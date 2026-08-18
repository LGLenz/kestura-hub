#!/usr/bin/env node
/**
 * Kestura Hub generator.
 *
 * Scans all non-archived repos under the LGLenz GitHub account, derives each
 * repo's live URL (CNAME file first, then the repo homepage field), classifies
 * it, and writes:
 *   - data/links.json  (machine-readable inventory)
 *   - index.html       (the launcher page)
 *
 * Fully automatic: run by GitHub Actions on a daily schedule and on manual
 * dispatch. No browser, no external service, no manual editing required.
 *
 * Auth: uses the GITHUB_TOKEN provided by Actions via the `gh`-less REST API.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const OWNER = "LGLenz";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const API = "https://api.github.com";

// Hosts that are docs/framework links, not the user's own live properties.
const EXCLUDE_HOST_SUBSTR = [
  "platform.openai.com",
];

// Repos to skip entirely (the hub itself, redirect-only shells, etc.).
const EXCLUDE_REPOS = new Set([
  "LGLenz/kestura-hub",
  "LGLenz/LGLenz.github.io",
]);
const EXCLUDE_REPO_NAME_RE = /redirect|\.github$|-template$|sandbox|scratch/i;

// GitHub is a useful pinned link but auto-detected repo homepages pointing at
// github.com are noise; only the curated PINNED_EXTRA GitHub link is kept.
const EXCLUDE_AUTO_GITHUB = true;

// Manual curation: pin order, friendly labels, and grouping for known repos.
// Anything not listed still appears (auto-labeled) under "More".
const CURATION = {
  "LGLenz/kestura":            { label: "Kestura — Main Site",        group: "Core",     order: 1 },
  "LGLenz/kestura-ops":        { label: "Kestura Ops Dashboard",       group: "Core",     order: 2 },
  "LGLenz/digiassist-website": { label: "DigiAssist",                  group: "Core",     order: 3 },
  "LGLenz/techvisaassist-website": { label: "TechVisaAssist",         group: "Core",     order: 4 },
  "LGLenz/cybersecurity-phd-research-lab": { label: "PhD Research Lab", group: "Research", order: 5 },
  "LGLenz/jacob-njiru-profile":  { label: "Jacob Njiru — Profile",    group: "Partners", order: 7 },
  "LGLenz/andreas-lenz-profile": { label: "Andreas Lenz — Profile",   group: "Partners", order: 8 },
  "LGLenz/kuna-beauty-salon-website": { label: "Kushy's Beauty Haven", group: "Partners", order: 9 },
  "LGLenz/mafrick-munene-advocates-website": { label: "Mafrick & Munene Advocates", group: "Partners", order: 10 },
};

// Manually pinned entries not derived from a repo.
//
// Deliberately NOT listed: Tideline (LGLenz/tideline). Its only deployment is
// tideline.elbconsultingtech.com, which is internal-only by design, and this
// hub is a public page — publishing the hostname here would advertise it. It
// previously pointed at app.kestura.io, which stopped resolving when kestura.io
// went into redemption. If Tideline ever gets a public entry point, add it back.
const PINNED_EXTRA = [
  { label: "GitHub — LGLenz", url: "https://github.com/LGLenz", group: "Core", order: 99, repo: null, description: "All repositories" },
];

async function gh(path, { soft = false } = {}) {
  const res = await fetch(API + path, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "kestura-hub-generator",
      ...(TOKEN ? { "Authorization": `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    // 404 (no such file) and, in soft mode, 403 (token lacks access to this
    // repo) are treated as "nothing here" rather than fatal — one repo the
    // token can't read must not break the whole hub build.
    if (res.status === 404) return null;
    if (soft && (res.status === 403 || res.status === 401)) {
      console.warn(`  (skip) ${res.status} for ${path}`);
      return null;
    }
    throw new Error(`GitHub ${res.status} for ${path}: ${await res.text()}`);
  }
  return res.json();
}

async function listRepos() {
  const out = [];
  // With a token, use the authenticated endpoint so PRIVATE repos are included.
  const base = TOKEN
    ? `/user/repos?per_page=100&affiliation=owner&sort=pushed`
    : `/users/${OWNER}/repos?per_page=100&type=owner&sort=pushed`;
  for (let page = 1; page <= 15; page++) {
    const batch = await gh(`${base}&page=${page}`);
    if (!batch || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.filter((r) => !r.archived && r.owner && r.owner.login === OWNER);
}

async function getCname(fullName) {
  const c = await gh(`/repos/${fullName}/contents/CNAME`, { soft: true });
  if (!c || !c.content) return null;
  const decoded = Buffer.from(c.content, "base64").toString("utf8").trim();
  return decoded.split(/\s+/)[0] || null;
}

function isExcluded(url) {
  if (!url) return true;
  if (EXCLUDE_AUTO_GITHUB && /^https?:\/\/github\.com/i.test(url)) return true;
  return EXCLUDE_HOST_SUBSTR.some((h) => url.includes(h));
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function build() {
  const repos = await listRepos();
  const entries = [];

  for (const r of repos) {
    if (EXCLUDE_REPOS.has(r.full_name) || EXCLUDE_REPO_NAME_RE.test(r.name)) continue;
    const cname = await getCname(r.full_name);
    let url = cname ? `https://${cname}` : (r.homepage || "");
    if (isExcluded(url)) continue;
    const cur = CURATION[r.full_name] || {};
    entries.push({
      repo: r.full_name,
      label: cur.label || r.name.replace(/[-_]/g, " ").replace(/\bwebsite\b/i, "").trim(),
      url,
      description: r.description || "",
      group: cur.group || "More",
      order: cur.order ?? 50,
      pushed_at: r.pushed_at,
    });
  }

  // Merge pinned extras (dedupe by url).
  for (const p of PINNED_EXTRA) {
    if (!entries.some((e) => e.url === p.url)) entries.push({ ...p, pushed_at: null });
  }

  entries.sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));

  const groupsOrder = ["Core", "Research", "Partners", "More"];
  const grouped = {};
  for (const e of entries) (grouped[e.group] ||= []).push(e);

  const generatedAt = new Date().toISOString();

  // ---- write data file ----
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(join(ROOT, "data", "links.json"), JSON.stringify({ generatedAt, entries }, null, 2));

  // ---- render HTML ----
  const cards = groupsOrder
    .filter((g) => grouped[g]?.length)
    .map((g) => {
      const items = grouped[g]
        .map(
          (e) => `
        <a class="card" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">
          <span class="card-label">${esc(e.label)}</span>
          ${e.description ? `<span class="card-desc">${esc(e.description)}</span>` : ""}
          <span class="card-host">${esc(e.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</span>
        </a>`
        )
        .join("");
      return `
      <section class="group">
        <h2 class="group-title">${esc(g)}</h2>
        <div class="grid">${items}</div>
      </section>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kestura — Policy-as-Code Hub</title>
<meta name="description" content="Quick-access launcher for Kestura apps, sites and dashboards." />
<style>
  :root {
    --bg: #0b1220; --panel: #121b2e; --ink: #e7edf7; --muted: #9fb0c9;
    --brand: #2dd4bf; --brand-2: #38bdf8; --line: #1e2b45; --card: #16223b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink); background: radial-gradient(1200px 600px at 70% -10%, #16233f 0%, var(--bg) 55%);
    min-height: 100vh;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 56px 24px 80px; }
  header.hero { margin-bottom: 40px; }
  .logo { font-size: 40px; font-weight: 800; letter-spacing: -0.02em;
    background: linear-gradient(90deg, var(--brand), var(--brand-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .tagline { color: var(--muted); margin-top: 8px; max-width: 640px; }
  .group { margin-top: 40px; }
  .group-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin: 0 0 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .card { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border-radius: 14px;
    background: var(--card); border: 1px solid var(--line); text-decoration: none; color: var(--ink);
    transition: transform .12s ease, border-color .12s ease, box-shadow .12s ease; }
  .card:hover { transform: translateY(-2px); border-color: var(--brand); box-shadow: 0 8px 30px rgba(45,212,191,.10); }
  .card-label { font-weight: 700; }
  .card-desc { font-size: 13px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .card-host { font-size: 12px; color: var(--brand-2); margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  footer a { color: var(--muted); }
  .stamp { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="logo">Kestura</div>
      <p class="tagline">Policy-as-Code for EU regulation — GDPR · NIS2 · DORA · AI Act — built for the Mittelstand. One place to launch every app, site and dashboard.</p>
    </header>
    ${cards}
    <footer>
      <a href="https://eliaslenz-mbaberatung.de/impressum.html" target="_blank" rel="noopener noreferrer">Impressum</a>
      <span class="stamp">Auto-generated ${esc(generatedAt)}</span>
    </footer>
  </div>
</body>
</html>
`;

  writeFileSync(join(ROOT, "index.html"), html);
  console.log(`Generated ${entries.length} entries at ${generatedAt}`);
}

build().catch((e) => { console.error(e); process.exit(1); });
