/**
 * Entra-groepen via Microsoft Graph (app-only).
 *
 * Waarvoor: toegang tot het medewerkers- en beheerdersportaal hangt aan de Azure-rollen
 * 'medewerker' en 'beheerder'. Die werden per persoon met een uitnodiging in Azure Role
 * management toegekend — bij elke nieuwe collega handwerk, en uitnodigingen verlopen.
 * In plaats daarvan bepaalt api/rollen bij het inloggen zelf welke rollen iemand krijgt:
 * zit je in de ingestelde Entra-groep (bij Activaa: "Activaa B.V."), dan ben je medewerker.
 *
 * Gebruikt dezelfde app-registratie en dezelfde Application Settings als de mailkoppeling
 * (DYNAMICS_TENANT_ID / DYNAMICS_CLIENT_ID / DYNAMICS_CLIENT_SECRET). Daar is één
 * APPLICATION-permission bij nodig, met admin-consent:
 *
 *   GroupMember.Read.All   (Microsoft Graph, type Application)
 *
 * Zonder die consent geeft Graph een 403 en levert dit bestand een lege ledenlijst op. Dat is
 * bewust: geen groepsleden betekent geen rollen uit de groep, nooit per ongeluk toegang voor
 * iedereen. api/rollen valt in dat geval terug op de noodbeheerders uit de Application Settings.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
// Groepsleden veranderen zelden, maar rollen worden bij elke login opgehaald. Een korte cache
// scheelt Graph-aanroepen zonder dat een nieuwe collega lang moet wachten op toegang.
const CACHE_MS = Number(process.env.ENTRA_GROEP_CACHE_MS || 5 * 60 * 1000);
const cache = new Map(); // groepId -> { tijd, emails: Set }

async function haalGraphToken() {
  const tenantId = process.env.DYNAMICS_TENANT_ID;
  const clientId = process.env.DYNAMICS_CLIENT_ID;
  const clientSecret = process.env.DYNAMICS_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error("MISSING_CONFIG");

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) throw new Error(`Graph-token ophalen mislukt (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

/** Loopt alle Graph-pagina's af (@odata.nextLink) tot maximaal `max` rijen. */
async function haalAlles(url, token, max) {
  const alles = [];
  let volgende = url;
  while (volgende && alles.length < max) {
    // ConsistencyLevel: eventual is verplicht voor "advanced queries" op directory-objecten —
    // o.a. $orderby (+ groot $top) op /groups en de type-cast op /transitiveMembers. Zonder deze
    // header (samen met $count=true in de URL) geeft Graph een 400 Request_UnsupportedQuery.
    const res = await fetch(volgende, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ConsistencyLevel: "eventual" },
    });
    if (!res.ok) {
      const fout = new Error(`Graph-aanroep mislukt (${res.status}): ${await res.text()}`);
      fout.status = res.status;
      throw fout;
    }
    const data = await res.json();
    alles.push(...(data.value || []));
    volgende = data["@odata.nextLink"] || null;
  }
  return alles.slice(0, max);
}

/**
 * Alle groepen in de tenant, om er in het beheersportaal één te kunnen kiezen.
 * Geeft [{ id, naam, email, aantalLeden: null }] terug, op naam gesorteerd.
 */
async function haalGroepen() {
  const token = await haalGraphToken();
  const rijen = await haalAlles(
    `${GRAPH}/groups?$select=id,displayName,mail&$top=999&$orderby=displayName&$count=true`,
    token,
    2000
  );
  return rijen.map((g) => ({ id: g.id, naam: g.displayName || "(zonder naam)", email: g.mail || "" }));
}

const LEDEN_SELECT = "$select=id,mail,userPrincipalName,otherMails";

function voegEmailsToe(emails, leden) {
  for (const l of leden || []) {
    for (const kandidaat of [l.mail, l.userPrincipalName, ...(Array.isArray(l.otherMails) ? l.otherMails : [])]) {
      const schoon = String(kandidaat || "").trim().toLowerCase();
      if (schoon) emails.add(schoon);
    }
  }
}

