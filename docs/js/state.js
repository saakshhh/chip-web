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

export function setYear(year) {
  year = +year;
  if (year === state.year) return;
  state.year = year;
  emit("yearChanged");
}

// Called by main.js after the product's data is loaded. Views shouldn't call this directly;
// use requestProduct() in main.js so the data is fetched first.
export function setProduct(product) {
  product = String(product);
  if (product === state.product) return;
  state.product = product;
  emit("productChanged");
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
