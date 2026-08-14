/**
 * /api/mijn-toegang — de effectieve rol-toegang van de ingelogde medewerker: welke tabs hij mag zien in
 * het medewerkers- en beheerdersportaal en welke functies zijn rol toestaat. Gebruikt door beide portalen
 * om tabs te verbergen op basis van de toegewezen rol (Beheer → Medewerkers → Rollen & toegang).
 *
 * Belangrijk (veilig ontwerp): dit VERFIJNT alleen binnen de harde grens 'medewerker'/'beheerder'. Heeft
 * iemand geen rol, dan geldt geen beperking (heeftRol=false) — zo raakt niemand per ongeluk buitengesloten.
 *
 *   GET → { heeftRol, rolNaam, medewerkerTabs:[key], beheerTabs:[key], functies:{key:bool}, beheerder }
 *
 * Route beveiligd via staticwebapp.config.json (rol 'medewerker'/'beheerder').
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { haalRolVoorEmail } = require("../_gedeeld/rollenConfig");

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) { context.res = json(403, { error: "Geen toegang." }); return; }
  const email = (haalEmailUitPrincipal(req) || "").trim();
  let rol = null;
  try { rol = await haalRolVoorEmail(email); } catch { rol = null; }
  context.res = json(200, {
    heeftRol: !!rol,
    rolNaam: rol ? rol.naam : "",
    medewerkerTabs: rol ? (rol.medewerkerTabs || []) : [],
    beheerTabs: rol ? (rol.beheerTabs || []) : [],
    functies: rol ? (rol.functies || {}) : {},
    beheerder: rollen.includes("beheerder"),
  });
};
