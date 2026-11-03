# The Chip Web

Visualizing global semiconductor trade and dependency, 1995 to 2024.
CS 43900 Interactive Data Visualization, Purdue University, Fall 2026.

Team: Joseph Hsin, Thomas Temperley, Saksham Singh, Kyungmin Kim, Alex Jung.

## Repo layout

```
pipeline/            Python that turns raw BACI files into the site's JSON
  build_data.py      the pipeline (run once after downloading BACI)
  data_report.md     coverage and data checks from the last run
  reference/         country lookup (codes, regions, map positions) and the optional CPI file
docs/                the website; GitHub Pages serves this folder
  index.html         data check page for now (the real site replaces it)
  data/              processed JSON the site loads (committed, a few MB)
reports/             proposal, progress report, final write-up
```

The raw BACI download (about 8.8 GB) is never committed. Keep it outside the repo,
for example in `~/Downloads/BACI_HS92_V202601`.

## Quick start

1. Clone the repo and install the Python requirements:
   ```bash
   git clone <repo url>
   cd chip-web
   pip install -r pipeline/requirements.txt
   ```
2. You don't need to run the pipeline to work on the site: once the data lead has run it and
   committed the output, the processed JSON is in `docs/data/`. Only the data lead reruns it.
3. Serve the site locally (opening `index.html` directly won't load the data):
   ```bash
   python3 -m http.server 8000 --directory docs
   ```
   Then open http://localhost:8000.

## Rebuilding the data (data lead)

1. Download BACI HS92, release 202601, from the
   [CEPII BACI page](https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html) and unzip it.
2. Optional, for inflation-adjusted totals: download the CPI-U series as CSV from
   [FRED (CPIAUCSL)](https://fred.stlouisfed.org/series/CPIAUCSL) and save it as
   `pipeline/reference/cpi_u_annual.csv`. Monthly data is fine; the pipeline averages it by year.
3. Run:
   ```bash
   python pipeline/build_data.py ~/Downloads/BACI_HS92_V202601
   ```
4. Read `pipeline/data_report.md`, then commit the updated `docs/data/` files and the report.

## Working together

- Each lead works on a branch (`network`, `timeline`, `dependency`, `interface`, `data`) and
  opens a pull request into `main`; someone else reviews it before it merges.
- One JavaScript file per view keeps merge conflicts rare.
- Every view reads the same JSON and listens for the same shared selection events
  (year, country, product, brushed countries).

## Data dictionary

All money values are **millions of current US dollars**. To compare across decades in constant
2024 dollars, multiply a value from year `y` by `meta.deflators[y]` (U.S. CPI-U); `deflators` is
`null` if the pipeline ran without a CPI file. `world_trade.json` already includes the adjusted
total as `v_real`. Country ids
(`c`, `e`, `i`, `top1`) are ISO3 codes, for example `TWN`, `USA`, `KOR`. Product files come in
pairs: `_8542` (integrated circuits, our main focus) and `_8541` (other semiconductor devices,
including solar cells and LEDs).

### `meta.json`
Source, release, build date, year range, product labels, units, the yearly inflation
`deflators`, and the curated hub list with the reason for each. Tip for the site: load the
`_8542` files first and fetch the `_8541` files only when someone switches product.

### `countries.json`, one object per country or territory in the chip data
| Field | Meaning |
|---|---|
| `c` | ISO3 id used in every other file |
| `name` | display name (Taiwan is relabeled from BACI's "Other Asia, nes") |
| `baci_code`, `baci_name` | BACI's own numeric code and label |
| `iso_num` | ISO numeric code. **Join to the world map with this**, not `baci_code`: BACI uses 842 for the USA, the map uses 840 |
| `region`, `subregion` | World Bank-style region (for color) and subregion |
| `lat`, `lon` | approximate centroid, the node's anchor position on the map |
| `on_map` | whether the country has a shape in the 1:110m map (Singapore and Hong Kong don't; draw them as nodes only) |
| `hub` | `true` for curated re-export hubs (Hong Kong, Singapore) |
| `matched` | `false` for BACI codes with no modern country; these have no position |

### `flows_8542.json` / `flows_8541.json`, one object per trade link and year
| Field | Meaning |
|---|---|
| `y` | year |
| `e`, `i` | exporter and importer ids |
| `v` | trade value |
| `g` | `1` if the link is among the year's 150 strongest (draw these in the global view); `0` if it was kept only because it is one of a country's top 8 suppliers or customers (use these in the country view) |

### `importers_8542.json` / `importers_8541.json`, one object per importer and year
| Field | Meaning |
|---|---|
| `y`, `c` | year and importing country |
| `imports` | total chip imports |
| `n_suppliers` | number of countries it bought from |
| `top1`, `top1_share` | largest supplier and its share of imports (0 to 1) |
| `top3_share` | share from the three largest suppliers |
| `hhi` | Herfindahl-Hirschman Index of supplier concentration, 0 (spread out) to 1 (one supplier) |
| `suppliers` | top 5 suppliers as `[{c, s}]`, where `s` is the share |
| `other_share` | share from all remaining suppliers |

### `exporters_8542.json` / `exporters_8541.json`, one object per country and year
| Field | Meaning |
|---|---|
| `y`, `c` | year and country |
| `exports`, `imports` | totals |
| `world_share`, `rank` | share of world exports and rank by exports |
| `weighted_degree` | exports plus imports: the total value of the country's trade links (our export centrality measure) |
| `top_supplier_of` | how many countries have it as their largest supplier |
| `throughput` | smaller of exports and imports divided by the larger; high values can signal pass-through trade, but also simply balanced trade |

### `world_trade.json`
World total by product and year: `p`, `y`, `v`, `v_real`. Drives the timeline.

### `events.json`
Timeline annotations: `year`, `label`, `detail`, and `kind` (`world` for real-world events,
`data` for trade-code revisions to check).

### `world-110m.json`
World country shapes (TopoJSON, 1:110m). Features use ISO numeric ids, matching `iso_num`.

## Known data caveats

- Trade value is not production: chips cross borders several times (fabrication, packaging,
  testing, device assembly).
- Trade data can't separate re-exports from domestic use, so the hub list is curated, not computed.
- The world total jumps in some years when the HS codes were revised (2002, 2007, 2012, 2017,
  2022); the data report flags large jumps to check.
- BACI ends in 2024, so only two years follow the October 2022 U.S. export controls.

## Credits

- Trade data: CEPII BACI (Gaulier and Zignago, 2010), Etalab Open Licence 2.0.
- Country codes, names and centroids: `world-countries` (mledoze/countries), ODbL.
- Map shapes: `world-atlas` by Mike Bostock (ISC), from Natural Earth.
