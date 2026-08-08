/**
 * /api/mw-planning-capaciteit — de beschikbare capaciteit per medewerker per maand voor de
 * maandplanning-bezetting (Stap 3c). Combineert drie bronnen die al in het systeem staan:
 *   - het WERKROOSTER per medewerker → parttime-factor (verlofDataverse.berekenParttimeFactor:
 *     werkelijk gewerkte uren/week ÷ 40, ook voor een 2-wekelijks rooster);
 *   - het DECLARABEL-DOEL % per medewerker (urentarief cr283_urentarief, uren.lijstTarieven);
 *   - VERLOF (cr283_verlofaanvraag): goedgekeurd verlof (gaat van de capaciteit af) en aangevraagd
 *     verlof (getoond zodat je een vakantieaanvraag tegen de bezetting kunt beoordelen).
 *
 * De frontend beslist welke factoren meetellen (rooster/declarabel-doel apart aan/uit) — dit
 * endpoint geeft de losse bouwstenen terug, zodat beide combinaties mogelijk zijn zonder
 * herberekening op de server.
 *
 * GET ?maand=YYYY-MM[&scope=alle] → { maand, werkdagen, normPerDag, medewerkers: [{ email, naam,
 *   leidinggevende, parttimeFactor, roosterUren, declarabelDoel, verlofGoedgekeurd, verlofAangevraagd }] }
 *
 * Scoping als bij mw-uren-bezetting: standaard alleen wie de ingelogde medewerker als leidinggevende
 * heeft; een beheerder kan met ?scope=alle iedereen zien.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { metPlanningRecht } = require("../_gedeeld/planningRecht");
const uren = require("../_gedeeld/urenDataverse");
const verlof = require("../_gedeeld/verlofDataverse");
const { haalUitgeslotenMedewerkers } = require("../_gedeeld/planningInstellingen");

const pad = (n) => String(n).padStart(2, "0");

function maandVanNu() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

async function mijnNaam(req, email) {
  let naam = haalNaamUitPrincipal(req) || "";
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (resource && email) {
    try {
      const token = await haalDynamicsToken();
      const veilig = String(email).replace(/'/g, "''");
      const res = await fetch(`${resource}/api/data/v9.2/systemusers?$select=fullname&$filter=internalemailaddress eq '${encodeURIComponent(veilig)}' and isdisabled eq false&$top=1`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
      if (res.ok) { const d = await res.json(); if (d.value && d.value[0] && d.value[0].fullname) naam = d.value[0].fullname; }
    } catch { /* val terug op de principal-naam */ }
  }
  return naam;
}

module.exports = metPlanningRecht(async function (context, req) {
  try {
    if (req.method !== "GET") {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
      return;
    }
    const email = haalEmailUitPrincipal(req);
    const isBeheerder = haalRollenUitPrincipal(req).includes("beheerder");
    const maand = (req.query && req.query.maand) || maandVanNu();
    const alle = (req.query && req.query.scope) === "alle" && isBeheerder;
    const naam = await mijnNaam(req, email);

    const [jaar, mnd] = maand.split("-").map(Number);
    if (!jaar || !mnd || mnd < 1 || mnd > 12) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef maand als YYYY-MM mee." } };
      return;
    }
    const laatsteDag = new Date(Date.UTC(jaar, mnd, 0)).getUTCDate();
    const eerste = `${jaar}-${pad(mnd)}-01`;
    const laatste = `${jaar}-${pad(mnd)}-${pad(laatsteDag)}`;
    let werkdagen = 0;
    for (let d = 1; d <= laatsteDag; d++) {
      const dow = new Date(Date.UTC(jaar, mnd - 1, d)).getUTCDay();
      if (dow !== 0 && dow !== 6) werkdagen++;
    }
    const normPerDag = uren.WEEK_UREN_EIS / 5;

    // Medewerkers (uit de urentarieven), gescoped op leidinggevende tenzij beheerder + scope=alle.
    // Uitgesloten medewerkers (Beheer → Planning, bijv. secretaresses/loonadministratie) vallen weg.
    const mij = String(naam || "").trim().toLowerCase();
    const uitgesloten = new Set((await haalUitgeslotenMedewerkers().catch(() => [])).map((u) => String(u.email || "").toLowerCase()));
    const tarieven = (await uren.lijstTarieven())
      .filter((t) => t.actief !== false && (t.medewerker_email || t.medewerker_naam))
      .filter((t) => !uitgesloten.has(String(t.medewerker_email || "").toLowerCase()))
      .filter((t) => alle || (t.leidinggevende || "").trim().toLowerCase() === mij);

    // Verlof: goedgekeurd (overlap met de maand) en aangevraagd (nog te beoordelen), per e-mail opgeteld.
    const [goedgekeurd, aangevraagd] = await Promise.all([
      verlof.goedgekeurdVerlof({ vanaf: eerste, tot: laatste }).catch(() => []),
      verlof.aanvragenVoorLeidinggevende({ leidinggevendeNaam: naam, alle }).catch(() => []),
    ]);
    const somPerEmail = (lijst, filter) => {
      const m = {};
      for (const a of lijst) {
        if (filter && !filter(a)) continue;
        const e = String(a.medewerkerEmail || "").toLowerCase();
        if (!e) continue;
        m[e] = (m[e] || 0) + (Number(a.aantalUren) || 0);
      }
      return m;
    };
    const overlaptMaand = (a) => (a.startdatum || "") <= laatste && (a.einddatum || "") >= eerste;
    const goedPerEmail = somPerEmail(goedgekeurd, overlaptMaand);
    const aangePerEmail = somPerEmail(aangevraagd, overlaptMaand);

    // Rooster-factor per medewerker (parallel).
    const factoren = await Promise.all(tarieven.map((t) =>
      verlof.berekenParttimeFactor(t.medewerker_email).catch(() => 1)
    ));

    const medewerkers = tarieven.map((t, i) => {
      const e = String(t.medewerker_email || "").toLowerCase();
      const factor = factoren[i];
      const roosterUren = Math.round(werkdagen * normPerDag * factor * 100) / 100;
      return {
        email: t.medewerker_email || "",
        naam: t.medewerker_naam || t.medewerker_email || "",
        leidinggevende: t.leidinggevende || "",
        parttimeFactor: Math.round(factor * 1000) / 1000,
        roosterUren,
        declarabelDoel: t.declarabel_doel != null ? Number(t.declarabel_doel) : null,
        verlofGoedgekeurd: Math.round((goedPerEmail[e] || 0) * 100) / 100,
        verlofAangevraagd: Math.round((aangePerEmail[e] || 0) * 100) / 100,
      };
    }).sort((a, b) => String(a.naam).localeCompare(String(b.naam), "nl"));

    context.res = { headers: { "Content-Type": "application/json" }, body: { maand, werkdagen, normPerDag, medewerkers } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de capaciteit niet berekenen.", detail: String(err.message || err) } };
  }
});
