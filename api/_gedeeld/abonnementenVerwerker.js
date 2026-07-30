/**
 * Kernlogica voor het verwerken van de abonnementen op vaste uitvragen. Gedeeld zodat zowel het
 * losse endpoint (/api/verwerk-vaste-abonnementen) als de dagelijkse periodieke-uitvragen-verwerker
 * dit kan aanroepen — zo hoeft er maar één dagelijkse HTTP-aanroep te zijn.
 *
 * Per klant/lijst met een actief abonnement wordt op de geplande datum een aanlever-verzoek
 * aangemaakt: als concept (medewerker geeft vrij) of direct zichtbaar ("versturen"), met een deadline
 * van X dagen na de startdatum, en optioneel een e-mail naar de contactpersoon.
 */
const { haalDynamicsToken } = require("./identiteit");
const { haalLijsten } = require("./aanleverlijsten");
const { resolvePad } = require("./aanleveronderwerpen");
const vasteUitvragen = require("./klantvasteuitvragen");
const { bepaalDue, deadlineVan, naarISO } = require("./abonnementdatum");
const verzoeken = require("./aanleververzoeken");
const { verstuurMail, mailIngericht } = require("./mailer");
const { logGebeurtenis } = require("./klantlog");

const CLIENTNUMMER_VELD = process.env.DYNAMICS_KLANT_NUMMER_VELD || "sk_clientnrauto";
const SYSTEEM = "systeem (abonnement)";

function leesHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
}

async function haalAccountKort(resource, token, accountId) {
  const url = `${resource}/api/data/v9.2/accounts(${accountId})?$select=name,${CLIENTNUMMER_VELD}&$expand=primarycontactid($select=contactid,fullname,emailaddress1)`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return null;
  const a = await res.json();
  const nummer = a[CLIENTNUMMER_VELD];
  const p = a.primarycontactid || null;
  return {
    klantnaam: a.name || "",
    klantnummer: nummer != null && nummer !== "" ? String(nummer) : "",
    primairContactId: p ? p.contactid : "",
    primairContactNaam: p ? p.fullname || "" : "",
    primairContactEmail: p ? p.emailaddress1 || "" : "",
  };
}

async function haalContact(resource, token, contactId) {
  const url = `${resource}/api/data/v9.2/contacts(${contactId})?$select=fullname,emailaddress1`;
  const res = await fetch(url, { headers: leesHeaders(token) });
  if (!res.ok) return null;
  const c = await res.json();
  return { naam: c.fullname || "", email: c.emailaddress1 || "" };
}

/**
 * Verwerkt alle vervallen abonnementen. `resource` = DYNAMICS_RESOURCE_URL. Geeft een samenvatting
 * terug. Gooit alleen bij een echte fout (bv. opslag onbereikbaar).
 */
