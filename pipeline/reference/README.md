# Reference data

`countries_reference.csv` gives every country's ISO3 code, ISO numeric code (used by the
world map file), name, UN-style subregion, a World Bank-style region and an approximate
centroid (lat, lon) for placing nodes on the map.

- Country codes, names, subregions and centroids come from the `world-countries` package
  (mledoze/countries, ODbL license). Credit it on the site.
- The `region` column groups subregions into seven World Bank-style regions, with a few
  hand-set exceptions (Turkey and the Caucasus in Europe & Central Asia, Iran and Djibouti in
  Middle East & North Africa, Mexico in Latin America & Caribbean). It approximates the
  official World Bank classification; replace it with the World Bank's own CLASS file if exact
  groups matter.
- `in_world_atlas_110m` says whether the country has a shape in the 1:110m world map
  (`world-atlas` package). Small places such as Singapore and Hong Kong don't, so the site
  draws them as nodes only.
- `cpi_u_annual.csv` is optional; see the main README for how to download it.
