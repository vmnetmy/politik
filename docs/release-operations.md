# Release operations

## Environments

- **Local:** Vite development and preview servers.
- **Preview/staging:** every validated non-main branch may be deployed to a Vercel preview URL.
- **Production:** only a validated `main` workflow run receives the `--prod` deployment flag.

Set `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as GitHub Actions secrets. Until all three are present, the deployment workflow exits safely without publishing. `vercel.json` supplies SPA rewrites, immutable hashed-asset caching, revalidated data caching and security headers.

## Telemetry

Production clients report CLS, FCP, INP, LCP, TTFB and uncaught errors to `/api/telemetry`. The collector writes structured events to provider logs. It does not set cookies, retain IP addresses in the payload, send query strings or fragments, or run when Do Not Track is enabled. Set `VITE_TELEMETRY_ENABLED=false` to disable collection.

## GitHub protection

After adding a GitHub `origin`, run:

```bash
bash scripts/configure_github_ruleset.sh
```

The ruleset prevents deletion and force pushes, requires one approving CODEOWNER, dismisses stale approvals, resolves review threads and requires `validate` plus `browser-quality` checks.
