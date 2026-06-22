# Bliss VRS — Employee Directory & Org Dashboard

## What this project is

A hosted internal web app for **Bliss VRS / Vivekananda Enterprises**. Staff use it to look up employee roles, job duties, and the reporting structure. It is **view-only for all staff** — no login, no backend. The owner (Chirag) makes all data changes directly in Google Sheets, and the app reflects them automatically on every page load.

---

## Tech stack

- **Pure HTML + CSS + vanilla JS** — no framework, no build step
- **D3.js v7** (loaded via CDN) — used only for the Org Chart tab
- **Google Sheets public CSV export** — acts as the live database; no API key needed
- **Montserrat** from Google Fonts — the project's sole typeface
- **GitHub Pages** — static hosting, zero cost

---

## File structure

```
bliss-vrs-dashboard/
├── index.html   — Single HTML page; all three tabs live here
├── style.css    — All styles; Montserrat applied globally via --font variable
├── app.js       — All JavaScript; data fetching, rendering, org chart, print
├── logo.png     — Company logo used in the header (40px height)
└── CLAUDE.md    — This file
```

### `index.html`
Three tab panels inside one `<main>`: Directory, Org Chart, Search. Also contains the Employee Detail modal. The header uses `logo.png` with an `onerror` fallback to the text "BLISS VRS / Vivekananda Enterprises". The Print Report button sits in the Org Chart panel header and calls `printReport()`.

### `style.css`
- CSS custom properties in `:root` define all brand colors and the font variable (`--font`)
- The `.role-tag` class is the **single shared pill style** — used by Directory cards, Search results, Modal, Org Chart popup panel, and Print Report. Colors are applied via inline `style="background:…;color:…"` from `ROLE_COLORS` in `app.js`
- The `#org-tree` div has `position: relative` — required for the absolute-positioned Org Chart popup
- `.org-svg-wrap` has `overflow: hidden` — the SVG auto-fits via `viewBox` + `width="100%"`; no scrollbars on the chart

### `app.js`
Key sections in order:

| Section | What it does |
|---|---|
| `ROLE_COLORS` | Single source of truth for all role → color mappings. Every surface that shows role pills reads from here. Never define colors elsewhere. |
| `getRoleColor()` | Looks up a role string in ROLE_COLORS (lowercase, trimmed). Returns `{bg, fg}`. |
| `renderRoleTags()` | Returns HTML `<span class="role-tag" style="…">` tags. Used by Directory, Search, Modal, Org popup. |
| `parseCSVRecords()` | Character-by-character CSV parser that handles embedded newlines inside quoted fields (the Job Duties column has multi-line content). |
| `parseCSV()` | Finds the real header row (row 1, not row 0 which is a title row), maps columns by keyword, returns employee array. |
| `renderDirectory()` | Renders the Directory tab cards. **Do not touch.** |
| `renderOrgChart()` | Builds D3 tree, computes per-node tag layout, renders SVG pills with identical colors from ROLE_COLORS, handles click popup. |
| `OC` constants | All org chart geometry (node width, tag height, font sizes, gaps). Change here to adjust the chart layout globally. |
| `computeTagRows()` | Wraps role tags into rows that fit within the node width. Uses character-width estimation. |
| `nodeHeight()` | Returns each node's height based on how many tag rows it needs. |
| `printReport()` | Groups employees by tier, generates a self-contained HTML document in a new window with A4-optimized CSS, same ROLE_COLORS for pill colors, then triggers `window.print()`. |
| `doSearch()` | Filters by name + roles + duties. Renders result cards with color-coded role tags. |
| `openModal()` | Opens the Employee Detail modal. Shows role tags, duties, reports-to, and reporting chain. |

---

## Google Sheet connection

**Sheet URL:** `https://docs.google.com/spreadsheets/d/1BlJeuTjcWaORjc323ggMacMC_zRfv24xJ8FcgnyQilw`

**How it works:** The app fetches data from the sheet's public GViz CSV export endpoint on every page load — no API key required:
```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv
```
The sheet **must be shared as "Anyone with the link → Viewer"** for this to work.

**Sheet structure (columns):**
| Column | Header | Notes |
|---|---|---|
| A | *(empty)* | Always blank; ignored by parser |
| B | Employee Name | Primary key |
| C | Major Roles | Comma-separated; drives tag pills |
| D | Job Duties | Multi-line (bullet points with `•`); the parser handles embedded newlines |
| E | Reports To | Another employee's name; drives org chart hierarchy |
| F | Available Tags | Ignored by the app |
| G | Tag Selection | Ignored by the app |

**Important parsing quirks:**
- Row 0 of the CSV is a title row (`"Employee Roles & Duties"`). Row 1 is the real header. The parser auto-detects the header by scanning for whichever row contains `"employee name"`.
- The parser is character-by-character (not line-split) because Job Duties contains `\n` inside quoted CSV fields.
- Empty rows (no Employee Name) are silently skipped.

