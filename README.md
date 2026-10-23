# Kestura Hub

Self-hosted, auto-updating quick-access launcher for all Kestura apps, sites and dashboards.
Served via GitHub Pages at **https://hub.kestura.com**.

## How it stays current (fully automatic)
`scripts/generate.mjs` inspects explicitly curated non-archived repos under `LGLenz`, derives each
repo's live URL (canonical override → CNAME file → homepage field → curated fallback), classifies it,
and regenerates `index.html` + `data/links.json`.

A GitHub Actions workflow (`.github/workflows/build-and-deploy.yml`) runs it:
- **daily** at 04:30 UTC,
- on every **push** to `main`,
- and on **manual dispatch**.

Existing approved entries are refreshed automatically. New repositories do not become public hub cards merely because they gain a homepage URL.

## Curation
Edit the `CURATION` and `PINNED_EXTRA` maps in `scripts/generate.mjs` to set
friendly labels, ordering, and groups. Only explicitly curated entries are eligible.

A `CURATION` entry may also carry a `url`, used only when discovery finds nothing.
A `canonicalUrl` takes precedence over discovery, for deliberate consolidation destinations such as DigiAssist Resources.

For a local rebuild through authenticated native GitHub CLI access, use `GH_USE_CLI=1 node scripts/generate.mjs`. Actions continues to use its own token by default. Unresolved checkout and partner-profile names are excluded until their publication is separately reviewed.

## Private sibling repos and `HUB_TOKEN`

Reading `CNAME` from another repo requires read access to it. The default
`GITHUB_TOKEN` can only read this repo, so every **private** sibling answers 403
and its live site would silently disappear from the hub — no error, just a
shorter list. That is what the curated `url` fallback protects against.

To restore real auto-discovery, set a `HUB_TOKEN` secret to a fine-grained PAT
with **Contents: Read** on the `LGLenz` repos. The workflow already prefers it
(`secrets.HUB_TOKEN || secrets.GITHUB_TOKEN`). Direct curated-repository lookups replace `/user/repos`, which is unsuitable for installation tokens. Missing sibling access falls back to maintained, approved URLs. The build log reports how many
entries came from fallbacks, so a stale token is visible rather than silent.

## Custom domain
`CNAME` = `hub.kestura.com`. Add a DNS CNAME record `hub → LGLenz.github.io` at Hetzner DNS (kestura.com zone).
