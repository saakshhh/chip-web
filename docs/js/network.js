// Trade network on a world map. Owner: Joseph.
//
// Starter version: countries sit at their map centroids, the year's largest flows are drawn
// as curved arcs (each arc bends to the left of its direction of travel, so the curve shows
// which way trade flows), and clicking a country shows only its suppliers and customers.
//
// TODO (Joseph), roughly in priority order:
//   1. [DONE] Overlaps in East Asia and Europe: run a d3-force simulation ONCE (forceX/forceY toward
//      each centroid + forceCollide using each country's largest radius over all years), then
//      freeze the positions so nodes never move between years (stable mental map). 
//   2. [DONE] Labels: avoid overlaps; show the rest on hover.
//   3. [IN PROGRESS] Tapered edges (wide at the exporter, narrow at the importer) instead of plain arcs.
//        Works right now, but in full zoom out some of the taper dissapears before actualling connecting the nodes
//        You can see the full path if you zoom in, but will experiment more. 
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
let visibleLabels = new Set();
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

  // pos = new Map(core.countries.filter(c => c.lat != null).map(c => [c.c, projection([c.lon, c.lat])]));
  pos = calculatePositions(core, projection, state.product);

  layers.flows = svg.append("g");
  layers.nodes = svg.append("g");
  layers.labels = svg.append("g");
  layers.hover = svg.append("g");
  layers.legend = svg.append("g").attr("class", "net-legend").attr("transform", `translate(16, ${H - 16})`);

  draw();
  ["yearChanged", "productChanged", "countrySelected", "brushChanged"].forEach(e => on(e, draw));
}


function calculatePositions(core, projection, product) {
  // Find each country's maximum exports across all available years.
  const maxByCountry = new Map();

  for (const year of data.years()) {
    for (const e of data.exportersInYear(product, year)) {
      maxByCountry.set(
        e.c,
        Math.max(maxByCountry.get(e.c) || 0, e.exports)
      );
    }
  }

  // Use the same radius scale as the displayed circles.
  const maxValue = d3.max(maxByCountry.values()) || 1;
  const radius = d3.scaleSqrt([0, maxValue], [1.5, 22]);

  // Create simulation nodes at their original geographic positions.
  const nodes = core.countries
    .filter(c => c.lat != null)
    .map(c => {
      const [x, y] = projection([c.lon, c.lat]);

      return {
        c: c.c,
        x,
        y,
        targetX: x,
        targetY: y,
        r: radius(maxByCountry.get(c.c) || 0)
      };
    });

  // Run the simulation once, balancing geographic accuracy and spacing.
  const simulation = d3.forceSimulation(nodes)
    .force("x", d3.forceX(d => d.targetX).strength(0.3))
    .force("y", d3.forceY(d => d.targetY).strength(0.3))
    .force("collide", d3.forceCollide(d => d.r + 2)
      .strength(0.9)
      .iterations(3))
    .velocityDecay(0.4)
    .stop();

  // Manually advance the simulation so positions are ready immediately.
  simulation.tick(300);

  // Save the final positions. These remain fixed when years change.
  return new Map(
    nodes.map(d => [
      d.c,
      [
        Math.max(8, Math.min(W - 8, d.x)),
        Math.max(8, Math.min(H - 8, d.y))
      ]
    ])
  );
}

// Curved path from a to b, bending to the left of the direction of travel.
// function arc([x1, y1], [x2, y2]) {
//   const k = 0.18, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
//   return `M${x1},${y1}Q${mx + (y2 - y1) * k},${my - (x2 - x1) * k} ${x2},${y2}`;
// }

