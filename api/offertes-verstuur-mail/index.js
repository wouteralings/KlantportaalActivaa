const { haalGraphToken, genereerOffertePdf, genereerOpdrachtbevestigingPdf } = require("../_gedeeld/offertesOnboarding.js");
const { haalDocumentRecord } = require("../_gedeeld/offertesOpslag.js");

// Vast afzenderadres — een gedeelde/functionele mailbox, geen persoonlijk account. Kan later
// eventueel een omgevingsvariabele worden als dit ooit moet wisselen.
const AFZENDER_MAILBOX = "correspondentie@activaa.nl";

function escapeHtml(tekst) {
  return String(tekst || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Platte, door de gebruiker (evt. bewerkte) tekst omzetten naar simpele HTML: regeleinden
// worden <br/>, en elke http(s)-link wordt automatisch klikbaar gemaakt. Kleuren staan
// bewust overal expliciet inline (i.p.v. te vertrouwen op een mailclient-standaard) — anders
// kan een mailprogramma met een donker thema (Outlook/Gmail dark mode) de tekst en/of link
// onbedoeld wit-op-wit (onzichtbaar) weergeven.
function tekstNaarHtml(tekst) {
  const geescaped = escapeHtml(tekst);
  const metLinks = geescaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color:#1C5D8C; text-decoration:underline;">${url}</a>`
  );
  return metLinks.replace(/\n/g, "<br/>");
}

module.exports = async function (context, req) {
  if (req.method !== "POST") {
    context.res = { status: 405, body: { error: "Methode niet ondersteund." } };
    return;
  }

  const invoer = req.body || {};
  const naar = (invoer.naar || "").trim();
  const onderwerp = (invoer.onderwerp || "Bericht").trim();
  const tekst = (invoer.tekst || "").trim();
  // documentId is de generieke naam (werkt voor zowel offerte als opdrachtbevestiging);
  // offerteId blijft ondersteund voor compatibiliteit met eventuele oudere aanroepen.
  const documentId = (invoer.documentId || invoer.offerteId || "").trim();
  // Cc: bijv. de maker van de offerte en/of een handmatig toegevoegd adres — optioneel,
  // dus een lege/ontbrekende lijst is prima.
  const cc = Array.isArray(invoer.cc)
    ? invoer.cc.map((adres) => String(adres || "").trim()).filter(Boolean)
    : [];

  if (!naar || !tekst) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "E-mailadres en berichttekst zijn verplicht." },
    };
    return;
  }

  try {
    const token = await haalGraphToken();

    const htmlBody = `<div style="color:#1C2321; background-color:#ffffff; font-family:Arial, Helvetica, sans-serif; font-size:14px;">${tekstNaarHtml(tekst)}</div>`;

    const bericht = {
      message: {
        subject: onderwerp,
        body: { contentType: "HTML", content: htmlBody },
        toRecipients: [{ emailAddress: { address: naar } }],
      },
      saveToSentItems: true,
    };

    if (cc.length > 0) {
      bericht.message.ccRecipients = cc.map((adres) => ({ emailAddress: { address: adres } }));
    }

    // Het document (offerte of opdrachtbevestiging) als PDF-bijlage meesturen (zelfde
    // generator/opmaak als de tekenlink en "Afdrukken / opslaan als PDF") — puur een extra
    // gemak naast de tekenlink die al in de hoofdtekst staat, dus dit mag het versturen van
    // de mail zelf nooit blokkeren. Lukt het niet (document nog niet opgeslagen, PDF-generatie
    // mislukt), dan gaat de mail gewoon zonder bijlage de deur uit en wordt de fout alleen gelogd.
    let pdfBijgevoegd = false;
    if (documentId) {
      try {
        const gevonden = await haalDocumentRecord(documentId);
        if (gevonden) {
          const { record, soort } = gevonden;
          const documentLabel = soort === "opdrachtbevestiging" ? "Opdrachtbevestiging" : "Offerte";
          const pdfBytes = soort === "opdrachtbevestiging" ? await genereerOpdrachtbevestigingPdf(record) : await genereerOffertePdf(record);
          const klantnaam = (record.klantNamen || [])[0] || documentLabel.toLowerCase();
          const veiligeNaam = klantnaam.replace(/[\\/:*?"<>|]/g, "-").trim();
          bericht.message.attachments = [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: `${documentLabel} - ${veiligeNaam}.pdf`,
              contentType: "application/pdf",
              contentBytes: Buffer.from(pdfBytes).toString("base64"),
            },
          ];
          pdfBijgevoegd = true;
        } else {
          context.log.error(`verstuur-mail: document ${documentId} niet gevonden, mail gaat zonder PDF-bijlage.`);
        }
      } catch (e) {
        context.log.error("verstuur-mail: PDF-bijlage genereren mislukt, mail gaat zonder bijlage:", e);
      }
    }

    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${AFZENDER_MAILBOX}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bericht),
    });

    if (!res.ok) {
      const tekst = await res.text();
      throw new Error(`Graph sendMail mislukt (${res.status}): ${tekst}`);
    }

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: { verzonden: true, van: AFZENDER_MAILBOX, pdfBijgevoegd },
    };
  } catch (err) {
    if (err.message === "MISSING_CONFIG") {
      context.res = {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "Dynamics/Graph-koppeling is nog niet geconfigureerd." },
      };
      return;
    }
    context.log.error(err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: {
        error:
          "Versturen via " +
          AFZENDER_MAILBOX +
          " is mislukt. Controleer of de app-registratie de machtiging 'Mail.Send' (Application, met " +
          "beheerderstoestemming) heeft.",
        detail: String(err),
      },
    };
  }
};
