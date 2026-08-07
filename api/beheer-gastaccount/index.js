const { nodigGastUit, zetAccountEnabled, verwijderGast } = require("../_gedeeld/gastaccounts");
const { verstuurMail } = require("../_gedeeld/mail");

/**
 * Acties op één gastaccount — Beheer → Gastaccounts en het contactpersoon-detail. Route is
 * beveiligd via staticwebapp.config.json (alleen rol 'beheerder').
 *
 * POST body: { actie, email, naam, userId }
 *   - "uitnodigen"  → POST /invitations (sendInvitationMessage:false) + eigen Activaa-uitnodigingsmail
 *                     via mail.js met de acceptatielink. Nodig: email (+ optioneel naam).
 *   - "blokkeren"   → accountEnabled:false (omkeerbaar). Nodig: userId.
 *   - "deblokkeren" → accountEnabled:true. Nodig: userId.
 *   - "verwijderen" → DELETE /users/{userId} (definitief). Nodig: userId.
 *
 * De destructieve/omkeerbare acties worden aan de voorkant nog eens bevestigd; hier dwingen we
 * alleen de aanwezigheid van de juiste velden af en vertrouwen we op de beheerder-rol uit de route.
 */
module.exports = async function (context, req) {
  try {
    if (req.method !== "POST") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }

    const body = req.body || {};
    const actie = String(body.actie || "").trim();

    const jsonAntwoord = (status, obj) => {
      context.res = { status, headers: { "Content-Type": "application/json" }, body: obj };
    };

    if (actie === "uitnodigen") {
      const email = String(body.email || "").trim();
      const naam = String(body.naam || "").trim();
      if (!email || !email.includes("@")) return jsonAntwoord(400, { error: "Geen geldig e-mailadres." });

      const resultaat = await nodigGastUit({ email, naam });
      const portaal = process.env.PORTAL_URL || "https://mijn.activaa.nl";
      const link = resultaat.inviteRedeemUrl || portaal;
      const aanhef = naam ? `Beste ${naam},` : "Beste,";
      const tekst =
        `${aanhef}\n\n` +
        `U krijgt toegang tot het beveiligde klantportaal van Activaa. Via het portaal kunt u onder meer uw ` +
        `documenten, gegevens en openstaande taken inzien en afhandelen.\n\n` +
        `Activeer uw toegang via onderstaande link en log in met dit e-mailadres:\n${link}\n\n` +
        `Na activatie bereikt u het portaal voortaan via ${portaal}.\n\n` +
        `Heeft u vragen? Neem gerust contact met ons op.\n\n` +
        `Met vriendelijke groet,\nActivaa Accountants en Adviseurs`;

      try {
        await verstuurMail({ ontvangers: email, onderwerp: "Toegang tot het klantportaal van Activaa", tekst });
        return jsonAntwoord(200, { ok: true, id: resultaat.id, gemaild: true });
      } catch (mailErr) {
        // Het gastaccount is wél aangemaakt; alleen de mail lukte niet. Geef de link terug zodat de
        // beheerder 'm desnoods zelf kan doorsturen, en meld het zichtbaar.
        context.log.error(`Uitnodiging aangemaakt maar mail versturen mislukt: ${mailErr}`);
        return jsonAntwoord(200, {
          ok: true,
          id: resultaat.id,
          gemaild: false,
          inviteRedeemUrl: resultaat.inviteRedeemUrl,
          waarschuwing: "Gastaccount is aangemaakt, maar de uitnodigingsmail kon niet worden verstuurd.",
        });
      }
    }

    if (actie === "blokkeren" || actie === "deblokkeren") {
      const userId = String(body.userId || "").trim();
      if (!userId) return jsonAntwoord(400, { error: "Geen userId." });
      await zetAccountEnabled(userId, actie === "deblokkeren");
      return jsonAntwoord(200, { ok: true });
    }

    if (actie === "verwijderen") {
      const userId = String(body.userId || "").trim();
      if (!userId) return jsonAntwoord(400, { error: "Geen userId." });
      await verwijderGast(userId);
      return jsonAntwoord(200, { ok: true });
    }

    return jsonAntwoord(400, { error: "Onbekende actie." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De Entra-/Graph-koppeling is nog niet geconfigureerd." } };
      return;
    }
    const status = err && err.status && Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 500;
    context.log.error(err);
    context.res = {
      status: status === 403 ? 403 : 500,
      headers: { "Content-Type": "application/json" },
      body: {
        error:
          status === 403
            ? "Geen toestemming bij Microsoft Graph. Ontbreekt User.Invite.All / User.ReadWrite.All met admin-consent op de app-registratie?"
            : "Onverwachte fout bij de gastaccount-actie.",
        detail: String((err && err.message) || err),
      },
    };
  }
};
