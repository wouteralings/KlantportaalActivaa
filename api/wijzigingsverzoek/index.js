const { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal, IBAN_VELD, IBAN_TENAAMSTELLING_VELD } = require("../_gedeeld/identiteit");
const { voegVerzoekToe, haalVerzoekenVoorEmail } = require("../_gedeeld/wijzigingen");
const { verstuurMail } = require("../_gedeeld/mail");
const { isIngeschakeld } = require("../_gedeeld/facturatieInstellingen");
const { SOORTEN, haalEenDossier } = require("../_gedeeld/dossiers");
const { haalGegevens: haalBedrijfsgegevens, zetGegevens: zetBedrijfsgegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");

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
            // Alleen bij dossier-verzoeken: zodat het portaal per dossier een "wacht op goedkeuring"
            // kan tonen én de al ingediende (nog niet goedgekeurde) reactie kan laten zien.
            soort: v.soort || null, dossierId: v.dossierId || null,
            voorstelReactie: v.type === "dossier" ? (v.voorstel && v.voorstel.reactie) || "" : undefined,
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

    // Dossier-reactie — de klant dient een reactie/opmerking op een fiscaal dossier (IB/VPB) in.
    // Loopt via dezelfde goedkeuringssystematiek: wordt bij akkoord door een medewerker naar het
    // reactie-veld van het dossier in Dynamics weggeschreven (zie api/beheer-wijzigingen).
    if (req.body?.type === "dossier") {
      const soort = SOORTEN.find((s) => s.key === req.body?.soort);
      const dossierId = req.body?.dossierId;
      const reactie = typeof req.body?.reactie === "string" ? req.body.reactie.trim() : "";
      if (!soort || !dossierId) {
        context.res = { status: 400, body: { error: "Geef een geldige dossiersoort en dossier mee." } };
        return;
      }
      if (!reactie) {
        context.res = { status: 400, body: { error: "Je reactie is leeg." } };
        return;
      }
      // Controleer dat dit dossier écht bij het (geverifieerde) account van de klant hoort — anders
      // zou een klant via een geraden id op een ander dossier kunnen reageren.
      const dossier = await haalEenDossier(resource, token, soort, dossierId).catch(() => null);
      if (!dossier || dossier.accountId !== account.accountId) {
        context.res = { status: 403, body: { error: "Dit dossier hoort niet bij jouw gegevens." } };
        return;
      }
      const huidig = { reactie: dossier.reactie || "", reviewNotitie: dossier.reviewNotitie || "" };
      const voorstel = { reactie };
      const verzoek = await voegVerzoekToe({
        type: "dossier",
        accountId: account.accountId,
        soort: soort.key,
        dossierId,
        klantnummer: account.klantnummer,
        klantnaam: account.klantnaam,
        aanvragerEmail: email,
        huidig,
        voorstel,
      });
      // Best-effort melding aan Activaa.
      try {
        const periode = dossier.jaar != null && dossier.jaar !== "" ? ` ${dossier.jaar}` : "";
        await verstuurMail({
          ontvangers: [INFO_EMAIL, account.relatiebeheerder?.email],
          onderwerp: `Reactie op ${soort.label}-dossier — ${account.klantnaam}`,
          tekst:
            `Een klant heeft via het portaal een reactie op een fiscaal dossier ingediend.\n\n` +
            `Klant: ${account.klantnaam} (klantnr ${account.klantnummer ?? "-"})\n` +
            `Dossier: ${soort.label}${periode}\n` +
            `Ingediend door: ${email}\n\n` +
            `Reactie van de klant:\n${reactie}\n\n` +
            `Keur het verzoek goed of af in de beheeromgeving onder "Wijzigingsverzoeken".`,
        });
      } catch (mailFout) {
        context.log.error("Melding dossier-wijzigingsverzoek mislukt:", mailFout);
      }
      context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, id: verzoek.id, status: verzoek.status } };
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
      // Let op: `account` hier is wat herleidAccounts() teruggeeft — dat heeft GEEN
      // account.klantadres/account.kvkNummer/account.btwNummer (die bestaan alleen op de
      // aparte, verrijkte mapping die /api/mijn-gegevens maakt). De ruwe Dynamics-velden
      // zitten genest onder account.account — zelfde bron als /api/mijn-gegevens en de
      // front-end (BedrijfsgegevensKaart) gebruiken om voor te vullen.
      const raw = account.account || {};
      const kvkVeldNaam = process.env.DYNAMICS_KVK_VELD || "accountnumber";
      const btwVeldNaam = process.env.DYNAMICS_BTW_VELD || "sk_btwnummer";
      // Voor elk veld: de al opgeslagen waarde, en anders (nog leeg) de bekende CRM-waarde als
      // die er is — zo blijft een al goedgekeurde eigen waarde behouden bij een volgend verzoek,
      // en wordt alleen een nog leeg veld aangevuld vanuit wat we al weten.
      const huidig = {
        bedrijfsnaam: opgeslagen.bedrijfsnaam || account.klantnaam || raw.name || "",
        straat: opgeslagen.straat || raw.address1_line1 || "",
        huisnummer: opgeslagen.huisnummer || raw.cr283_huisnummer || "",
        toevoeging: opgeslagen.toevoeging || raw.cr283_huisnummertoevoeging || "",
        postcode: opgeslagen.postcode || raw.address1_postalcode || "",
        plaats: opgeslagen.plaats || raw.address1_city || "",
        land: opgeslagen.land || raw.address1_country || "NL",
        kvkNummer: opgeslagen.kvkNummer || (raw[kvkVeldNaam] || "").toString().trim(),
        btwNummer: opgeslagen.btwNummer || (raw[btwVeldNaam] || "").toString().trim(),
        // IBAN + tenaamstelling: sinds 29-07-2026 ook uit Dataverse bekend (sk_iban /
        // cr283_ibannaamstelling), zelfde val-terug-patroon als KvK/BTW hierboven.
        iban: opgeslagen.iban || (raw[IBAN_VELD] || "").toString().trim(),
        ibanTenaamstelling: opgeslagen.ibanTenaamstelling || (raw[IBAN_TENAAMSTELLING_VELD] || "").toString().trim(),
      };

      const voorstel = schoonVoorstel(req.body?.voorstel, BEDRIJFSGEGEVENS_VELDEN);
      const definitiefVoorstel = { ...huidig };
      for (const veld of BEDRIJFSGEGEVENS_VELDEN) {
        if (voorstel[veld] !== undefined) definitiefVoorstel[veld] = voorstel[veld];
      }

      const isGewijzigd = BEDRIJFSGEGEVENS_VELDEN.some((v) => (definitiefVoorstel[v] ?? "") !== (huidig[v] ?? ""));
      if (!isGewijzigd) {
        // Niets dat de klant écht zelf wijzigt t.o.v. wat al bekend is (opgeslagen, of anders
        // de CRM-waarde) — dan hoeft Activaa daar niets voor goed te keuren. Wél gelijk
        // wegschrijven als er nog CRM-waarden zijn die nog niet in de eigen tabel stonden,
        // zodat bijv. een BTW-nummer dat alleen uit Dynamics kwam gewoon op de factuur
        // verschijnt zonder dat er iets "gewijzigd" hoefde te worden.
        const nieuwVoorOpgeslagen = BEDRIJFSGEGEVENS_VELDEN.some((v) => (huidig[v] ?? "") !== (opgeslagen[v] ?? ""));
        if (nieuwVoorOpgeslagen) {
          await zetBedrijfsgegevens(accountId, huidig, email).catch((fout) => {
            context.log.error("Automatisch wegschrijven van CRM-bedrijfsgegevens mislukt:", fout);
          });
        }
        context.res = {
          headers: { "Content-Type": "application/json" },
          body: { ok: true, geenWijziging: true },
        };
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
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
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
