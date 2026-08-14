/**
 * /api/beheer-taaksoort-toevoegen — voegt vanuit het beheerdersportaal een nieuwe optie toe aan het
 * "Soort"-keuzeveld (optieset) op de Dynamics task-tabel. Zo kan de beheerder de keuzelijst uitbreiden
 * zonder de Dataverse-omgeving in te hoeven.
 *
 *   POST { label }  → { ok, waarde, label }   (waarde = de nieuwe optieset-waarde)
 *
 * Werkt via de Dataverse-actie InsertOptionValue op het veld DYNAMICS_TAAK_SOORT_VELD van entity "task".
 * De app-registratie moet hiervoor aanpas-/customization-rechten (System Customizer) hebben; ontbreekt dat,
 * dan geeft Dataverse een fout terug die we doorgeven zodat IT dit eenmalig kan toestaan.
 * Route beveiligd via staticwebapp.config.json (alleen rol 'beheerder'); extra rolcheck hier.
 */
const { haalDynamicsToken, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");

const SOORT_VELD = process.env.DYNAMICS_TAAK_SOORT_VELD || "";
const json = (status, body) => ({ status, headers: { "Content-Type": "application/json" }, body });

// De basistaal van de organisatie (LanguageCode) — nodig voor een geldig LocalizedLabel. Val terug op 1033.
async function haalBasistaal(resource, token) {
  try {
    const res = await fetch(`${resource}/api/data/v9.2/organizations?$select=languagecode&$top=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
    });
    if (res.ok) { const d = await res.json(); const lc = d.value && d.value[0] && d.value[0].languagecode; if (lc) return Number(lc); }
  } catch { /* val terug */ }
  return 1033;
}

module.exports = async function (context, req) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = json(501, { error: "Dynamics-koppeling is nog niet geconfigureerd." }); return; }

  const rollen = haalRollenUitPrincipal(req);
  if (!rollen.includes("beheerder")) { context.res = json(403, { error: "Alleen beheerders mogen taaksoorten toevoegen." }); return; }
  if ((req.method || "POST").toUpperCase() !== "POST") { context.res = json(405, { error: "Methode niet toegestaan." }); return; }
  if (!SOORT_VELD) { context.res = json(400, { error: "Het soort-veld is niet ingesteld (Application Setting DYNAMICS_TAAK_SOORT_VELD)." }); return; }

  const label = String((req.body && req.body.label) || "").trim();
  if (!label) { context.res = json(400, { error: "Geef een naam voor de nieuwe taaksoort." }); return; }
  if (label.length > 100) { context.res = json(400, { error: "De naam is te lang (max. 100 tekens)." }); return; }

  try {
    const token = await haalDynamicsToken();
    const taal = await haalBasistaal(resource, token);
    const body = {
      EntityLogicalName: "task",
      AttributeLogicalName: SOORT_VELD,
      Label: {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: label, LanguageCode: taal }],
      },
    };
    const res = await fetch(`${resource}/api/data/v9.2/InsertOptionValue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      context.res = json(502, { error: `Toevoegen in Dynamics is mislukt (${res.status}). Controleer of de app-registratie aanpasrechten (System Customizer) heeft in Dataverse.`, detail });
      return;
    }
    const d = await res.json().catch(() => ({}));
    const waarde = d.NewOptionValue != null ? Number(d.NewOptionValue) : null;
    context.res = json(200, { ok: true, waarde, label });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = json(501, { error: "Dynamics-koppeling is nog niet geconfigureerd." }); return; }
    context.log && context.log.error && context.log.error(err);
    context.res = json(500, { error: "Kon de taaksoort niet toevoegen.", detail: String(err.message || err) });
  }
};
