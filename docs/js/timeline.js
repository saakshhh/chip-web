// Timeline: world chip trade over time, event markers, year slider and playback. Owner: Thomas.

import { state, on, setYear, setPlaying } from "./state.js";
import * as data from "./data.js";

const W = 1000, H = 226, M = { top: 52, right: 20, bottom: 42, left: 56 };
let svg, x, y, line, slider, yearLabel, playButton, timer = null;

// Inflation setting. false: values as recorded (field v, current dollars).
// true: inflation-adjusted (field v_real, constant base-year dollars).
let adjusted = false;
const value = d => (adjusted ? d.v_real : d.v);

// Playback: one year every STEP_MS milliseconds at 1x
const STEP_MS = 900;
let speed = 1;

// Up to two periods to compare, each [firstYear, lastYear]
// The first drag sets A, the second B, and a third starts over.
let periods = [];
let compareEl;

export function init(el) {
  const yrs = data.years(), base = data.getCore().meta.base_year;
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
      <label class="tl-adjusted" title="Converts each year to ${base} dollars using U.S. consumer prices (CPI)">
        <input type="checkbox" id="tl-adjusted"> Adjust for inflation (${base} $)
      </label>
    </div>
    <div class="tl-compare" id="tl-compare"></div>`;
  compareEl = el.querySelector("#tl-compare");
  compareEl.addEventListener("click", e => {
    if (e.target.id === "tl-clear") { periods = []; drawPeriods(); }
  });
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
  svg.append("g").attr("class", "tl-periods");
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

  // Drag across the chart to pick a period to compare
  const brush = d3.brushX().extent([[M.left, M.top], [W - M.right, H - M.bottom]])
    .on("end", ({ selection, sourceEvent }) => {
      if (!sourceEvent) return;
      stop();
      if (!selection) {   // a click or tap without dragging: jump to that year
        const pt = sourceEvent.changedTouches?.[0] ?? sourceEvent;
        const yr = Math.round(x.invert(d3.pointer(pt, svg.node())[0]));
        return setYear(Math.max(yrs[0], Math.min(yrs.at(-1), yr)));
      }
      const period = selection.map(px => Math.round(x.invert(px)));   // snaps to whatever closest whole year
      periods = periods.length === 2 ? [period] : [...periods, period];
      svg.select(".tl-brush").call(brush.move, null);   // hide the drag box; the shaded period replaces it
      drawPeriods();
    });
  svg.append("g").attr("class", "tl-brush").call(brush);

  drawSeries();
  drawEvents();
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
  drawPeriods();   // the averages depend on the product and the inflation setting
}

function drawEvents() {
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

// Event years alternate between a high and a low row so neighbouring labels don't collide.
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

function drawPeriods() {
  svg.select(".tl-periods").selectAll("rect").data(periods).join("rect")
    .attr("class", (p, i) => `tl-period ${i ? "b" : "a"}`)
    .attr("x", p => x(p[0]))
    .attr("width", p => Math.max(2, x(p[1]) - x(p[0])))
    .attr("y", M.top).attr("height", H - M.top - M.bottom);

  const series = data.worldSeries(state.product);
  const avg = ([a, b]) => d3.mean(series.filter(d => d.y >= a && d.y <= b), value);
  // Average yearly growth from the first to the last year of a period (compound annual growth).
  const at = yr => value(series.find(d => d.y === yr));
  const growth = ([a, b]) => (at(b) / at(a)) ** (1 / (b - a)) - 1;
  const describe = (p, i) => `<b class="${i ? "b" : "a"}">${i ? "B" : "A"}</b> ` +
    `${p[0] === p[1] ? p[0] : `${p[0]}–${p[1]}`}: avg ${data.money(avg(p))}/yr` +
    (p[0] === p[1] ? "" : ` · growth ${d3.format("+.1%")(growth(p))}/yr`);

  const lines = periods.map(describe);
  if (periods.length === 0) lines.push("Drag across the chart to pick two periods to compare.");
  if (periods.length === 1) lines.push(`<b class="b">B</b> drag again to pick period B`);
  if (periods.length === 2) {
    const change = d3.format("+.0%")(avg(periods[1]) / avg(periods[0]) - 1);
    lines.push(`<span class="tl-result">Result: B is ${change} vs A</span>`);
  }
  if (periods.length) lines[lines.length - 1] += ` <button type="button" id="tl-clear">Clear</button>`;
  compareEl.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
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
