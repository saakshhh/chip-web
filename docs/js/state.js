// Shared selection state for every view. Owner: Alex.
//
// Views never talk to each other directly. They read `state` and listen for events:
//
//   import { state, on, setCountry } from "./state.js";
//   on("countrySelected", s => highlight(s.country));   // react to changes
//   setCountry("JPN");                                    // make a change
//
// Events (each listener receives the whole state object):
//   yearChanged      state.year changed (number, 1995 to 2024)
//   productChanged   state.product changed ("8542" or "8541"); its data is already loaded
//   countrySelected  state.country changed (ISO3 code like "TWN", or null for none)
//   brushChanged     state.brushed changed (a Set of ISO3 codes, empty for none)
//   playingChanged   state.playing changed (true while the timeline animates)
//
// Team rules for selections:
//   - Changing the year or product keeps state.country but empties state.brushed (the brushed
//     points move, so the old group no longer means the same thing). yearChanged/productChanged
//     fires first, then brushChanged, but only if there was a brush to clear. Both values are
//     already updated before either event fires.
//   - Esc and the Clear button empty both (see clearSelection in main.js).

export const state = {
  year: 2024,
  product: "8542",
  country: null,
  brushed: new Set(),
  playing: false,
};

const bus = d3.dispatch("yearChanged", "productChanged", "countrySelected", "brushChanged", "playingChanged");
let nextId = 0;

// Subscribe to an event. Returns a function that unsubscribes.
export function on(event, fn) {
  const name = `${event}.l${nextId++}`;
  bus.on(name, fn);
  return () => bus.on(name, null);
}

function emit(event) {
  bus.call(event, null, state);
}

// Empties state.brushed without firing an event. Returns true if there was anything to clear,
// so the caller can fire brushChanged after its own event.
function clearBrushedQuietly() {
  if (state.brushed.size === 0) return false;
  state.brushed = new Set();
  return true;
}

export function setYear(year) {
  year = +year;
  if (year === state.year) return;
  state.year = year;
  const brushCleared = clearBrushedQuietly();
  emit("yearChanged");
  if (brushCleared) emit("brushChanged");
}

// Called by main.js after the product's data is loaded. Views shouldn't call this directly;
// use requestProduct() in main.js so the data is fetched first.
export function setProduct(product) {
  product = String(product);
  if (product === state.product) return;
  state.product = product;
  const brushCleared = clearBrushedQuietly();
  emit("productChanged");
  if (brushCleared) emit("brushChanged");
}

export function setCountry(iso3) {
  const next = iso3 || null;
  if (next === state.country) return;
  state.country = next;
  emit("countrySelected");
}

export function setBrushed(codes) {
  state.brushed = new Set(codes || []);
  emit("brushChanged");
}

export function setPlaying(playing) {
  if (!!playing === state.playing) return;
  state.playing = !!playing;
  emit("playingChanged");
}
