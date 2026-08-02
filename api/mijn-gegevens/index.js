const { haalDynamicsToken, herleidAccounts, IBAN_VELD, IBAN_TENAAMSTELLING_VELD, CC_EMAIL_VELD } = require("../_gedeeld/identiteit");
const { haalStatussen } = require("../_gedeeld/facturatieInstellingen");
const { haalStatussen: haalUrenStatussen } = require("../_gedeeld/urenInstellingen");
const { haalStatussen: haalRapportagesStatussen } = require("../_gedeeld/rapportagesInstellingen");
const { haalStatussen: haalBezittingenStatussen } = require("../_gedeeld/bezittingenInstellingen");
const { haalStatussen: haalRittenStatussen } = require("../_gedeeld/rittenInstellingen");
const { haalStatussen: haalProjectenStatussen } = require("../_gedeeld/projectenInstellingen");
const { haalStatussen: haalContractenStatussen } = require("../_gedeeld/contractenInstellingen");

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const { email, accounts } = await herleidAccounts(req, token);

    // Per account: staat de facturatiemodule aan, en heeft de klant hem eventueel al
    // aangevraagd? (beheerd in het beheerdersportaal, tab "Facturatie"). Best-effort: als
    // de opslag nog niet geconfigureerd is, gewoon uit / geen aanvraag.
    const facturatieStatussen = await haalStatussen().catch(() => ({}));
    // Aparte, losse schakelaar voor de urenregistratie (€2,50 per administratie) — zelfde
    // blob-patroon, los van de facturatiemodule. Best-effort: nog niet geconfigureerd => uit.
    const urenStatussen = await haalUrenStatussen().catch(() => ({}));
    // Rapportages (W&V + Balans op basis van RGS 3.5) en Bezittingen (activastaat/afschrijvingen)
    // — twee losse, standalone schakelaars, elk met hun eigen prijs (zie instellingen.js).
    const rapportagesStatussen = await haalRapportagesStatussen().catch(() => ({}));
    const bezittingenStatussen = await haalBezittingenStatussen().catch(() => ({}));
    // Rittenregistratie (€1,50/maand, los van Facturatie/Uren) en de Uren↔Projecten-koppeling —
    // zie api/_gedeeld/rittenInstellingen.js resp. projectenInstellingen.js.
    const rittenStatussen = await haalRittenStatussen().catch(() => ({}));
    const projectenStatussen = await haalProjectenStatussen().catch(() => ({}));
    // Contracten (zelf geregistreerde verzekeringen/telefonie/overige doorlopende contracten,
    // met verloopherinneringen) — losse, standalone schakelaar, zie contractenInstellingen.js.
    const contractenStatussen = await haalContractenStatussen().catch(() => ({}));

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: {
        email,
        accounts: accounts.map(({ accountId, klantnummer, klantnaam, groepsnaam, contactpersoon, relatiebeheerder, accountant, account }) => ({
          accountId,
          klantnummer,
          klantnaam: klantnaam || account.name || "",
          groepsnaam: groepsnaam || "",
          // Bezoekadres van het bedrijf. Staat er een KvK-nummer (accountnumber), dan is het
          // KvK-gesynchroniseerd en read-only; zo niet, dan mag de klant het wél wijzigen.
          klantadres: {
            straat: account.address1_line1 || "",
            huisnummer: account.cr283_huisnummer || "",
            toevoeging: account.cr283_huisnummertoevoeging || "",
            postcode: account.address1_postalcode || "",
            plaats: account.address1_city || "",
            land: account.address1_country || "",
          },
          bedrijfsadresBewerkbaar: !(account[process.env.DYNAMICS_KVK_VELD || "accountnumber"] || "").toString().trim(),
          // Zelfde KvK-nummer, maar dan de waarde zelf — gebruikt om de eigen bedrijfsgegevens
          // (Facturatiemodule → Bedrijfsgegevens & logo) mee voor te vullen.
          kvkNummer: (account[process.env.DYNAMICS_KVK_VELD || "accountnumber"] || "").toString().trim(),
          // BTW-nummer, zelfde voorvul-doel als kvkNummer hierboven. Leeg als het veld (nog)
          // niet in Dataverse staat onder deze naam — zie identiteit.js / DYNAMICS_BTW_VELD.
          btwNummer: (account[process.env.DYNAMICS_BTW_VELD || "sk_btwnummer"] || "").toString().trim(),
          // IBAN + tenaamstelling, zelfde voorvul-doel — sinds 29-07-2026 uit Dataverse
          // (sk_iban / cr283_ibannaamstelling). Leeg als het veld niet is meegekomen.
          iban: (account[IBAN_VELD] || "").toString().trim(),
          ibanTenaamstelling: (account[IBAN_TENAAMSTELLING_VELD] || "").toString().trim(),
          // CC-mailadres bij versturen — zelfde voorvul-doel, uit Dataverse (cr283_ccbijversturen,
          // zie identiteit.js / DYNAMICS_CC_EMAIL_VELD). Leeg als er nog nooit een CC-mailadres
          // via het portaal of Dynamics is gezet.
          ccEmail: (account[CC_EMAIL_VELD] || "").toString().trim(),
          // Volledige contactpersoon-gegevens (wijzigbaar via een verzoek, behalve functie rol).
          contactpersoon: contactpersoon || {},
          relatiebeheerder,
          accountant,
          facturatieIngeschakeld: !!(facturatieStatussen[accountId] && facturatieStatussen[accountId].ingeschakeld),
          facturatieAangevraagdOp: (facturatieStatussen[accountId] && facturatieStatussen[accountId].aangevraagdOp) || null,
          // Klant-voorkeur: snelknop "Factuur maken" op de homepagina tonen (zie /api/facturatie-instelling).
          toonFacturenOpHome: !!(facturatieStatussen[accountId] && facturatieStatussen[accountId].toonOpHome),
          urenIngeschakeld: !!(urenStatussen[accountId] && urenStatussen[accountId].ingeschakeld),
          urenAangevraagdOp: (urenStatussen[accountId] && urenStatussen[accountId].aangevraagdOp) || null,
          // Klant-voorkeur: snelknop "Uren registreren" op de homepagina tonen (zie /api/uren-instelling).
          toonUrenOpHome: !!(urenStatussen[accountId] && urenStatussen[accountId].toonOpHome),
          rapportagesIngeschakeld: !!(rapportagesStatussen[accountId] && rapportagesStatussen[accountId].ingeschakeld),
          rapportagesAangevraagdOp: (rapportagesStatussen[accountId] && rapportagesStatussen[accountId].aangevraagdOp) || null,
          bezittingenIngeschakeld: !!(bezittingenStatussen[accountId] && bezittingenStatussen[accountId].ingeschakeld),
          bezittingenAangevraagdOp: (bezittingenStatussen[accountId] && bezittingenStatussen[accountId].aangevraagdOp) || null,
          // Rittenregistratie (€1,50/maand, los van Facturatie/Uren) — zie api/_gedeeld/rittenInstellingen.js.
          rittenIngeschakeld: !!(rittenStatussen[accountId] && rittenStatussen[accountId].ingeschakeld),
          rittenAangevraagdOp: (rittenStatussen[accountId] && rittenStatussen[accountId].aangevraagdOp) || null,
          // Of de beheerder voor dit account de Uren↔Projecten-koppeling heeft aangezet (zie
          // api/_gedeeld/projectenInstellingen.js) — bepaalt of het urenformulier een Project-veld toont.
          projectenGekoppeld: !!(projectenStatussen[accountId] && projectenStatussen[accountId].gekoppeld),
          // Contracten (verzekeringen/telefonie/overig, met verloopherinneringen) — zie
          // api/_gedeeld/contractenInstellingen.js.
          contractenIngeschakeld: !!(contractenStatussen[accountId] && contractenStatussen[accountId].ingeschakeld),
          contractenAangevraagdOp: (contractenStatussen[accountId] && contractenStatussen[accountId].aangevraagdOp) || null,
        })),
      },
    };
  } catch (err) {
    if (err.code === "GEEN_IDENTITEIT" || err.code === "GEEN_KOPPELING" || err.code === "GEEN_RECHT" || err.code === "ALLEEN_LEZEN") {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij ophalen van je gegevens.", detail: String(err) },
    };
  }
};
