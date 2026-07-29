/**
 * /api/bedrijfsgegevens-klanten — de eigen afzendergegevens (+ logo) van de ingelogde
 * portaalklant, per gekoppeld klant-account (dbo.bedrijfsgegevens_klanten). Zelfde
 * accountId-afspraak als /api/klanten-klanten, zie api/_gedeeld/facturatieToegang.js.
 * Alleen bereikbaar als de facturatiemodule voor dat account aan staat.
 *
 *   GET /api/bedrijfsgegevens-klanten?accountId=...        → de opgeslagen gegevens
 *   PUT /api/bedrijfsgegevens-klanten  body { accountId, ccEmail } → alleen het cc-mailadres zetten
 *   PUT /api/bedrijfsgegevens-klanten  body { accountId, standaardBetalingstermijn, standaardBtwCode,
 *                                             standaardFactuurtekst } → standaardwaarden voor nieuwe
 *                                             facturen/offertes zetten (migratie 007, 29-07-2026)
 *
 * De twee bovenstaande PUT-vormen mogen los van elkaar (elk met alleen hun eigen velden) of
 * samen aangeroepen worden — alleen de velden die daadwerkelijk in de body staan worden gewijzigd
 * (zie zetGegevens()), dus een aanroep met alleen standaardwaarden laat het cc-mailadres met rust
 * en omgekeerd.
 *
 * Sinds 28-07-2026 is er GEEN directe PUT meer voor de klant voor de verificatiegegevens
 * (naam/adres/KvK/BTW/IBAN): een wijziging daarvan loopt via een wijzigingsverzoek (POST
 * /api/wijzigingsverzoek met type "bedrijfsgegevens_facturatie"), dat een beheerder moet
 * goedkeuren — pas dan wordt `zetGegevens()` hier aangeroepen, rechtstreeks vanuit
 * api/beheer-wijzigingen/index.js (geen HTTP-endpoint nodig voor die kant). Het logo blijft
 * wél direct zelf te wijzigen, zie /api/bedrijfsgegevens-logo. Sinds 29-07-2026 geldt hetzelfde
 * voor het cc-mailadres en de standaardwaarden hierboven — geen verificatiegegeven, dus geen
 * goedkeuring nodig, net als het logo.
 */
const { controleerToegang, afhandelFout } = require("../_gedeeld/facturatieToegang");
const { haalGegevens, zetGegevens } = require("../_gedeeld/bedrijfsgegevensKlanten");
const { haalDynamicsToken, CC_EMAIL_VELD } = require("../_gedeeld/identiteit");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FACTUURTEKST_LENGTE = 4000;

function heeftVeld(body, naam) {
  return !!body && Object.prototype.hasOwnProperty.call(body, naam);
}

/**
 * Schrijft het CC-mailadres best-effort ook naar Dynamics (cr283_ccbijversturen) — zelfde
 * vangnet-gedachte als IBAN/tenaamstelling (zie api/beheer-wijzigingen/index.js): mislukt het
 * wegschrijven naar de eigen SQL-tabel een keer (bekend, nog niet opgelost probleem), dan komt
 * de waarde via Dynamics alsnog terecht bij het versturen van een factuur/offerte/creditnota
 * (zie haalGegevensMetCrmAanvulling in bedrijfsgegevensKlanten.js). Mag het opslaan van het
 * cc-mailadres zelf nooit laten mislukken — vandaar dat de aanroeper dit los in een eigen
 * try/catch aanroept en de fout alleen logt.
 */
async function schrijfCcEmailNaarDynamics(accountId, ccEmail) {
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (!resource) return;
  const token = await haalDynamicsToken();
  const res = await fetch(`${resource}/api/data/v9.2/accounts(${accountId})`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      "If-Match": "*",
    },
    body: JSON.stringify({ [CC_EMAIL_VELD]: ccEmail || null }),
  });
  if (!res.ok) throw new Error(`CC-mailadres bijwerken in Dynamics mislukt (${res.status}): ${await res.text()}`);
}

