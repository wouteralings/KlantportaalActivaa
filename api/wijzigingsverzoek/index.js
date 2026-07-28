const { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { voegVerzoekToe, haalVerzoekenVoorEmail } = require("../_gedeeld/wijzigingen");
const { verstuurMail } = require("../_gedeeld/mail");
const { isIngeschakeld } = require("../_gedeeld/facturatieInstellingen");
const { haalGegevens: haalBedrijfsgegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");

const INFO_EMAIL = process.env.REVIEW_INFO_EMAIL || "info@activaa.nl";

// Contactpersoon-velden mag een klant altijd voorstellen te wijzigen ('Functie rol' niet).
const CONTACT_VELDEN = [
  "aanhef", "voornaam", "tussenvoegsel", "achternaam", "functietitel",
  "mobiel", "email", "geboortedatum",
  "straat", "huisnummer", "toevoeging", "postcode", "plaats", "provincie", "land",
];
// Bedrijfsadres-velden: alleen wijzigbaar als er GEEN KvK-nummer is (natuurlijke personen).
const BEDRIJF_VELDEN = [
  "bedrijf_straat", "bedrijf_huisnummer", "bedrijf_toevoeging",
  "bedrijf_postcode", "bedrijf_plaats", "bedrijf_land",
];
// Facturatiemodule "Bedrijfsgegevens & logo" (dbo.bedrijfsgegevens_klanten) — logoUrl zit hier
// bewust niet bij: het logo blijft direct zelf te wijzigen (geen goedkeuring nodig), alleen
// de tekstvelden lopen sinds 28-07-2026 via een wijzigingsverzoek.
const BEDRIJFSGEGEVENS_VELDEN = [
  "bedrijfsnaam", "straat", "huisnummer", "toevoeging", "postcode", "plaats", "land",
  "kvkNummer", "btwNummer", "iban", "ibanTenaamstelling",
];

function schoonVoorstel(voorstel, toegestaan) {
  const schoon = {};
  for (const veld of toegestaan) {
    if (voorstel && typeof voorstel[veld] === "string") schoon[veld] = voorstel[veld].trim();
  }
  return schoon;
}

async function stuurMelding(account, aanvragerEmail, huidig, voorstel, toegestaan) {
  const gewijzigd = toegestaan.filter((v) => (voorstel[v] ?? "") !== (huidig[v] ?? ""));
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
        body: {
          verzoeken: eigen.map((v) => ({
            id: v.id, accountId: v.accountId, status: v.status, aangevraagdOp: v.aangevraagdOp,
            type: v.type || "naw",
          })),
        },
      };
      return;
    }

    // POST → nieuw verzoek indienen.
    const accountId = req.body?.accountId;
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

    // Facturatiemodule "Bedrijfsgegevens & logo" — apart afgehandeld, want dit gaat over
    // dbo.bedrijfsgegevens_klanten (eigen SQL-tabel), niet over Dynamics-velden.
    if (req.body?.type === "bedrijfsgegevens_facturatie") {
      const aan = await isIngeschakeld(accountId).catch(() => false);
      if (!aan) {
        context.res = { status: 403, body: { error: "De facturatiemodule staat niet aan voor dit account." } };
        return;
      }

      const opgeslagen = await haalBedrijfsgegevens(accountId);
      const ka = account.klantadres || {};
      // Voor elk veld: de al opgeslagen waarde, en anders (nog leeg) de bekende CRM-waarde als
      // die er is — zo blijft een al goedgekeurde eigen waarde behouden bij een volgend verzoek,
      // en wordt alleen een nog leeg veld aangevuld vanuit wat we al weten.
      const huidig = {
        bedrijfsnaam: opgeslagen.bedrijfsnaam || account.klantnaam || "",
        straat: opgeslagen.straat || ka.straat || "",
        huisnummer: opgeslagen.huisnummer || ka.huisnummer || "",
        toevoeging: opgeslagen.toevoeging || ka.toevoeging || "",
        postcode: opgeslagen.postcode || ka.postcode || "",
        plaats: opgeslagen.plaats || ka.plaats || "",
        land: opgeslagen.land || ka.land || "NL",
        kvkNummer: opgeslagen.kvkNummer || account.kvkNummer || "",
        // Niet in CRM beschikbaar — blijft leeg totdat de klant (of Activaa) het zelf invult.
        btwNummer: opgeslagen.btwNummer || "",
        iban: opgeslagen.iban || "",
        ibanTenaamstelling: opgeslagen.ibanTenaamstelling || "",
      };

      const voorstel = schoonVoorstel(req.body?.voorstel, BEDRIJFSGEGEVENS_VELDEN);
      const definitiefVoorstel = { ...huidig };
      for (const veld of BEDRIJFSGEGEVENS_VELDEN) {
        if (voorstel[veld] !== undefined) definitiefVoorstel[veld] = voorstel[veld];
      }

      const isGewijzigd = BEDRIJFSGEGEVENS_VELDEN.some((v) => (definitiefVoorstel[v] ?? "") !== (huidig[v] ?? ""));
      if (!isGewijzigd) {
        context.res = { status: 400, body: { error: "Er zijn geen wijzigingen ten opzichte van de huidige gegevens." } };
        return;
      }

      const verzoek = await voegVerzoekToe({
        type: "bedrijfsgegevens_facturatie",
        accountId: account.accountId,
        klantnummer: account.klantnummer,
        klantnaam: account.klantnaam,
        aanvragerEmail: email,
        huidig,
        voorstel: definitiefVoorstel,
      });

      // Melding is best-effort: als mailen (nog) niet kan, faalt het verzoek zelf niet.
      try {
        await stuurMelding(account, email, huidig, definitiefVoorstel, BEDRIJFSGEGEVENS_VELDEN);
      } catch (mailFout) {
        context.log.error("Melding wijzigingsverzoek mislukt:", mailFout);
      }

      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { ok: true, id: verzoek.id, status: verzoek.status },
      };
      return;
    }

    // Bedrijfsadres is alleen wijzigbaar als er GEEN KvK-nummer op het account staat.
    const raw = account.account || {};
    const kvkVeld = process.env.DYNAMICS_KVK_VELD || "accountnumber";
    const magBedrijf = !(raw[kvkVeld] || "").toString().trim();
    const toegestaan = magBedrijf ? [...CONTACT_VELDEN, ...BEDRIJF_VELDEN] : CONTACT_VELDEN;

    const voorstel = schoonVoorstel(req.body?.voorstel, toegestaan);

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
      bedrijf_straat: raw.address1_line1 || "",
      bedrijf_huisnummer: raw.cr283_huisnummer || "",
      bedrijf_toevoeging: raw.cr283_huisnummertoevoeging || "",
      bedrijf_postcode: raw.address1_postalcode || "",
      bedrijf_plaats: raw.address1_city || "",
      bedrijf_land: raw.address1_country || "",
    };

    // Alleen daadwerkelijk gewijzigde velden bewaren als voorstel; ontbrekende = ongewijzigd.
    const definitiefVoorstel = { ...huidig };
    for (const veld of toegestaan) {
      if (voorstel[veld] !== undefined) definitiefVoorstel[veld] = voorstel[veld];
    }

    const isGewijzigd = toegestaan.some((v) => (definitiefVoorstel[v] ?? "") !== (huidig[v] ?? ""));
    if (!isGewijzigd) {
      context.res = { status: 400, body: { error: "Er zijn geen wijzigingen ten opzichte van de huidige gegevens." } };
      return;
    }

    const verzoek = await voegVerzoekToe({
      type: "naw",
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
      await stuurMelding(account, email, huidig, definitiefVoorstel, toegestaan);
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
