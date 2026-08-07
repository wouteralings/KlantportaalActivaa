/**
 * B2B-gastaccounts (klant-contactpersonen) beheren via Microsoft Graph — app-only, op DEZELFDE
 * app-registratie als de directory-reads en de mail: DYNAMICS_CLIENT_ID (2ad2d208). We hergebruiken
 * daarom bewust de token- en paginatiehelper uit entraGroepen.js, zodat er één plek is waar het
 * Graph-directory-token wordt gehaald.
 *
 * Waarvoor: klanten loggen in het portaal in als B2B-gast van de activaa.nl-tenant. Tot nu toe
 * werden die gasten handmatig in Entra uitgenodigd. Dit bestand maakt dat beheerbaar vanuit het
 * portaal: zien of een contactpersoon al een gastaccount heeft, uitnodigen, (de)blokkeren en
 * verwijderen.
 *
 * LET OP — dit staat volledig LOS van de portaal-documentrechten (documentrechten.js). Een
 * gastaccount bepaalt of iemand KAN inloggen; de documentrechten bepalen WAT hij daarna ziet.
 * Gasten hebben geen eigen SharePoint-rechten (documenten lopen app-only), dus "toegang" is hier
 * twee losse dingen die het beheerscherm ook los toont.
 *
 * Vereist op de app-registratie DYNAMICS_CLIENT_ID, type APPLICATION, met admin-consent:
 *   - User.Read.All        gasten + status lezen (GET /users)            [was al nodig voor Entra-groep]
 *   - User.Invite.All      uitnodigen (POST /invitations)
 *   - User.ReadWrite.All   (de)blokkeren (PATCH accountEnabled) en verwijderen (DELETE /users)
 *   - Mail.Send            de eigen Activaa-uitnodigingsmail (via mail.js)   [was al aanwezig]
 * Zonder deze permissies/consent geeft Graph een 403; dat wordt naar het beheerscherm gemeld.
 */

const { haalGraphToken: haalDirectoryGraphToken, haalAlles } = require("./entraGroepen");

const GRAPH = "https://graph.microsoft.com/v1.0";
// Gasten veranderen zelden binnen één beheersessie; een korte cache scheelt Graph-aanroepen bij het
// samenstellen van het overzicht. Na elke wijzigende actie legen we de cache expliciet.
const GAST_CACHE_MS = Number(process.env.GAST_CACHE_MS || 2 * 60 * 1000);
let cache = { tijd: 0, perEmail: null };

/**
 * Gastgebruikers-UPN's zien er soms uit als "naam_bedrijf.nl#EXT#@tenant.onmicrosoft.com"; het echte
 * adres staat vóór "#EXT#" met een underscore i.p.v. de laatste @. Zelfde omzetting als in api/rollen
 * en identiteit.js, zodat het matchen met het Dynamics-e-mailadres (emailaddress1) klopt.
 */
function normaliseerEmail(waarde) {
  let s = String(waarde || "").trim();
  if (!s) return "";
  if (s.includes("#EXT#")) {
    const voor = s.split("#EXT#")[0];
    const u = voor.lastIndexOf("_");
    if (u > -1) s = voor.slice(0, u) + "@" + voor.slice(u + 1);
  }
  return s.toLowerCase();
}

/** Kleine, niet-gevoelige samenvatting van een gast voor het beheerscherm. */
function gastSamenvatting(u) {
  return {
    id: u.id,
    displayName: u.displayName || "",
    mail: (u.mail || "").toLowerCase(),
    userPrincipalName: u.userPrincipalName || "",
    // Ontbreekt accountEnabled in de select, behandel dan als ingeschakeld (geen valse "geblokkeerd").
    accountEnabled: u.accountEnabled !== false,
    // "PendingAcceptance" = uitgenodigd maar nog niet geaccepteerd; "Accepted" = actief; "" = onbekend.
    externalUserState: u.externalUserState || "",
    userType: u.userType || "",
  };
}

/**
 * Alle gasten één keer ophalen en indexeren op genormaliseerd e-mailadres. We nemen per gast zowel
 * `mail`, `userPrincipalName` (ge-de-EXT't) als `otherMails` mee, want bij gasten staat het echte
 * adres vaak in `mail`/`otherMails` terwijl de UPN de #EXT#-notatie heeft.
 */
