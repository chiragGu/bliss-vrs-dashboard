// ── Config ───────────────────────────────────────────────────────────────────
const SHEET_ID  = '1BlJeuTjcWaORjc323ggMacMC_zRfv24xJ8FcgnyQilw';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

// ── Role → Color Map ─────────────────────────────────────────────────────────
// Single source of truth — reused by Directory cards, Org Chart SVG nodes,
// Org Chart popup, Search results, Modals, and Print Report.
const ROLE_COLORS = {
  'dispatch head':     { bg: '#1565C0', fg: '#FFFFFF' },
  'dispatch':          { bg: '#90CAF9', fg: '#0D47A1' },
  'billing head':      { bg: '#BF360C', fg: '#FFFFFF' },
  'billing':           { bg: '#FFE0B2', fg: '#BF360C' },
  'inventory head':    { bg: '#1B5E20', fg: '#FFFFFF' },
  'inventory':         { bg: '#C8E6C9', fg: '#1B5E20' },
  'purchase':          { bg: '#388E3C', fg: '#FFFFFF' },
  'customer service':  { bg: '#4A148C', fg: '#FFFFFF' },
  'office manager':    { bg: '#CE93D8', fg: '#4A148C' },
  'office manger':     { bg: '#CE93D8', fg: '#4A148C' },
  'mis':               { bg: '#37474F', fg: '#FFFFFF' },
  'packing':           { bg: '#78909C', fg: '#FFFFFF' },
  'delivery':          { bg: '#CFD8DC', fg: '#37474F' },
  'founder':           { bg: '#F9A825', fg: '#212121' },
  'sales & marketing': { bg: '#FDD835', fg: '#212121' },
  'quotation handler': { bg: '#00695C', fg: '#FFFFFF' },
};

function getRoleColor(role) {
  return ROLE_COLORS[role.trim().toLowerCase()] || { bg: '#E8EAF6', fg: '#424242' };
}

// Renders role tags as HTML spans — shared by Directory, Search, Modal, Org popup
function renderRoleTags(rolesStr) {
  if (!rolesStr) return '';
  return rolesStr.split(',').map(r => r.trim()).filter(Boolean).map(r => {
    const c = getRoleColor(r);
    return `<span class="role-tag" style="background:${c.bg};color:${c.fg}">${esc(r)}</span>`;
  }).join('');
}

// ── State ─────────────────────────────────────────────────────────────────────
let employees = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl     = document.getElementById('loading');
const errorEl       = document.getElementById('error');
const errorMsg      = document.getElementById('error-msg');
const tabPanels     = document.querySelectorAll('.tab-panel');
const tabBtns       = document.querySelectorAll('.tab-btn');
const cardsGrid     = document.getElementById('cards-grid');
const orgTree       = document.getElementById('org-tree');
const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const modalOverlay  = document.getElementById('modal-overlay');
const modalContent  = document.getElementById('modal-content');

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById('yr').textContent = new Date().getFullYear();
document.getElementById('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
searchInput.addEventListener('input', debounce(doSearch, 220));
loadData();

// ── Data Loading ──────────────────────────────────────────────────────────────
async function loadData() {
  showLoading(true);
  try {
    const res = await fetch(SHEET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    employees = parseCSV(await res.text());
    if (!employees.length) throw new Error('No employee data found in the sheet.');
    showLoading(false);
    renderAll();
  } catch (err) {
    showLoading(false);
    showError(err.message);
  }
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCSVRecords(csv) {
  const records = [];
  let row = [], cur = '', inQuote = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuote) {
      if (ch === '"' && csv[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"')  { inQuote = false; }
      else                  { cur += ch; }
    } else {
      if      (ch === '"')  { inQuote = true; }
      else if (ch === ',')  { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); cur = ''; records.push(row); row = []; }
      else if (ch === '\r') { /* skip */ }
      else                  { cur += ch; }
    }
  }
  if (cur || row.length) { row.push(cur); records.push(row); }
  return records;
}

function parseCSV(csv) {
  const records = parseCSVRecords(csv.trim());
  if (records.length < 2) return [];
  let headerIdx = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i].some(c => c.trim().toLowerCase() === 'employee name')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];
  const hdrs = records[headerIdx].map(h => h.trim().toLowerCase());
  const col  = kw => hdrs.findIndex(h => h.includes(kw));
  const colName = col('employee name'), colRoles = col('major role');
  const colDuties = col('job dut'), colReports = col('reports to');
  if (colName === -1) return [];
  return records.slice(headerIdx + 1)
    .filter(r => (r[colName] || '').trim())
    .map(r => ({
      name:      (r[colName]    || '').trim(),
      roles:     colRoles   >= 0 ? (r[colRoles]   || '').trim() : '',
      duties:    colDuties  >= 0 ? (r[colDuties]  || '').trim() : '',
      reportsTo: colReports >= 0 ? (r[colReports] || '').trim() : '',
    }));
}

