/**
 * /api/mijn-naam — geeft de volledige naam (Dynamics systemuser fullname) van de ingelogde medewerker
 * terug, opgezocht op e-mailadres. Dat is dezelfde naam die Dynamics bij de klant-rolvelden
 * (relatiebeheerder, accountant, manager, assistent, …) gebruikt, zodat een "Mijn cliënten"-filter
 * betrouwbaar matcht — ook als het inlogtoken zelf geen naam-claim meestuurt.
 *
 *   GET → { naam, email }
 *
 * Alleen medewerker/beheerder.
 */
const { haalDynamicsToken, haalEmailUitPrincipal, haalNaamUitPrincipal, haalRollenUitPrincipal } = require("../_gedeeld/identiteit");

async function haalSystemuserNaam(resource, token, email) {
  if (!resource || !email) return "";
  const veilig = String(email).replace(/'/g, "''");
  const url = `${resource}/api/data/v9.2/systemusers?$select=fullname&$filter=internalemailaddress eq '${encodeURIComponent(veilig)}' and isdisabled eq false&$top=1`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" } });
    if (!res.ok) return "";
    const d = await res.json();
    return (d.value && d.value[0] && d.value[0].fullname) || "";
  } catch {
    return "";
  }
}

module.exports = async function (context, req) {
  const email = haalEmailUitPrincipal(req);
  const rollen = haalRollenUitPrincipal(req);
  if (!(rollen.includes("beheerder") || rollen.includes("medewerker"))) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: { error: "Geen toegang." } };
    return;
  }

  let naam = haalNaamUitPrincipal(req) || "";
  const resource = process.env.DYNAMICS_RESOURCE_URL;
  if (resource && email) {
    try {
      const token = await haalDynamicsToken();
      const fn = await haalSystemuserNaam(resource, token, email);
      if (fn) naam = fn;
    } catch { /* val terug op token-naam */ }
  }

  context.res = { headers: { "Content-Type": "application/json" }, body: { naam, email: email || "" } };
};
