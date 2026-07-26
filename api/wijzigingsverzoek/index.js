const { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { voegVerzoekToe, haalVerzoekenVoorEmail } = require("../_gedeeld/wijzigingen");
const { verstuurMail } = require("../_gedeeld/mail");

const INFO_EMAIL = process.env.REVIEW_INFO_EMAIL || "info@activaa.nl";

// Alleen deze contactpersoon-velden mag een klant voorstellen te wijzigen.
// (Bedrijfsadres = KvK, read-only. 'Functie rol' bewust niet wijzigbaar.)
const TOEGESTANE_VELDEN = [
  "aanhef", "voornaam", "tussenvoegsel", "achternaam", "functietitel",
  "mobiel", "email", "geboortedatum",
  "straat", "huisnummer", "toevoeging", "postcode", "plaats", "provincie", "land",
];

function schoonVoorstel(voorstel) {
  const schoon = {};
  for (const veld of TOEGESTANE_VELDEN) {
    if (voorstel && typeof voorstel[veld] === "string") schoon[veld] = voorstel[veld].trim();
  }
  return schoon;
}

async function stuurMelding(account, aanvragerEmail, huidig, voorstel) {
  const gewijzigd = TOEGESTANE_VELDEN.filter((v) => (voorstel[v] ?? "") !== (huidig[v] ?? ""));
  const regels = gewijzigd
    .map((v) => `- ${v}: "${huidig[v] || ""}" → "${voorstel[v] || ""}"`)
    .join("\n");
  const onderwerp = `Wijzigingsverzoek — ${account.klantnaam}`;
  const tekst =
    `Een klant heeft via het portaal een wijziging van zijn gegevens ingediend.\n\n` +
    `Klant: ${account.klantnaam} (klantnr ${account.klantnummer ?? "-"})\n` +
    `Ingediend door: ${aanvragerEmail}\n\n` +
    `Voorgestelde wijzigingen:\n${regels || "(geen zichtbare verschillen)"}\n\n` +
    `Keur het verzoek goed of af in de beheeromgeving onder "Wijzigingsverzoeken".`;
  await verstuurMail({ ontvangers: [INFO_EMAIL, account.relatiebeheerder?.email], onderwerp, tekst });
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const email = haalEmailUitPrincipal(req);
    if (!email) {
      context.res = { status: 403, body: { error: "Kon je identiteit niet bepalen." } };
      return;
    }

    // GET → eigen (open) verzoeken teruggeven zodat het portaal de status kan tonen.
    if (req.method === "GET") {
      const eigen = await haalVerzoekenVoorEmail(email).catch(() => []);
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { verzoeken: eigen.map((v) => ({ id: v.id, accountId: v.accountId, status: v.status, aangevraagdOp: v.aangevraagdOp })) },
      };
      return;
    }

    // POST → nieuw verzoek indienen.
    const accountId = req.body?.accountId;
    const voorstel = schoonVoorstel(req.body?.voorstel);
    if (!accountId) {
      context.res = { status: 400, body: { error: "Geef aan voor welk account de wijziging is (accountId)." } };
      return;
    }

    const token = await haalDynamicsToken();
    const { accounts } = await herleidAccounts(req, token);
    const account = accounts.find((a) => a.accountId === accountId);
    if (!account) {
      context.res = { status: 403, body: { error: "Dit account hoort niet bij jouw gegevens." } };
      return;
    }

    const cp = account.contactpersoon || {};
    const adres = cp.adres || {};
    const huidig = {
      aanhef: cp.aanhef || "",
      voornaam: cp.voornaam || "",
      tussenvoegsel: cp.tussenvoegsel || "",
      achternaam: cp.achternaam || "",
      functietitel: cp.functietitel || "",
      mobiel: cp.mobiel || "",
      email: cp.email || "",
      geboortedatum: cp.geboortedatum || "",
      straat: adres.straat || "",
      huisnummer: adres.huisnummer || "",
      toevoeging: adres.toevoeging || "",
      postcode: adres.postcode || "",
      plaats: adres.plaats || "",
      provincie: adres.provincie || "",
      land: adres.land || "",
    };

    // Alleen daadwerkelijk gewijzigde velden bewaren als voorstel; ontbrekende = ongewijzigd.
    const definitiefVoorstel = { ...huidig };
    for (const veld of TOEGESTANE_VELDEN) {
      if (voorstel[veld] !== undefined) definitiefVoorstel[veld] = voorstel[veld];
    }

    const isGewijzigd = TOEGESTANE_VELDEN.some((v) => (definitiefVoorstel[v] ?? "") !== (huidig[v] ?? ""));
    if (!isGewijzigd) {
      context.res = { status: 400, body: { error: "Er zijn geen wijzigingen ten opzichte van de huidige gegevens." } };
      return;
    }

    const verzoek = await voegVerzoekToe({
      accountId: account.accountId,
      contactId: account.contactId,
      klantnummer: account.klantnummer,
      klantnaam: account.klantnaam,
      aanvragerEmail: email,
      huidig,
      voorstel: definitiefVoorstel,
    });

    // Melding is best-effort: als mailen (nog) niet kan, faalt het verzoek zelf niet.
    try {
      await stuurMelding(account, email, huidig, definitiefVoorstel);
    } catch (mailFout) {
      context.log.error("Melding wijzigingsverzoek mislukt:", mailFout);
    }

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { ok: true, id: verzoek.id, status: verzoek.status },
    };
  } catch (err) {
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING") {
      context.res = { status: 403, body: { error: err.message } };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het indienen van je wijziging.", detail: String(err) },
    };
  }
};
