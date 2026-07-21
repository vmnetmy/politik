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
5. Run `npm run data:scoresheets` when any SPR 760 PDF changes. The extractor treats every available scoresheet as final and overwrites the corresponding aggregate result in `election.json`.
6. Run `npm run data:manifest` after any published data change.
7. Open a draft pull request and complete the source/effective-date checklist.
8. Obtain editorial and engineering approval. Required CI and browser checks must pass.
9. Merge to `main`; the governed deployment workflow publishes the validated revision.

## Integrity and rollback

`public/data/manifest.json` records SHA-256, byte size and record count for every published data file. CI rejects stale manifests. Rollback is performed by reverting the data pull request, regenerating the manifest and publishing a new reviewed commit; deployed files are never edited in place.

Raw SPR 760 PDFs are retained under `sources/pru15/scoresheets/` and tracked by a separate source manifest. The public bundle receives only normalized JSON. For covered seats, scoresheet totals are authoritative and replace the aggregate election record automatically. Partial coverage is explicit in `scoresheets/index.json`; a missing source never becomes an empty or inferred result.

## Future CMS requirements

A future CMS must provide SSO, role separation, immutable audit history, draft/published states, two-person approval, effective dates, source URLs, schema validation, webhook signatures and export to the same versioned JSON contracts. It must never mutate the PRU-15 snapshot when recording a current affiliation.
