/**
 * /api/beheer-planning-instellingen — beheer van de activiteiten- en statuslijsten van de
 * Planningsmodule (api/_gedeeld/planningInstellingen.js). Beveiligd via staticwebapp.config.json
 * (alleen rol 'beheerder').
 *
 *   GET → { activiteiten: [{ sleutel, label, type, actief }], statussen: [...], gebruik: { <sleutel>: n } }
 *   PUT body { activiteiten: [...], statussen: [...] } → overschrijft de lijsten (volgorde blijft behouden)
 *
 * `gebruik` telt per activiteit hoe vaak hij in gebruik is: in de per-klant planning-configuratie, in
 * de losse planningsregels en in de setjes. Een activiteit die nog nergens wordt gebruikt mag je echt
 * VERWIJDEREN (weglaten uit de PUT); is hij wél in gebruik, dan weigert de PUT dat — anders zouden
 * bestaande regels naar een onbekende activiteit wijzen. Die kun je alleen op inactief zetten.
 */
const { haalInstellingen, zetInstellingen, maakSleutel } = require("../_gedeeld/planningInstellingen");
const planningConfig = require("../_gedeeld/planningConfig");
const planningKlanten = require("../_gedeeld/planningKlanten");

/**
 * Gebruik per activiteit-sleutel, UITGESPLITST naar bron. Faalt een bron, dan telt die als 0.
 * Geeft { "<sleutel>": { config, los, setjes: ["naam", ...] } } terug — zo kan het beheerscherm
 * precies laten zien wáár een activiteit nog hangt, in plaats van alleen "3× in gebruik".
 */
async function haalGebruikDetail(setjes) {
  const [config, los] = await Promise.all([
    planningConfig.telGebruikPerActiviteit().catch(() => ({})),
    planningKlanten.telGebruikPerActiviteit().catch(() => ({})),
  ]);
  const uit = {};
  const zorg = (k) => (uit[k] = uit[k] || { config: 0, los: 0, setjes: [] });
  for (const [k, n] of Object.entries(config || {})) if (k) zorg(k).config += Number(n) || 0;
  for (const [k, n] of Object.entries(los || {})) if (k) zorg(k).los += Number(n) || 0;
  for (const s of setjes || []) {
    for (const it of (s.items || [])) {
      if (!it || !it.activiteit) continue;
      const d = zorg(it.activiteit);
      const naam = s.naam || s.sleutel || "setje";
      if (!d.setjes.includes(naam)) d.setjes.push(naam);
    }
  }
  return uit;
}

/** Platte telling per activiteit uit het detail: { "<sleutel>": n }. */
function totalen(detail) {
  const uit = {};
  for (const [k, d] of Object.entries(detail || {})) uit[k] = (d.config || 0) + (d.los || 0) + ((d.setjes || []).length);
  return uit;
}

/** Leesbare uitleg waar een activiteit nog gebruikt wordt — voor de 409-melding. */
function gebruikTekst(d) {
  const delen = [];
  if (d.config) delen.push(`${d.config}× in de planning-configuratie van klanten`);
  if (d.los) delen.push(`${d.los}× in losse planningsregels`);
  if ((d.setjes || []).length) delen.push(`in ${d.setjes.length === 1 ? "setje" : "de setjes"} ${d.setjes.join(", ")}`);
  return delen.join(" en ");
}

module.exports = async function (context, req) {
  try {
    if (req.method === "GET") {
      const { activiteiten, statussen, uitgeslotenMedewerkers, setjes } = await haalInstellingen();
      const gebruikDetail = await haalGebruikDetail(setjes);
      context.res = { headers: { "Content-Type": "application/json" }, body: { activiteiten, statussen, uitgeslotenMedewerkers, setjes, gebruik: totalen(gebruikDetail), gebruikDetail } };
      return;
    }
    if (req.method === "PUT") {
      const activiteiten = (req.body && req.body.activiteiten) || [];
      const statussen = (req.body && req.body.statussen) || [];
      const uitgeslotenMedewerkers = (req.body && req.body.uitgeslotenMedewerkers) || [];
      // setjes optioneel: undefined laten als niet meegestuurd, zodat ze niet gewist worden.
      const setjes = (req.body && req.body.setjes !== undefined) ? req.body.setjes : undefined;
      if (!Array.isArray(activiteiten) || !Array.isArray(statussen)) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef 'activiteiten' en 'statussen' als lijsten mee." } };
        return;
      }
      // Verwijderen mag alleen zolang een activiteit nog nergens wordt gebruikt.
      const huidig = await haalInstellingen();
      const nieuweSleutels = new Set(activiteiten.map((a) => String((a && (a.sleutel || a.label)) || "")).filter(Boolean));
      const nieuweSleutelsNorm = new Set([...nieuweSleutels].map((k) => maakSleutel(k)));
      const verwijderd = (huidig.activiteiten || []).filter((a) => !nieuweSleutelsNorm.has(a.sleutel));
      if (verwijderd.length) {
        const detail = await haalGebruikDetail(setjes !== undefined ? setjes : huidig.setjes);
        const inGebruik = verwijderd.filter((a) => ((detail[a.sleutel] && ((detail[a.sleutel].config || 0) + (detail[a.sleutel].los || 0) + (detail[a.sleutel].setjes || []).length)) || 0) > 0);
        if (inGebruik.length) {
          const namen = inGebruik.map((a) => `“${a.label}” — ${gebruikTekst(detail[a.sleutel])}`).join("; ");
          context.res = {
            status: 409,
            headers: { "Content-Type": "application/json" },
            body: { error: `Deze activiteit(en) zijn nog in gebruik en kunnen daarom niet worden verwijderd: ${namen}. Haal ze daar eerst weg, of zet ze op inactief — dan verdwijnen ze uit de keuzelijsten en blijven bestaande regels geldig.` },
          };
          return;
        }
      }
      const opgeslagen = await zetInstellingen({ activiteiten, statussen, uitgeslotenMedewerkers, setjes });
      const detailNa = await haalGebruikDetail(opgeslagen.setjes);
      context.res = { headers: { "Content-Type": "application/json" }, body: { ...opgeslagen, gebruik: totalen(detailNa), gebruikDetail: detailNa } };
      return;
    }
    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Opslag is nog niet geconfigureerd (STORAGE_CONNECTION_STRING)." } };
      return;
    }
    context.log && context.log.error && context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Onverwachte fout bij de planning-instellingen.", detail: String(err.message || err) } };
  }
};
