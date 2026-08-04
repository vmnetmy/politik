# PRU-14 SPR scoresheet archive

This directory preserves the parliamentary XLSX scoresheets supplied from the
`PRU 14 - DUN & PARLIMEN RESULTS` archive. The files identify themselves as
`© SPR 2018 Versi 1.1.0 - Suruhanjaya Pilihan Raya Malaysia`.

## Published scope

- 190 parliamentary workbooks were present: Peninsular Malaysia except W.P.
  Labuan, plus Sabah.
- The supplied archive did not contain the 31 Sarawak parliamentary seats or
  P.166 W.P. Labuan.
- 180 workbooks pass the publication gate. Each published stream satisfies
  candidate votes = valid votes and A = valid + rejected + unreturned, and its
  final candidate and registered-voter totals reconcile to the official SPR
  result sources.
- Ten workbooks remain archived but are rejected from row-level publication.
  Their exact reasons are recorded in `scoresheets/manifest.json`.

The companion archive also contains 444 workbooks for the eleven Assembly-14
state elections held with PRU-14. Of the 445 contests, Rantau was uncontested
and therefore has no polling scoresheet. Reconciled DUN workbooks are archived
under `dun-scoresheets/` and published lazily on PRN-14 DUN result pages.
Sabah's 60 supplied 2018 workbooks belong to Assembly 15. They are preserved
under `sabah-assembly-15-scoresheets/`, resolved against a separate 60-seat
registry derived from the gazetted PRU-14 electoral roll, and published under
`/prn/15/sabah/`. Fifty-five pass row-level accounting; five are retained as
declared rejections because their visible stream rows do not add up to their
own final `JUMLAH`. Aggregate SPR results remain available for all 60 seats.

The pre-2019 Sabah registry is explicitly `identity-only`: official seat names,
codes, Parliament parents and registered-voter totals are locked, but the app
does not substitute the later 73-seat geometry or draw an estimated map.

## Official comparison sources

- SPR Open Data: <https://opendata.spr.gov.my/>
- MySPR PRU results: <https://mysprsemak.spr.gov.my/semakan/keputusan/pru>
- PRU-14 electoral roll: <https://www.spr.gov.my/sites/default/files/HargaDPIST42017_PRU14.pdf>
- Official pre-2019 60-seat list: <https://www.spr.gov.my/sites/default/files/senarai-bahagian-pilihanraya-persekutuan-dan-negeri.pdf>

The latest official replacement-source search and publication policy are
recorded in `official-source-search.json`; every unresolved item is exposed at
`/pru/14/audit` and in the downloadable audit JSON/CSV.

Run `npm run data:scoresheets:pru14` to regenerate the published saluran files,
or `npm run data:scoresheets:pru14:check` to verify all archived bytes and
generated artifacts without changing them.
Run `npm run data:scoresheets:sabah-pru14` (or its `:check` variant) for the
Sabah Assembly-15 archive.
