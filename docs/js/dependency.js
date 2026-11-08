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

const WIDTH = 336;
const MARGIN = { top: 20, right: 12, bottom: 30, left: 42 };
const OTHER = "other";

export function init(element) {
  el = element;
  draw();

  ["countrySelected", "yearChanged", "productChanged"].forEach(event =>
    on(event, draw)
  );
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
    el.innerHTML = `<h2>${data.countryName(c)}</h2>
      <p class="hint">No recorded chip imports in ${year}.</p>`;

    drawHistory(c, product, year);
    return;
  }

  el.innerHTML = `<h2>Where ${data.countryName(c)} buys its chips, ${year}</h2>
    <p class="hint">Share of ${data.money(rec.imports)} in chip imports, by supplier.</p>`;

  drawHistory(c, product, year);

  d3.select(el).append("h3")
    .style("font-size", "13px")
    .style("margin", "12px 0 6px")
    .text(`Top suppliers in ${year}`);

  const rows = [
    ...rec.suppliers.map(s => ({ c: s.c, s: s.s })),
    { c: null, s: rec.other_share },
  ].filter(d => d.s > 0);

  const W = 336;
  const rowH = 24;
  const labelW = 112;
  const xs = d3.scaleLinear([0, 1], [0, W - labelW - 48]);

  const svg = d3.select(el).append("svg")
    .attr("viewBox", `0 0 ${W} ${rows.length * rowH + 4}`)
    .attr("role", "img")
    .attr("aria-label", `Chip suppliers of ${data.countryName(c)} in ${year}`);

  const g = svg.selectAll("g")
    .data(rows)
    .join("g")
    .attr("class", d => `dep-bar${d.c ? "" : " other"}`)
    .attr("transform", (d, i) => `translate(0,${i * rowH})`)
    .style("cursor", d => (d.c ? "pointer" : "default"))
    .on("click", (event, d) => d.c && setCountry(d.c));

  g.append("text")
    .attr("x", 0)
    .attr("y", 15)
    .text(d => (d.c ? data.countryName(d.c) : "All others"));

  g.append("rect")
    .attr("x", labelW)
    .attr("y", 4)
    .attr("height", rowH - 8)
    .attr("rx", 3)
    .attr("width", d => xs(d.s));

  g.append("text")
    .attr("x", d => labelW + xs(d.s) + 6)
    .attr("y", 15)
    .text(d => data.pct(d.s));

  d3.select(el).append("div")
    .attr("class", "dep-stats")
    .html(
      `<span>Top 3 share <b>${data.pct(rec.top3_share)}</b></span>
       <span>HHI <b>${rec.hhi.toFixed(2)}</b></span>
       <span>Suppliers <b>${rec.n_suppliers}</b></span>`
    );
}

