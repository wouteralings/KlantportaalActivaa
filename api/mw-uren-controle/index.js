/**
 * /api/mw-uren-controle — de maandelijkse urencontrole door de manager. Toont de declarabele
 * boekingen op cliënten waarvan de ingelogde medewerker de MANAGER is (snapshot manager_naam op
 * de boeking); een beheerder kan met ?scope=alle het hele kantoor zien. Per boeking kan de manager
 * goedkeuren, afboeken (uren erkennen/verminderen met reden) of opboeken (extra te factureren
 * bedrag toevoegen).
 *
 *   - GET  ?maand=YYYY-MM[&scope=alle]                       → { maand, scope, magAlles, boekingen }
 *   - POST { id, goedgekeurdeUren?, afboekUren?, afboekReden?, extraBedrag?, extraReden? } → controle
 *
 * Route beveiligd via staticwebapp.config.json (medewerker/beheerder).
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const { logGebeurtenis } = require("../_gedeeld/klantlog");
const uren = require("../_gedeeld/urenDataverse");
const exactUren = require("../_gedeeld/exactUren");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json" }, body };
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
    } catch { /* val terug */ }
  }
  return naam;
}

function huidigeMaand() {
  const nu = new Date();
  return `${nu.getUTCFullYear()}-${String(nu.getUTCMonth() + 1).padStart(2, "0")}`;
}

module.exports = async function (context, req) {
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) return json(context, 403, { error: "Geen toegang." });
  const email = haalEmailUitPrincipal(req);
  if (!email) return json(context, 401, { error: "Kon geen e-mailadres uit de ingelogde gebruiker halen." });
  const isBeheerder = rollen.includes("beheerder");
  const methode = (req.method || "GET").toUpperCase();

  try {
    if (methode === "GET") {
      const maand = (req.query && req.query.maand) || huidigeMaand();
      const wilAlles = (req.query && req.query.scope) === "alle" && isBeheerder;
      const naam = await mijnNaam(req, email);
      const boekingen = await uren.boekingenVoorControle({ maand, goedkeurderNaam: naam, alle: wilAlles });
      return json(context, 200, { maand, scope: wilAlles ? "alle" : "manager", magAlles: isBeheerder, mijnNaam: naam, boekingen });
    }

    if (methode === "POST" || methode === "PATCH") {
      const b = req.body || {};
      if (!b.id) return json(context, 400, { error: "Geef een id mee." });
      const naam = await mijnNaam(req, email);
      const bijgewerkt = await uren.controleActie(b.id, {
        goedgekeurdeUren: b.goedgekeurdeUren != null ? Number(b.goedgekeurdeUren) : null,
        afboekUren: b.afboekUren != null ? Number(b.afboekUren) : null,
        afboekReden: b.afboekReden,
        extraBedrag: b.extraBedrag != null ? Number(b.extraBedrag) : null,
        extraReden: b.extraReden,
      }, naam || email);
      if (!bijgewerkt) return json(context, 404, { error: "Boeking niet gevonden of niet controleerbaar." });

      // Alleen UXT gaat automatisch (bij goedkeuring) naar Exact als definitieve verkoopfactuur.
      // Best-effort: fouten blokkeren de goedkeuring niet; ze staan op de boeking (exactStatus).
      let exactResultaat = null;
      if (bijgewerkt.soort === "uxt" && bijgewerkt.status === "goedgekeurd" && bijgewerkt.accountId) {
        try {
          exactResultaat = await exactUren.pushKlantNaarExact(bijgewerkt.accountId);
          if (exactResultaat && exactResultaat.aantal > 0) {
            bijgewerkt.gefactureerd = true; bijgewerkt.status = "gefactureerd"; bijgewerkt.factuurRef = exactResultaat.referentie || bijgewerkt.factuurRef;
          }
        } catch (e) { exactResultaat = { fout: String(e.message || e) }; }
      }

      // Best-effort log bij de cliënt.
      if (bijgewerkt.accountId) {
        await logGebeurtenis({
          door: email, actie: "uren-controle", accountId: bijgewerkt.accountId, accountIds: [bijgewerkt.accountId],
          klantnaam: bijgewerkt.klantnaam,
          tekst: `Uren gecontroleerd (${bijgewerkt.soort}, ${bijgewerkt.datum}) — ${bijgewerkt.goedgekeurdeUren != null ? `${bijgewerkt.goedgekeurdeUren} u erkend` : "goedgekeurd"}${bijgewerkt.afboekUren ? `, ${bijgewerkt.afboekUren} u afgeboekt` : ""}${bijgewerkt.extraBedrag ? `, € ${bijgewerkt.extraBedrag} extra` : ""}.`,
        });
      }
      return json(context, 200, { ok: true, boeking: bijgewerkt, exact: exactResultaat });
    }

    return json(context, 405, { error: "Methode niet toegestaan." });
  } catch (err) {
    if (err.message === "MISSING_CONFIG") return json(context, 501, { error: "De database of Dynamics-koppeling is nog niet geconfigureerd." });
    context.log.error(err);
    return json(context, 500, { error: "Kon de urencontrole niet verwerken.", detail: String(err.message || err) });
  }
};