// Tapered curved path: wide at exporter, narrow at importer.
function taperedArc([x1, y1], [x2, y2], startWidth, endWidth) {
  const k = 0.18;
  const cx = (x1 + x2) / 2 + (y2 - y1) * k;
  const cy = (y1 + y2) / 2 - (x2 - x1) * k;

  const left = [];
  const right = [];
  const steps = 24;

  // Sample points along the quadratic Bézier curve.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;

    const x = u * u * x1 + 2 * u * t * cx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * cy + t * t * y2;

    // Calculate the curve's direction at this point.
    const dx = 2 * u * (cx - x1) + 2 * t * (x2 - cx);
    const dy = 2 * u * (cy - y1) + 2 * t * (y2 - cy);
    const length = Math.hypot(dx, dy) || 1;

    // Perpendicular direction determines the edge of the flow.
    const nx = -dy / length;
    const ny = dx / length;

    // Gradually reduce width toward the importer.
    // const halfWidth =
    //   (startWidth + (endWidth - startWidth) * t) / 2;

    const taper = Math.pow(1 - t, 1.5);
    //const halfWidth = (endWidth / 2) + ((startWidth - endWidth) / 2) * taper;
    // const halfWidth = (endWidth / 2) + ((startWidth - endWidth) / 2) * taper;
    const halfWidth = (startWidth / 2) * (1 - t);

    left.push([x + nx * halfWidth, y + ny * halfWidth]);
    right.push([x - nx * halfWidth, y - ny * halfWidth]);
  }

  // Connect both sides to create a filled tapered shape.
  const points = [...left, ...right.reverse()];

  return "M" + points.map(([x, y]) => `${x},${y}`).join("L") + "Z";
}



