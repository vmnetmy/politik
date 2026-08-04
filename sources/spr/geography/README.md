# SPR geography and locality coverage

`dpi-2022.json` and `senarai-bpr.json` provide the complete reusable
State → Parliament → DUN → PDM hierarchy for the PRU-15 snapshot.

SPR defines a locality as the smallest unit inside a polling district, but its
Open Data catalogue does not currently publish a complete national locality
table. Public monthly DPT PDFs expose only the localities affected or listed in
that publication. For that reason, locality coverage must remain explicitly
partial and must never be inferred from polling-centre names.

`localities.json` is the governed union of locality rows transcribed from public
SPR DPT documents. Each record keeps first/last-seen dates and every source
reference. Conflicting names for the same full locality code are emitted as
reconciliation issues rather than silently overwritten.

`scripts/extract_dpt_localities.py` is the automated ingestion path for future
archived DPT PDFs. Add each PDF and its official URL/date to
`dpt-source-index.json`, run `npm run data:localities`, review the generated
snapshot, merge approved rows into `localities.json`, then run
`npm run data:geography`.
