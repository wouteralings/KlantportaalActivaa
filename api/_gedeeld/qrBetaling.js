/**
 * SEPA-betalings-QR-code ("Betaalverzoek") voor op facturen — scanbaar met de bank-app van
 * de klant (ING, Rabobank, ABN AMRO en vrijwel elke andere Nederlandse/Europese bank-app
 * herkennen dit rechtstreeks als "scan & betaal", met IBAN/bedrag/omschrijving al ingevuld).
 *
 * Volgt de EPC069-12-standaard ("European Payments Council Quick Response Code"), hetzelfde
 * formaat dat op de meeste Nederlandse facturen als betaal-QR staat. BIC is sinds de
 * SEPA-verordening van 2016 niet meer verplicht binnen de SEPA-zone en wordt hier bewust
 * leeg gelaten (regel 5).
 */
const QRCode = require("qrcode");

/**
 * Bouwt de QR-code als PNG-buffer. Geeft null terug als er geen IBAN bekend is — een factuur
 * zonder IBAN toont dan gewoon geen QR-code (geen harde fout, betalen kan dan nog steeds
 * handmatig met de getoonde rekeninggegevens).
 */
async function genereerBetaalQr({ naam, iban, bedrag, omschrijving }) {
  const schoneIban = String(iban || "").replace(/\s+/g, "").toUpperCase();
  if (!schoneIban) return null;

  const regels = [
    "BCD",                                        // Service Tag
    "002",                                         // Versie
    "1",                                           // Tekenset: 1 = UTF-8
    "SCT",                                         // Identificatie: SEPA Credit Transfer
    "",                                            // BIC (optioneel, niet verplicht binnen SEPA)
    String(naam || "").slice(0, 70),               // Naam begunstigde
    schoneIban,                                    // IBAN begunstigde
    `EUR${Number(bedrag || 0).toFixed(2)}`,        // Bedrag
    "",                                            // Purpose (niet gebruikt)
    "",                                            // Structured remittance (niet gebruikt)
    String(omschrijving || "").slice(0, 140),      // Omschrijving (bijv. "Factuur F0001")
  ];
  const payload = regels.join("\n");

  return QRCode.toBuffer(payload, { type: "png", width: 220, margin: 1, errorCorrectionLevel: "M" });
}

module.exports = { genereerBetaalQr };