async function haalGastenPerEmail({ ververs = false } = {}) {
  const nu = Date.now();
  if (!ververs && cache.perEmail && nu - cache.tijd < GAST_CACHE_MS) return cache.perEmail;

  const token = await haalDirectoryGraphToken();
  const rijen = await haalAlles(
    `${GRAPH}/users?$filter=${encodeURIComponent("userType eq 'Guest'")}` +
      `&$select=id,displayName,mail,otherMails,userPrincipalName,userType,accountEnabled,externalUserState` +
      `&$top=999&$count=true`,
    token,
    20000
  );

  const perEmail = new Map();
  for (const u of rijen) {
    const info = gastSamenvatting(u);
    const adressen = [u.mail, u.userPrincipalName, ...(Array.isArray(u.otherMails) ? u.otherMails : [])];
    for (const a of adressen) {
      const norm = normaliseerEmail(a);
      if (norm && !perEmail.has(norm)) perEmail.set(norm, info);
    }
  }

  cache = { tijd: nu, perEmail };
  return perEmail;
}

/** Legen na een wijziging (uitnodigen/(de)blokkeren/verwijderen), zodat het overzicht klopt. */
function leegGastCache() {
  cache = { tijd: 0, perEmail: null };
}

/** De gast (of null) achter een e-mailadres. */
async function vindGast(email) {
  const norm = normaliseerEmail(email);
  if (!norm) return null;
  const perEmail = await haalGastenPerEmail();
  return perEmail.get(norm) || null;
}

/**
 * Nodigt een e-mailadres uit als B2B-gast. sendInvitationMessage:false — wij versturen zélf de
 * (gebrande) uitnodigingsmail via mail.js. Geeft { id, inviteRedeemUrl, email } terug.
 */
async function nodigGastUit({ email, naam, redirectUrl }) {
  const doelEmail = String(email || "").trim();
  if (!doelEmail || !doelEmail.includes("@")) {
    const fout = new Error("Ongeldig e-mailadres.");
    fout.status = 400;
    throw fout;
  }
  const token = await haalDirectoryGraphToken();
  const body = {
    invitedUserEmailAddress: doelEmail,
    inviteRedirectUrl: redirectUrl || process.env.PORTAL_URL || "https://mijn.activaa.nl",
    sendInvitationMessage: false,
  };
  if (naam) body.invitedUserDisplayName = String(naam).trim();

  const res = await fetch(`${GRAPH}/invitations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const fout = new Error(`Uitnodigen mislukt (${res.status}): ${await res.text()}`);
    fout.status = res.status;
    throw fout;
  }
  const data = await res.json();
  leegGastCache();
  return {
    id: (data.invitedUser && data.invitedUser.id) || "",
    inviteRedeemUrl: data.inviteRedeemUrl || "",
    email: data.invitedUserEmailAddress || doelEmail,
  };
}

/** Zet een gastaccount aan/uit (blokkeren = false). Omkeerbaar. */
async function zetAccountEnabled(userId, enabled) {
  const id = String(userId || "").trim();
  if (!id) { const f = new Error("Geen userId."); f.status = 400; throw f; }
  const token = await haalDirectoryGraphToken();
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ accountEnabled: !!enabled }),
  });
  if (!res.ok) {
    const fout = new Error(`Wijzigen accountstatus mislukt (${res.status}): ${await res.text()}`);
    fout.status = res.status;
    throw fout;
  }
  leegGastCache();
}

/** Verwijdert het gast-userobject definitief (DELETE /users). Onomkeerbaar. */
async function verwijderGast(userId) {
  const id = String(userId || "").trim();
  if (!id) { const f = new Error("Geen userId."); f.status = 400; throw f; }
  const token = await haalDirectoryGraphToken();
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const fout = new Error(`Verwijderen gast mislukt (${res.status}): ${await res.text()}`);
    fout.status = res.status;
    throw fout;
  }
  leegGastCache();
}

module.exports = {
  normaliseerEmail,
  haalGastenPerEmail,
  leegGastCache,
  vindGast,
  nodigGastUit,
  zetAccountEnabled,
  verwijderGast,
};
