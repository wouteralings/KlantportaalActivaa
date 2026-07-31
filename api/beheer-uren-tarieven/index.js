/**
 * /api/beheer-uren-tarieven — beheer van de interne urenregistratie (beheerder-only).
 * Toont alle actieve Activaa-medewerkers (Dynamics systemusers, zelfde selectie als
 * /api/beheer-medewerkers) samengevoegd met hun uurtarieven (normaal/hoog/laag) en declarabel-doel,
 * plus de instellingen van de herinneringsflow.
 *
 *   - GET                                  → { medewerkers:[{id,naam,email,functie,tarief}], instellingen }
 *   - POST { actie:"tarief", email, naam, tarief_normaal, tarief_hoog, tarief_laag, declarabel_doel, actief }
 *   - POST { actie:"instellingen", herinnering_actief, herinnering_weekdag, herinnering_minuren, herinnering_webhook, herinnering_tekst }
 *
 * Route beveiligd via staticwebapp.config.json (alleen 'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const uren = require("../_gedeeld/urenDataverse");
const instellingenStore = require("../_gedeeld/urenInstellingenIntern");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body };
}

async function haalMedewerkers() {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) return [];
  const token = await haalDynamicsToken();
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", Prefer: "odata.maxpagesize=1000" };
  const start = `${resource}/api/data/v9.2/systemusers` +
    `?$select=systemuserid,fullname,internalemailaddress,title,address1_telephone1` +
    `&$filter=isdisabled eq false and internalemailaddress ne null and applicationid eq null` +
    `&$orderby=fullname asc`;
  const alles = [];
  let next = start;
  while (next && alles.length < 2000) {
    const res = await fetch(next, { headers });
    if (!res.ok) throw new Error(`Ophalen medewerkers mislukt (${res.status}): ${await res.text()}`);
    const data = await res.json();
    alles.push(...(data.value || []));
    next = data["@odata.nextLink"] || null;
  }
  const TELFILTER = (process.env.MEDEWERKER_TELEFOONFILTER || "850600960").replace(/\D/g, "");
  const cijfers = (s) => String(s || "").replace(/\D/g, "");
  return alles
    .filter((u) => u.title && cijfers(u.address1_telephone1).includes(TELFILTER))
    .map((u) => ({ id: u.systemuserid, naam: u.fullname || "", email: (u.internalemailaddress || "").toLowerCase(), functie: u.title || "" }))
    .filter((m) => m.email);
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!rollen.includes("beheerder")) return json(context, 403, { error: "Geen toegang." });
  const email = haalEmailUitPrincipal(req);
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const [medewerkers, tarieven, instellingen] = await Promise.all([
        haalMedewerkers().catch(() => []),
        uren.lijstTarieven(),
        instellingenStore.haalInstellingen(),
      ]);
      const tvan = new Map(tarieven.map((t) => [String(t.medewerker_email).toLowerCase(), t]));
      // Medewerkers uit Dynamics, aangevuld met eventueel losstaande tarief-rijen (voor het geval
      // iemand niet meer in de Dynamics-selectie zit maar wél een tarief heeft).
      const gezien = new Set();
      const rijen = medewerkers.map((m) => {
        gezien.add(m.email);
        const t = tvan.get(m.email);
        return { ...m, tarief: tariefUit(t) };
      });
      for (const t of tarieven) {
        const e = String(t.medewerker_email).toLowerCase();
        if (!gezien.has(e)) rijen.push({ id: "", naam: t.medewerker_naam || e, email: e, functie: "", tarief: tariefUit(t) });
      }
      return json(context, 200, { medewerkers: rijen, instellingen });
    }

    if (methode === "POST" || methode === "PATCH") {
      const b = req.body || {};
      if (b.actie === "instellingen") {
        const opgeslagen = await instellingenStore.zetInstellingen({
          herinneringActief: !!b.herinnering_actief,
          herinneringWeekdag: b.herinnering_weekdag != null ? Number(b.herinnering_weekdag) : 5,
          herinneringMinuren: b.herinnering_minuren != null ? Number(b.herinnering_minuren) : 40,
          herinneringWebhook: b.herinnering_webhook || "",
          herinneringTekst: b.herinnering_tekst || "",
        });
        return json(context, 200, { ok: true, instellingen: opgeslagen });
      }
      // Standaard: tarief zetten.
      if (!b.email) return json(context, 400, { error: "Geef een e-mailadres mee." });
      const num = (v) => (v === "" || v == null ? null : Number(v));
      const opgeslagen = await uren.zetTarief(String(b.email).toLowerCase(), {
        naam: b.naam || null,
        tarief_normaal: num(b.tarief_normaal), tarief_hoog: num(b.tarief_hoog), tarief_laag: num(b.tarief_laag),
        declarabel_doel: num(b.declarabel_doel), leidinggevende: b.leidinggevende || null,
        deadline_weekdag: b.deadline_weekdag === "" || b.deadline_weekdag == null ? null : Number(b.deadline_weekdag),
        actief: b.actief == null ? true : !!b.actief,
      }, email);
      return json(context, 200, { ok: true, tarief: tariefUit(opgeslagen) });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon het tariefbeheer niet verwerken.", detail: String(err.message || err) });
  }
};

function tariefUit(t) {
  if (!t) return { normaal: null, hoog: null, laag: null, declarabelDoel: null, leidinggevende: "", actief: true, gewijzigdOp: null, gewijzigdDoor: "" };
  return {
    normaal: t.tarief_normaal == null ? null : Number(t.tarief_normaal),
    hoog: t.tarief_hoog == null ? null : Number(t.tarief_hoog),
    laag: t.tarief_laag == null ? null : Number(t.tarief_laag),
    declarabelDoel: t.declarabel_doel == null ? null : Number(t.declarabel_doel),
    leidinggevende: t.leidinggevende || "",
    deadlineWeekdag: t.deadline_weekdag == null ? null : Number(t.deadline_weekdag),
    actief: t.actief == null ? true : !!t.actief,
    gewijzigdOp: t.gewijzigd_op || null, gewijzigdDoor: t.gewijzigd_door || "",
  };
}
