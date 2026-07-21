#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required." >&2
  exit 1
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No origin remote exists. Add the GitHub repository as origin first." >&2
  exit 1
fi

repository=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
ruleset_name="main-production-protection"
existing_id=$(gh api "repos/${repository}/rulesets" --jq ".[] | select(.name == \"${ruleset_name}\") | .id" | head -n 1)
payload=$(mktemp)
trap 'rm -f "$payload"' EXIT

cat >"$payload" <<'JSON'
{
  "name": "main-production-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": true,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": true,
        "required_status_checks": [
          { "context": "validate" },
          { "context": "browser-quality" }
        ]
      }
    }
  ]
}
JSON

if [[ -n "$existing_id" ]]; then
  gh api --method PUT "repos/${repository}/rulesets/${existing_id}" --input "$payload" >/dev/null
  echo "Updated ${ruleset_name} on ${repository}."
else
  gh api --method POST "repos/${repository}/rulesets" --input "$payload" >/dev/null
  echo "Created ${ruleset_name} on ${repository}."
fi