async function verwerkAbonnementen(resource) {
  const vandaag = naarISO(new Date());
  const [alle, lijsten] = await Promise.all([vasteUitvragen.haalAlleGenormaliseerd(), haalLijsten()]);
  const lijstMap = new Map(lijsten.map((l) => [l.id, l]));

  let token = null;
  let aangemaakt = 0;
  let gemaild = 0;
  const overgeslagen = [];
  let gewijzigd = false;

  for (const [accountId, config] of Object.entries(alle)) {
    let accountKort = null; // lazy: pas ophalen als er echt iets vervalt
    for (const [lijstId, item] of Object.entries(config)) {
      const ab = item.abonnement;
      if (!ab || ab.actief !== true) continue;
      const due = bepaalDue(ab, vandaag);
      if (!due) continue;

      const lijst = lijstMap.get(lijstId);
      if (!lijst) { overgeslagen.push({ accountId, lijstId, reden: "lijst niet gevonden" }); continue; }
      const regels = Array.isArray(item.regels) ? item.regels : (lijst.regels || []);
      if (!regels.length) { overgeslagen.push({ accountId, lijstId, reden: "geen documenten in de lijst" }); continue; }

      if (!token) token = await haalDynamicsToken();
      if (!accountKort) accountKort = await haalAccountKort(resource, token, accountId);
      if (!accountKort) { overgeslagen.push({ accountId, lijstId, reden: "account niet gevonden" }); continue; }

      // Contactpersoon: de toegewezen contactpersoon, anders de primaire.
      const contactId = item.contactId || accountKort.primairContactId;
      let contactNaam = item.contactNaam || accountKort.primairContactNaam;
      let contactEmail = "";
      if (item.contactId && item.contactId === accountKort.primairContactId) {
        contactEmail = accountKort.primairContactEmail;
      } else if (item.contactId) {
        const c = await haalContact(resource, token, item.contactId);
        if (c) { contactNaam = contactNaam || c.naam; contactEmail = c.email; }
      } else {
        contactEmail = accountKort.primairContactEmail;
      }
      if (!contactId) { overgeslagen.push({ accountId, lijstId, reden: "geen contactpersoon" }); continue; }

      const jaar = due.slice(0, 4);
      const map = lijst.pad ? resolvePad(lijst.pad, { jaar, lijst: lijst.naam, onderwerp: lijst.naam }) : [];
      const deadline = deadlineVan(due, ab.deadlineDagen);
      const zichtbaar = ab.modus === "versturen";

      const verzoek = verzoeken.maakVerzoek({
        accountId,
        klantnaam: accountKort.klantnaam,
        klantnummer: accountKort.klantnummer,
        contactId,
        contactNaam,
        lijstId,
        lijstNaam: lijst.naam,
        jaar,
        map,
        notitie: item.notitie || "",
        regels,
        aangemaaktDoor: SYSTEEM,
        zichtbaar,
        deadline,
        bron: "abonnement",
      });
      await verzoeken.voegToe(verzoek);
      aangemaakt++;

      // E-mail (optioneel, alleen bij 'versturen' + ingericht + adres bekend).
      let mailReden = "";
      if (ab.email && zichtbaar) {
        if (!mailIngericht()) mailReden = "mail niet ingericht (AANLEVER_MAIL_AFZENDER ontbreekt)";
        else if (!contactEmail) mailReden = "geen e-mailadres bij contactpersoon";
        else {
          const deadlineTekst = deadline ? ` De uiterste aanleverdatum is ${deadline}.` : "";
          const r = await verstuurMail({
            naar: contactEmail,
            onderwerp: `Aanlevering gevraagd: ${lijst.naam}${jaar ? ` ${jaar}` : ""}`,
            tekst: `Beste ${contactNaam || "relatie"},\n\nIn uw klantportaal staat een nieuw aanlever-verzoek voor u klaar: "${lijst.naam}"${jaar ? ` (${jaar})` : ""}.${deadlineTekst}\n\nLog in op het klantportaal om de gevraagde documenten aan te leveren.\n\nMet vriendelijke groet,\nActivaa`,
          });
          if (r.verstuurd) gemaild++; else mailReden = r.reden || "onbekend";
        }
      }

      // Abonnement bijwerken: laatste run zetten, eenmalig deactiveren.
      ab.laatsteRun = due;
      if (ab.frequentie === "eenmalig") ab.actief = false;
      gewijzigd = true;

      await logGebeurtenis({
        door: SYSTEEM, actie: "aanleververzoek", accountId, accountIds: [accountId],
        klantnaam: accountKort.klantnaam, klantnummer: accountKort.klantnummer, contactId, contactNaam,
        tekst: `Abonnement: aanlever-verzoek "${lijst.naam}"${jaar ? ` ${jaar}` : ""} ${zichtbaar ? "verstuurd (zichtbaar)" : "als concept klaargezet"}${deadline ? ` — deadline ${deadline}` : ""}${ab.email ? (mailReden ? ` — e-mail niet verstuurd: ${mailReden}` : " — e-mail verstuurd") : ""}.`,
      });
    }
  }

  if (gewijzigd) await vasteUitvragen.schrijfAlleGenormaliseerd(alle);
  return { datum: vandaag, aangemaakt, gemaild, overgeslagen };
}

module.exports = { verwerkAbonnementen };
