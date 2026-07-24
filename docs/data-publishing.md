# Governed data publishing

## Decision

Versioned JSON remains the public, cacheable election contract. PostgreSQL is
the governed editorial and operational store: it records immutable election
identities, effective-dated memberships, source documents, draft/reviewed/
published revisions, reconciliation runs, telemetry and Atlas annotations.
Publishing creates a read model; it never overwrites a historical ballot
identity. Git remains the reproducible source and rollback layer for generated
public snapshots.

## Roles

- **Editor:** prepares an effective-dated change and supplies a source URL.
- **Editorial approver:** verifies the political fact, effective date and historical/current classification.
- **Engineering approver:** verifies schema, rendering, security and deployment impact.
- **Publisher:** publishes a reviewed revision and merges the generated snapshot
  after all required checks pass.

`@vmnetmy` temporarily holds all roles. When an organisation is available, replace the CODEOWNERS entries with separate `@org/editorial` and `@org/engineering` teams.

## Publication flow

1. Create a feature branch from `main`.
2. Enter a sourced draft in `/settings/data/operasi?election={number}`. A second
   named actor must review it before publication; the API rejects self-review.
3. Use `candidate-changes.json` only for evidenced source corrections in its own edition. Use `affiliations.json` for post-election party changes in the corresponding parliamentary term.
4. Run `npm run data:seating` only when the official seating PDF changes.
5. Run `npm run data:scoresheets` when an SPR 760 PDF or archived supplementary Parquet snapshot changes. SPR 760 remains authoritative where present; supplementary open data fills only seats without a PDF.
6. Run `npm run data:spr-pru15` to refresh the official SPR catalogue snapshot and cross-check all 222 PRU-15 contests, 945 candidates and ballot-accounting totals.
7. Run `npm run data:voter-roll` when the official annual Daftar Pemilih Induk series changes; this republishes the locked 2018/PRU-14 and 2022/PRU-15 geography snapshots together.
8. Run `npm run data:geography` when the archived SPR Open Data hierarchy or sourced DPT locality records change.
9. Run `npm run data:boundaries` and `npm run data:atlas` when the official SPR boundary dataset changes; the extractors republish the state map, national Atlas index, 16 lazy state chunks and edition-aware boundary registry from the same locked source.
10. Run `npm run data:state-elections` after refreshing any archived official SPR state-result dataset.
11. Run `npm run data:federal-elections` after refreshing an archived federal result, candidate, ballot or statistics source.
12. Run `npm run data:manifest` after any published data change.
13. Run `npm run data:reconcile`; zero errors and zero warnings are required for
    a release candidate.
14. Open a draft pull request and complete the source/effective-date checklist.
15. Obtain editorial and engineering approval. Required CI and browser checks
    must pass.
16. Publish the reviewed read model, merge to `main`, and let the protected
    production environment deploy the exact validated artifact.

## Integrity and rollback

Each `public/data/elections/{electionId}/manifest.json` records SHA-256, byte size and record count for that edition's published files; `public/data/reference/manifest.json` protects the shared party, alliance and person registries, while `public/data/boundaries/manifest.json` protects browser-ready map geometry. CI rejects stale manifests. Operational rollback atomically points the published read model to a prior published or superseded revision and records the actor in `editorial_revision_events`; a public JSON rollback is completed by reverting the data pull request, regenerating the manifest and publishing a new reviewed commit.

Raw SPR 760 PDFs are retained under `sources/pru15/scoresheets/`; the supplementary ballot and statistics snapshots are retained under `sources/electiondata-my/pru15/`. Both source tiers have SHA-256 manifests, while the public bundle receives only normalized JSON. Scoresheet totals are authoritative for their 56 seats. The 166 remaining seats use the CC0 snapshots as an explicit supplementary tier, yielding complete 222-seat saluran coverage without allowing the supplementary source to overwrite an available SPR 760 record.

SPR Open Data snapshots used for the reusable geography hierarchy are retained under `sources/spr/geography/`. PDM identities come from the 2022 electoral roll snapshot and are validated against the current official Senarai BPR tuple set. Locality coverage is a separately dated DPT overlay: every record must cite an official `sprinfo.spr.gov.my` PDF, and missing locality coverage must remain missing rather than inferred.

