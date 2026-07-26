const { haalDynamicsToken, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalAlleVerzoeken, werkVerzoekBij } = require("../_gedeeld/wijzigingen");

const DYN_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
  "If-Match": "*",
});

// Aanhef-optieset (sk_aanhef) op Contact: label → waarde.
const AANHEF_WAARDE = { "De heer": 126480000, "Mevrouw": 126480001, "De heer / mevrouw": 126480002 };

// Mapping van onze veldnamen naar de Contact-velden in Dynamics.
const CONTACT_VELD_MAP = {
  voornaam: "firstname",
  tussenvoegsel: "middlename",
  achternaam: "lastname",
  functietitel: "jobtitle",
  mobiel: "mobilephone",
  email: "emailaddress1",
  geboortedatum: "birthdate",
  straat: "address1_line1",
  huisnummer: "cr283_huisnummer",
  toevoeging: "cr283_huisnummertoevoeging",
  postcode: "address1_postalcode",
  plaats: "address1_city",
  provincie: "address1_stateorprovince",
  land: "address1_country",
};

/**
 * Schrijft de goedgekeurde wijziging weg naar de Contactpersoon in Dynamics. Alleen daadwerkelijk
 * gewijzigde velden worden meegestuurd. Het bedrijfsadres (KvK) wordt bewust niet aangeraakt.
 * Gooit door bij een fout (bijv. onvoldoende schrijfrechten) zodat de aanroeper dit kan tonen.
 */
async function verwerkInDynamics(resource, token, verzoek) {
  const { huidig = {}, voorstel = {} } = verzoek;
  if (!verzoek.contactId) throw new Error("Geen contactpersoon-id bij dit verzoek; kan niet verwerken.");

  const contactVelden = {};
  for (const [eigenVeld, dynVeld] of Object.entries(CONTACT_VELD_MAP)) {
    if ((voorstel[eigenVeld] ?? "") !== (huidig[eigenVeld] ?? "")) {
      contactVelden[dynVeld] = voorstel[eigenVeld] || null;
    }
  }
  // Aanhef is een optieset: schrijf de numerieke waarde.
  if ((voorstel.aanhef ?? "") !== (huidig.aanhef ?? "")) {
    contactVelden.sk_aanhef = AANHEF_WAARDE[voorstel.aanhef] ?? null;
  }

  if (Object.keys(contactVelden).length === 0) return;

  const res = await fetch(`${resource}/api/data/v9.2/contacts(${verzoek.contactId})`, {
    method: "PATCH",
    headers: DYN_HEADERS(token),
    body: JSON.stringify(contactVelden),
  });
  if (!res.ok) throw new Error(`Contact bijwerken mislukt (${res.status}): ${await res.text()}`);
}

module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const verzoeken = await haalAlleVerzoeken();
      // Nieuwste eerst.
      verzoeken.sort((a, b) => new Date(b.aangevraagdOp) - new Date(a.aangevraagdOp));
      context.res = { headers: { "Content-Type": "application/json" }, body: { verzoeken } };
      return;
    }

    if (req.method === "PATCH") {
      const id = req.body?.id;
      const actie = req.body?.actie; // "goedkeuren" | "afwijzen"
      if (!id || !["goedkeuren", "afwijzen"].includes(actie)) {
        context.res = { status: 400, body: { error: "Geef 'id' en 'actie' ('goedkeuren' of 'afwijzen') mee." } };
        return;
      }

      const alle = await haalAlleVerzoeken();
      const verzoek = alle.find((v) => v.id === id);
      if (!verzoek) {
        context.res = { status: 404, body: { error: "Wijzigingsverzoek niet gevonden." } };
        return;
      }

      const beheerder = haalEmailUitPrincipal(req) || "";

      if (actie === "afwijzen") {
        const bij = await werkVerzoekBij(id, {
          status: "afgewezen",
          verwerktOp: new Date().toISOString(),
          verwerktDoor: beheerder,
          verwerkingsfout: null,
        });
        context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, verzoek: bij } };
        return;
      }

      // Goedkeuren → in Dynamics verwerken.
      const resource = process.env.DYNAMICS_RESOURCE_URL;
      let verwerkingsfout = null;
      try {
        const token = await haalDynamicsToken();
        await verwerkInDynamics(resource, token, verzoek);
      } catch (schrijfFout) {
        context.log.error("Verwerken in Dynamics mislukt:", schrijfFout);
        verwerkingsfout = String(schrijfFout.message || schrijfFout);
      }

      const bij = await werkVerzoekBij(id, {
        status: "goedgekeurd",
        verwerktOp: new Date().toISOString(),
        verwerktDoor: beheerder,
        verwerkingsfout,
      });

      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { ok: true, verwerkt: !verwerkingsfout, verwerkingsfout, verzoek: bij },
      };
      return;
    }

    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij wijzigingsverzoeken.", detail: String(err) },
    };
  }
};