function layoutLabels(labelled, exporters, selected, radius) {
  const exportMap = new Map(exporters.map(e => [e.c, e]));

  // Give the selected country first priority, then largest exporters.
  const ordered = labelled.slice().sort((a, b) => {
    if (a === selected) return -1;
    if (b === selected) return 1;
    return (exportMap.get(b)?.exports || 0) -
           (exportMap.get(a)?.exports || 0);
  });

  const placed = [];

  // Use SVG to measure the actual rendered text width.
  const measure = layers.labels.append("text")
    .attr("class", "net-label")
    .attr("visibility", "hidden");

  for (const c of ordered) {
    const [px, py] = pos.get(c);
    const r = radius(exportMap.get(c)?.exports || 0);
    const name = data.countryName(c);

    measure.text(name);
    const w = measure.node().getComputedTextLength();
    const h = 14;
    const gap = 5;

    // Try eight positions around the country.
    const candidates = [
      { x: px + r + gap, y: py + 4, anchor: "start" },
      { x: px - r - gap, y: py + 4, anchor: "end" },
      { x: px, y: py - r - gap, anchor: "middle" },
      { x: px, y: py + r + gap + h, anchor: "middle" },
      { x: px + r + gap, y: py - r - gap, anchor: "start" },
      { x: px - r - gap, y: py - r - gap, anchor: "end" },
      { x: px + r + gap, y: py + r + gap + h, anchor: "start" },
      { x: px - r - gap, y: py + r + gap + h, anchor: "end" }
    ];

    let best = null;
    let bestScore = Infinity;

    for (const candidate of candidates) {
      const left = candidate.anchor === "start"
        ? candidate.x
        : candidate.anchor === "end"
          ? candidate.x - w
          : candidate.x - w / 2;

      const right = left + w;
      const top = candidate.y - h;
      const bottom = candidate.y + 3;

      // Penalize labels that extend outside the map.
      let score =
        Math.max(0, 8 - left) * 100 +
        Math.max(0, right - (W - 8)) * 100 +
        Math.max(0, 8 - top) * 100 +
        Math.max(0, bottom - (H - 8)) * 100;

      // Penalize overlap with labels already positioned.
      for (const box of placed) {
        const overlapX = left < box.right && right > box.left;
        const overlapY = top < box.bottom && bottom > box.top;

        if (overlapX && overlapY) {
          score += 10000;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        best = {
          c, ...candidate,
          left, right, top, bottom
        };
      }
    }

    placed.push(best);
  }

  measure.remove();
  return placed;
}


function showHoverLabel(e) {
  // Don't show a duplicate if this country already has a permanent label.
  if (visibleLabels.has(e.c)) return;

  const [x, y] = pos.get(e.c);

  layers.hover.selectAll("text")
    .data([e])
    .join("text")
    .attr("class", "net-label")
    .attr("x", x + 10)
    .attr("y", y - 10)
    .attr("pointer-events", "none")
    .text(d => data.countryName(d.c));
}

function clearHoverLabel() {
  layers.hover.selectAll("text").remove();
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

  // layers.flows.selectAll("path")
  //   .data(flows, f => `${f.e}>${f.i}`)
  //   .join(enter => enter.append("path").attr("stroke-width", 0))
  //   .attr("class", f => `net-flow ${f.kind}`)
  //   .attr("d", f => arc(pos.get(f.e), pos.get(f.i)))
  //   .call(s => s.selectAll("title").data(f => [f]).join("title")
  //     .text(f => `${data.countryName(f.e)} → ${data.countryName(f.i)}: ${data.money(f.v)}`))
  //   .transition(t).attr("stroke-width", f => width(f.v));


  layers.flows.selectAll("path")
  .data(flows, f => `${f.e}>${f.i}`)
  .join(enter => enter.append("path").attr("opacity", 0))
  .attr("class", f => `net-flow ${f.kind}`)
  .attr("d", f => {
    const w = width(f.v);

    // return taperedArc(
    //   pos.get(f.e),
    //   pos.get(f.i),
    //   w,
    //   // Math.max(0.8, w * 0.15)
    //   Math.max(0.2, w * 0.02)
    // );

    // return taperedArc(pos.get(f.e), pos.get(f.i), w, 0.05);

    return taperedArc(pos.get(f.e), pos.get(f.i), w, 0);


  })
  // Use the existing CSS stroke colors as the new fill colors.
  .style("fill", function() {
    const color = d3.select(this).style("stroke");
    return color && color !== "none" ? color : "#64748b";
  })
  .style("stroke", "none")
  .call(s => s.selectAll("title").data(f => [f]).join("title")
    .text(f => `${data.countryName(f.e)} → ${data.countryName(f.i)}: ${data.money(f.v)}`))
  .transition(t)
  .style("opacity", 0.85);



  // Nodes: every country with a position that exported this year.
  const partners = new Set(flows.flatMap(f => [f.e, f.i]));
  const exporters = data.exportersInYear(p, y).filter(e => pos.has(e.c));
  const r = d3.scaleSqrt([0, maxExports(p)], [1.5, 22]);

  layers.nodes.selectAll("circle")
    .data(exporters, e => e.c)
    .join(enter => enter.append("circle")
      .attr("cx", e => pos.get(e.c)[0]).attr("cy", e => pos.get(e.c)[1]).attr("r", 0)
      //.on("click", (event, e) => { event.stopPropagation(); setCountry(state.country === e.c ? null : e.c); }))
      .on("click", (event, e) => {
        event.stopPropagation();
        setCountry(state.country === e.c ? null : e.c);
      })
      .on("mouseenter", (event, e) => showHoverLabel(e))
      .on("mouseleave", clearHoverLabel))
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
  // const labelled = exporters.slice().sort((a, b) => b.exports - a.exports).slice(0, LABELS).map(e => e.c);
  // if (sel && pos.has(sel) && !labelled.includes(sel)) labelled.push(sel);
  // layers.labels.selectAll("text")
  //   .data(labelled, c => c)
  //   .join("text")
  //   .attr("class", c => `net-label${sel && c !== sel && !partners.has(c) ? " faded" : ""}`)
  //   .attr("x", c => pos.get(c)[0] + 7).attr("y", c => pos.get(c)[1] - 7)
  //   .text(c => data.countryName(c));
  
  // Labels: biggest exporters, plus the selected country.
  const labelled = exporters
  .slice()
  .sort((a, b) => b.exports - a.exports)
  .slice(0, LABELS)
  .map(e => e.c);

  if (sel && pos.has(sel) && !labelled.includes(sel)) {
  labelled.push(sel);
  }

  // Remember which countries already have permanent labels.
  visibleLabels = new Set(labelled);

  // Calculate positions that minimize label overlap.
  const labelPositions = layoutLabels(labelled, exporters, sel, r);

  layers.labels.selectAll("text")
  .data(labelPositions, d => d.c)
  .join("text")
  .attr("class", d =>
    `net-label${sel && d.c !== sel && !partners.has(d.c) ? " faded" : ""}`
  )
  .attr("x", d => d.x)
  .attr("y", d => d.y)
  .attr("text-anchor", d => d.anchor)
  .text(d => data.countryName(d.c));


  layers.legend.selectAll("text")
    .data([sel ? "Blue lines: where it buys chips · Orange lines: where it sells them · Press Esc to clear"
               : `Showing the ${flows.length} largest flows in ${y} · Circle size = chip exports · Line width = trade value`])
    .join("text").text(d => d);
}
