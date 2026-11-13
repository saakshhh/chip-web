// Starts the app: loads data, creates every view, wires the page-level controls.
// Owner: Alex.
//
// Each view module exports init(element). A view draws itself from `state` and the data
// helpers, then subscribes to the state events it cares about (see state.js).

import { loadCore, ensureProduct, countryName } from "./data.js";
import { state, on, setProduct, setCountry, setBrushed, setPlaying } from "./state.js";
import * as network from "./network.js";
import * as timeline from "./timeline.js";
import * as dependency from "./dependency.js";
import * as scatter from "./scatter.js";

// Load a product's files if needed, then switch every view to it.
export async function requestProduct(product) {
  document.body.classList.add("loading");
  try {
    await ensureProduct(product);
    setProduct(product);
  } finally {
    document.body.classList.remove("loading");
  }
}

// Esc and the Clear button: drop the clicked country and the brushed group, keep the year and
// product. This is a manual action, so it also pauses playback (team rule).
function clearSelection() {
  setPlaying(false);
  setCountry(null);
  if (state.brushed.size) setBrushed([]);
}

function wireControls() {
  const select = document.querySelector("#product");
  select.value = state.product;
  select.addEventListener("change", e => requestProduct(e.target.value));

  // The badge shows the clicked country and/or how many countries are brushed, so the Clear
  // button is visible whenever there is something to clear.
  const chip = document.querySelector("#selection");
  const name = document.querySelector("#selection-name");
  function updateBadge(s) {
    const parts = [];
    if (s.country) parts.push(countryName(s.country));
    if (s.brushed.size) parts.push(`${s.brushed.size} ${s.brushed.size === 1 ? "country" : "countries"} highlighted`);
    chip.hidden = parts.length === 0;
    name.textContent = parts.join(" · ");
  }
  ["countrySelected", "brushChanged"].forEach(e => on(e, updateBadge));

  document.querySelector("#clear-selection").addEventListener("click", clearSelection);
  window.addEventListener("keydown", e => { if (e.key === "Escape") clearSelection(); });
}

async function start() {
  await loadCore();
  network.init(document.querySelector("#network"));
  timeline.init(document.querySelector("#timeline"));
  dependency.init(document.querySelector("#dependency"));
  scatter.init(document.querySelector("#scatter"));
  wireControls();
  document.body.classList.remove("loading");
}

start().catch(err => {
  console.error(err);
  document.querySelector("#loading-message").innerHTML =
    `<p class="error">Couldn't load the data: ${err.message}.<br>
     If you opened the file directly, run <code>python3 -m http.server 8000 --directory docs</code> instead.</p>`;
});
