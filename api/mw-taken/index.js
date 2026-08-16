/**
 * /api/mw-taken — het medewerkerskant takenoverzicht (kantoorbreed). In tegenstelling tot
 * /api/taken (de KLANTkant, alleen de eigen accounts van de ingelogde klant en alleen de in Beheer
 * zichtbaar gezette soorten) toont dit endpoint ALLE taken in Dynamics, zodat een medewerker in
 * één scherm ziet wat er open staat en bij wie het ligt.
 *
 * Beveiligd via staticwebapp.config.json (rol 'beheerder' of 'medewerker'); daarnaast controleert
 * dit endpoint de rol ook zelf (defensief, een verborgen route houdt niemand tegen die het pad kent).
 *
 * GET  ?status=open|afgehandeld → { taken: [...], appUrl, configuratieNodig }
 *        - open        : alle taken met statecode 0 (Actief), nieuwste eerst op aanmaakdatum.
 *        - afgehandeld : alle taken met statecode 1 (Voltooid), nieuwste eerst.
 *      Elke taak bevat o.a. eigenaar (+ eigenaarVanMij), soort en `afwikkeling`
 *      ("automatisch" = de cliënt handelt de taak zelf af via akkoord/ondertekenen; "handmatig" =
 *      een medewerker moet 'm aftekenen), plus het klant-account-id zodat de voorkant de
 *      klantnaam/-nummer/groep erbij joint via /api/beheer-klanten.
 * PATCH { id, actie: "afronden" }        → markeert de taak als Voltooid (statecode 1/5) met een notitie.
 * PATCH { id, actie: "tijd", uren }      → indicatie-uren van deze taak (leeg = standaard van de soort).
 * PATCH { id, actie: "urencode", urencode } → urencode van deze taak voor het gekoppelde urenschrijven
 *        (leeg = de standaard-urencode van de taaksoort uit Beheer → Taken). Beide laatste acties
 *        schrijven naar een eigen blob en raken Dynamics niet aan.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");
const {
  SOORT_VELD, KLANT_VELD, KLANT_VALUE, FV, DYNAMICS_HEADERS,
  haalSystemuser, haalAutomatischAfgewikkeldeSoorten, afwikkelingVoorSoort,
  haalStandaardUrenPerSoort, effectieveTaakUren,
  haalStandaardUrencodePerSoort, effectieveTaakUrencode, dynamicsAppUrl,
} = require("../_gedeeld/takenGedeeld");
const takenTijd = require("../_gedeeld/takenTijd");
const takenUrencode = require("../_gedeeld/takenUrencode");
const urencodesStore = require("../_gedeeld/urencodesStore");
const dossierReview = require("../_gedeeld/dossierReview");
const { SOORTEN, werkDossierBij } = require("../_gedeeld/dossiers");

// Verbergt de interne "[dossier-ref: ...]"-koppeling die sommige flows in de omschrijving
// verstoppen (zie api/taken) — nooit bedoeld voor weergave.
function verbergDossierRef(tekst) {
  return String(tekst || "").replace(/\n*\[dossier-ref:[^\]]*\]/g, "").trimEnd();
}

const EXTRA = SOORT_VELD ? "," + SOORT_VELD : "";

function magErin(req) {
  const rollen = haalRollenUitPrincipal(req);
  return rollen.includes("beheerder") || rollen.includes("medewerker");
}

async function haalTaken(resource, token, statecode, automatischeSet, mijnId, standaardPerSoort, tijdOverrides, urencodePerSoort, urencodeOverrides, reviews) {
  const orderby = statecode === 1 ? "modifiedon desc" : "createdon desc";
  const top = statecode === 1 ? 1000 : 2000;
  const query =
    `${resource}/api/data/v9.2/tasks` +
    `?$select=activityid,subject,description,scheduledend,createdon,modifiedon,prioritycode,statecode,statuscode,` +
    `_ownerid_value,_regardingobjectid_value,${KLANT_VALUE}${EXTRA}` +
    `&$filter=statecode eq ${statecode}` +
    `&$orderby=${orderby}&$top=${top}`;

  const res = await fetch(query, { headers: DYNAMICS_HEADERS(token) });
  if (!res.ok) throw new Error(`Ophalen taken mislukt: ${await res.text()}`);
  const data = await res.json();
  const overrides = tijdOverrides || {};
  const stdPerSoort = standaardPerSoort || {};
  const codeOverrides = urencodeOverrides || {};
  const codePerSoort = urencodePerSoort || {};

  return (data.value || []).map((rij) => {
    const soortWaarde = SOORT_VELD ? rij[SOORT_VELD] : null;
    const eigenaarId = rij._ownerid_value || "";
    const klantAccountId = rij[KLANT_VALUE] || rij._regardingobjectid_value || "";
    const id = rij.activityid;
    const override = id != null ? overrides[String(id).toLowerCase()] : undefined;
    const codeOverride = id != null ? codeOverrides[String(id).toLowerCase()] : undefined;
    const standaardUren = soortWaarde == null ? null : (stdPerSoort[String(soortWaarde)] != null ? stdPerSoort[String(soortWaarde)] : null);
    const urenOverride = override == null ? null : Number(override);
    const standaardUrencode = soortWaarde == null ? "" : (codePerSoort[String(soortWaarde)] || "");
    // Is dit een REVIEWTAAK op een dossier? Dan kan de eigenaar 'm hier aftekenen met akkoord of
    // "aanpassen na review" (zie de PATCH-acties hieronder). `review` is null voor gewone taken.
    const reviewInfo = id != null ? (reviews || {})[String(id).toLowerCase()] : null;
    return {
      id,
      review: reviewInfo
        ? {
            status: reviewInfo.status || "open",
            uitkomst: reviewInfo.uitkomst || "",
            dossierSoort: reviewInfo.dossierSoort || "",
            dossierId: reviewInfo.dossierId || "",
            klantnaam: reviewInfo.klantnaam || "",
            jaar: reviewInfo.jaar || "",
            aanvragerNaam: reviewInfo.aanvragerNaam || reviewInfo.aanvragerEmail || "",
            reviewerNaam: reviewInfo.reviewerNaam || reviewInfo.reviewerEmail || "",
            opmerking: reviewInfo.opmerking || "",
            aangevraagdOp: reviewInfo.aangevraagdOp || "",
            afgerondOp: reviewInfo.afgerondOp || "",
          }
        : null,
      onderwerp: rij.subject || "(geen onderwerp)",
      omschrijving: verbergDossierRef(rij.description),
      deadline: rij.scheduledend || null,
      aangemaakt: rij.createdon || null,
      afgehandeldOp: statecode === 1 ? rij.modifiedon || null : null,
      prioriteit: rij[`prioritycode${FV}`] || "",
      prioriteitCode: rij.prioritycode ?? null,
      soort: SOORT_VELD ? rij[SOORT_VELD + FV] || "" : "",
      soortWaarde: soortWaarde == null ? null : String(soortWaarde),
      afwikkeling: afwikkelingVoorSoort(soortWaarde, automatischeSet),
      // Indicatie-tijd voor de planning/bezetting: standaard van de soort (Beheer → Taken),
      // per taak overschrijfbaar. `uren` is de effectieve waarde (overschrijving wint).
      standaardUren,
      urenOverride,
      uren: effectieveTaakUren(soortWaarde, stdPerSoort, override),
      // Urencode voor het gekoppelde urenschrijven: standaard van de soort (Beheer → Taken), per
      // taak overschrijfbaar. `urencode` is de effectieve waarde (overschrijving wint).
      standaardUrencode,
      urencodeOverride: codeOverride == null || codeOverride === "" ? null : String(codeOverride),
      urencode: effectieveTaakUrencode(soortWaarde, codePerSoort, codeOverride),
      eigenaar: rij[`_ownerid_value${FV}`] || "",
      eigenaarId,
      eigenaarVanMij: !!mijnId && eigenaarId.toLowerCase() === mijnId.toLowerCase(),
      klantAccountId: klantAccountId ? String(klantAccountId).toLowerCase() : "",
      klantnaam: rij[`${KLANT_VALUE}${FV}`] || rij[`_regardingobjectid_value${FV}`] || "",
      statusLabel: rij[`statecode${FV}`] || (statecode === 1 ? "Voltooid" : "Actief"),
    };
  });
}

module.exports = async function (context, req) {
  if (!magErin(req)) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }

  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) {
    context.res = { status: 501, headers: { "Content-Type": "application/json" }, body: { error: "Dynamics-koppeling is nog niet geconfigureerd.", configuratieNodig: true } };
    return;
  }

  try {
    const token = await haalDynamicsToken();
    const email = haalEmailUitPrincipal(req);

    if (req.method === "GET") {
      const statusParam = (req.query && req.query.status) === "afgehandeld" ? 1 : 0;
      const [automatischeSet, mij, standaardPerSoort, tijdOverrides, urencodePerSoort, urencodeOverrides, urencodes, reviews] = await Promise.all([
        haalAutomatischAfgewikkeldeSoorten(),
        haalSystemuser(resource, token, email),
        haalStandaardUrenPerSoort().catch(() => ({})),
        takenTijd.haalAlle().catch(() => ({})),
        haalStandaardUrencodePerSoort().catch(() => ({})),
        takenUrencode.haalAlle().catch(() => ({})),
        urencodesStore.haalCodes().then((c) => (c || []).filter((x) => x.actief !== false)).catch(() => []),
        dossierReview.haalAlle().catch(() => ({})),
      ]);
      const taken = await haalTaken(resource, token, statusParam, automatischeSet, mij.id, standaardPerSoort, tijdOverrides, urencodePerSoort, urencodeOverrides, reviews);
      context.res = {
        headers: { "Content-Type": "application/json" },
        body: { taken, urencodes, appUrl: dynamicsAppUrl(resource), mijnNaam: mij.naam, configuratieNodig: !SOORT_VELD },
      };
      return;
    }

    if (req.method === "PATCH") {
      const taakId = (req.body && req.body.id) || (req.query && req.query.id);
      const actie = (req.body && req.body.actie) || "afronden";
      if (!taakId) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef het id van de taak mee." } };
        return;
      }

      // Indicatie-tijd voor de planning/bezetting overschrijven (of leeg = terug naar de standaard
      // van de soort). Schrijft alleen naar de eigen blob, raakt Dynamics niet aan.
      if (actie === "tijd") {
        try {
          const nieuw = await takenTijd.zetTijd(taakId, req.body ? req.body.uren : "");
          context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true, urenOverride: nieuw } };
        } catch (e) {
          const validatie = String(e.message || "").startsWith("VALIDATIE:");
          context.res = { status: validatie ? 400 : 500, headers: { "Content-Type": "application/json" }, body: { error: validatie ? e.message.replace("VALIDATIE: ", "") : "Kon de tijd niet opslaan." } };
        }
        return;
      }

      // Urencode van deze taak overschrijven (of leeg = terug naar de standaard van de soort).
      // Schrijft alleen naar de eigen blob, raakt Dynamics niet aan.
      if (actie === "urencode") {
        try {
          const nieuw = await takenUrencode.zetUrencode(taakId, req.body ? req.body.urencode : "");
          context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true, urencodeOverride: nieuw } };
        } catch (e) {
          context.log.error(e);
          context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Kon de urencode niet opslaan." } };
        }
        return;
      }

      // ── Reviewtaak aftekenen: "akkoord" of "aanpassen na review" ─────────────────────────────
      //    Rondt de reviewtaak af, maakt de vervolgtaak bij de AANVRAGER met de opmerking van de
      //    reviewer erin, schrijft die opmerking ook in het review-notitieveld van het dossier en
      //    beweegt de dossierstatus mee (allemaal in te stellen bij Beheer → Dossiers → Review).
      if (actie === "review-akkoord" || actie === "review-aanpassen") {
        const uitkomst = actie === "review-aanpassen" ? "aanpassen" : "akkoord";
        const opmerking = String((req.body && req.body.opmerking) || "").trim();
        const review = await dossierReview.haalVoorTaak(taakId).catch(() => null);
        if (!review) {
          context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "Deze taak is geen dossier-review (meer)." } };
          return;
        }
        if (review.status !== "open") {
          context.res = { status: 409, headers: { "Content-Type": "application/json" }, body: { error: `Deze review is al afgetekend (${review.uitkomst || review.status}).` } };
          return;
        }
        if (uitkomst === "aanpassen" && !opmerking) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Geef aan wát er aangepast moet worden — die opmerking komt in de vervolgtaak." } };
          return;
        }

        const soort = SOORTEN.find((s) => s.key === review.dossierSoort);
        const cfg = await dossierReview.instellingenVoorSoort(review.dossierSoort);
        const taakSoort = uitkomst === "aanpassen" ? cfg.aanpassenTaakSoort : cfg.akkoordTaakSoort;
        const taakOnderwerp = uitkomst === "aanpassen" ? cfg.aanpassenTaakOnderwerp : cfg.akkoordTaakOnderwerp;
        const nieuweStatus = uitkomst === "aanpassen" ? cfg.statusAanpassen : cfg.statusAkkoord;

        // De vervolgtaak gaat terug naar de AANVRAGER — die heeft het dossier opgesteld.
        const aanvrager = await haalSystemuser(resource, token, review.aanvragerEmail).catch(() => null);
        const reviewerNaam = (await haalSystemuser(resource, token, email).catch(() => null))?.naam || email || review.reviewerNaam;

        let vervolgTaakId = "";
        let vervolgFout = "";
        if (taakSoort !== null && taakSoort !== undefined) {
          try {
            vervolgTaakId = await dossierReview.maakTaak(resource, token, {
              subject: dossierReview.vulSjabloonIn(taakOnderwerp, {
                klant: review.klantnaam || "", jaar: review.jaar || "",
                soort: (soort && soort.label) || review.dossierSoort || "",
                aanvrager: review.aanvragerNaam || review.aanvragerEmail || "",
                reviewer: reviewerNaam || "",
              }),
              description: [
                uitkomst === "aanpassen"
                  ? `De review is afgetekend met "aanpassen na review" door ${reviewerNaam}.`
                  : `De review is akkoord bevonden door ${reviewerNaam}.`,
                opmerking ? `\nOpmerking van de reviewer:\n${opmerking}` : "\n(De reviewer heeft geen opmerking achtergelaten.)",
                `\nDossier: ${(soort && soort.label) || review.dossierSoort}${review.jaar ? ` ${review.jaar}` : ""} — ${review.klantnaam || "cliënt onbekend"}.`,
              ].join("\n"),
              accountId: review.accountId,
              soortWaarde: taakSoort,
              rubriekWaarde: cfg.taakRubriek,
              eigenaarId: aanvrager && aanvrager.id,
            });
          } catch (e) {
            vervolgFout = String(e.message || e).slice(0, 300);
            context.log.error("Vervolgtaak na review aanmaken mislukt:", e);
          }
        } else {
          vervolgFout = "Er is voor deze uitkomst nog geen taaksoort ingesteld bij Beheer → Dossiers → Review.";
        }

        // Reviewtaak zelf afronden, met de uitkomst in de omschrijving.
        let huidigeOmschrijving = "";
        try {
          const huidig = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})?$select=description`, { headers: DYNAMICS_HEADERS(token) });
          if (huidig.ok) huidigeOmschrijving = (await huidig.json()).description || "";
        } catch { /* best-effort */ }
        const stempel = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
        const notitie = `\n\n[Review afgetekend als "${uitkomst === "aanpassen" ? "aanpassen na review" : "akkoord"}" door ${reviewerNaam} op ${stempel}]${opmerking ? `\nOpmerking: ${opmerking}` : ""}`;
        const updateRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})`, {
          method: "PATCH",
          headers: DYNAMICS_HEADERS(token),
          body: JSON.stringify({ statecode: 1, statuscode: 5, description: (huidigeOmschrijving || "") + notitie }),
        });
        if (!updateRes.ok) throw new Error(`Afronden reviewtaak mislukt: ${await updateRes.text()}`);

        await dossierReview.rondReviewAf(taakId, { uitkomst, opmerking, door: email, vervolgTaakId }).catch(() => {});
        // Ook bij de VERVOLGTAAK een verwijzing naar het dossier vastleggen, zodat de aanvrager
        // vanuit die taak met één klik in het dossier staat.
        if (vervolgTaakId) {
          await dossierReview.zetVervolgtaakVerwijzing(vervolgTaakId, review, uitkomst, opmerking, reviewerNaam).catch(() => {});
        }

        // Dossier bijwerken: status + de opmerking in het review-notitieveld. Best-effort — de
        // review is al afgetekend, dat mag niet stuklopen op één dossierveld.
        if (soort) {
          try {
            const teZetten = {};
            if (nieuweStatus !== null && nieuweStatus !== undefined) teZetten.status = nieuweStatus;
            const heeftVeld = (k) => (soort.catalogus || []).some((v) => v.key === k);
            const velden = {};
            if (opmerking && heeftVeld("reviewnotitie")) velden.reviewnotitie = opmerking;
            if (heeftVeld("reviewnotitiedatum")) velden.reviewnotitiedatum = new Date().toISOString();
            if (heeftVeld("reviewdoor")) velden.reviewdoor = String(reviewerNaam || "").slice(0, 100);
            if (Object.keys(velden).length) teZetten.velden = velden;
            if (Object.keys(teZetten).length) await werkDossierBij(resource, token, soort, review.dossierId, teZetten);
          } catch (e) {
            context.log.error("Dossier bijwerken na review mislukt (de review zelf is wél verwerkt):", e);
          }
        }

        context.res = {
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: { ok: true, uitkomst, vervolgTaakId, vervolgFout, aanvrager: review.aanvragerNaam || review.aanvragerEmail },
        };
        return;
      }

      if (actie !== "afronden") {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Onbekende actie." } };
        return;
      }

      // Huidige omschrijving ophalen zodat de notitie eronder komt (en niet de bestaande tekst wist).
      let huidigeOmschrijving = "";
      try {
        const huidig = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})?$select=description`, { headers: DYNAMICS_HEADERS(token) });
        if (huidig.ok) huidigeOmschrijving = (await huidig.json()).description || "";
      } catch { /* best-effort */ }

      const stempel = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
      const notitie = `\n\n[Afgehandeld door medewerker (${email || "onbekend"}) via het medewerkersportaal op ${stempel}]`;
      const body = { statecode: 1, statuscode: 5, description: (huidigeOmschrijving || "") + notitie };

      const updateRes = await fetch(`${resource}/api/data/v9.2/tasks(${taakId})`, {
        method: "PATCH",
        headers: DYNAMICS_HEADERS(token),
        body: JSON.stringify(body),
      });
      if (!updateRes.ok) throw new Error(`Afronden taak mislukt: ${await updateRes.text()}`);

      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { ok: true } };
      return;
    }

    context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: { error: "Methode niet ondersteund." } };
  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Onverwachte fout bij het ophalen van de taken.", detail: String(err.message || err) },
    };
  }
};
