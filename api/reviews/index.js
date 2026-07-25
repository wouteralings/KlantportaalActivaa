const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");
const { verstuurMail } = require("../_gedeeld/mail");

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
async function stuurReviewMelding(account, sterren, opmerking) {
  const ontvangers = [
    INFO_EMAIL,
    account.relatiebeheerder?.email,
    account.accountant?.email,
  ];

  const onderwerp = `Lage review-score (${sterren}★) — ${account.klantnaam}`;
  const tekst =
    `Er is via het klantportaal een review met een lage score binnengekomen.\n\n` +
    `Klant: ${account.klantnaam}\n` +
    `Klantnummer: ${account.klantnummer}\n` +
    `Relatiebeheerder: ${account.relatiebeheerder?.naam || "onbekend"}\n` +
    `Accountant: ${account.accountant?.naam || "onbekend"}\n` +
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
    const { accounts } = await herleidAccounts(req, token);
    // Bij meerdere gekoppelde klanten: de review hoort bij de eerste (of geef er één mee via accountId in de body).
    const gekozenAccountId = req.body?.accountId;
    const account = gekozenAccountId
      ? accounts.find((a) => a.accountId === gekozenAccountId) || accounts[0]
      : accounts[0];

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

    await stuurReviewMelding(account, sterren, opmerking);
    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { doorsturenNaarGoogle: false },
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
      body: { error: "Onverwachte fout bij verwerken van de review.", detail: String(err) },
    };
  }
};
