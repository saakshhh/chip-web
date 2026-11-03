"""
The Chip Web: data pipeline.

Turns the raw CEPII BACI files (HS92 version) into the small JSON files the website loads.

Usage (from the repo root):
    pip install -r pipeline/requirements.txt
    python pipeline/build_data.py ~/Downloads/BACI_HS92_V202601

Options:
    --out DIR          where to write the JSON (default: docs/data)
    --cpi FILE         annual CPI-U CSV for inflation adjustment
                       (default: pipeline/reference/cpi_u_annual.csv, skipped if missing)
    --top-global N     strongest flows kept per year for the global network (default 150)
    --top-ego K        top suppliers and top customers kept per country per year (default 8)
    --base-year Y      year whose dollars are used for inflation adjustment (default 2024)

Everything the site needs is written to --out; a human-readable data_report.md is written
next to this script. Run time is several minutes, because it reads all 30 yearly files.
"""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
REF = HERE / "reference"

PRODUCTS = {
    8542: "Electronic integrated circuits",
    8541: "Other semiconductor devices (diodes, transistors, solar cells, LEDs)",
}

# Places that mostly re-export chips rather than use them. Trade data cannot tell
# re-exports from domestic use, so this list is curated and documented, not computed.
# The computed throughput ratio is published alongside it for anyone who wants to look further.
CURATED_HUBS = {"HKG": "Hong Kong re-exports large volumes of chips, much of it to and from mainland China",
                "SGP": "Singapore is a major chip packaging, testing and transshipment hub"}

# BACI uses a few historical or special country codes. Each is mapped to its modern
# successor, so its flows merge into that country's series (BACI's own label is kept in
# countries.json as baci_name). Codes not listed here and not in the reference table keep
# an "X<code>" id and are listed in the data report.
ISO3_OVERRIDES = {
    "S19": "TWN",   # "Other Asia, nes" = Taiwan in UN-based trade data
    "BLX": "BEL",   # Belgium-Luxembourg (reported jointly in early years)
    "ANT": "CUW",   # Netherlands Antilles
    "SCG": "SRB",   # Serbia and Montenegro
    "SUD": "SDN",   # Sudan before 2011, if coded this way
    "ZA1": "ZAF",   # Southern African Customs Union
}

EVENTS = [
    {"year": 2009, "label": "Financial crisis", "kind": "world",
     "detail": "Global trade fell during the 2008 to 2009 financial crisis."},
    {"year": 2017, "label": "HS 2017 revision", "kind": "data",
     "detail": "Trade codes were revised; check whether jumps this year are real or reclassification."},
    {"year": 2020, "label": "COVID-19 and chip shortage", "kind": "world",
     "detail": "The pandemic and a demand surge led to the 2020 to 2022 chip shortage."},
    {"year": 2022, "label": "U.S. export controls", "kind": "world",
     "detail": "In October 2022 the U.S. restricted exports of advanced chips and chipmaking tools to China."},
    {"year": 2022, "label": "HS 2022 revision", "kind": "data",
     "detail": "Trade codes were revised again; another year to check for reclassification effects."},
]


# ------------------------------------------------------------------ helpers
def log(msg):
    print(msg, flush=True)


def clean(x):
    """Turn NaN and empty strings into None so the output is valid JSON."""
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items()}
    if isinstance(x, list):
        return [clean(v) for v in x]
    if isinstance(x, float) and x != x:
        return None
    if isinstance(x, str) and x == "":
        return None
    return x


def write_json(path, obj):
    path.write_text(json.dumps(clean(obj), separators=(",", ":"), ensure_ascii=False, allow_nan=False))
    return path.stat().st_size


def r3(x):
    return None if pd.isna(x) else round(float(x), 3)


def r4(x):
    return None if pd.isna(x) else round(float(x), 4)


