const { haalDynamicsToken, herleidAccounts } = require("../_gedeeld/identiteit");
const { haalInstellingen } = require("../_gedeeld/instellingen");

/**
 * LET OP — Google's richtlijnen voor bedrijfsprofielen verbieden "review gating": het
 * selectief alleen ontvangen klanten doorsturen naar een openbare review, en ontevreden
 * klanten daarvan weghouden. Dit endpoint implementeert exact dat patroon, dus wees je
 * bewust dat dit tegen Google's beleid in kan gaan. Technisch werkt het zoals gevraagd.
 *
 * Benodigd: de Google-reviewlink moet gezet zijn via PUT /api/beheer-instellingen
 * (alleen rol 'beheerder'), bijv. { "googleReviewUrl": "https://g.page/r/.../review" }.
 */
async function maakEscalatieTaak(resource, token, account, sterren, opmerking) {
  const body = {
    subject: `Lage review-score (${sterren}★) — ${account.klantnaam}`,
    description:
      `Klantnummer: ${account.klantnummer}\n` +
      `Sterren: ${sterren}/5\n` +
      `Opmerking van de klant:\n${opmerking || "(geen opmerking meegegeven)"}`,
    prioritycode: 2, // Hoog
    "regardingobjectid_account@odata.bind": `/accounts(${account.accountId})`,
  };

  const res = await fetch(`${resource}/api/data/v9.2/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Aanmaken escalatietaak mislukt: ${await res.text()}`);
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

    await maakEscalatieTaak(resource, token, account, sterren, opmerking);
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