function drawHistory(countryCode, product, selectedYear) {
  const history = data.importerHistory(product, countryCode);

  if (history.length === 0) {
    return;
  }

  // Rank suppliers by their individually reported trade values.
  // The selected year does not affect this list.
  const totals = d3.rollups(
    history.flatMap(record =>
      record.suppliers.map(supplier => ({
        code: supplier.c,
        value: record.imports * supplier.s,
      }))
    ),
    entries => d3.sum(entries, entry => entry.value),
    entry => entry.code
  );

  totals.sort((a, b) =>
    d3.descending(a[1], b[1]) || d3.ascending(a[0], b[0])
  );

  const supplierCodes = totals.slice(0, 4).map(([code]) => code);
  const keys = [...supplierCodes, OTHER];
  const years = data.years();

  const recordsByYear = new Map(
    history.map(record => [record.y, record])
  );

  // Include every year so missing records create gaps.
  const rows = years.map(year => {
    const record = recordsByYear.get(year);
    const shares = new Map(
      (record?.suppliers ?? []).map(supplier => [
        supplier.c,
        supplier.s,
      ])
    );

    const row = {
      year,
      available: Boolean(record),
      hhi: record?.hhi ?? null,
    };

    for (const code of supplierCodes) {
      // A supplier outside this year's top five is included in Other.
      // Zero here means no individually displayed share, not zero trade.
      row[code] = shares.get(code) ?? 0;
    }

    const shownShare = d3.sum(supplierCodes, code => row[code]);

    // Rounded source shares can slightly exceed 100%.
    const divisor = Math.max(1, shownShare);

    for (const code of supplierCodes) {
      row[code] /= divisor;
    }

    row[OTHER] = Math.max(0, 1 - shownShare) / divisor;

    return row;
  });

  const color = d3.scaleOrdinal()
    .domain(keys)
    .range([
      ...d3.schemeTableau10.slice(0, supplierCodes.length),
      "#cbd5e1",
    ]);

  const x = d3.scaleLinear()
    .domain(d3.extent(years))
    .range([MARGIN.left, WIDTH - MARGIN.right]);

  const shareY = d3.scaleLinear()
    .domain([0, 1])
    .range([160, MARGIN.top]);

  const hhiY = d3.scaleLinear()
    .domain([0, 1])
    .range([310, 230]);

  const svg = d3.select(el).append("svg")
    .attr("viewBox", `0 0 ${WIDTH} 345`)
    .attr("role", "img")
    .attr(
      "aria-label",
      `Supplier shares and HHI over time for ${data.countryName(countryCode)}`
    );

  svg.append("text")
    .attr("x", MARGIN.left)
    .attr("y", 12)
    .attr("font-size", 11)
    .text("Supplier shares over time");

  const layers = d3.stack()
    .keys(keys)(rows);

  const area = d3.area()
    .defined(point => point.data.available)
    .x(point => x(point.data.year))
    .y0(point => shareY(point[0]))
    .y1(point => shareY(point[1]));

  svg.append("g")
    .selectAll("path")
    .data(layers)
    .join("path")
    .attr("fill", layer => color(layer.key))
    .attr("d", area)
    .append("title")
    .text(layer =>
      layer.key === OTHER
        ? "Other suppliers, including shares outside each year's top five"
        : `${data.countryName(layer.key)}: individually reported top-five shares`
    );

  svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(
      d3.axisLeft(shareY)
        .tickValues([0, 0.5, 1])
        .tickFormat(d3.format(".0%"))
    );

  svg.append("g")
    .attr("transform", "translate(0,160)")
    .call(
      d3.axisBottom(x)
        .ticks(4)
        .tickFormat(d3.format("d"))
    );

  svg.append("text")
    .attr("x", MARGIN.left)
    .attr("y", 211)
    .attr("font-size", 11)
    .text("HHI — higher means more concentrated");

  const line = d3.line()
    .defined(row => row.available && Number.isFinite(row.hhi))
    .x(row => x(row.year))
    .y(row => hhiY(row.hhi));

  svg.append("path")
    .datum(rows)
    .attr("fill", "none")
    .attr("stroke", "var(--accent)")
    .attr("stroke-width", 2)
    .attr("d", line);

  // Keep isolated observations visible when adjacent years are missing.
  svg.append("g")
    .selectAll("circle")
    .data(
      rows.filter(row =>
        row.available && Number.isFinite(row.hhi)
      )
    )
    .join("circle")
    .attr("cx", row => x(row.year))
    .attr("cy", row => hhiY(row.hhi))
    .attr("r", row => row.year === selectedYear ? 4 : 2)
    .attr("fill", "var(--accent)")
    .append("title")
    .text(row => `${row.year}: HHI ${row.hhi.toFixed(3)}`);

  svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(
      d3.axisLeft(hhiY)
        .tickValues([0, 0.5, 1])
    );

  svg.append("g")
    .attr("transform", "translate(0,310)")
    .call(
      d3.axisBottom(x)
        .ticks(4)
        .tickFormat(d3.format("d"))
    );

  // Mark the shared selected year in both charts.
  svg.append("g")
    .selectAll("line")
    .data([
      [MARGIN.top, 160],
      [230, 310],
    ])
    .join("line")
    .attr("x1", x(selectedYear))
    .attr("x2", x(selectedYear))
    .attr("y1", bounds => bounds[0])
    .attr("y2", bounds => bounds[1])
    .attr("stroke", "var(--ink)")
    .attr("stroke-dasharray", "3 3")
    .attr("pointer-events", "none");

  const legend = d3.select(el).append("div")
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("gap", "4px 12px")
    .style("font-size", "12px")
    .style("margin-bottom", "8px");

  const items = legend.selectAll("span")
    .data(keys)
    .join("span")
    .style("display", "inline-flex")
    .style("align-items", "center")
    .style("gap", "4px");

  items.append("span")
    .style("width", "10px")
    .style("height", "10px")
    .style("background-color", key => color(key));

  items.append("span")
    .text(key =>
      key === OTHER ? "Other suppliers" : data.countryName(key)
    );

  d3.select(el).append("p")
    .attr("class", "hint")
    .text(
      "Four suppliers are selected by their total individually reported trade value " +
      "across all years. Each year reports only its top five suppliers individually; " +
      "shares outside that list are included in Other suppliers. " +
      "A missing colored band does not imply zero trade. Missing years appear as gaps."
    );
}q