// ── Render All ────────────────────────────────────────────────────────────────
function renderAll() {
  renderDirectory();
  renderOrgChart();
  renderSearchPlaceholder();
}

// ── Directory (unchanged) ─────────────────────────────────────────────────────
function renderDirectory() {
  cardsGrid.innerHTML = '';
  employees.forEach(emp => {
    const card = document.createElement('div');
    card.className = 'emp-card';
    const tagsHtml = renderRoleTags(emp.roles);
    card.innerHTML = `
      <div class="emp-card-name">${esc(emp.name)}</div>
      ${tagsHtml ? `<div class="emp-card-tags">${tagsHtml}</div>` : ''}
      ${emp.reportsTo ? `<div class="emp-card-reports">Reports to: <strong>${esc(emp.reportsTo)}</strong></div>` : ''}
    `;
    card.addEventListener('click', () => openModal(emp));
    cardsGrid.appendChild(card);
  });
}

// ── Org Chart — D3 (auto-fit, SVG role-tag pills) ────────────────────────────

// Org chart constants (SVG coordinate space, before viewBox scaling)
const OC = {
  NW:        168,   // node width
  NAME_H:    26,    // height reserved for the name text row
  TAG_H:     15,    // pill height
  TAG_HPAD:  8,     // horizontal padding inside each pill (each side)
  TAG_VPAD:  4,     // gap between tag rows
  NODE_PAD:  8,     // left/right padding inside node
  NODE_BOT:  9,     // bottom padding inside node
  HGAP:      24,    // horizontal gap between sibling nodes
  VGAP:      72,    // vertical gap between levels
  FONT_TAG:  8.5,   // font-size for tag text (px)
  CHAR_W:    5.0,   // estimated character width at FONT_TAG size
  FONT_NAME: 12,    // font-size for name
};

// Estimate each tag's pill width in SVG px
function tagWidth(tag) {
  return Math.ceil(tag.length * OC.CHAR_W + OC.TAG_HPAD * 2);
}

// Layout tags into rows that fit within (OC.NW - OC.NODE_PAD*2)
function computeTagRows(roles) {
  const tags = (roles || '').split(',').map(r => r.trim()).filter(Boolean);
  const maxW = OC.NW - OC.NODE_PAD * 2;
  const rows = [];
  let curRow = [], curW = 0;
  for (const tag of tags) {
    const tw = tagWidth(tag);
    if (curRow.length > 0 && curW + 4 + tw > maxW) {
      rows.push(curRow);
      curRow = [{ tag, w: tw }];
      curW = tw;
    } else {
      if (curRow.length > 0) curW += 4;
      curRow.push({ tag, w: tw });
      curW += tw;
    }
  }
  if (curRow.length) rows.push(curRow);
  return rows;
}

// Compute total SVG node height for a given employee
function nodeHeight(emp) {
  const rows = computeTagRows(emp.roles);
  if (rows.length === 0) return OC.NAME_H + OC.NODE_BOT + 4;
  return OC.NAME_H + rows.length * (OC.TAG_H + OC.TAG_VPAD) + OC.NODE_BOT;
}

