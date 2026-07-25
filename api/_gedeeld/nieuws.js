const { XMLParser } = require("fast-xml-parser");

/**
 * Haalt alleen titel + korte samenvatting + link op via de standaard WordPress RSS-feeds
 * (per categorie), nooit de volledige artikeltekst — dat zou auteursrechtelijk niet mogen
 * en is ook niet de bedoeling: de klant klikt door naar activaa.nl voor het hele artikel.
 */
const FEEDS = [
  { url: "https://activaa.nl/category/blogposts/feed/", categorie: "blog" },
  { url: "https://activaa.nl/category/nieuws/feed/", categorie: "nieuws" },
];

const CACHE_DUUR_MS = 15 * 60 * 1000; // 15 minuten, om activaa.nl niet bij elke klik te belasten
let cache = { op: 0, items: [] };

function strip(html) {
  return (html || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function kort(tekst, maxLengte = 220) {
  if (tekst.length <= maxLengte) return tekst;
  return tekst.slice(0, maxLengte).replace(/\s+\S*$/, "") + "…";
}

async function haalFeed({ url, categorie }) {
  const res = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml" } });
  if (!res.ok) return [];

  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);

  const items = data?.rss?.channel?.item;
  const lijst = Array.isArray(items) ? items : items ? [items] : [];

  return lijst.map((item) => ({
    titel: strip(item.title),
    samenvatting: kort(strip(item.description)),
    url: item.link,
    datum: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    categorie,
  }));
}

async function haalNieuwsEnBlogs() {
  const nu = Date.now();
  if (nu - cache.op < CACHE_DUUR_MS && cache.items.length > 0) {
    return cache.items;
  }

  const resultaten = await Promise.allSettled(FEEDS.map(haalFeed));
  const items = resultaten
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.datum) - new Date(a.datum))
    .slice(0, 5);

  cache = { op: nu, items };
  return items;
}

module.exports = { haalNieuwsEnBlogs };
