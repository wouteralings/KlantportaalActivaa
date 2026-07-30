/**
 * POST /api/verwerk-periodieke-uitvragen — zet automatisch de vervallen periodieke aanlever-uitvragen
 * klaar bij de klanten waar het onderwerp van toepassing is. Bedoeld om dagelijks aangeroepen te
 * worden door hetzelfde EXTERNE schema als de terugkerende facturen (Power Automate → HTTP POST),
 * want SWA managed functions hebben geen timer-trigger.
 *
 * BEVEILIGING: staat bewust op "anonymous"; de enige poort is een geheime sleutel in header
 * 'x-verwerk-sleutel' of querystring '?sleutel=', die moet overeenkomen met de omgevingsvariabele
 * TERUGKEREND_TRIGGER_SECRET (dezelfde als bij de terugkerende facturen). Zonder die variabele
 * weigert dit endpoint altijd (501).
 *
 * Per vervallen schema (zie periodiekeuitvragen.js → bepaalPeriode): voor elke cliënt waar het
 * onderwerp van toepassing is (klantonderwerpen, actief) wordt een aanlever-verzoek aangemaakt voor
 * de primaire contactpersoon, met de klant-specifieke lijst (voorrang) of de algemene lijst, en de
 * map uit onderwerp + jaar. Dubbele-preventie: per (cliënt, onderwerp, jaar) wordt niet nog eens
 * aangemaakt, en per schema wordt de laatst verwerkte periode bijgehouden.
 */
const { haalDynamicsToken } = require("../_gedeeld/identiteit");
const { haalSchemas, zetSchemas, bepaalPeriode } = require("../_gedeeld/periodiekeuitvragen");
const { haalOnderwerpen, resolvePad } = require("../_gedeeld/aanleveronderwerpen");
const { haalLijsten } = require("../_gedeeld/aanleverlijsten");
const klantonderwerpen = require("../_gedeeld/klantonderwerpen");
const verzoeken = require("../_gedeeld/aanleververzoeken");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const { verwerkAbonnementen } = require("../_gedeeld/abonnementenVerwerker");

const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";
const SYSTEEM = "systeem (periodieke uitvraag)";

async function haalAccountKort(resource, token, accountId) {
  const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${CLIENTNUMMER_VELD}&$expand=primarycontactid($select=contactid,fullname)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
  if (!res.ok) return null;
  const a = await res.json();
  const nummer = a[CLIENTNUMMER_VELD];
  const p = a.primarycontactid || null;
  return {
    klantnaam: a.name || "",
    klantnummer: nummer != null && nummer !== "" ? String(nummer) : "",
    contactId: p ? p.contactid : "",
    contactNaam: p ? p.fullname || "" : "",
  };
}

