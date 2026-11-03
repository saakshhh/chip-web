# The Chip Web: data report

Built 2026-11-03 from BACI HS92 V202601.

## Coverage
- Years: 1995 to 2024
- Countries and territories in the chip data: 228
- HS 8542 flows (exporter, importer, year): 239,610
- HS 8541 flows: 197,898
- Flows kept for the site: 155,379 (9,000 in the global top 150)
- Inflation adjustment: yes, constant 2024 dollars

## Checks
- Country codes in trade data but missing from the lookup file: none
- BACI codes with no reference match (given X-codes, no map position): ['US Misc. Pacific Isds']
- Countries with no map position: ['US Misc. Pacific Isds']
- Self-flows dropped: 0
- Years missing from the CPI file: none
- Share of world HS 8542 trade covered by the global top 150 flows, 2024: 93.0%

## Year-over-year changes in world HS 8542 trade above 25%
Check these against HS revision years (2002, 2007, 2012, 2017, 2022) before treating them as real.

- 2000: +29.2%
- 2007: +28.7%
- 2017: +47.9%

## Top 10 HS 8542 flows, 2024 (US$ millions, nominal)
- China -> Hong Kong: 74,671
- South Korea -> China: 63,556
- Taiwan -> China: 48,766
- Taiwan -> Hong Kong: 46,891
- Taiwan -> Singapore: 45,388
- Singapore -> Hong Kong: 35,115
- South Korea -> Taiwan: 28,935
- South Korea -> Hong Kong: 22,565
- Taiwan -> South Korea: 22,279
- China -> South Korea: 19,409

## Output files
- meta.json: 1 KB
- countries.json: 48 KB
- events.json: 1 KB
- world_trade.json: 3 KB
- flows_8542.json: 3,761 KB
- importers_8542.json: 1,661 KB
- exporters_8542.json: 956 KB
- flows_8541.json: 3,382 KB
- importers_8541.json: 1,636 KB
- exporters_8541.json: 945 KB