# ------------------------------------------------------------------ countries
def load_countries(baci_dir):
    files = sorted(baci_dir.glob("country_codes*.csv"))
    if not files:
        sys.exit(f"No country_codes*.csv in {baci_dir}")
    c = pd.read_csv(files[-1], dtype=str, encoding="latin-1", keep_default_na=False)
    c.columns = [x.strip().lower() for x in c.columns]
    code_col = next(x for x in c.columns if x in ("country_code", "code"))
    name_col = next(x for x in c.columns if "name" in x)
    iso3_col = next((x for x in c.columns if "iso3" in x), None)
    c = pd.DataFrame({
        "baci_code": c[code_col].astype(int),
        "baci_name": c[name_col].str.strip(),
        "baci_iso3": c[iso3_col].str.strip().str.upper() if iso3_col else "",
    }).drop_duplicates("baci_code")

    taiwan = c["baci_name"].str.contains("other asia", case=False) | (c["baci_code"] == 490)
    c.loc[taiwan, "baci_iso3"] = "S19"

    ref = pd.read_csv(REF / "countries_reference.csv", dtype={"iso_num": str}, keep_default_na=False)
    ref = ref.set_index("iso3")

    c["iso3"] = c["baci_iso3"].map(lambda s: ISO3_OVERRIDES.get(s, s))
    c["matched"] = c["iso3"].isin(ref.index)
    for col in ("name", "iso_num", "region", "subregion", "lat", "lon", "in_world_atlas_110m"):
        c[col] = c["iso3"].map(ref[col]) if col in ref else None
    # Display name: the reference's common name for real countries, BACI's label otherwise.
    c["name"] = c["name"].where(c["matched"], c["baci_name"])
    c.loc[taiwan, "name"] = "Taiwan"
    # Unmatched codes still get a unique id so no flow is lost.
    c.loc[~c["matched"], "iso3"] = "X" + c.loc[~c["matched"], "baci_code"].astype(str)
    return c


# ------------------------------------------------------------------ trade
def read_baci(baci_dir):
    files = sorted(baci_dir.glob("BACI_*_Y*_V*.csv"))
    if not files:
        sys.exit(f"No BACI_*_Y####_V*.csv files in {baci_dir}")
    parts = []
    for f in files:
        rows = 0
        for chunk in pd.read_csv(f, usecols=["t", "i", "j", "k", "v"], dtype={"k": str},
                                 chunksize=2_000_000):
            hs4 = pd.to_numeric(chunk["k"].str.strip().str.zfill(6).str[:4], errors="coerce")
            keep = hs4.isin(PRODUCTS.keys())
            if keep.any():
                sub = chunk.loc[keep, ["t", "i", "j", "v"]].copy()
                sub["p"] = hs4[keep].astype(int)
                sub["v"] = pd.to_numeric(sub["v"], errors="coerce")
                parts.append(sub.groupby(["p", "t", "i", "j"], as_index=False)["v"].sum())
                rows += int(keep.sum())
        log(f"  {f.name}: {rows:,} chip rows")
    raw = pd.concat(parts)
    return raw.groupby(["p", "t", "i", "j"], as_index=False)["v"].sum()