/**
 * De e-mailadressen van alle gebruikers in een groep. Alles in kleine letters, want e-mail is niet
 * case-sensitive en de vergelijking met de ingelogde gebruiker moet niet op een hoofdletter stuklopen.
 *
 * We combineren twee bronnen zodat het robuust is als één ervan in de tenant leeg terugkomt:
 *   1. de DIRECTE leden (/members) — een eenvoudige query zonder advanced-query-vereisten;
 *   2. de TRANSITIEVE leden (/transitiveMembers, incl. geneste groepen) — een advanced query
 *      (ConsistencyLevel: eventual + $count), die niet in elke tenant/permissie-situatie leden
 *      teruggeeft. De directe leden vangen dat op.
 * De e-mailadressen worden samengevoegd (ontdubbeld via de Set).
 *
 * Naast `mail` en `userPrincipalName` nemen we ook `otherMails` mee: bij gastgebruikers staat het
 * echte adres daar vaak, terwijl de UPN de #EXT#-notatie heeft.
 *
 * Foutafhandeling: lukt geen van beide bronnen én is er niets gevonden, dan gooien we de fout door
 * (zodat het beheerscherm bijv. de ontbrekende GroupMember.Read.All-consent kan melden). Lukt er
 * minstens één, dan geven we terug wat we hebben.
 */
async function haalGroepEmails(groepId) {
  if (!groepId) return new Set();

  const inCache = cache.get(groepId);
  if (inCache && Date.now() - inCache.tijd < CACHE_MS) return inCache.emails;

  const token = await haalGraphToken();
  const emails = new Set();
  let laatsteFout = null;

  // 1) Directe leden — simpele query (geen ConsistencyLevel/$count nodig).
  try {
    const direct = await haalAlles(
      `${GRAPH}/groups/${encodeURIComponent(groepId)}/members/microsoft.graph.user?${LEDEN_SELECT}&$top=999`,
      token,
      5000
    );
    voegEmailsToe(emails, direct);
  } catch (e) {
    laatsteFout = e;
  }

  // 2) Transitieve leden (incl. geneste groepen) — advanced query.
  try {
    const trans = await haalAlles(
      `${GRAPH}/groups/${encodeURIComponent(groepId)}/transitiveMembers/microsoft.graph.user?${LEDEN_SELECT}&$top=999&$count=true`,
      token,
      5000
    );
    voegEmailsToe(emails, trans);
  } catch (e) {
    laatsteFout = e;
  }

  // Alleen als we écht niets vonden én er onderweg een fout was: die fout doorgeven (zodat het
  // een echte permissie-/configuratiefout blijft, geen stil "0 leden").
  if (emails.size === 0 && laatsteFout) throw laatsteFout;

  cache.set(groepId, { tijd: Date.now(), emails });
  return emails;
}

/** Leegt de cache — na het wijzigen van de groep in het beheersportaal willen we direct het nieuwe beeld. */
function leegCache() {
  cache.clear();
}

/**
 * Diagnose: probeert de ledenqueries rechtstreeks en rapporteert per query de HTTP-status, het
 * aantal teruggekomen items en of het eerste item een e-mail/UPN heeft. Zo is precies te zien of het
 * probleem zit in het lezen van de leden (0 items / 403) of in het lezen van de gebruikersgegevens
 * (wel items, maar zonder mail/UPN → app mist Directory.Read.All/User.Read.All). Alleen voor beheer.
 */
async function diagnoseGroep(groepId) {
  if (!groepId) return { fout: "geen groepId" };
  const token = await haalGraphToken();
  const probeer = async (pad) => {
    try {
      const res = await fetch(`${GRAPH}/groups/${encodeURIComponent(groepId)}/${pad}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ConsistencyLevel: "eventual" },
      });
      const tekst = await res.text();
      let data = null;
      try { data = JSON.parse(tekst); } catch { /* niet-JSON */ }
      const items = (data && data.value) || [];
      const eerste = items[0] || null;
      return {
        status: res.status,
        aantal: items.length,
        odataCount: data ? data["@odata.count"] : undefined,
        eersteVelden: eerste ? Object.keys(eerste) : [],
        eersteHeeftMailOfUpn: !!(eerste && (eerste.mail || eerste.userPrincipalName)),
        fout: res.ok ? "" : String(tekst || "").slice(0, 300),
      };
    } catch (e) {
      return { status: "ERR", fout: String((e && e.message) || e) };
    }
  };
  return {
    membersUser: await probeer(`members/microsoft.graph.user?${LEDEN_SELECT}&$top=5`),
    membersRuw: await probeer(`members?$select=id,displayName&$top=5`),
    transitiveUser: await probeer(`transitiveMembers/microsoft.graph.user?${LEDEN_SELECT}&$top=5&$count=true`),
  };
}

module.exports = { haalGroepen, haalGroepEmails, leegCache, diagnoseGroep };
