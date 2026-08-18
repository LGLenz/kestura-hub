# Kestura Hub

Self-hosted, auto-updating quick-access launcher for all Kestura apps, sites and dashboards.
Served via GitHub Pages at **https://hub.kestura.com**.

## How it stays current (fully automatic)
`scripts/generate.mjs` scans every non-archived repo under `LGLenz`, derives each
repo's live URL (CNAME file → homepage), classifies it, and regenerates
`index.html` + `data/links.json`.

A GitHub Actions workflow (`.github/workflows/build-and-deploy.yml`) runs it:
- **daily** at 04:30 UTC,
- on every **push** to `main`,
- and on **manual dispatch**.

No browser, no manual editing, no external credits. New live sites appear on the hub within a day (or instantly via a manual run).

## Curation
Edit the `CURATION` and `PINNED_EXTRA` maps in `scripts/generate.mjs` to set
friendly labels, ordering, and groups. Everything else is auto-listed under "More".

## Custom domain
`CNAME` = `hub.kestura.com`. Add a DNS CNAME record `hub → LGLenz.github.io` at Hetzner DNS (kestura.com zone).
