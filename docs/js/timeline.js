// Timeline: world chip trade over time, event markers, year slider and playback. Owner: Thomas.
//
// TODO (Thomas):
//   1. Toggle between current and constant 2024 dollars (data.toReal / world_trade v_real).
//   2. Better event labels (avoid overlaps when two events share a year, e.g. 2022).
//   3. Brush a range of years to compare two periods.
//   4. Tune playback speed; pause when the user interacts with another view.

import { state, on, setYear, setPlaying } from "./state.js";
import * as data from "./data.js";

const W = 1000, H = 226, M = { top: 52, right: 20, bottom: 42, left: 56 };
let svg, x, y, line, slider, yearLabel, playButton, timer = null;

// Which dollars the chart shows: "nominal" (current dollars, field v) or "real" (constant
// base-year dollars, field v_real)
let adjusted = false;
const value = d => (adjusted ? d.v_real : d.v);

// Playback: one year every STEP_MS milliseconds at 1x
const STEP_MS = 900;
let speed = 1;

export function init(el) {
  const yrs = data.years();
  el.innerHTML = `<h2>World chip trade over time</h2>
    <div class="tl-controls">
      <div class="tl-buttons">
        <button type="button" id="tl-play">Play</button>
        <select id="tl-speed" aria-label="Playback speed">
          <option value="0.5">0.5×</option>
          <option value="1" selected>1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
        </select>
      </div>
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
  el.querySelector("#tl-speed").addEventListener("change", e => {
    speed = +e.target.value;
    if (timer) startTimer();
  });
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

  // legend at the bottom
  const legend = svg.append("g").attr("class", "tl-legend");
  [["world", "Real-world event"], ["data", "Trade code revision"]].forEach(([kind, text], i) => {
    const g = legend.append("g").attr("class", `tl-event ${kind}`)
      .attr("transform", `translate(${M.left + i * 110},${H - 4})`);
    g.append("line").attr("y1", -9).attr("y2", 2);
    g.append("text").attr("x", 6).text(text);
  });
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

  // One marker per year, multiple events are seperated by \n
  const groups = layoutEvents(data.getCore().events);
  svg.select(".tl-events").selectAll("g.tl-event").data(groups, d => d.year).join(enter => {
    const g = enter.append("g");
    g.append("line");
    g.append("title");
    return g;
  })
    .attr("class", d => `tl-event ${d.kind}`)
    .call(g => g.select("line").attr("x1", d => x(d.year)).attr("x2", d => x(d.year))
      .attr("y1", d => d.y1).attr("y2", d => d.y2))
    .call(g => g.selectAll("text").data(d => d.events.map((e, i) => ({ ...e, d, i }))).join("text")
      .attr("class", e => e.kind)
      .attr("x", e => e.d.tx).attr("y", e => e.d.ty + e.i * STACK_H)
      .attr("text-anchor", "middle").text(e => e.label))
    .call(g => g.select("title").text(d => [d.year, ...d.events.map(e => `${e.label}: ${e.detail}`)].join("\n")));
}

// Events alternate between height at top to seperate.
const TIER_H = 16;   // how much lower the alternating years sit (2nd, 4th... event year)
const STACK_H = 12;  // gap between labels in the same year (e.g. the two 2022 labels)
function layoutEvents(events) {
  return d3.groups(events, e => e.year).sort((a, b) => a[0] - b[0]).map(([year, evs], i) => {
    const ty = 10 + (i % 2) * TIER_H;   // alternate: high, low, high, low...
    return {
      year, events: evs, tx: x(year), ty,
      kind: evs.some(e => e.kind === "world") ? "world" : "data",
      y1: ty + (evs.length - 1) * STACK_H + 4, y2: H - M.bottom,
    };
  });
}

function drawYear() {
  const cx = x(state.year);
  svg.select(".tl-current").transition().duration(state.playing ? Math.min(250, STEP_MS / speed / 2) : 300).attr("x1", cx).attr("x2", cx);
  slider.value = state.year;
  yearLabel.textContent = state.year;
}

function play() {
  const yrs = data.years();
  if (state.year === yrs.at(-1)) setYear(yrs[0]);
  setPlaying(true);
  playButton.textContent = "Pause";
  startTimer();
}

function startTimer() {
  const yrs = data.years();
  if (timer) timer.stop();
  timer = d3.interval(() => {
    if (state.year >= yrs.at(-1)) return stop();
    setYear(state.year + 1);
  }, STEP_MS / speed);
}

function stop() {
  if (timer) timer.stop();
  timer = null;
  setPlaying(false);
  if (playButton) playButton.textContent = "Play";
}
