const { haalDynamicsToken, herleidAccounts, haalEmailUitPrincipal } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { verstuurMail } = require("../_gedeeld/mail");
const { voegReviewToe } = require("../_gedeeld/reviewopslag");

/**
 * LET OP — Google's richtlijnen voor bedrijfsprofielen verbieden "review gating": het
 * selectief alleen tevreden klanten doorsturen naar een openbare review, en ontevreden
 * klanten daarvan weghouden. Dit endpoint implementeert exact dat patroon, dus wees je
 * bewust dat dit tegen Google's beleid in kan gaan. Technisch werkt het zoals gevraagd.
 *
 * Benodigd: de Google-reviewlink moet gezet zijn via PUT /api/beheer-instellingen
 * (alleen rol 'beheerder'), bijv. { "googleReviewUrl": "https://g.page/r/.../review" }.
 */

// Adres van de info-inbox; overschrijf via de Application Setting REVIEW_INFO_EMAIL.
const INFO_EMAIL = process.env.REVIEW_INFO_EMAIL || "info@activaa.nl";

/**
 * Stuurt bij een lage review een e-mailmelding naar de info-inbox, de relatiebeheerder
 * (manager) en de accountant van de betreffende klant, via Microsoft Graph.
 */
async function stuurReviewMelding(account, sterren, opmerking, reviewerEmail) {
  // Is de reviewer aan een klant gekoppeld, dan gaat de melding óók naar de relatiebeheerder
  // en de accountant. Zo niet, dan alleen naar de info-inbox.
  const ontvangers = [
    INFO_EMAIL,
    account?.relatiebeheerder?.email,
    account?.accountant?.email,
  ];

  const klantnaam = account?.klantnaam || "(niet aan een klant gekoppeld)";
  const onderwerp = `Lage review-score (${sterren}★) — ${klantnaam}`;
  const tekst =
    `Er is via het klantportaal een review met een lage score binnengekomen.\n\n` +
    `Ingelogd als: ${reviewerEmail || "onbekend"}\n` +
    `Klant: ${klantnaam}\n` +
    `Klantnummer: ${account?.klantnummer ?? "-"}\n` +
    `Relatiebeheerder: ${account?.relatiebeheerder?.naam || "onbekend"}\n` +
    `Accountant: ${account?.accountant?.naam || "onbekend"}\n` +
    `Score: ${sterren}/5 sterren\n\n` +
    `Opmerking van de klant:\n${opmerking || "(geen opmerking meegegeven)"}\n`;

  await verstuurMail({ ontvangers, onderwerp, tekst });
}

module.exports = async function (context, req) {
  if (req.method !== "POST") {
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
    return;
  }

  const resource = process.env.DYNAMICS_RESOURCE_URL;

  if (!resource) {
    context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } };
    return;
  }

  const sterren = Number(req.body?.sterren);
  const opmerking = (req.body?.opmerking || "").trim();

  if (!Number.isInteger(sterren) || sterren < 1 || sterren > 5) {
    context.res = { status: 400, body: { error: "Geef 'sterren' mee als geheel getal van 1 t/m 5." } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const reviewerEmail = haalEmailUitPrincipal(req) || "";

    // Een review vereist géén klantkoppeling: ook een niet-gekoppelde (bijv. interne) gebruiker
    // mag feedback geven. Is er wél een gekoppelde klant, dan sturen we de melding ook naar de
    // relatiebeheerder en accountant van die klant.
    let account = null;
    try {
      const { accounts } = await herleidAccounts(req, token);
      const gekozenAccountId = req.body?.accountId;
      account = gekozenAccountId
        ? accounts.find((a) => a.accountId === gekozenAccountId) || accounts[0]
        : accounts[0];
    } catch (koppelFout) {
      if (koppelFout.code !== "GEEN_KOPPELING" && koppelFout.code !== "GEEN_IDENTITEIT") throw koppelFout;
      // Geen gekoppelde klant → account blijft null; de melding gaat alleen naar de info-inbox.
    }

    // Elke review vastleggen (ook 5 sterren), zodat het beheerportaal kan tonen wie wanneer
    // een review gaf. Faalt dit (bijv. opslag even niet bereikbaar), dan loggen we het maar
    // laten we de review zelf niet mislukken.
    try {
      await voegReviewToe({
        accountId: account?.accountId,
        klantnummer: account?.klantnummer,
        klantnaam: account?.klantnaam,
        sterren,
        opmerking,
        reviewerEmail,
      });
    } catch (opslagFout) {
      context.log.error("Review vastleggen mislukt:", opslagFout);
    }

    if (sterren === 5) {
      const { googleReviewUrl } = await haalInstellingen();
      if (!googleReviewUrl) {
        context.res = { status: 501, body: { error: "De Google-reviewlink is nog niet ingesteld via /api/beheer-instellingen." } };
        return;
      }
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { doorsturenNaarGoogle: true, googleReviewUrl },
      };
      return;
    }

    await stuurReviewMelding(account, sterren, opmerking, reviewerEmail);
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { doorsturenNaarGoogle: false },
    };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij verwerken van de review.", detail: String(err) },
    };
  }
};
