# Administrative divisions

Source: [Natural Earth, Admin 1 states and provinces](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson), downloaded 2026-10-19.
Natural Earth geographic data are in the public domain:
https://www.naturalearthdata.com/about/terms-of-use/.

Simplified with shared topology using mapshaper's weighted 8% simplification,
keeping shapes and rounding coordinates to 0.001°. Dateline crossings are split
before rendering. Names use Portuguese where supplied, otherwise the local name.
The administrative level and coverage follow Natural Earth and can differ by
country. A missing file indicates unavailable coverage, not absence of divisions.
Brazil retains the existing 27-UF dataset; see `../BRAZIL-STATES-SOURCE.md`.

Run `node tools/prepare-subdivisions.mjs <simplified-geojson>` to regenerate.
