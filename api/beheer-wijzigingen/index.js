const { haalDynamicsToken, haalEmailUitPrincipal, IBAN_VELD, IBAN_TENAAMSTELLING_VELD } = require("../_gedeeld/identiteit");
const { haalAlleVerzoeken, werkVerzoekBij } = require("../_gedeeld/wijzigingen");
const { zetGegevens: zetBedrijfsgegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");

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

// Mapping van bedrijfsadres-velden naar de Account-velden (alleen bij accounts zonder KvK).
const BEDRIJF_VELD_MAP = {
  bedrijf_straat: "address1_line1",
  bedrijf_huisnummer: "cr283_huisnummer",
  bedrijf_toevoeging: "cr283_huisnummertoevoeging",
  bedrijf_postcode: "address1_postalcode",
  bedrijf_plaats: "address1_city",
  bedrijf_land: "address1_country",
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

  if (Object.keys(contactVelden).length > 0) {
    const res = await fetch(`${resource}/api/data/v9.2/contacts(${verzoek.contactId})`, {
      method: "PATCH",
      headers: DYN_HEADERS(token),
      body: JSON.stringify(contactVelden),
    });
    if (!res.ok) throw new Error(`Contact bijwerken mislukt (${res.status}): ${await res.text()}`);
  }

  // Bedrijfsadres naar het Account (alleen aanwezig bij accounts zonder KvK-nummer).
  const accountVelden = {};
  for (const [eigenVeld, dynVeld] of Object.entries(BEDRIJF_VELD_MAP)) {
    if ((voorstel[eigenVeld] ?? "") !== (huidig[eigenVeld] ?? "")) {
      accountVelden[dynVeld] = voorstel[eigenVeld] || null;
    }
  }
  if (Object.keys(accountVelden).length > 0 && verzoek.accountId) {
    const res = await fetch(`${resource}/api/data/v9.2/accounts(${verzoek.accountId})`, {
      method: "PATCH",
      headers: DYN_HEADERS(token),
      body: JSON.stringify(accountVelden),
    });
    if (!res.ok) throw new Error(`Bedrijfsadres bijwerken mislukt (${res.status}): ${await res.text()}`);
  }
}

/**
 * Schrijft IBAN + tenaamstelling van een goedgekeurd bedrijfsgegevens_facturatie-verzoek weg
 * naar het Account in Dynamics (sk_iban / cr283_ibannaamstelling) — sinds 29-07-2026, nadat
 * bleek dat deze velden daar al bestaan. Zo komt de waarde via dezelfde koppeling als KvK/BTW
 * altijd weer terug, ook als het wegschrijven naar onze eigen SQL-tabel (het primaire pad,
 * hieronder nog steeds geprobeerd) een keer mislukt. Alleen daadwerkelijk gewijzigde velden
 * worden meegestuurd; doet geen request als er niets IBAN-gerelateerds is gewijzigd.
 */
async function verwerkIbanInDynamics(resource, token, verzoek) {
  const { huidig = {}, voorstel = {} } = verzoek;
  if (!verzoek.accountId) throw new Error("Geen account-id bij dit verzoek; kan IBAN niet naar Dynamics wegschrijven.");

  const accountVelden = {};
  if ((voorstel.iban ?? "") !== (huidig.iban ?? "")) {
    accountVelden[IBAN_VELD] = voorstel.iban || null;
  }
  if ((voorstel.ibanTenaamstelling ?? "") !== (huidig.ibanTenaamstelling ?? "")) {
    accountVelden[IBAN_TENAAMSTELLING_VELD] = voorstel.ibanTenaamstelling || null;
  }
  if (Object.keys(accountVelden).length === 0) return;

  const res = await fetch(`${resource}/api/data/v9.2/accounts(${verzoek.accountId})`, {
    method: "PATCH",
    headers: DYN_HEADERS(token),
    body: JSON.stringify(accountVelden),
  });
  if (!res.ok) throw new Error(`IBAN bijwerken in Dynamics mislukt (${res.status}): ${await res.text()}`);
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

      // Goedkeuren → verwerken. Het type van het verzoek bepaalt het doelsysteem: NAW-
      // verzoeken (of oudere verzoeken zonder type) gaan naar Dynamics; de facturatiemodule-
      // bedrijfsgegevens gaan primair naar onze eigen SQL-tabel. Sinds 29-07-2026 schrijven we
      // IBAN + tenaamstelling daarnaast ook naar Dynamics (sk_iban / cr283_ibannaamstelling) —
      // dat kanaal is bewezen betrouwbaar (zelfde als KvK/BTW), dus als het SQL-schrijven een
      // keer misgaat maar IBAN via Dynamics wél lukt, komt de waarde alsnog bij de klant terecht.
      let verwerkingsfout = null;
      try {
        if (verzoek.type === "bezitting_niet_meer_in_bezit") {
          // Geen geautomatiseerd doelsysteem: de "niet meer in bezit"-vlag staat al (direct bij
          // het indienen) in bezittingenStatus.js. Goedkeuren betekent hier alleen dat een
          // medewerker heeft gezien dat dit nog handmatig verwerkt moet worden (bijv. afvoeren in
          // Exact Online) — er is dus niets om automatisch weg te schrijven.
        } else if (verzoek.type === "bedrijfsgegevens_facturatie") {
          const sqlFout = await zetBedrijfsgegevens(verzoek.accountId, verzoek.voorstel, beheerder)
            .then(() => null)
            .catch((fout) => fout);

          const ibanGewijzigd =
            (verzoek.voorstel?.iban ?? "") !== (verzoek.huidig?.iban ?? "") ||
            (verzoek.voorstel?.ibanTenaamstelling ?? "") !== (verzoek.huidig?.ibanTenaamstelling ?? "");

          let dynFout = null;
          if (ibanGewijzigd) {
            try {
              const resource = process.env.DYNAMICS_RESOURCE_URL;
              const token = await haalDynamicsToken();
              await verwerkIbanInDynamics(resource, token, verzoek);
            } catch (fout) {
              dynFout = fout;
            }
          }

          if (sqlFout) {
            if (ibanGewijzigd && !dynFout) {
              // Database-schrijven mislukt (bekend, nog niet opgelost probleem), maar IBAN/
              // tenaamstelling staan via Dynamics klaar — die komen via de koppeling gewoon
              // terug, dus voor de klant is dit verzoek in de praktijk verwerkt. Wel loggen.
              context.log.error("Database-schrijven bij bedrijfsgegevens_facturatie mislukt (IBAN wél via Dynamics verwerkt):", sqlFout);
            } else {
              throw dynFout
                ? new Error(`Database: ${sqlFout.message || sqlFout} | Dynamics: ${dynFout.message || dynFout}`)
                : sqlFout;
            }
          } else if (dynFout) {
            // Database-schrijven (het primaire pad) is gelukt; het wegschrijven naar Dynamics is
            // hier alleen best-effort, dus een foutje daarin hoeft dit verzoek niet te laten mislukken.
            context.log.error("Wegschrijven van IBAN naar Dynamics (best effort) mislukt:", dynFout);
          }
        } else {
          const resource = process.env.DYNAMICS_RESOURCE_URL;
          const token = await haalDynamicsToken();
          await verwerkInDynamics(resource, token, verzoek);
        }
      } catch (schrijfFout) {
        context.log.error("Verwerken van wijzigingsverzoek mislukt:", schrijfFout);
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
