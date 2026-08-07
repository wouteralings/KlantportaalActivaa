/**
 * Schrijft het antwoord op een uitvraag-vraag terug naar Dynamics, naar het veld waaraan de vraag
 * in beheer gekoppeld is (Uitvraag Fase B). Best-effort: een fout hier mag het opslaan van het
 * antwoord in het portaal nooit blokkeren — de aanroeper vangt dit af en logt het.
 *
 * De koppeling staat op de regel als `regel.dynamics`:
 *   { tabel, tabelLabel, entitySet, kolom, kolomLabel, kolomType, vraagtype, record, opties? }
 *   - entitySet : de collectie-naam (EntitySetName) voor de PATCH-URL.
 *   - record    : "account" | "contact" — welk record van de klant gevuld wordt (auto-herleid uit
 *                 het verzoek: het account, resp. de contactpersoon van de klant).
 *   - opties    : bij een keuzelijst-kolom (Picklist) de [{ waarde, label }] om het antwoord naar
 *                 de numerieke optieset-waarde te vertalen.
 */
const { HEADERS } = require("./dynamicsMetadata");

/** Zet het (tekst)antwoord om naar de juiste JS-waarde voor het kolomtype. Geeft `undefined` terug
 *  als er niets zinnigs te schrijven is (dan slaan we de PATCH over). */
function converteer(dyn, antwoord) {
  const type = dyn.kolomType || "";
  const tekst = antwoord == null ? "" : String(antwoord).trim();
  if (tekst === "") return undefined;

  if (type === "Boolean") {
    const l = tekst.toLowerCase();
    if (["ja", "true", "waar", "1"].includes(l)) return true;
    if (["nee", "false", "onwaar", "0"].includes(l)) return false;
    return undefined;
  }
  if (["Integer", "BigInt"].includes(type)) {
    const n = parseInt(tekst.replace(/\./g, "").replace(",", "."), 10);
    return Number.isFinite(n) ? n : undefined;
  }
  if (["Decimal", "Double", "Money"].includes(type)) {
    const n = Number(tekst.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "DateTime") {
    const d = new Date(tekst);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (type === "Picklist") {
    const opties = Array.isArray(dyn.opties) ? dyn.opties : [];
    // Antwoord kan de optie-label of de numerieke waarde zijn.
    const opLabel = opties.find((o) => String(o.label).toLowerCase() === tekst.toLowerCase());
    if (opLabel) return Number(opLabel.waarde);
    const alsGetal = Number(tekst);
    if (Number.isFinite(alsGetal) && opties.some((o) => Number(o.waarde) === alsGetal)) return alsGetal;
    return undefined;
  }
  // String / Memo (en overige tekst): gewoon de tekst.
  return tekst;
}

/**
 * @returns {Promise<{geschreven:boolean, reden?:string}>}
 */
async function schrijfAntwoordNaarDynamics({ resource, token, dynamics, recordId, antwoord }) {
  if (!resource || !token) return { geschreven: false, reden: "GEEN_DYNAMICS" };
  if (!dynamics || !dynamics.entitySet || !dynamics.kolom) return { geschreven: false, reden: "GEEN_KOPPELING" };
  if (!recordId) return { geschreven: false, reden: "GEEN_RECORD" };

  const waarde = converteer(dynamics, antwoord);
  if (waarde === undefined) return { geschreven: false, reden: "GEEN_WAARDE" };

  const body = { [dynamics.kolom]: waarde };
  const url = `${resource}/api/data/v9.2/${dynamics.entitySet}(${recordId})`;
  const res = await fetch(url, { method: "PATCH", headers: HEADERS(token), body: JSON.stringify(body) });
  if (!res.ok) {
    const tekst = await res.text().catch(() => "");
    return { geschreven: false, reden: `HTTP ${res.status}: ${tekst.slice(0, 300)}` };
  }
  return { geschreven: true };
}

module.exports = { converteer, schrijfAntwoordNaarDynamics };
