/**
 * /api/beheer-taaksoort-toevoegen — beheert de opties van het "Soort"-keuzeveld (optieset) op de
 * Dynamics task-tabel vanuit het beheerdersportaal, zodat de beheerder de keuzelijst kan uitbreiden en
 * bijwerken zonder de Dataverse-omgeving in te hoeven.
 *
 *   POST { label }           → { ok, waarde, label }   nieuwe optie (InsertOptionValue)
 *   POST { waarde, label }   → { ok, waarde, label }   bestaande optie HERNOEMEN (UpdateOptionValue)
 *
 * Bij hernoemen verandert alleen het LABEL; de onderliggende optieset-waarde blijft gelijk, dus alle
 * bestaande taken houden hun soort en alles wat op die waarde is ingesteld (std. uren, urencode,
 * zichtbaarheid, vervolgtaak) blijft gewoon staan. Na het wijzigen publiceren we de task-tabel, anders
 * blijft het oude label in Dynamics zichtbaar.
 *
 * Werkt via de Dataverse-acties InsertOptionValue/UpdateOptionValue op het veld
 * DYNAMICS_TAAK_SOORT_VELD van entity "task".
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
  if (!rollen.includes("beheerder")) { context.res = json(403, { error: "Alleen beheerders mogen taaksoorten beheren." }); return; }
  if ((req.method || "POST").toUpperCase() !== "POST") { context.res = json(405, { error: "Methode niet toegestaan." }); return; }
  if (!SOORT_VELD) { context.res = json(400, { error: "Het soort-veld is niet ingesteld (Application Setting DYNAMICS_TAAK_SOORT_VELD)." }); return; }

  const label = String((req.body && req.body.label) || "").trim();
  const ruweWaarde = req.body && req.body.waarde;
  const hernoemen = ruweWaarde !== undefined && ruweWaarde !== null && ruweWaarde !== "";
  const waardeIn = hernoemen ? Number(ruweWaarde) : null;
  if (!label) { context.res = json(400, { error: hernoemen ? "Geef een nieuwe naam voor de taaksoort." : "Geef een naam voor de nieuwe taaksoort." }); return; }
  if (label.length > 100) { context.res = json(400, { error: "De naam is te lang (max. 100 tekens)." }); return; }
  if (hernoemen && !Number.isInteger(waardeIn)) { context.res = json(400, { error: "Ongeldige taaksoort-waarde." }); return; }

  try {
    const token = await haalDynamicsToken();
    const taal = await haalBasistaal(resource, token);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
    const labelObject = {
      "@odata.type": "Microsoft.Dynamics.CRM.Label",
      LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: label, LanguageCode: taal }],
    };
    const body = { EntityLogicalName: "task", AttributeLogicalName: SOORT_VELD, Label: labelObject };
    if (hernoemen) { body.Value = waardeIn; body.MergeLabels = true; }

    const actie = hernoemen ? "UpdateOptionValue" : "InsertOptionValue";
    const res = await fetch(`${resource}/api/data/v9.2/${actie}`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const detail = await res.text();
      context.res = json(502, { error: `${hernoemen ? "Hernoemen" : "Toevoegen"} in Dynamics is mislukt (${res.status}). Controleer of de app-registratie aanpasrechten (System Customizer) heeft in Dataverse.`, detail });
      return;
    }
    const d = await res.json().catch(() => ({}));
    const waarde = hernoemen ? waardeIn : (d.NewOptionValue != null ? Number(d.NewOptionValue) : null);

    // Publiceren zodat het nieuwe label ook in Dynamics zelf zichtbaar is. Best-effort: mislukt dit,
    // dan is de wijziging wél doorgevoerd en verschijnt hij na de eerstvolgende publicatie.
    if (hernoemen) {
      try {
        await fetch(`${resource}/api/data/v9.2/PublishXml`, {
          method: "POST", headers,
          body: JSON.stringify({ ParameterXml: "<importexportxml><entities><entity>task</entity></entities></importexportxml>" }),
        });
      } catch { /* niet blokkerend */ }
    }
    context.res = json(200, { ok: true, waarde, label });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = json(501, { error: "Dynamics-koppeling is nog niet geconfigureerd." }); return; }
    context.log && context.log.error && context.log.error(err);
    context.res = json(500, { error: "Kon de taaksoort niet opslaan.", detail: String(err.message || err) });
  }
};