function renderOrgChart() {
  orgTree.innerHTML = '';

  const nameLC = new Map(employees.map(e => [e.name.toLowerCase(), e]));
  const rootEmp = employees.find(e => !e.reportsTo || !nameLC.has(e.reportsTo.toLowerCase()))
    || employees[0];

  function buildNode(emp) {
    const kids = employees.filter(e =>
      e.reportsTo && e.reportsTo.toLowerCase() === emp.name.toLowerCase()
    );
    const n = { emp };
    if (kids.length) n.children = kids.map(buildNode);
    return n;
  }

  // Pre-compute node heights
  const nhMap = new Map(employees.map(e => [e.name, nodeHeight(e)]));
  const maxNH = Math.max(...employees.map(e => nodeHeight(e)));

  const hier = d3.hierarchy(buildNode(rootEmp));
  d3.tree()
    .nodeSize([OC.NW + OC.HGAP, maxNH + OC.VGAP])
    .separation((a, b) => a.parent === b.parent ? 1 : 1.35)
    (hier);

  // Bounding box (using each node's actual height)
  let x0 = Infinity, x1 = -Infinity, y1 = 0;
  hier.each(d => {
    const nh = nhMap.get(d.data.emp.name) || maxNH;
    x0 = Math.min(x0, d.x - OC.NW / 2);
    x1 = Math.max(x1, d.x + OC.NW / 2);
    y1 = Math.max(y1, d.y + nh);
  });

  const PAD = 24;
  const vbX = x0 - PAD;
  const vbY = -PAD;
  const vbW = (x1 - x0) + PAD * 2;
  const vbH = y1 + PAD * 2;

  // Container
  const wrap = document.createElement('div');
  wrap.className = 'org-svg-wrap';
  orgTree.appendChild(wrap);

  // SVG auto-fits container via viewBox + width="100%"
  const svg = d3.select(wrap)
    .append('svg')
    .attr('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`)
    .attr('width', '100%')
    .attr('preserveAspectRatio', 'xMidYMin meet')
    .style('display', 'block');

  const g = svg.append('g');

  // ── Links — bezier from bottom-center of parent to top-center of child ──
  g.selectAll('.org-link')
    .data(hier.links())
    .join('path')
    .attr('class', 'org-link')
    .attr('d', lk => {
      const nh = nhMap.get(lk.source.data.emp.name) || maxNH;
      const sx = lk.source.x, sy = lk.source.y + nh;
      const tx = lk.target.x, ty = lk.target.y;
      const my = (sy + ty) / 2;
      return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
    });

  // ── Node groups ──
  const nodeG = g.selectAll('.org-node-g')
    .data(hier.descendants())
    .join('g')
    .attr('class', d =>
      `org-node-g ${d.depth === 0 ? 'is-root' : d.depth === 1 ? 'is-l1' : 'is-leaf'}`
    )
    .attr('transform', d => `translate(${d.x - OC.NW / 2},${d.y})`);

  // Build node content for each employee
  nodeG.each(function(d) {
    const grp = d3.select(this);
    const emp = d.data.emp;
    const nh  = nhMap.get(emp.name) || maxNH;
    const isRoot = d.depth === 0;
    const isL1   = d.depth === 1;

    // Background rect
    grp.append('rect')
      .attr('class', 'org-rect')
      .attr('width', OC.NW)
      .attr('height', nh)
      .attr('rx', 7);

    // Employee name
    const nameFill = isRoot ? '#F9A825' : isL1 ? '#FFFFFF' : '#111111';
    grp.append('text')
      .attr('class', 'org-label-name')
      .attr('x', OC.NW / 2)
      .attr('y', OC.NAME_H / 2 + 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-family', 'Montserrat, sans-serif')
      .attr('font-weight', 700)
      .attr('font-size', OC.FONT_NAME)
      .attr('fill', nameFill)
      .text(emp.name);

    // Role tag pills (SVG rect + text, same colors as ROLE_COLORS)
    const rows = computeTagRows(emp.roles);
    let rowY = OC.NAME_H + 2;
    rows.forEach(row => {
      let rowX = OC.NODE_PAD;
      row.forEach(({ tag, w }) => {
        const c = getRoleColor(tag);
        const tg = grp.append('g').attr('transform', `translate(${rowX},${rowY})`);
        tg.append('rect')
          .attr('width', w)
          .attr('height', OC.TAG_H)
          .attr('rx', 7)
          .attr('fill', c.bg);
        tg.append('text')
          .attr('x', w / 2)
          .attr('y', OC.TAG_H / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-family', 'Montserrat, sans-serif')
          .attr('font-weight', 600)
          .attr('font-size', OC.FONT_TAG)
          .attr('fill', c.fg)
          .text(tag);
        rowX += w + 4;
      });
      rowY += OC.TAG_H + OC.TAG_VPAD;
    });
  });

  // ── Popup panel ──
  const panel = document.createElement('div');
  panel.className = 'org-panel hidden';
  orgTree.appendChild(panel);

  // Dismiss panel when clicking panel content (stop propagation)
  panel.addEventListener('click', e => e.stopPropagation());

  function showPanel(emp, event) {
    const dutyItems = emp.duties
      ? emp.duties.split('\n').map(d => d.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
      : [];

    panel.innerHTML = `
      <button class="org-panel-close" aria-label="Close">&times;</button>
      <div class="org-panel-name">${esc(emp.name)}</div>
      <div class="org-panel-reports">${
        emp.reportsTo
          ? `Reports to <strong>${esc(emp.reportsTo)}</strong>`
          : '<span class="org-panel-apex">Top of org</span>'
      }</div>
      <div class="org-panel-section">
        <div class="org-panel-section-title">Roles</div>
        <div class="org-panel-tags">${renderRoleTags(emp.roles) || '<em>None</em>'}</div>
      </div>
      <div class="org-panel-section">
        <div class="org-panel-section-title">Job Duties</div>
        <ul class="org-panel-duties">
          ${dutyItems.length
            ? dutyItems.map(d => `<li>${esc(d)}</li>`).join('')
            : '<li><em>Not listed</em></li>'}
        </ul>
      </div>
    `;
    panel.classList.remove('hidden');

    panel.querySelector('.org-panel-close').addEventListener('click', e => {
      e.stopPropagation();
      hidePanel();
    });

    // Position panel relative to #org-tree (position:relative container)
    const tRect = orgTree.getBoundingClientRect();
    const PW = 292;
    let left = event.clientX - tRect.left + 16;
    let top  = event.clientY - tRect.top  - 20;

    if (left + PW > orgTree.clientWidth - 4) left = event.clientX - tRect.left - PW - 16;
    panel.style.left = Math.max(4, left) + 'px';
    panel.style.top  = Math.max(4, top)  + 'px';
  }

  function hidePanel() {
    panel.classList.add('hidden');
    nodeG.classed('org-selected', false);
  }

  // Node click: highlight + show popup
  nodeG.on('click', (event, d) => {
    event.stopPropagation();
    nodeG.classed('org-selected', false);
    d3.select(event.currentTarget).classed('org-selected', true);
    showPanel(d.data.emp, event);
  });

  // Click outside nodes: dismiss
  svg.on('click', hidePanel);
  orgTree.addEventListener('click', hidePanel, { once: false });

  // Hint text
  const hint = document.createElement('p');
  hint.className = 'org-hint';
  hint.textContent = 'Click any node to view employee details';
  orgTree.appendChild(hint);
}

// ── Print Report ──────────────────────────────────────────────────────────────
function printReport() {
  // Tier grouping
  const nameSet = new Set(employees.map(e => e.name.toLowerCase()));
  const tier1   = employees.filter(e => !e.reportsTo || !nameSet.has(e.reportsTo.toLowerCase()));
  const t1lc    = new Set(tier1.map(e => e.name.toLowerCase()));
  const tier2   = employees.filter(e => e.reportsTo && t1lc.has(e.reportsTo.toLowerCase()));
  const t2lc    = new Set(tier2.map(e => e.name.toLowerCase()));
  const tier3   = employees.filter(e =>
    !t1lc.has(e.name.toLowerCase()) && !t2lc.has(e.name.toLowerCase())
  );

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Inline role tag for the print window (same colors from ROLE_COLORS)
  function printTag(role) {
    const c = getRoleColor(role);
    return `<span class="p-tag" style="background:${c.bg};color:${c.fg}">${role}</span>`;
  }

  function printTags(rolesStr) {
    return (rolesStr || '').split(',').map(r => r.trim()).filter(Boolean)
      .map(printTag).join('');
  }

  function empBlock(emp, borderColor) {
    const duties = emp.duties
      ? emp.duties.split('\n').map(d => d.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
      : [];
    return `
      <div class="p-block" style="border-left-color:${borderColor}">
        <div class="p-left">
          <div class="p-name">${emp.name}</div>
          <div class="p-reports">${emp.reportsTo ? `Reports to: ${emp.reportsTo}` : 'Top of org'}</div>
          <div class="p-tags">${printTags(emp.roles) || '<span class="p-none">No roles</span>'}</div>
        </div>
        <div class="p-divider"></div>
        <div class="p-right">
          ${duties.length
            ? `<ul class="p-duties">${duties.map(d => `<li>${d}</li>`).join('')}</ul>`
            : '<p class="p-none">No duties listed</p>'}
        </div>
      </div>`;
  }

  function tierSection(label, emps, borderColor, indent) {
    if (!emps.length) return '';
    return `
      <div class="p-tier" style="margin-left:${indent}px">
        <div class="p-tier-label">${label}</div>
        ${emps.map(e => empBlock(e, borderColor)).join('')}
      </div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bliss VRS — Staff Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Montserrat', sans-serif;
      font-size: 9.5pt;
      font-weight: 400;
      color: #111;
      background: #fff;
      padding: 14mm 16mm;
    }

    /* ── Page header ── */
    .p-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 5mm;
      margin-bottom: 7mm;
      border-bottom: 2.5px solid #CC0000;
    }
    .p-title    { font-size: 15pt; font-weight: 700; color: #111; line-height: 1.2; }
    .p-subtitle { font-size: 8.5pt; font-weight: 400; color: #666; margin-top: 2mm; }
    .p-date     { font-size: 8pt; font-weight: 600; color: #666; text-align: right; white-space: nowrap; }

    /* ── Tier sections ── */
    .p-tier { margin-bottom: 8mm; }
    .p-tier-label {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #999;
      margin-bottom: 3mm;
    }

    /* ── Employee block ── */
    .p-block {
      display: flex;
      border-left: 4px solid #ccc;
      margin-bottom: 3.5mm;
      background: #fff;
      page-break-inside: avoid;
    }
    .p-left {
      width: 64mm;
      flex-shrink: 0;
      padding: 3mm 4mm;
      border-right: 1px solid #e5e5e5;
    }
    .p-divider { /* visual only — border-right on p-left handles it */ }
    .p-right {
      flex: 1;
      padding: 3mm 4mm;
    }

    .p-name {
      font-size: 11pt;
      font-weight: 700;
      margin-bottom: 1mm;
      line-height: 1.2;
    }
    .p-reports {
      font-size: 7.5pt;
      font-weight: 400;
      color: #666;
      margin-bottom: 2.5mm;
    }
    .p-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5mm;
    }
    .p-tag {
      display: inline-block;
      padding: 0.8mm 2.5mm;
      border-radius: 10mm;
      font-size: 6.5pt;
      font-weight: 600;
      line-height: 1.5;
      white-space: nowrap;
    }
    .p-duties {
      padding-left: 4mm;
      font-size: 9pt;
      font-weight: 400;
      color: #333;
      line-height: 1.65;
    }
    .p-duties li { margin-bottom: 0.5mm; }
    .p-none { font-size: 8pt; color: #aaa; font-style: italic; }

    @media print {
      @page { size: A4; margin: 12mm 14mm; }
      body  { padding: 0; }
      .p-block { page-break-inside: avoid; }
      .p-tier  { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <div class="p-header">
    <div>
      <div class="p-title">Bliss VRS &mdash; Staff Roles &amp; Responsibilities</div>
      <div class="p-subtitle">Vivekananda Enterprises &middot; Internal use only</div>
    </div>
    <div class="p-date">${today}</div>
  </div>

  ${tierSection('Tier 1 &mdash; Leadership', tier1, '#111111', 0)}
  ${tierSection('Tier 2 &mdash; Direct Reports', tier2, '#CC0000', 16)}
  ${tierSection('Tier 3 &mdash; Operations', tier3, '#BDBDBD', 32)}

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.focus(); window.print(); }, 700);
    });
  <\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Search ────────────────────────────────────────────────────────────────────
function renderSearchPlaceholder() {
  searchResults.innerHTML = '<p class="search-placeholder">Start typing to search roles and duties…</p>';
}

function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { renderSearchPlaceholder(); return; }

  const hits = employees.filter(emp =>
    [emp.name, emp.roles, emp.duties].join(' ').toLowerCase().includes(q)
  );

  if (!hits.length) {
    searchResults.innerHTML = `<p class="search-placeholder">No results for "<strong>${esc(q)}</strong>".</p>`;
    return;
  }

  searchResults.innerHTML = hits.map(emp => {
    const dutySnippet = emp.duties.toLowerCase().includes(q)
      ? `<div class="sr-match">Duty: ${highlight(snippetAround(emp.duties, q, 70), q)}</div>`
      : '';
    return `
      <div class="search-result-card" data-name="${esc(emp.name)}">
        <div class="sr-name">${highlight(emp.name, q)}</div>
        <div class="sr-roles">${renderRoleTags(emp.roles)}</div>
        ${dutySnippet}
      </div>
    `;
  }).join('');

  searchResults.querySelectorAll('.search-result-card').forEach(card => {
    card.addEventListener('click', () => {
      const emp = employees.find(e => e.name === card.dataset.name);
      if (emp) openModal(emp);
    });
  });
}

function snippetAround(text, q, maxLen) {
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 20);
  const end   = Math.min(text.length, idx + q.length + 40);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function highlight(text, q) {
  if (!q) return esc(text);
  return esc(text).replace(new RegExp(`(${escRegex(q)})`, 'gi'), '<mark>$1</mark>');
}

function escRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(emp) {
  const chain = buildChain(emp);
  const dutyItems = emp.duties
    ? emp.duties.split('\n').map(d => d.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
    : [];
  const duties = dutyItems.length
    ? `<ul>${dutyItems.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`
    : '<em>Not listed</em>';

  modalContent.innerHTML = `
    <div class="modal-name">${esc(emp.name)}</div>
    <div class="modal-roles">${renderRoleTags(emp.roles) || '<span style="color:#9e9e9e">No roles listed</span>'}</div>
    <div class="modal-section">
      <div class="modal-section-title">Job Duties</div>
      <div class="modal-section-body">${duties}</div>
    </div>
    ${emp.reportsTo ? `
    <div class="modal-section">
      <div class="modal-section-title">Reports To</div>
      <div class="modal-section-body">${esc(emp.reportsTo)}</div>
    </div>` : ''}
    <div class="modal-section">
      <div class="modal-section-title">Reporting Chain</div>
      <div class="modal-section-body">
        <div class="chain-list">${renderChain(chain, emp.name)}</div>
      </div>
    </div>
  `;
  modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function buildChain(emp) {
  const chain = [], visited = new Set();
  let cur = emp;
  while (cur) {
    if (visited.has(cur.name)) break;
    visited.add(cur.name);
    chain.unshift(cur);
    if (!cur.reportsTo) break;
    cur = employees.find(e => e.name.toLowerCase() === cur.reportsTo.trim().toLowerCase());
  }
  return chain;
}

function renderChain(chain, selfName) {
  return chain.map((e, i) => `
    <div class="chain-item${e.name === selfName ? ' chain-self' : ''}">
      ${i > 0 ? '<span class="chain-arrow">&#x25B2;</span>' : ''}
      <span class="chain-name">${esc(e.name)}</span>
      <span class="chain-role">${esc(firstRole(e.roles))}</span>
    </div>
  `).join('');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  tabPanels.forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tab}`);
    p.classList.toggle('hidden', p.id !== `tab-${tab}`);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function firstRole(roles) {
  if (!roles) return '';
  return roles.split(/[,;\/]+/)[0].trim();
}

function showLoading(on) {
  loadingEl.classList.toggle('hidden', !on);
  tabPanels.forEach(p => p.classList.toggle('hidden', on || !p.classList.contains('active')));
  if (on) errorEl.classList.add('hidden');
}

function showError(msg) {
  errorEl.classList.remove('hidden');
  errorMsg.textContent = `Error loading data: ${msg}`;
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
