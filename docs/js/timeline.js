// Timeline: world chip trade over time, event markers, year slider and playback. Owner: Thomas.
//
// TODO (Thomas):
//   1. Toggle between current and constant 2024 dollars (data.toReal / world_trade v_real).
//   2. Better event labels (avoid overlaps when two events share a year, e.g. 2022).
//   3. Brush a range of years to compare two periods.
//   4. Tune playback speed; pause when the user interacts with another view.

import { state, on, setYear, setPlaying } from "./state.js";
import * as data from "./data.js";

const W = 1000, H = 210, M = { top: 52, right: 20, bottom: 26, left: 56 };
let svg, x, y, line, slider, yearLabel, playButton, timer = null;

// Which dollars the chart shows: "nominal" (current dollars, field v) or "real" (constant
// base-year dollars, field v_real)
let adjusted = false;
const value = d => (adjusted ? d.v_real : d.v);

export function init(el) {
  const yrs = data.years();
  el.innerHTML = `<h2>World chip trade over time</h2>
    <div class="tl-controls">
      <button type="button" id="tl-play">Play</button>
      <input type="range" id="tl-slider" min="${yrs[0]}" max="${yrs.at(-1)}" step="1" value="${state.year}" aria-label="Year">
      <span class="tl-year" id="tl-year">${state.year}</span>
      <label class="tl-adjusted" title="Converts each year to ${data.getCore().meta.base_year} dollars using U.S. consumer prices (CPI)">
        <input type="checkbox" id="tl-adjusted"> Adjust for inflation (${data.getCore().meta.base_year} $)
      </label>
    </div>`;
  slider = el.querySelector("#tl-slider");
  yearLabel = el.querySelector("#tl-year");
  playButton = el.querySelector("#tl-play");
  slider.addEventListener("input", e => { stop(); setYear(e.target.value); });
  playButton.addEventListener("click", () => (timer ? stop() : play()));
  el.querySelector("#tl-adjusted").addEventListener("change", e => { adjusted = e.target.checked; drawSeries(); });

  svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", "World chip trade by year");
  x = d3.scaleLinear([yrs[0], yrs.at(-1)], [M.left, W - M.right]);
  y = d3.scaleLinear().range([H - M.bottom, M.top]);
  line = d3.line().x(d => x(d.y)).y(d => y(value(d)));

  svg.append("g").attr("class", "tl-axis tl-x").attr("transform", `translate(0,${H - M.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(15));
  svg.append("g").attr("class", "tl-axis tl-y").attr("transform", `translate(${M.left},0)`);
  svg.append("g").attr("class", "tl-events");
  svg.append("path").attr("class", "tl-line");
  svg.append("line").attr("class", "tl-current").attr("y1", M.top - 6).attr("y2", H - M.bottom);

  // Click anywhere on the chart to jump to that year.
  svg.append("rect").attr("x", M.left).attr("y", M.top).attr("width", W - M.left - M.right)
    .attr("height", H - M.top - M.bottom).attr("fill", "transparent").style("cursor", "pointer")
    .on("click", event => { stop(); setYear(Math.round(x.invert(d3.pointer(event)[0]))); });

  drawSeries();
  drawYear();
  on("productChanged", drawSeries);
  on("yearChanged", drawYear);

  // Pause playback when the user interacts with another view
  ["countrySelected", "brushChanged", "productChanged"].forEach(e => on(e, stop));
  on("playingChanged", s => { if (!s.playing) stop(); });
}

function drawSeries() {
  const series = data.worldSeries(state.product);
  y.domain([0, d3.max(series, value) * 1.1]).nice();
  svg.select(".tl-y").transition().duration(400)
    .call(d3.axisLeft(y).ticks(4).tickFormat(v => data.money(v)));
  svg.select(".tl-line").datum(series).transition().duration(400).attr("d", line);

  const events = layoutEvents(data.getCore().events);
  svg.select(".tl-events").selectAll("g").data(events).join(enter => {
    const g = enter.append("g");
    g.append("line");
    g.append("text");
    return g;
  })
    .attr("class", d => `tl-event ${d.kind}`)
    .call(g => g.select("line").attr("x1", d => x(d.year)).attr("x2", d => x(d.year))
      .attr("y1", d => d.ty + 3).attr("y2", H - M.bottom))
    .call(g => g.select("text").attr("x", d => d.tx).attr("y", d => d.ty)
      .attr("text-anchor", d => d.anchor).text(d => d.label))
    .call(g => g.selectAll("title").data(d => [d]).join("title").text(d => d.detail));
}

// Put each event label on the first of four rows where it doesn't overlap a label already
// placed. Labels near the right edge are right-aligned so they stay inside the chart.
function layoutEvents(events) {
  const charW = 6, rows = [[], [], [], []];
  return events.slice().sort((a, b) => a.year - b.year).map(e => {
    const px = x(e.year), w = e.label.length * charW;
    const anchor = px + 3 + w > W - M.right ? "end" : "start";
    const x0 = anchor === "end" ? px - 3 - w : px + 3, x1 = x0 + w;
    let row = rows.findIndex(r => r.every(([a, b]) => x1 + 6 < a || x0 > b + 6));
    if (row === -1) row = rows.length - 1;
    rows[row].push([x0, x1]);
    return { ...e, anchor, tx: anchor === "end" ? px - 3 : px + 3, ty: 10 + row * 11 };
  });
}

function drawYear() {
  const cx = x(state.year);
  svg.select(".tl-current").transition().duration(state.playing ? 250 : 300).attr("x1", cx).attr("x2", cx);
  slider.value = state.year;
  yearLabel.textContent = state.year;
}

function play() {
  const yrs = data.years();
  if (state.year === yrs.at(-1)) setYear(yrs[0]);
  setPlaying(true);
  playButton.textContent = "Pause";
  timer = d3.interval(() => {
    if (state.year >= yrs.at(-1)) return stop();
    setYear(state.year + 1);
  }, 900);
}

function stop() {
  if (timer) timer.stop();
  timer = null;
  setPlaying(false);
  if (playButton) playButton.textContent = "Play";
}