def load_cpi(path, base_year):
    if not path or not Path(path).exists():
        return None
    cpi = pd.read_csv(path)
    cpi.columns = [x.strip().lower() for x in cpi.columns]
    date_col = next(x for x in cpi.columns if "date" in x or "year" in x)
    val_col = next(x for x in cpi.columns if x != date_col)
    cpi["year"] = cpi[date_col].astype(str).str[:4].astype(int)
    cpi = cpi.groupby("year")[val_col].mean()
    if base_year not in cpi.index:
        log(f"  CPI file has no {base_year}; skipping inflation adjustment")
        return None
    return cpi[base_year] / cpi  # multiply nominal values by this to get base-year dollars


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("baci_dir", type=Path)
    ap.add_argument("--out", type=Path, default=HERE.parent / "docs" / "data")
    ap.add_argument("--cpi", type=Path, default=REF / "cpi_u_annual.csv")
    ap.add_argument("--top-global", type=int, default=150)
    ap.add_argument("--top-ego", type=int, default=8)
    ap.add_argument("--base-year", type=int, default=2024)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)

    log("Reading country codes...")
    countries = load_countries(a.baci_dir)
    code2iso = countries.set_index("baci_code")["iso3"]

    log("Reading BACI files (this takes a few minutes)...")
    raw = read_baci(a.baci_dir)
    release = (re.search(r"V\d{6}", next(a.baci_dir.glob("BACI_*_Y*_V*.csv")).name) or [""])[0]

    unknown_codes = sorted(set(raw["i"]).union(raw["j"]) - set(code2iso.index))
    f = pd.DataFrame({
        "p": raw["p"], "y": raw["t"].astype(int),
        "e": raw["i"].map(code2iso).fillna("X" + raw["i"].astype(str)),
        "i": raw["j"].map(code2iso).fillna("X" + raw["j"].astype(str)),
        "v": raw["v"] / 1000.0,  # thousands of US$ -> millions of US$
    })
    self_flows = int((f["e"] == f["i"]).sum())
    f = f[(f["e"] != f["i"]) & (f["v"] > 0)]
    # Codes that map to the same country (e.g., a renamed code) are merged here.
    f = f.groupby(["p", "y", "e", "i"], as_index=False)["v"].sum()

    deflator = load_cpi(a.cpi, a.base_year)
    if deflator is not None:
        f["v_real"] = f["v"] * f["y"].map(deflator)
        missing_cpi = sorted(set(f["y"]) - set(deflator.index))
    else:
        f["v_real"] = float("nan")
        missing_cpi = []

    # ---- world totals
    world = f.groupby(["p", "y"], as_index=False)[["v", "v_real"]].sum(min_count=1)

    # ---- importers: who supplies each country
    imp_rows = []
    for (p, y, imp), s in f.groupby(["p", "y", "i"], sort=False):
        s = s.sort_values("v", ascending=False)
        tot = s["v"].sum()
        sh = s["v"] / tot
        top = [{"c": e, "s": r4(x)} for e, x in zip(s["e"].head(5), sh.head(5))]
        imp_rows.append({
            "p": int(p), "y": int(y), "c": imp,
            "imports": r3(tot),
            "n_suppliers": int(len(s)),
            "top1": s["e"].iloc[0], "top1_share": r4(sh.iloc[0]),
            "top3_share": r4(sh.head(3).sum()), "hhi": r4((sh ** 2).sum()),
            "suppliers": top, "other_share": r4(1 - sh.head(5).sum()),
        })
    importers = pd.DataFrame(imp_rows)

    # ---- exporters
    ex = f.groupby(["p", "y", "e"], as_index=False).agg(exports=("v", "sum"), exports_real=("v_real", "sum"))
    im = f.groupby(["p", "y", "i"], as_index=False)["v"].sum().rename(columns={"i": "e", "v": "imports"})
    ex = ex.merge(im, on=["p", "y", "e"], how="outer").fillna({"exports": 0.0, "imports": 0.0})
    ex["world_share"] = ex["exports"] / ex.groupby(["p", "y"])["exports"].transform("sum")
    ex["rank"] = ex.groupby(["p", "y"])["exports"].rank(ascending=False, method="min").astype(int)
    ex["weighted_degree"] = ex["exports"] + ex["imports"]
    lo = ex[["exports", "imports"]].min(axis=1)
    hi = ex[["exports", "imports"]].max(axis=1).replace(0, float("nan"))
    ex["throughput"] = lo / hi
    tops = importers.groupby(["p", "y", "top1"]).size().rename("top_supplier_of").reset_index()
    tops = tops.rename(columns={"top1": "e"})
    ex = ex.merge(tops, on=["p", "y", "e"], how="left").fillna({"top_supplier_of": 0})
    ex = ex.rename(columns={"e": "c"})

    # ---- flows: global top N per year, plus each country's top K suppliers and customers
    g = f.sort_values("v", ascending=False).groupby(["p", "y"]).head(a.top_global).index
    sup = f.sort_values("v", ascending=False).groupby(["p", "y", "i"]).head(a.top_ego).index
    cus = f.sort_values("v", ascending=False).groupby(["p", "y", "e"]).head(a.top_ego).index
    keep = f.loc[g.union(sup).union(cus)].copy()
    keep["g"] = keep.index.isin(g).astype(int)

    # ---- countries file: only those that appear in the chip data
    used = set(f["e"]).union(f["i"])
    cty = countries[countries["iso3"].isin(used)].drop_duplicates("iso3")
    cty_out = [{
        "c": r.iso3, "baci_code": int(r.baci_code), "name": r.name, "baci_name": r.baci_name,
        "iso_num": clean(r.iso_num) if r.matched else None,
        "region": clean(r.region) if r.matched and clean(r.region) else "Other",
        "subregion": clean(r.subregion) if r.matched else None,
        "lat": r3(pd.to_numeric(r.lat, errors="coerce")), "lon": r3(pd.to_numeric(r.lon, errors="coerce")),
        "on_map": str(r.in_world_atlas_110m) == "True" if r.matched else False,
        "hub": r.iso3 in CURATED_HUBS, "matched": bool(r.matched),
    } for r in cty.itertuples()]
    no_position = [x["name"] for x in cty_out if x["lat"] is None]

    # ---- write
    log("Writing JSON...")
    sizes = {}
    years = sorted(f["y"].unique().tolist())
    sizes["meta.json"] = write_json(a.out / "meta.json", {
        "source": "CEPII BACI, HS92 version", "release": release,
        "built": date.today().isoformat(), "years": [int(years[0]), int(years[-1])],
        "products": {str(k): v for k, v in PRODUCTS.items()},
        "units": "millions of current US dollars; multiply by deflators[year] for constant "
                 f"{a.base_year} dollars (U.S. CPI-U)" if deflator is not None else "millions of current US dollars",
        "inflation_adjusted": deflator is not None, "base_year": a.base_year,
        "hubs": CURATED_HUBS, "top_global": a.top_global, "top_ego": a.top_ego,
        # Multiply any nominal value from year y by deflators[y] to get base-year dollars.
        "deflators": ({str(int(y)): r4(x) for y, x in deflator.items() if int(y) in years}
                      if deflator is not None else None),
    })
    sizes["countries.json"] = write_json(a.out / "countries.json", cty_out)
    sizes["events.json"] = write_json(a.out / "events.json", EVENTS)
    sizes["world_trade.json"] = write_json(a.out / "world_trade.json", [
        {"p": int(r.p), "y": int(r.y), "v": r3(r.v), "v_real": r3(r.v_real)} for r in world.itertuples()])
    for p in PRODUCTS:
        fl = keep[keep["p"] == p].sort_values(["y", "v"], ascending=[True, False])
        sizes[f"flows_{p}.json"] = write_json(a.out / f"flows_{p}.json", [
            {"y": int(r.y), "e": r.e, "i": r.i, "v": r3(r.v), "g": int(r.g)}
            for r in fl.itertuples()])
        ip = importers[importers["p"] == p].drop(columns="p")
        sizes[f"importers_{p}.json"] = write_json(a.out / f"importers_{p}.json", ip.to_dict("records"))
        ep = ex[ex["p"] == p]
        sizes[f"exporters_{p}.json"] = write_json(a.out / f"exporters_{p}.json", [{
            "y": int(r.y), "c": r.c, "exports": r3(r.exports),
            "imports": r3(r.imports), "world_share": r4(r.world_share), "rank": int(r.rank),
            "weighted_degree": r3(r.weighted_degree), "throughput": r4(r.throughput),
            "top_supplier_of": int(r.top_supplier_of)} for r in ep.itertuples()])

    # ---- data report
    ic = world[world["p"] == 8542].set_index("y")["v"]
    jumps = (ic.pct_change() * 100).round(1)
    big = jumps[jumps.abs() > 25]
    check = keep[(keep["p"] == 8542) & (keep["g"] == 1)].groupby("y")["v"].sum()
    last = int(max(years))
    top_last = f[(f["p"] == 8542) & (f["y"] == last)].nlargest(10, "v")
    name = {x["c"]: x["name"] for x in cty_out}
    lines = [
        "# The Chip Web: data report", "",
        f"Built {date.today().isoformat()} from BACI HS92 {release}.", "",
        "## Coverage",
        f"- Years: {years[0]} to {years[-1]}",
        f"- Countries and territories in the chip data: {len(cty_out)}",
        f"- HS 8542 flows (exporter, importer, year): {int((f['p'] == 8542).sum()):,}",
        f"- HS 8541 flows: {int((f['p'] == 8541).sum()):,}",
        f"- Flows kept for the site: {len(keep):,} ({int(keep['g'].sum()):,} in the global top {a.top_global})",
        f"- Inflation adjustment: {'yes, constant ' + str(a.base_year) + ' dollars' if deflator is not None else 'no (no CPI file found)'}",
        "",
        "## Checks",
        f"- Country codes in trade data but missing from the lookup file: {unknown_codes or 'none'}",
        f"- BACI codes with no reference match (given X-codes, no map position): "
        f"{[x['baci_name'] for x in cty_out if not x['matched']] or 'none'}",
        f"- Countries with no map position: {no_position or 'none'}",
        f"- Self-flows dropped: {self_flows}",
        f"- Years missing from the CPI file: {missing_cpi or 'none'}",
        f"- Share of world HS 8542 trade covered by the global top {a.top_global} flows, {last}: "
        f"{check.get(last, 0) / ic.get(last, 1) * 100:.1f}%",
        "",
        "## Year-over-year changes in world HS 8542 trade above 25%",
        "Check these against HS revision years (2002, 2007, 2012, 2017, 2022) before treating them as real.", "",
    ]
    lines += [f"- {y}: {v:+.1f}%" for y, v in big.items()] or ["- none"]
    lines += ["", f"## Top 10 HS 8542 flows, {last} (US$ millions, nominal)"]
    lines += [f"- {name.get(r.e, r.e)} -> {name.get(r.i, r.i)}: {r.v:,.0f}" for r in top_last.itertuples()]
    lines += ["", "## Output files"] + [f"- {k}: {v / 1024:,.0f} KB" for k, v in sizes.items()]
    (HERE / "data_report.md").write_text("\n".join(lines) + "\n")
    log("\n".join(lines))
    log(f"\nDone. JSON in {a.out.resolve()}, report in {(HERE / 'data_report.md').resolve()}")


if __name__ == "__main__":
    main()
