/**
 * Doorklikken naar een dossier vanuit een ander scherm — vandaag vanuit een reviewtaak in het
 * Taken-overzicht ("Open dossier"), morgen desgewenst vanuit elk ander scherm.
 *
 * Waarom via de URL-hash en niet via props? Het dossier zit drie componenten diep (MedewerkerPortaal
 * → KlantenModule → MedewerkerDossiers) en Taken is een heel andere hoofd-tab. Een hash is de
 * kortste route zonder een callback door die hele keten te rijgen — en hij overleeft een refresh of
 * het openen in een nieuw tabblad.
 *
 * Vorm: #dossier=<soort>:<guid>, bijvoorbeeld #dossier=ib:8f2c…-…-…
 *
 * De keten: MedewerkerPortaal springt naar de tab "Klanten", KlantenModule naar de sub-tab van die
 * soort, en MedewerkerDossiers opent het dossier en WIST daarna de hash (met replaceState, dus
 * zonder nóg een hashchange te veroorzaken). Zo werkt een tweede klik op dezelfde taak weer.
 */

const GELDIGE_SOORTEN = ["ib", "vpb", "dividend", "notulen"];

/** { soort, id } uit de huidige hash, of null als er geen (geldige) dossier-hash staat. */
export function leesDossierHash() {
  if (typeof window === "undefined") return null;
  const ruw = String(window.location.hash || "").replace(/^#/, "");
  if (!ruw.startsWith("dossier=")) return null;
  const waarde = decodeURIComponent(ruw.slice("dossier=".length));
  const scheiding = waarde.indexOf(":");
  if (scheiding < 0) return null;
  const soort = waarde.slice(0, scheiding).toLowerCase();
  const id = waarde.slice(scheiding + 1).trim();
  if (!GELDIGE_SOORTEN.includes(soort) || !id) return null;
  return { soort, id };
}

/** Zet de hash — dit start de sprong naar het dossier. */
export function gaNaarDossier(soort, id) {
  if (typeof window === "undefined" || !soort || !id) return;
  window.location.hash = `dossier=${encodeURIComponent(`${soort}:${id}`)}`;
}

/** Wist de dossier-hash zonder een hashchange te veroorzaken (zodat niemand er opnieuw op reageert). */
export function wisDossierHash() {
  if (typeof window === "undefined") return;
  if (!String(window.location.hash || "").startsWith("#dossier=")) return;
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    window.location.hash = "";
  }
}

/**
 * Roept `opDossier({ soort, id })` aan bij het monteren (als er al een dossier-hash staat) en bij
 * elke hashchange daarna. Geeft de opruimfunctie terug voor useEffect.
 */
export function luisterNaarDossierHash(opDossier) {
  if (typeof window === "undefined") return () => {};
  const reageer = () => {
    const doel = leesDossierHash();
    if (doel) opDossier(doel);
  };
  reageer();
  window.addEventListener("hashchange", reageer);
  return () => window.removeEventListener("hashchange", reageer);
}
