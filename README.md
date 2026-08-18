# Kestura Hub

Self-hosted, auto-updating quick-access launcher for all Kestura apps, sites and dashboards.
Served via GitHub Pages at **https://hub.kestura.com**.

## How it stays current (fully automatic)
`scripts/generate.mjs` scans every non-archived repo under `LGLenz`, derives each
repo's live URL (CNAME file → homepage field → curated fallback), classifies it,
and regenerates `index.html` + `data/links.json`.

A GitHub Actions workflow (`.github/workflows/build-and-deploy.yml`) runs it:
- **daily** at 04:30 UTC,
- on every **push** to `main`,
- and on **manual dispatch**.

No browser, no manual editing, no external credits. New live sites appear on the hub within a day (or instantly via a manual run).

## Curation
Edit the `CURATION` and `PINNED_EXTRA` maps in `scripts/generate.mjs` to set
friendly labels, ordering, and groups. Everything else is auto-listed under "More".

A `CURATION` entry may also carry a `url`, used only when discovery finds nothing.

## Private sibling repos and `HUB_TOKEN`

Reading `CNAME` from another repo requires read access to it. The default
`GITHUB_TOKEN` can only read this repo, so every **private** sibling answers 403
and its live site would silently disappear from the hub — no error, just a
shorter list. That is what the curated `url` fallback protects against.

To restore real auto-discovery, set a `HUB_TOKEN` secret to a fine-grained PAT
with **Contents: Read** on the `LGLenz` repos. The workflow already prefers it
(`secrets.HUB_TOKEN || secrets.GITHUB_TOKEN`). The build log reports how many
entries came from fallbacks, so a stale token is visible rather than silent.

## Custom domain
`CNAME` = `hub.kestura.com`. Add a DNS CNAME record `hub → LGLenz.github.io` at Hetzner DNS (kestura.com zone).
