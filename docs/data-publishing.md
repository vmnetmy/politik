# Governed data publishing

## Decision

Election data remains versioned JSON until multi-user editing or scheduled publication justifies a CMS. GitHub authentication, draft pull requests, CODEOWNERS and required checks form the initial authenticated publishing system. This keeps every factual change reviewable and reversible without giving a CMS permission to rewrite the historical PRU-15 snapshot.

## Roles

- **Editor:** prepares an effective-dated change and supplies a source URL.
- **Editorial approver:** verifies the political fact, effective date and historical/current classification.
- **Engineering approver:** verifies schema, rendering, security and deployment impact.
- **Publisher:** merges an approved pull request after all required checks pass.

`@vmnetmy` temporarily holds all roles. When an organisation is available, replace the CODEOWNERS entries with separate `@org/editorial` and `@org/engineering` teams.

## Publication flow

1. Create a feature branch from `main`.
2. Enter changes in `/settings/data`, export JSON and replace only the corresponding file under `public/data`.
3. Use `candidate-changes.json` only for evidenced PRU-15 source corrections. Use `affiliations.json` for post-election party changes.
4. Run `npm run data:seating` only when the official seating PDF changes.
5. Run `npm run data:scoresheets` when an SPR 760 PDF or archived supplementary Parquet snapshot changes. SPR 760 remains authoritative where present; supplementary open data fills only seats without a PDF.
6. Run `npm run data:geography` when the archived SPR Open Data hierarchy or sourced DPT locality records change.
7. Run `npm run data:state-elections` after refreshing any archived official SPR state-result dataset.
8. Run `npm run data:manifest` after any published data change.
9. Open a draft pull request and complete the source/effective-date checklist.
10. Obtain editorial and engineering approval. Required CI and browser checks must pass.
11. Merge to `main`; the governed deployment workflow publishes the validated revision.

## Integrity and rollback

`public/data/manifest.json` records SHA-256, byte size and record count for every published data file. CI rejects stale manifests. Rollback is performed by reverting the data pull request, regenerating the manifest and publishing a new reviewed commit; deployed files are never edited in place.

Raw SPR 760 PDFs are retained under `sources/pru15/scoresheets/`; the supplementary ballot and statistics snapshots are retained under `sources/electiondata-my/pru15/`. Both source tiers have SHA-256 manifests, while the public bundle receives only normalized JSON. Scoresheet totals are authoritative for their 56 seats. The 166 remaining seats use the CC0 snapshots as an explicit supplementary tier, yielding complete 222-seat saluran coverage without allowing the supplementary source to overwrite an available SPR 760 record.

SPR Open Data snapshots used for the reusable geography hierarchy are retained under `sources/spr/geography/`. PDM identities come from the 2022 electoral roll snapshot and are validated against the current official Senarai BPR tuple set. Locality coverage is a separately dated DPT overlay: every record must cite an official `sprinfo.spr.gov.my` PDF, and missing locality coverage must remain missing rather than inferred.

Official state-election snapshots are retained under `sources/spr/state-elections/`. This includes SPR Open Data, archived MySPR Semak responses, the official Johor/Negeri Sembilan 2026 schedule statement and Federal Government Gazette P.U. (B) 246. The generated publication represents the latest completed assembly for all 13 states: Johor uses all 56 gazetted Form 16 statements from its final 11 July 2026 result, while Negeri Sembilan remains on 2023 until its scheduled 1 August 2026 election is completed. The gazette extractor reconciles every ballot accounting equation, majority and First Schedule winner before the common state-election extractor runs. The common extractor requires every one of the 600 reusable DUN identities exactly once and records—not hides—any conflicting aggregate field in an upstream source.

## Future CMS requirements

A future CMS must provide SSO, role separation, immutable audit history, draft/published states, two-person approval, effective dates, source URLs, schema validation, webhook signatures and export to the same versioned JSON contracts. It must never mutate the PRU-15 snapshot when recording a current affiliation.
