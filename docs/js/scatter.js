// Concentration scatterplot: chip imports vs. supplier concentration. Owner: Kyungmin.
//
// Starter version: one dot per importer with at least MIN_IMPORTS of chip imports.
// Drag to brush countries (they light up on the map); click a dot to select a country.
//
// TODO (Kyungmin):
//   1. Option to swap the x axis to export centrality (exporters_*.json weighted_degree).
//   2. Labels for the most extreme countries.
//   3. Animate dots between years while the timeline plays.

import { state, on, setCountry, setBrushed } from "./state.js";
import * as data from "./data.js";

const W = 336, H = 260, M = { top: 12, right: 22, bottom: 34, left: 40 };
const MIN_IMPORTS = 100;   // US$ millions; smaller importers add noise
let svg, x, y, dots, brush;

export function init(el) {
  el.innerHTML = `<h2>How concentrated are chip suppliers?</h2>
    <p class="hint">Each dot is a country. Higher means it relies on fewer suppliers. Drag to highlight countries on the map.</p>`;
  svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", "Scatterplot of chip imports against supplier concentration");
  x = d3.scaleLog().range([M.left, W - M.right]);
  y = d3.scaleLinear([0, 1], [H - M.bottom, M.top]);

  svg.append("g").attr("class", "sc-axis sc-x").attr("transform", `translate(0,${H - M.bottom})`);
  svg.append("g").attr("class", "sc-axis sc-y").attr("transform", `translate(${M.left},0)`)
    .call(d3.axisLeft(y).ticks(5));
  svg.append("text").attr("class", "sc-label").attr("x", W - M.right).attr("y", H - 4)
    .attr("text-anchor", "end").text("Chip imports (log scale)");
  svg.append("text").attr("class", "sc-label").attr("x", 4).attr("y", M.top - 2).text("HHI");

  brush = d3.brush().extent([[M.left, M.top], [W - M.right, H - M.bottom]]).on("end", brushed);
  svg.append("g").attr("class", "sc-brush").call(brush);
  dots = svg.append("g");

  draw();
  ["yearChanged", "productChanged"].forEach(e => on(e, draw));
  ["countrySelected", "brushChanged"].forEach(e => on(e, highlight));
}

function points() {
  return data.importersInYear(state.product, state.year).filter(d => d.imports >= MIN_IMPORTS);
}

function draw() {
  const pts = points();
  x.domain([MIN_IMPORTS, d3.max(pts, d => d.imports) || MIN_IMPORTS * 10]).nice();
  // One tick per power of ten keeps the log axis readable.
  const [lo, hi] = x.domain();
  const ticks = d3.range(Math.ceil(Math.log10(lo)), Math.floor(Math.log10(hi)) + 1).map(k => 10 ** k);
  svg.select(".sc-x").call(d3.axisBottom(x).tickValues(ticks).tickFormat(v => data.money(v)));
  dots.selectAll("circle").data(pts, d => d.c)
    .join(enter => enter.append("circle").attr("r", 0)
      .on("click", (e, d) => setCountry(state.country === d.c ? null : d.c)))
    .attr("class", "sc-dot")
    .attr("fill", d => data.regionColor(d.c))
    .call(s => s.selectAll("title").data(d => [d]).join("title")
      .text(d => `${data.countryName(d.c)}: imports ${data.money(d.imports)}, HHI ${d.hhi.toFixed(2)}, top supplier ${data.countryName(d.top1)}`))
    .transition().duration(state.playing ? 300 : 500)
    .attr("cx", d => x(d.imports)).attr("cy", d => y(d.hhi)).attr("r", 4);
  highlight();
}

function highlight() {
  const b = state.brushed;
  dots.selectAll("circle")
    .classed("selected", d => d.c === state.country)
    .classed("dim", d => b.size > 0 && !b.has(d.c));
  if (b.size === 0) svg.select(".sc-brush").call(brush.move, null);
}

function brushed({ selection, sourceEvent }) {
  if (!sourceEvent) return;                 // ignore programmatic brush.move calls
  if (!selection) return setBrushed([]);
  const [[x0, y0], [x1, y1]] = selection;
  setBrushed(points().filter(d => {
    const cx = x(d.imports), cy = y(d.hhi);
    return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
  }).map(d => d.c));
}
