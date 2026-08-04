# RANDOM ACCESS ARCHIVE

A rabbit-hole engine for art, design, architecture, fashion, and culture history.
Hit **PULL** → get a random record → open its **constellation** → click any bright-bordered
node to fall deeper. Breadcrumb trail tracks your descent.

Utilitarian × cybercore UI. Single static page, no build step, no framework.

## Structure

- `index.html` — the whole app (markup, styles, logic)
- `records.json` — all archive data: `{ types, records }`
  - **types**: the five connection types (INFLUENCE, MATERIAL, TECHNIQUE, ECHO, HISTORY) with edge colors
  - **records**: keyed by id. Each record: `kind`, `title`, `byline`, `cat`, `spec`, `fact`, `more[]` (extra facts), `connections[]`, optional `img` + `pullable`
  - A connection with `ref` points at another record (clickable node); one with `title` only is a stub (dead end, dimmed)

## Adding a record

1. Add an entry to `records` in `records.json`
2. Point at it from existing records via `"ref": "your-id"` connections
3. Images: Wikimedia Commons via `https://commons.wikimedia.org/wiki/Special:FilePath/<Filename>?width=900` — public domain or CC only

## Run locally

`fetch()` needs HTTP — opening `index.html` directly from disk won't load data.

```sh
npx serve .
```

## Content rules

- Facts must be verifiable; hedge legends as legends ("reportedly", "one theory")
- Connections are opinionated and specific — "influenced by X" is banned; "stole the gold from Ravenna's mosaics" is the bar
- Images: public domain or Creative Commons (Wikimedia Commons), credited in the footer
