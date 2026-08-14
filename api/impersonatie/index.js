/**
 * /api/impersonatie — "kijken als rol" (FASE 4). Alleen een ECHTE beheerder kan het portaal bekijken
 * zoals een bepaalde rol dat ziet/kan. De actieve keuze wordt server-side bewaard (per beheerder-email,
 * zie _gedeeld/impersonatie.js) en door /api/mijn-toegang toegepast op de UI.
 *
 *   GET  → { actief, rolSleutel, rolNaam }                 (huidige stand voor deze beheerder)
 *   POST { actie: "start", rolSleutel } → begin met kijken als die rol
 *   POST { actie: "stop" }              → stop met kijken
 *
 * Beveiliging: de route staat in staticwebapp.config.json op rol 'beheerder'; daarnaast controleren we
 * hier nog eens expliciet op de ECHTE beheerdersrol uit de principal (defense in depth). Zo kan stoppen
 * altijd — ook wanneer de nagebootste rol zelf geen enkel tabblad zou tonen.
 */
const { haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { haalImpersonatie, zetImpersonatie, stopImpersonatie } = require("../_gedeeld/impersonatie");
const { haalRollenConfig } = require("../_gedeeld/rollenConfig");

const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

async function rolNaamVan(rolSleutel) {
  if (!rolSleutel) return "";
  try {
    const { rollen } = await haalRollenConfig();
    const r = rollen.find((x) => x.sleutel === rolSleutel);
    return r ? r.naam : "";
  } catch {
    return "";
  }
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  // Harde grens: uitsluitend een ECHTE beheerder mag impersoneren.
  if (!rollen.includes("beheerder")) { context.res = json(403, { error: "Alleen beheerders kunnen kijken als rol." }); return; }
  const email = (haalEmailUitPrincipal(req) || "").trim();
  if (!email) { context.res = json(400, { error: "Kon geen e-mailadres uit de ingelogde gebruiker halen." }); return; }

  const method = (req.method || "GET").toUpperCase();

  if (method === "GET") {
    let imp = null;
    try { imp = await haalImpersonatie(email); } catch { imp = null; }
    const rolSleutel = imp ? imp.rolSleutel : "";
    context.res = json(200, { actief: !!imp, rolSleutel, rolNaam: await rolNaamVan(rolSleutel) });
    return;
  }

  if (method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const actie = String(body.actie || "").trim().toLowerCase();

    if (actie === "stop") {
      try { await stopImpersonatie(email); } catch { /* best-effort */ }
      context.res = json(200, { actief: false, rolSleutel: "", rolNaam: "" });
      return;
    }

    if (actie === "start") {
      const rolSleutel = String(body.rolSleutel || "").trim();
      if (!rolSleutel) { context.res = json(400, { error: "Geen rol opgegeven." }); return; }
      let bestaat = false;
      let naam = "";
      try {
        const { rollen: rln } = await haalRollenConfig();
        const r = rln.find((x) => x.sleutel === rolSleutel);
        bestaat = !!r; naam = r ? r.naam : "";
      } catch { bestaat = false; }
      if (!bestaat) { context.res = json(400, { error: "Onbekende rol." }); return; }
      try { await zetImpersonatie(email, rolSleutel); } catch (e) {
        context.res = json(500, { error: "Kon impersonatie niet opslaan." }); return;
      }
      context.res = json(200, { actief: true, rolSleutel, rolNaam: naam });
      return;
    }

    context.res = json(400, { error: "Onbekende actie." });
    return;
  }

  context.res = json(405, { error: "Methode niet toegestaan." });
};
