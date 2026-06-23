# Bliss VRS — Employee Directory & Org Dashboard

An internal web app for **Bliss VRS / Vivekananda Enterprises** to look up employee roles, job duties, and the reporting structure.

**Live site:** https://chiraggu.github.io/bliss-vrs-dashboard/

---

## Features

- **Directory** — Searchable card grid of all employees with color-coded role tags
- **Org Chart** — D3-powered hierarchy tree; click any node for a detail popup
- **Search** — Filter by name, role, or job duties
- **Print Report** — A4-optimized printable org summary

---

## Stack

- Pure HTML + CSS + vanilla JS — no framework, no build step
- D3.js v7 (CDN) for the org chart
- Google Sheets public CSV export as the live data source
- Hosted on GitHub Pages

---

## Data

All employee data lives in a Google Sheet shared as "Anyone with the link → Viewer". The app fetches it on every page load — no API key needed. To update data, edit the sheet directly; changes reflect immediately on the next page load.

---

## Deployment

Push to `master` — GitHub Pages serves from the repo root automatically.

```bash
git add <files>
git commit -m "description"
git push origin master
```
