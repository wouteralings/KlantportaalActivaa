const { haalNieuwsEnBlogs } = require("../_gedeeld/nieuws");

module.exports = async function (context, req) {
  try {
    const items = await haalNieuwsEnBlogs();
    context.res = { headers: { "Content-Type": "application/json" }, body: items };
  } catch (err) {
    context.log.error(err);
    // Niet-kritisch voor de rest van het portaal: geef een lege lijst terug i.p.v. een 500.
    context.res = { headers: { "Content-Type": "application/json" }, body: [] };
  }
};
