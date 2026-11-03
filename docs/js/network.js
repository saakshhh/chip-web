// Trade network on a world map. Owner: Joseph.
//
// Starter version: countries sit at their map centroids, the year's largest flows are drawn
// as curved arcs (each arc bends to the left of its direction of travel, so the curve shows
// which way trade flows), and clicking a country shows only its suppliers and customers.
//
// TODO (Joseph), roughly in priority order:
//   1. Overlaps in East Asia and Europe: run a d3-force simulation ONCE (forceX/forceY toward
//      each centroid + forceCollide using each country's largest radius over all years), then
//      freeze the positions so nodes never move between years (stable mental map).
//   2. Labels: avoid overlaps; show the rest on hover.
//   3. Tapered edges (wide at the exporter, narrow at the importer) instead of plain arcs.
//   4. Smooth transitions between years for edges, not just nodes.
//   5. Zoom and pan (d3.zoom), keeping node sizes readable when zoomed.
//   6. Proper legend for circle size and line width.

import { state, on, setCountry } from "./state.js";
import * as data from "./data.js";

const W = 1000, H = 520;
const TOP_N = 60;          // flows drawn in the global view
const TOP_PARTNERS = 8;    // suppliers and customers drawn when a country is selected
const LABELS = 8;          // biggest exporters that get a label

let svg, pos, layers = {};
const sizeDomain = {};     // product -> largest exports in any year, so sizes are comparable across years

export function init(el) {
  const core = data.getCore();
  el.innerHTML = `<h2>Trade network</h2>
    <p class="hint">Circles are countries, sized by chip exports. Lines are the year's largest flows.
    Click a country to see its suppliers (blue) and customers (orange).</p>`;

  svg = d3.select(el).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img")
    .attr("aria-label", "World map of chip trade flows");

  // Pacific-centered so the East Asia hubs and the Americas aren't split by the map edge.
  const projection = d3.geoEqualEarth().rotate([-150, 0]).fitExtent([[8, 8], [W - 8, H - 8]], { type: "Sphere" });
  const path = d3.geoPath(projection);

  svg.append("path").attr("class", "net-sphere").attr("d", path({ type: "Sphere" }))
    .on("click", () => setCountry(null));
  svg.append("g").selectAll("path")
    .data(topojson.feature(core.world, core.world.objects.countries).features)
    .join("path").attr("class", "net-country").attr("d", path)
    .on("click", () => setCountry(null));

  pos = new Map(core.countries.filter(c => c.lat != null).map(c => [c.c, projection([c.lon, c.lat])]));

  layers.flows = svg.append("g");
  layers.nodes = svg.append("g");
  layers.labels = svg.append("g");
  layers.legend = svg.append("g").attr("class", "net-legend").attr("transform", `translate(16, ${H - 16})`);

  draw();
  ["yearChanged", "productChanged", "countrySelected", "brushChanged"].forEach(e => on(e, draw));
}

// Curved path from a to b, bending to the left of the direction of travel.
function arc([x1, y1], [x2, y2]) {
  const k = 0.18, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return `M${x1},${y1}Q${mx + (y2 - y1) * k},${my - (x2 - x1) * k} ${x2},${y2}`;
}

function maxExports(p) {
  if (!sizeDomain[p]) sizeDomain[p] = d3.max(data.years(), y => d3.max(data.exportersInYear(p, y), e => e.exports)) || 1;
  return sizeDomain[p];
}

function draw() {
  const { product: p, year: y, country: sel, brushed } = state;
  const t = svg.transition().duration(state.playing ? 300 : 500);

  // Flows: the global top list, or the selected country's partners.
  const globalTop = data.globalFlows(p, y, TOP_N);
  let flows;
  if (sel) {
    const { imports, exports } = data.countryFlows(p, y, sel);
    flows = [...imports.slice(0, TOP_PARTNERS).map(f => ({ ...f, kind: "imports" })),
             ...exports.slice(0, TOP_PARTNERS).map(f => ({ ...f, kind: "exports" }))];
  } else {
    flows = globalTop.map(f => ({ ...f, kind: "" }));
  }
  flows = flows.filter(f => pos.has(f.e) && pos.has(f.i));
  const width = d3.scaleSqrt([0, d3.max(globalTop, f => f.v) || 1], [0.6, 10]);

  layers.flows.selectAll("path")
    .data(flows, f => `${f.e}>${f.i}`)
    .join(enter => enter.append("path").attr("stroke-width", 0))
    .attr("class", f => `net-flow ${f.kind}`)
    .attr("d", f => arc(pos.get(f.e), pos.get(f.i)))
    .call(s => s.selectAll("title").data(f => [f]).join("title")
      .text(f => `${data.countryName(f.e)} → ${data.countryName(f.i)}: ${data.money(f.v)}`))
    .transition(t).attr("stroke-width", f => width(f.v));

  // Nodes: every country with a position that exported this year.
  const partners = new Set(flows.flatMap(f => [f.e, f.i]));
  const exporters = data.exportersInYear(p, y).filter(e => pos.has(e.c));
  const r = d3.scaleSqrt([0, maxExports(p)], [1.5, 22]);

  layers.nodes.selectAll("circle")
    .data(exporters, e => e.c)
    .join(enter => enter.append("circle")
      .attr("cx", e => pos.get(e.c)[0]).attr("cy", e => pos.get(e.c)[1]).attr("r", 0)
      .on("click", (event, e) => { event.stopPropagation(); setCountry(state.country === e.c ? null : e.c); }))
    .attr("class", e => {
      const c = data.country(e.c);
      return ["net-node", c?.hub && "hub", e.c === sel && "selected", brushed.has(e.c) && "brushed",
              sel && e.c !== sel && !partners.has(e.c) && "faded"].filter(Boolean).join(" ");
    })
    .attr("fill", e => data.regionColor(e.c))
    .call(s => s.selectAll("title").data(e => [e]).join("title")
      .text(e => `${data.countryName(e.c)}${data.country(e.c)?.hub ? " (re-export hub)" : ""}\n` +
                 `Exports ${data.money(e.exports)} · rank ${e.rank} · top supplier for ${e.top_supplier_of} countries`))
    .transition(t).attr("r", e => r(e.exports));

  // Labels: the biggest exporters, plus the selected country.
  const labelled = exporters.slice().sort((a, b) => b.exports - a.exports).slice(0, LABELS).map(e => e.c);
  if (sel && pos.has(sel) && !labelled.includes(sel)) labelled.push(sel);
  layers.labels.selectAll("text")
    .data(labelled, c => c)
    .join("text")
    .attr("class", c => `net-label${sel && c !== sel && !partners.has(c) ? " faded" : ""}`)
    .attr("x", c => pos.get(c)[0] + 7).attr("y", c => pos.get(c)[1] - 7)
    .text(c => data.countryName(c));

  layers.legend.selectAll("text")
    .data([sel ? "Blue lines: where it buys chips · Orange lines: where it sells them · Press Esc to clear"
               : `Showing the ${flows.length} largest flows in ${y} · Circle size = chip exports · Line width = trade value`])
    .join("text").text(d => d);
}
