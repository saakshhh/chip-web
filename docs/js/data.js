// Data loading and lookups. Owner: Saksham.
//
// Every view gets its numbers through these helpers instead of reading the JSON files
// itself, so if a file format changes, only this file needs updating.
// Field meanings are in the README's data dictionary.

const cache = {};          // product -> { flows, importers, exporters, indexes }
let core = null;           // files every page needs

export async function loadCore() {
  const [world, meta, countries, events, worldTrade] = await Promise.all(
    ["world-110m", "meta", "countries", "events", "world_trade"].map(f => d3.json(`data/${f}.json`)));
  const regions = [...new Set(countries.map(c => c.region))].sort();
  core = {
    world, meta, countries, events, worldTrade, regions,
    countryById: new Map(countries.map(c => [c.c, c])),
    // One color per region, shared by every view so a region looks the same everywhere.
    regionColor: d3.scaleOrdinal(regions, d3.schemeTableau10),
  };
  await ensureProduct("8542");   // the default product; HS 8541 loads only when requested
  return core;
}

// Fetch a product's files the first time it's needed. Safe to call repeatedly.
export async function ensureProduct(product) {
  product = String(product);
  if (cache[product]) return cache[product];
  const [flows, importers, exporters] = await Promise.all(
    [`flows_${product}`, `importers_${product}`, `exporters_${product}`].map(f => d3.json(`data/${f}.json`)));
  cache[product] = {
    flows,
    importers,
    exporters,
    flowsByYear: d3.group(flows, d => d.y),
    importerByYear: d3.group(importers, d => d.y),
    exporterByYear: d3.group(exporters, d => d.y),
    importerIndex: new Map(importers.map(d => [`${d.y}|${d.c}`, d])),
    exporterIndex: new Map(exporters.map(d => [`${d.y}|${d.c}`, d])),
  };
  return cache[product];
}

function product(p) {
  const d = cache[String(p)];
  if (!d) throw new Error(`Product ${p} isn't loaded yet; call ensureProduct first`);
  return d;
}

export const getCore = () => core;
export const years = () => d3.range(core.meta.years[0], core.meta.years[1] + 1);
export const country = id => core.countryById.get(id);
export const countryName = id => core.countryById.get(id)?.name ?? id;
export const regionColor = id => core.regionColor(core.countryById.get(id)?.region ?? "Other");

// The year's strongest flows for the global view, biggest first.
export function globalFlows(p, year, limit = 150) {
  return (product(p).flowsByYear.get(year) || []).filter(f => f.g === 1).slice(0, limit);
}

// A country's suppliers and customers in a year (includes flows outside the global top list).
export function countryFlows(p, year, iso3) {
  const all = product(p).flowsByYear.get(year) || [];
  return {
    imports: all.filter(f => f.i === iso3).sort((a, b) => b.v - a.v),
    exports: all.filter(f => f.e === iso3).sort((a, b) => b.v - a.v),
  };
}

export const importer = (p, year, iso3) => product(p).importerIndex.get(`${year}|${iso3}`);
export const exporter = (p, year, iso3) => product(p).exporterIndex.get(`${year}|${iso3}`);
export const importersInYear = (p, year) => product(p).importerByYear.get(year) || [];
export const exportersInYear = (p, year) => product(p).exporterByYear.get(year) || [];

// A country's importer record for every year (for time-series charts).
export const importerHistory = (p, iso3) => product(p).importers.filter(d => d.c === iso3);

// World total by year for one product: [{y, v, v_real}].
export const worldSeries = p => core.worldTrade.filter(d => String(d.p) === String(p));

// Convert a nominal value from `year` into constant base-year dollars (or return it unchanged).
export function toReal(value, year) {
  const f = core.meta.deflators?.[String(year)];
  return f ? value * f : value;
}

// Formatting used across views so numbers look the same everywhere.
export function money(millions) {
  if (millions == null) return "n/a";
  return millions >= 1000 ? `$${d3.format(",.1~f")(millions / 1000)}B` : `$${d3.format(",.0f")(millions)}M`;
}
export const pct = d3.format(".1%");
