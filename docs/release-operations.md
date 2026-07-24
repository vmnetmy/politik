# Release operations

## Environments

- **Local:** Vite development and preview servers.
- **Preview/staging:** a pull request is deployed after the main CI passes; the
  `Staging Release` workflow can also package and publish the `staging` branch
  or a manual release candidate to a Vercel preview URL.
- **Production:** only a validated `main` workflow run in the protected
  `production` GitHub environment receives the `--prod` deployment flag.

Set `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as GitHub Actions
secrets. Staging also accepts `STAGING_DATABASE_URL` and
`STAGING_EDITORIAL_API_TOKEN`; production requires
`PRODUCTION_DATABASE_URL` and `PRODUCTION_EDITORIAL_API_TOKEN`.
`vercel.json` supplies the dedicated Atlas document rewrite, application SPA
rewrites, immutable hashed-asset caching, revalidated data caching and security
headers.

Every staging candidate runs the governed Atlas data checks, the production
build, artifact size/security verification, desktop/mobile Atlas acceptance
tests and then uploads the exact `dist/` directory for 14 days. Direct visits to
`/peta`, `/prn/*`, `/pru/*` and `/settings/*` are covered by SPA rewrites.

## Telemetry

Production clients report CLS, FCP, INP, LCP, TTFB, attribution targets,
uncaught errors and named Atlas interactions to `/api/telemetry`. The collector
writes to `telemetry_events` and falls back to structured provider logs when the
database is unavailable. `/settings/data/operasi` shows seven-day aggregates
without storing query strings, fragments or client identifiers. It does not set
cookies and does not run when Do Not Track is enabled. Set
`VITE_TELEMETRY_ENABLED=false` to disable collection.

## GitHub protection

After adding a GitHub `origin`, run:

```bash
bash scripts/configure_github_ruleset.sh
```

The ruleset prevents deletion and force pushes, requires one approving CODEOWNER, dismisses stale approvals, resolves review threads and requires `validate` plus `browser-quality` checks.
