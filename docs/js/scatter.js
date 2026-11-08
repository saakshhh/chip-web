// Concentration scatterplot: chip imports vs. supplier concentration. Owner: Kyungmin.
//
// Starter version: one dot per importer with at least MIN_IMPORTS of chip imports.
// Drag to brush countries (they light up on the map); click a dot to select a country.
//
// TODO (Kyungmin):
//   1. Option to swap the x axis to export centrality (exporters_*.json weighted_degree).
//   2. Labels for the most extreme countries.
//   3. Animate dots between years while the timeline plays.
//
// ADDED:
//   Task 1 is implemented below.
//   weighted_degree is imports + exports, so the UI calls it "Total trade".

import { state, on, setCountry, setBrushed } from "./state.js";
import * as data from "./data.js";

const W = 336, H = 260, M = { top: 12, right: 22, bottom: 34, left: 40 };
const MIN_IMPORTS = 100;   // US$ millions; smaller importers add noise
let svg, x, y, dots, brush;

// ADDED: The x-axis choice belongs to this view.
let xMetric = "imports";

export function init(el) {
  el.innerHTML = `<h2>How concentrated are chip suppliers?</h2>
    <p class="hint">Each dot is a country. Higher means it relies on fewer suppliers. Drag to highlight countries on the map.</p>`;

  // ADDED: A labeled dropdown for selecting the horizontal measure.
  const control = d3.select(el).append("label")
    .style("display", "block")
    .style("margin-bottom", "12px")
    .style("font-size", "13px");

  control.append("span").text("Horizontal axis");

  const select = control.append("select")
    .style("display", "block")
    .style("width", "100%")
    .style("margin-top", "4px");

  select.selectAll("option")
    .data([
      { value: "imports", label: "Chip imports" },
      {
        value: "totalTrade",
        label: "Total trade (imports + exports)",
      },
    ])
    .join("option")
    .attr("value", d => d.value)
    .text(d => d.label);

  select.property("value", xMetric)
    .on("change", event => {
      xMetric = event.currentTarget.value;

      // The old brush rectangle refers to the previous x-axis measure.
      setBrushed([]);
      draw();
    });

  svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", "Scatterplot of chip imports against supplier concentration");
  x = d3.scaleLog().range([M.left, W - M.right]);
  y = d3.scaleLinear([0, 1], [H - M.bottom, M.top]);

  svg.append("g").attr("class", "sc-axis sc-x").attr("transform", `translate(0,${H - M.bottom})`);
  svg.append("g").attr("class", "sc-axis sc-y").attr("transform", `translate(${M.left},0)`)
    .call(d3.axisLeft(y).ticks(5));

  // CHANGED: Add sc-x-label so draw() can update this label.
  svg.append("text").attr("class", "sc-label sc-x-label").attr("x", W - M.right).attr("y", H - 4)
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
  // CHANGED: Keep the existing importer filter, then attach the x-axis value.
  return data.importersInYear(state.product, state.year)
    .filter(d => d.imports >= MIN_IMPORTS)
    .map(d => ({
      ...d,
      xValue: xMetric === "imports"
        ? d.imports
        : data.exporter(state.product, state.year, d.c)?.weighted_degree,
    }))
    .filter(d => Number.isFinite(d.xValue) && d.xValue > 0);
}

function draw() {
  const pts = points();

  // CHANGED: The domain follows the selected measure.
  // Keep two distinct positive endpoints, including when no points exist.
  const maxValue = d3.max(pts, d => d.xValue) ?? MIN_IMPORTS * 10;
  const upperBound = maxValue > MIN_IMPORTS ? maxValue : MIN_IMPORTS * 10;
  x.domain([MIN_IMPORTS, upperBound]).nice();

  // ADDED: Update the visible and accessible descriptions.
  const axisLabel = xMetric === "imports" ? "Chip imports" : "Total chip trade";

  svg.select(".sc-x-label").text(`${axisLabel} (log scale)`);
  svg.attr(
    "aria-label",
    `Scatterplot of ${axisLabel.toLowerCase()} against supplier concentration`
  );

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
      // CHANGED: The tooltip reports the selected measure.
      .text(d => `${data.countryName(d.c)}: ${axisLabel} ${data.money(d.xValue)}, HHI ${d.hhi.toFixed(2)}, top supplier ${data.countryName(d.top1)}`))
    .transition().duration(state.playing ? 300 : 500)
    // CHANGED: Position points using the selected measure.
    .attr("cx", d => x(d.xValue)).attr("cy", d => y(d.hhi)).attr("r", 4);

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

  // CHANGED: Use the visible point positions for either x-axis measure.
  // This also handles points that are still moving during a transition.
  const selected = dots.selectAll("circle").filter(function () {
    const cx = this.cx.baseVal.value;
    const cy = this.cy.baseVal.value;
    return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
  });

  setBrushed(selected.data().map(d => d.c));
}