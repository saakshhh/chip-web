# The Chip Web

Our final project for CS 43900 (Interactive Data Visualization) at Purdue, Fall 2026.

We're building an interactive map of the global chip trade from 1995 to 2024: who sells
chips to whom, which countries depend on just one or two suppliers, and how all of that
shifted around events like the chip shortage and the 2022 U.S. export controls.

**Live site:** https://saakshhh.github.io/chip-web/
(Right now it's a simple data check page. The real visualization will replace it.)

**Team:** Joseph Hsin, Thomas Temperley, Saksham Singh, Kyungmin Kim, Alex Jung

## Who's leading what

| Part | Lead |
|---|---|
| Data and metrics | Saksham |
| Trade network (the map) | TBD |
| Timeline and events | TBD |
| Dependency and concentration views | TBD |
| Interface and integration | TBD |

Leads are responsible for getting their part done, but we're building this together, so
jump in anywhere.

## Getting started

You don't need the raw data or Python to work on the site. The processed data is already
in the repo.

```bash
git clone https://github.com/saakshhh/chip-web.git
cd chip-web
python3 -m http.server 8000 --directory docs
```

Then open http://localhost:8000. (Opening `index.html` directly by double-clicking won't
work, because browsers block it from loading the data files.)

## What's in here

```
docs/          the website (GitHub Pages serves this folder)
  index.html   the page you see at the live link
  data/        the processed data the site loads
pipeline/      the Python script that builds the data from the raw files
reports/       proposal, progress report, final write-up
```

## How we work

- Make a branch for your part (for example `network` or `timeline`), not `main`.
- When something works, open a pull request and ask someone to look it over before merging.
- Try to keep your code in your own file under `docs/js/` so we don't keep editing the same
  file and hitting merge conflicts.
- Every view should react to the same shared selections: year, country, product, and any
  countries brushed in the scatterplot. We'll agree on the exact names at the kickoff.

## The data

Everything comes from CEPII's BACI database, which records trade between about 200 countries
for every product. We use two product codes:

- **HS 8542, integrated circuits:** our main focus, what most people mean by "chips"
- **HS 8541, other semiconductor devices:** kept separate, since it includes solar cells and
  LEDs and would skew the picture

A few things that are good to know before you use the files:

- **Money is in millions of US dollars**, in that year's dollars. To compare across decades,
  multiply by `meta.deflators[year]` to get 2024 dollars.
- **Countries are identified by their 3-letter code** (`USA`, `CHN`, `TWN`, `KOR`, and so on)
  in every file.
- **Taiwan shows up in the raw data as "Other Asia, nes."** We've already relabeled it.
- **To match countries to the world map, use `iso_num`**, not BACI's own code. They don't
  always agree (BACI uses 842 for the USA, the map uses 840).
- **Hong Kong and Singapore are flagged as hubs.** They re-export a lot of chips, so their
  trade numbers mean something different from other countries'.

### The files

All of these live in `docs/data/`. Files ending in `_8542` and `_8541` come in pairs, one per
product. Load the `_8542` ones first; only fetch `_8541` if someone switches product.

**`countries.json`**: one entry per country or territory.

| Field | What it is |
|---|---|
| `c` | 3-letter code, used everywhere else |
| `name` | name to show on screen |
| `iso_num` | number used to match the world map |
| `region` | one of seven world regions, for coloring |
| `lat`, `lon` | where the country's node goes on the map |
| `on_map` | `false` for places too small to have a shape on the map (like Singapore); draw just the node |
| `hub` | `true` for Hong Kong and Singapore |

**`flows_8542.json`**: the trade links between countries.

| Field | What it is |
|---|---|
| `y` | year |
| `e`, `i` | exporter and importer |
| `v` | trade value |
| `g` | `1` if it's one of that year's 150 biggest flows (show these on the main map); `0` if it's only here because it's one of a country's top 8 partners (use these when someone clicks a country) |

**`importers_8542.json`**: where each country buys its chips, per year.

| Field | What it is |
|---|---|
| `imports` | total chip imports |
| `top1`, `top1_share` | biggest supplier and its share (0 to 1) |
| `top3_share` | share from the top three suppliers |
| `hhi` | how concentrated the suppliers are, from 0 (spread out) to 1 (all from one country) |
| `suppliers` | the top 5 suppliers with their shares |
| `other_share` | everything else |

**`exporters_8542.json`**: how big a seller each country is, per year.

| Field | What it is |
|---|---|
| `exports`, `imports` | totals |
| `world_share`, `rank` | share of world exports and where it ranks |
| `weighted_degree` | exports plus imports, our "how connected is this country" measure |
| `top_supplier_of` | how many countries have it as their number-one supplier |

**The smaller files:**
- `world_trade.json`: world total per year, for the timeline
- `events.json`: the events we mark on the timeline
- `meta.json`: where the data came from, units, and the inflation numbers
- `world-110m.json`: the world map shapes

## Rebuilding the data

Only needed if the data changes. This is Saksham's part, but here's how it works in case
anyone needs to rerun it.

1. Download BACI (HS92 version, release 202601) from the
   [CEPII website](https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html) and unzip
   it. It's about 9 GB, so keep it outside this folder. It must never be committed.
2. Install the requirements and run the script:
   ```bash
   pip install -r pipeline/requirements.txt
   python pipeline/build_data.py ~/Downloads/BACI_HS92_V202601
   ```
3. Check `pipeline/data_report.md` for anything odd, then commit the updated `docs/data/` files.

The inflation numbers come from the U.S. CPI on
[FRED](https://fred.stlouisfed.org/series/CPIAUCSL), saved in `pipeline/reference/`.

## Things to keep in mind

- **Trade isn't the same as production.** A chip can be made in one country, packaged in
  another and tested in a third, and it gets counted each time it crosses a border.
- **Some jumps aren't real.** The trade codes were revised in 2007 and 2017, and world chip
  trade jumps a lot in both years. Part of that may just be products being reclassified.
- **The data stops at 2024**, so we only see two years after the 2022 export controls.
- **The regions are approximate.** We grouped countries into seven World Bank-style regions
  ourselves, so a few borderline countries might not match the official list.

## Credits

- Trade data: CEPII BACI (Gaulier and Zignago, 2010), Etalab Open Licence 2.0
- Country names, codes and map positions: [world-countries](https://github.com/mledoze/countries) (ODbL)
- Map shapes: [world-atlas](https://github.com/topojson/world-atlas) by Mike Bostock, from Natural Earth
