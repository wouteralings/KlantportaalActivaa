/**
 * /api/mijn-toegang — de effectieve rol-toegang van de ingelogde medewerker: welke tabs hij mag zien in
 * het medewerkers- en beheerdersportaal en welke functies zijn rol toestaat. Gebruikt door beide portalen
 * om tabs te verbergen op basis van de toegewezen rol (Beheer → Medewerkers → Rollen & toegang).
 *
 * Belangrijk (veilig ontwerp): dit VERFIJNT alleen binnen de harde grens 'medewerker'/'beheerder'. Heeft
 * iemand geen rol, dan geldt geen beperking (heeftRol=false) — zo raakt niemand per ongeluk buitengesloten.
 *
 * FASE 4 — "kijken als rol": is de aanroeper een ECHTE beheerder én heeft hij een actieve impersonatie
 * (zie /api/impersonatie), dan geven we de tabs/functies van díe rol terug met beheerder:false, plus een
 * impersonatie-blok. Zo laat het hele portaal precies zien wat de rol ziet/kan. De harde beveiliging
 * blijft op zijn echte identiteit; dit stuurt alleen de weergave.
 *
 *   GET → { heeftRol, rolNaam, medewerkerTabs:[key], beheerTabs:[key], functies:{key:bool}, beheerder,
 *           standaardUitSubTabs:[key], impersonatie:{ actief, rolNaam, rolSleutel } }
 *
 * `standaardUitSubTabs` = subpagina's die pas zichtbaar zijn als een rol ze EXPLICIET krijgt. Normaal
 * erft een subpagina de rubriek zolang er voor die rubriek nog niets is ingesteld; nieuw toegevoegde
 * functionaliteit willen we juist niet stilzwijgend aan bestaande rollen geven.
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder').
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { haalRolVoorEmail, haalRollenConfig, STANDAARD_UIT_SUBTABS } = require("../_gedeeld/rollenConfig");
const { haalImpersonatie } = require("../_gedeeld/impersonatie");

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) { context.res = json(403, { error: "Geen toegang." }); return; }
  const email = (haalEmailUitPrincipal(req) || "").trim();
  const echtBeheerder = rollen.includes("beheerder");

  // "Kijken als rol": alleen een echte beheerder kan een rol nabootsen. We tonen dan de tabs/functies
  // van die rol i.p.v. zijn eigen, met beheerder:false, zodat het portaal precies laat zien wat de rol
  // ziet en kan. Stoppen kan altijd via de banner (/api/impersonatie blijft op zijn echte rol beveiligd).
  if (echtBeheerder) {
    let imp = null;
    try { imp = await haalImpersonatie(email); } catch { imp = null; }
    if (imp && imp.rolSleutel) {
      let nagebootst = null;
      try {
        const { rollen: rln } = await haalRollenConfig();
        nagebootst = rln.find((r) => r.sleutel === imp.rolSleutel) || null;
      } catch { nagebootst = null; }
      if (nagebootst) {
        context.res = json(200, {
          heeftRol: true,
          rolNaam: nagebootst.naam,
          medewerkerTabs: nagebootst.medewerkerTabs || [],
          bewerkTabs: nagebootst.bewerkTabs || [],
          verwijderTabs: nagebootst.verwijderTabs || [],
          subTabs: nagebootst.subTabs || [],
          bewerkSubTabs: nagebootst.bewerkSubTabs || [],
          verwijderSubTabs: nagebootst.verwijderSubTabs || [],
          bulkVerwijderSubTabs: nagebootst.bulkVerwijderSubTabs || [],
          beheerTabs: nagebootst.beheerTabs || [],
          bewerkBeheerTabs: nagebootst.bewerkBeheerTabs || [],
          functies: nagebootst.functies || {},
          standaardUitSubTabs: STANDAARD_UIT_SUBTABS,
          beheerder: false,
          impersonatie: { actief: true, rolNaam: nagebootst.naam, rolSleutel: nagebootst.sleutel },
        });
        return;
      }
    }
  }

  let rol = null;
  try { rol = await haalRolVoorEmail(email); } catch { rol = null; }
  context.res = json(200, {
    heeftRol: !!rol,
    rolNaam: rol ? rol.naam : "",
    medewerkerTabs: rol ? (rol.medewerkerTabs || []) : [],
    bewerkTabs: rol ? (rol.bewerkTabs || []) : [],
    verwijderTabs: rol ? (rol.verwijderTabs || []) : [],
    subTabs: rol ? (rol.subTabs || []) : [],
    bewerkSubTabs: rol ? (rol.bewerkSubTabs || []) : [],
    verwijderSubTabs: rol ? (rol.verwijderSubTabs || []) : [],
    bulkVerwijderSubTabs: rol ? (rol.bulkVerwijderSubTabs || []) : [],
    beheerTabs: rol ? (rol.beheerTabs || []) : [],
    bewerkBeheerTabs: rol ? (rol.bewerkBeheerTabs || []) : [],
    functies: rol ? (rol.functies || {}) : {},
    // Subpagina's die nieuw zijn en dus expliciet aangezet moeten worden (zie rollenConfig).
    standaardUitSubTabs: STANDAARD_UIT_SUBTABS,
    beheerder: echtBeheerder,
    impersonatie: { actief: false, rolNaam: "", rolSleutel: "" },
  });
};
