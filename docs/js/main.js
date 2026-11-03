// Starts the app: loads data, creates every view, wires the page-level controls.
// Owner: Alex.
//
// Each view module exports init(element). A view draws itself from `state` and the data
// helpers, then subscribes to the state events it cares about (see state.js).

import { loadCore, ensureProduct, countryName } from "./data.js";
import { state, on, setProduct, setCountry } from "./state.js";
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

function wireControls() {
  const select = document.querySelector("#product");
  select.value = state.product;
  select.addEventListener("change", e => requestProduct(e.target.value));

  const chip = document.querySelector("#selection");
  const name = document.querySelector("#selection-name");
  document.querySelector("#clear-selection").addEventListener("click", () => setCountry(null));
  on("countrySelected", s => {
    chip.hidden = !s.country;
    name.textContent = s.country ? countryName(s.country) : "";
  });
  // Escape clears the selection.
  window.addEventListener("keydown", e => { if (e.key === "Escape") setCountry(null); });
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
