# SPR election boundaries

`spr-boundaries-dataset-11.kmz` is the official SPR Open Data boundary archive retrieved on 23 July 2026 from:

`https://opendata.spr.gov.my/api/proxy-file?dataset_id=11`

SHA-256:

`1f4084554214c1ffe7fd5f20096ca049dafcb0a58facabde8bb10ff87cc78ffc`

Run `npm run data:boundaries` to refresh and republish the browser-ready Negeri Sembilan DUN artifact. Run `npm run data:boundaries:check` to validate the locked source hash, all 36 DUN geometries and their one-to-one joins to the PRN-15 result records.

The Atlas registry binds the current 222 Parliament and 600 DUN geometries to
the three regional delimitation regimes that produced them:

- Sarawak: P.U.(A) 299/2015, effective from 19 December 2015.
- States of Malaya and the Federal Territories: the 2018 review, effective from
  29 March 2018.
- Sabah: P.U.(A) 225/2019, effective from 22 August 2019 and introducing the
  present 73-DUN layout.

Every published PRU/PRN event occurs after the applicable regional effective
date. `scripts/extract_atlas_boundaries.py` therefore certifies event-by-state
coverage as `exact`; it rejects a state-election event that has no explicit
state boundary entry.
