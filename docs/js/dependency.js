// Country dependency panel: where the selected country buys its chips. Owner: Kyungmin.
//
// Starter version: bars for the selected year's top suppliers plus a few summary numbers.
//
// TODO (Kyungmin):
//   1. Stacked area chart of supplier shares over all years (the proposal's main design).
//      Note: importers_*.json keeps only each year's top 5, so a supplier can drop into
//      "other" in some years; decide how to show that honestly.
//   2. A small line of the HHI over time, with the current year marked.
//   3. Comparison mode: the same chart for a second country, same scales (with Alex).

import { state, on, setCountry } from "./state.js";
import * as data from "./data.js";

let el;

export function init(element) {
  el = element;
  draw();
  ["countrySelected", "yearChanged", "productChanged"].forEach(e => on(e, draw));
}

function draw() {
  const { country: c, year, product } = state;
  if (!c) {
    el.innerHTML = `<h2>Where a country buys its chips</h2>
      <p class="hint">Click a country on the map or in the scatterplot to see its suppliers.</p>`;
    return;
  }
  const rec = data.importer(product, year, c);
  if (!rec) {
    el.innerHTML = `<h2>${data.countryName(c)}</h2><p class="hint">No recorded chip imports in ${year}.</p>`;
    return;
  }

  el.innerHTML = `<h2>Where ${data.countryName(c)} buys its chips, ${year}</h2>
    <p class="hint">Share of ${data.money(rec.imports)} in chip imports, by supplier.</p>`;

  const rows = [...rec.suppliers.map(s => ({ c: s.c, s: s.s })), { c: null, s: rec.other_share }]
    .filter(d => d.s > 0);
  const W = 336, rowH = 24, labelW = 112;
  const xs = d3.scaleLinear([0, 1], [0, W - labelW - 48]);
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${rows.length * rowH + 4}`)
    .attr("role", "img").attr("aria-label", `Chip suppliers of ${data.countryName(c)}`);

  const g = svg.selectAll("g").data(rows).join("g")
    .attr("class", d => `dep-bar${d.c ? "" : " other"}`)
    .attr("transform", (d, i) => `translate(0,${i * rowH})`)
    .style("cursor", d => (d.c ? "pointer" : "default"))
    .on("click", (e, d) => d.c && setCountry(d.c));
  g.append("text").attr("x", 0).attr("y", 15).text(d => (d.c ? data.countryName(d.c) : "All others"));
  g.append("rect").attr("x", labelW).attr("y", 4).attr("height", rowH - 8).attr("rx", 3).attr("width", d => xs(d.s));
  g.append("text").attr("x", d => labelW + xs(d.s) + 6).attr("y", 15).text(d => data.pct(d.s));

  d3.select(el).append("div").attr("class", "dep-stats").html(
    `<span>Top 3 share <b>${data.pct(rec.top3_share)}</b></span>
     <span>HHI <b>${rec.hhi.toFixed(2)}</b></span>
     <span>Suppliers <b>${rec.n_suppliers}</b></span>`);
}