module.exports = async function (context, req) {
  const verwachteSleutel = process.env.TERUGKEREND_TRIGGER_SECRET;
  if (!verwachteSleutel) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "TERUGKEREND_TRIGGER_SECRET is nog niet geconfigureerd — dit endpoint staat uit." } };
    return;
  }
  const meegegeven = (req.headers && req.headers["x-verwerk-sleutel"]) || (req.query && req.query.sleutel) || "";
  if (meegegeven !== verwachteSleutel) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: { error: "Ongeldige of ontbrekende sleutel." } };
    return;
  }

  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) { context.res = { status: 501, body: { error: "Dynamics-koppeling is nog niet geconfigureerd." } }; return; }

  try {
    const nu = new Date();
    const [schemas, onderwerpen, lijsten, klantAlle, bestaande] = await Promise.all([
      haalSchemas(), haalOnderwerpen(), haalLijsten(), klantonderwerpen.haalAlle(), verzoeken.haalAlle(),
    ]);

    let token = null;
    let aangemaakt = 0;
    const overgeslagen = [];
    const verwerkteSchemas = [];

    for (const schema of schemas) {
      const p = bepaalPeriode(schema, nu);
      if (!p) continue;
      if (schema.laatstePeriode === p.periode) continue; // deze periode al gedaan

      const onderwerp = onderwerpen.find((o) => o.id === schema.onderwerpId);
      if (!onderwerp) { overgeslagen.push({ schema: schema.id, reden: "onderwerp niet gevonden" }); continue; }

      // Cliënten waar dit onderwerp van toepassing is.
      const accountIds = Object.keys(klantAlle || {}).filter((accId) => {
        const conf = klantAlle[accId] && klantAlle[accId][schema.onderwerpId];
        return conf && conf.actief === true;
      });

      const standaardRegels = onderwerp.standaardLijstId ? ((lijsten.find((l) => l.id === onderwerp.standaardLijstId) || {}).regels || []) : [];
      const map = resolvePad(onderwerp.pad, { jaar: p.jaarLabel, onderwerp: onderwerp.naam });

      if (!token) token = await haalDynamicsToken();

      for (const accId of accountIds) {
        // Dubbele-preventie: bestaat er al een verzoek voor deze cliënt+onderwerp+jaar?
        if (bestaande.some((v) => v.accountId === accId && v.onderwerpId === schema.onderwerpId && String(v.jaar) === p.jaarLabel)) continue;

        const conf = klantAlle[accId][schema.onderwerpId];
        const regels = Array.isArray(conf.regels) ? conf.regels : standaardRegels;
        if (!regels.length) { overgeslagen.push({ account: accId, reden: "geen documenten in de lijst" }); continue; }

        const acc = await haalAccountKort(resource, token, accId);
        if (!acc || !acc.contactId) { overgeslagen.push({ account: accId, reden: "geen primaire contactpersoon" }); continue; }

        const verzoek = verzoeken.maakVerzoek({
          accountId: accId,
          klantnaam: acc.klantnaam,
          klantnummer: acc.klantnummer,
          contactId: acc.contactId,
          contactNaam: acc.contactNaam,
          onderwerpId: onderwerp.id,
          onderwerp: onderwerp.naam,
          jaar: p.jaarLabel,
          map,
          notitie: schema.notitie || "",
          regels,
          aangemaaktDoor: SYSTEEM,
        });
        await verzoeken.voegToe(verzoek);
        bestaande.push(verzoek);
        aangemaakt++;

        await logGebeurtenis({
          door: SYSTEEM,
          actie: "aanleververzoek",
          accountId: accId,
          accountIds: [accId],
          klantnaam: acc.klantnaam,
          klantnummer: acc.klantnummer,
          contactId: acc.contactId,
          contactNaam: acc.contactNaam,
          tekst: `Automatisch aanlever-verzoek klaargezet — onderwerp "${onderwerp.naam}" ${p.jaarLabel} — ${regels.length} document(en) gevraagd.`,
        });
      }

      schema.laatstePeriode = p.periode;
      verwerkteSchemas.push({ schema: schema.id, onderwerp: onderwerp.naam, periode: p.periode, cliënten: accountIds.length });
    }

    // Laatst-verwerkte-periodes wegschrijven zodat een volgende run niet dubbel doet.
    if (verwerkteSchemas.length) await zetSchemas(schemas);

    // Meteen ook de abonnementen op vaste uitvragen verwerken (zelfde dagelijkse aanroep). Fouten
    // hierin mogen de periodieke uitvragen niet omvergooien.
    let abonnementen = null;
    try {
      abonnementen = await verwerkAbonnementen(resource);
    } catch (e) {
      context.log.error(`abonnementen verwerken mislukt: ${e && e.message ? e.message : e}`);
      abonnementen = { fout: String(e && e.message ? e.message : e) };
    }

    context.res = { headers: { "Content-Type": "application/json" }, body: { ok: true, aangemaakt, verwerkteSchemas, overgeslagen, abonnementen } };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") { context.res = { status: 501, body: { error: "Opslag/Dynamics is nog niet geconfigureerd." } }; return; }
    context.log.error(err);
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Verwerken van periodieke uitvragen mislukt.", detail: String(err.message || err) } };
  }
};