**Note**
EMP1 and EMP2 are placeholder names for staff not yet formally named in the system. Update their names directly in the Sheet when known.

---

## GitHub Pages deployment

**Live URL:** `https://chiraggu.github.io/bliss-vrs-dashboard/`

**Repo:** `https://github.com/chiragGu/bliss-vrs-dashboard`

**To deploy changes:** commit the modified files and push to `master`. GitHub Pages serves from the `master` branch root. No build step needed — what you see in the folder is what gets served.

```bash
git add <changed files>
git commit -m "description of change"
git push origin master
```

---

## Design decisions

### Typography — Montserrat
Montserrat is applied globally via `--font: 'Montserrat', sans-serif` on `body`. Weight rules applied consistently across all views and the print report:
- **700 Bold** — headings (`h2`), employee names, tier labels in print
- **600 SemiBold** — role tag pills, nav buttons, section titles
- **400 Regular** — body text, job duties, reports-to lines, footer

### Brand colors — Black, Red, White
```
--black:  #111111   (header bg when text fallback, org root nodes, footer)
--red:    #CC0000   (header border, active tab, card top border, Tier 2 print border)
--white:  #FFFFFF   (page background, card/modal surfaces, leaf org nodes)
--gray-1: #F5F5F5   (page background)
```

### Org chart node colors by depth
- **Depth 0 (Vivek):** Black fill, gold name text (`#F9A825`)
- **Depth 1 (direct reports):** Red fill (`#CC0000`), white name text
- **Depth 2+ (all others):** White fill, dark border, black name text

### Tag color system — `ROLE_COLORS` in `app.js`
Colors are grouped by functional family. **Do not redefine these anywhere else** — every view reads from `ROLE_COLORS` via `getRoleColor()`:

| Role | Background | Text |
|---|---|---|
| Dispatch Head | `#1565C0` dark blue | white |
| Dispatch | `#90CAF9` light blue | `#0D47A1` |
| Billing Head | `#BF360C` dark amber | white |
| Billing | `#FFE0B2` light amber | `#BF360C` |
| Inventory Head | `#1B5E20` dark green | white |
| Inventory | `#C8E6C9` light green | `#1B5E20` |
| Purchase | `#388E3C` mid green | white |
| Customer Service | `#4A148C` dark purple | white |
| Office Manager | `#CE93D8` mid purple | `#4A148C` |
| MIS | `#37474F` dark slate | white |
| Packing | `#78909C` mid slate | white |
| Delivery | `#CFD8DC` light slate | `#37474F` |
| Founder | `#F9A825` gold | `#212121` |
| Sales & Marketing | `#FDD835` gold | `#212121` |
| Quotation Handler | `#00695C` teal | white |

Note: `"Office Manger"` (typo in the sheet) is also mapped to the same color as "Office Manager".

---

## Rules — read before making changes

### Do not touch the Directory page layout or functionality
The Directory tab (card grid, tag rendering, reports-to line, click-to-modal) is finalized. Do not alter `renderDirectory()`, the `.emp-card` CSS, `.emp-card-tags`, `.emp-card-name`, or `.emp-card-reports`.

### Tag colors must be identical across all views
Role tag pills appear in four places: Directory cards, Org Chart SVG nodes, Org Chart popup, Search results, Modal, and Print Report. All of them use `getRoleColor()` which reads from the single `ROLE_COLORS` object. If you add or rename a role, update `ROLE_COLORS` only — never hardcode colors elsewhere.

### The CSV parser is fragile to structural changes in the sheet
If the sheet gains new rows above the headers, the parser will still work (it scans for the row containing `"employee name"`). If column order changes, the parser still works (it finds columns by keyword). But if the header text for Employee Name, Major Roles, Job Duties, or Reports To changes significantly, update the `col()` keyword strings in `parseCSV()`.

### The org chart SVG auto-fits via viewBox — do not add overflow-x to `.org-svg-wrap`
The SVG uses `width="100%"` and `viewBox` to scale down and fit the container. Adding `overflow-x: auto` would break this and reintroduce horizontal scrollbars. If the tree looks too small, adjust `OC.NW`, `OC.HGAP`, or `OC.VGAP` in `app.js`.

### Print Report opens a new window — it does not use the main app's CSS
The print window is fully self-contained HTML with its own inline `<style>`. If you update ROLE_COLORS in app.js, the print function uses `getRoleColor()` at call time so it automatically stays in sync. If you update the Montserrat weight rules for the main app, mirror the same rules in the `<style>` block inside `printReport()`.

### logo.png lives in the project root
The `<img src="logo.png">` has an `onerror` fallback. If the file is missing, the header gracefully shows the text "BLISS VRS / Vivekananda Enterprises". The logo is rendered at `height: 40px; width: auto`.