module.exports = async function (context, req) {
  try {
    const { email, accountId } = await controleerToegang(req);

    if (req.method === "GET") {
      const gegevens = await haalGegevens(accountId);
      context.res = { headers: { "Content-Type": "application/json" }, body: gegevens };
      return;
    }

    if (req.method === "PUT") {
      const data = {};
      const heeftCcEmail = heeftVeld(req.body, "ccEmail");
      let ccEmail = "";

      if (heeftCcEmail) {
        ccEmail = typeof req.body.ccEmail === "string" ? req.body.ccEmail.trim() : "";
        if (ccEmail && !EMAIL_REGEX.test(ccEmail)) {
          context.res = {
            status: 400,
            headers: { "Content-Type": "application/json" },
            body: { error: "Vul een geldig e-mailadres in (of laat het veld leeg)." },
          };
          return;
        }
        data.ccEmail = ccEmail;
      }

      const heeftStandaardwaarden = ["standaardBetalingstermijn", "standaardBtwCode", "standaardFactuurtekst"]
        .some((naam) => heeftVeld(req.body, naam));
      if (heeftStandaardwaarden) {
        if (heeftVeld(req.body, "standaardBetalingstermijn")) {
          const ruw = req.body.standaardBetalingstermijn;
          if (ruw === null || ruw === "") {
            data.standaardBetalingstermijn = null;
          } else {
            const dagen = Number(ruw);
            if (!Number.isFinite(dagen) || dagen <= 0 || dagen > 365) {
              context.res = {
                status: 400,
                headers: { "Content-Type": "application/json" },
                body: { error: "Vul een geldig aantal dagen in voor de standaard betalingstermijn (1-365), of laat leeg." },
              };
              return;
            }
            data.standaardBetalingstermijn = Math.round(dagen);
          }
        }
        if (heeftVeld(req.body, "standaardBtwCode")) {
          data.standaardBtwCode = typeof req.body.standaardBtwCode === "string" ? req.body.standaardBtwCode.trim().slice(0, 20) : "";
        }
        if (heeftVeld(req.body, "standaardFactuurtekst")) {
          const tekst = typeof req.body.standaardFactuurtekst === "string" ? req.body.standaardFactuurtekst.trim() : "";
          if (tekst.length > MAX_FACTUURTEKST_LENGTE) {
            context.res = {
              status: 400,
              headers: { "Content-Type": "application/json" },
              body: { error: `De standaard factuurtekst mag maximaal ${MAX_FACTUURTEKST_LENGTE} tekens zijn.` },
            };
            return;
          }
          data.standaardFactuurtekst = tekst;
        }
      }

      if (!heeftCcEmail && !heeftStandaardwaarden) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: { error: "Geef minstens één veld mee om te wijzigen (ccEmail, standaardBetalingstermijn, standaardBtwCode of standaardFactuurtekst)." },
        };
        return;
      }

      const opgeslagen = await zetGegevens(accountId, data, email);

      if (heeftCcEmail) {
        try {
          await schrijfCcEmailNaarDynamics(accountId, ccEmail);
        } catch (dynFout) {
          context.log.error("CC-mailadres wegschrijven naar Dynamics (best effort) mislukt:", dynFout);
        }
      }

      context.res = {
        headers: { "Content-Type": "application/json" },
        body: {
          ccEmail: opgeslagen.ccEmail,
          standaardBetalingstermijn: opgeslagen.standaardBetalingstermijn,
          standaardBtwCode: opgeslagen.standaardBtwCode,
          standaardFactuurtekst: opgeslagen.standaardFactuurtekst,
        },
      };
      return;
    }

    context.res = {
      status: 405,
      headers: { "Content-Type": "application/json" },
      body: { error: "Alleen het cc-mailadres en de standaardwaarden kunnen hier direct gewijzigd worden (PUT); de rest via een wijzigingsverzoek." },
    };
  } catch (err) {
    afhandelFout(context, err);
  }
};