Official state-election snapshots are retained under `sources/spr/state-elections/`. This includes SPR Open Data, the gazetted PRU-14 electoral roll, archived MySPR Semak responses, the official Johor/Negeri Sembilan 2026 schedule statement and Federal Government Gazette P.U. (B) 246. The generated publication represents the latest completed assembly for all 13 states, the complete Dewan ke-14 archive for the 11 states whose fourteenth assemblies were elected on 9 May 2018, and configured intermediate assemblies such as all 56 Johor PRN-15 contests elected on 12 March 2022. PRN-14 uses the exact electorate for each DUN from the roll gazetted on 10 April 2018; other archived events retain the electorate and ballot accounting published with their own result dataset. N.27 Rantau is retained as an uncontested return rather than being assigned invented vote totals. Johor PRN-16 uses all 56 gazetted Form 16 statements from its final 11 July 2026 result, while Negeri Sembilan remains on 2023 until its scheduled 1 August 2026 election is completed. The gazette extractor reconciles every ballot accounting equation, majority and First Schedule winner before the common state-election extractor runs. The common extractor enforces complete DUN-registry coverage separately for every configured event and records—not hides—any conflicting aggregate field in an upstream source.

Official boundary KMZ archives are retained under `sources/spr/boundaries/` with their download URL, retrieval date and SHA-256. `scripts/extract_election_boundaries.py` reads the published KML geometry rather than tracing an image, projects the 36 Negeri Sembilan DUN shapes into one responsive SVG coordinate space and rejects missing, duplicate or unjoined DUN identities. Empty or unverifiable geometry is never inferred.

`scripts/extract_atlas_boundaries.py` reads the same locked KMZ to publish all 222 Parliament and 600 DUN features as browser-ready GeoJSON. The national index contains simplified Parliament outlines only; detailed Parliament and DUN geometry is split by state and fetched after drill-down. `public/data/boundaries/registry.json` binds every PRU/PRN event and state to its regional delimitation regime: Sarawak P.U.(A) 299/2015, Negeri-Negeri Tanah Melayu 2018, or Sabah P.U.(A) 225/2019. Every currently published event is certified against an explicit exact state entry; adding an event without one fails extraction. Every feature must join the reusable constituency registry by state and code; the integrity manifest covers the index, registry and every state chunk, while CI rejects a stale source hash, missing geometry or incorrect 222/600 count.

Federal result and candidate snapshots are retained under `sources/spr/`, while normalized supporting statistics and ballot identity snapshots are retained under `sources/meco/`. The PRU-14 extractor requires complete one-to-one coverage for 222 seats and 687 candidates, reconciles 14,940,624 registered voters, and always gives the archived SPR result precedence for vote totals and winners.

The PRU-15 audit snapshot is retained at `sources/spr/open-data/pru-15-2022.json`. It combines the 221 election-night Parliament contests in `keputusan-pru` with the delayed P.017 Padang Serai contest in `keputusan-prk`, then checks registered voters, every candidate vote, winner, majority, valid/rejected/unreturned ballots and turnout against the published bundle. `turnout` means ballot papers issued; `validVotes` is the sum of candidate votes. The separately dated 2022 electoral-roll series is preserved for demographic analysis and must not replace the election-day denominator. P.028 is the sole declared source conflict: the publication retains the more granular official SPR 760 scoresheet values and records the differing catalogue aggregate in `spr-audit.json`.

The cross-election voter-roll artifacts are generated directly from SPR's annual `daftar-pemilih-induk-2012-2025.json` series. The pipeline selects only 2018 for PRU-14 and 2022 for PRU-15, validates gender, age and voter-category balances at PDM level, and aggregates the same stable IDs through DUN, Parliament, state and national levels. Annual snapshot totals and election-day registered-voter totals remain separate metadata fields.

## Database operations

Apply the idempotent migration and seed election/boundary registries:

```bash
npm run db:migrate
npm run db:seed
npm run data:reconcile:publish
```

`DATABASE_URL` must be a pooled PostgreSQL connection in serverless
environments. `EDITORIAL_API_TOKEN` is server-only and must never use a
`VITE_` prefix. The production GitHub environment should require a human
approval and keep these values in environment secrets.
