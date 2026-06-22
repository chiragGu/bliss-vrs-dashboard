// ── Config ───────────────────────────────────────────────────────────────────
const SHEET_ID  = '1BlJeuTjcWaORjc323ggMacMC_zRfv24xJ8FcgnyQilw';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

// ── Role → Color Map ─────────────────────────────────────────────────────────
const ROLE_COLORS = {
  // Dispatch family (blue)
  'dispatch head':     { bg: '#1565C0', fg: '#FFFFFF' },
  'dispatch':          { bg: '#90CAF9', fg: '#0D47A1' },
  // Billing family (amber/orange)
  'billing head':      { bg: '#BF360C', fg: '#FFFFFF' },
  'billing':           { bg: '#FFE0B2', fg: '#BF360C' },
  // Inventory / Purchase family (green)
  'inventory head':    { bg: '#1B5E20', fg: '#FFFFFF' },
  'inventory':         { bg: '#C8E6C9', fg: '#1B5E20' },
  'purchase':          { bg: '#388E3C', fg: '#FFFFFF' },
  // Customer Service / Office Manager family (purple)
  'customer service':  { bg: '#4A148C', fg: '#FFFFFF' },
  'office manager':    { bg: '#CE93D8', fg: '#4A148C' },
  'office manger':     { bg: '#CE93D8', fg: '#4A148C' }, // typo variant in data
  // MIS / Packing / Delivery family (slate)
  'mis':               { bg: '#37474F', fg: '#FFFFFF' },
  'packing':           { bg: '#78909C', fg: '#FFFFFF' },
  'delivery':          { bg: '#CFD8DC', fg: '#37474F' },
  // Leadership tier (gold)
  'founder':           { bg: '#F9A825', fg: '#212121' },
  'sales & marketing': { bg: '#FDD835', fg: '#212121' },
  // Quotation (teal)
  'quotation handler': { bg: '#00695C', fg: '#FFFFFF' },
};

function getRoleColor(role) {
  return ROLE_COLORS[role.trim().toLowerCase()] || { bg: '#E8EAF6', fg: '#424242' };
}

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
// Full-document character-by-character scan — handles embedded newlines in
// quoted fields (Job Duties column has \n inside quotes).
function parseCSVRecords(csv) {
  const records = [];
  let row = [], cur = '', inQuote = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuote) {
      if (ch === '"' && csv[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"')                   { inQuote = false; }
      else                                   { cur += ch; }
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

  // Sheet has a title row above the real headers — find the real header row
  // by locating whichever row contains "Employee Name" in any cell.
  let headerIdx = -1;
  for (let i = 0; i < records.length; i++) {
    if (records[i].some(c => c.trim().toLowerCase() === 'employee name')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) return [];

  const hdrs = records[headerIdx].map(h => h.trim().toLowerCase());
  const col  = kw => hdrs.findIndex(h => h.includes(kw));

  const colName    = col('employee name');
  const colRoles   = col('major role');
  const colDuties  = col('job dut');
  const colReports = col('reports to');
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

// ── Directory ─────────────────────────────────────────────────────────────────
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

// ── Org Chart (D3) ────────────────────────────────────────────────────────────
function renderOrgChart() {
  orgTree.innerHTML = '';

  // Build lookup and find root (no reportsTo, or manager not in the list)
  const nameLC = new Map(employees.map(e => [e.name.toLowerCase(), e]));
  const rootEmp = employees.find(e => !e.reportsTo || !nameLC.has(e.reportsTo.toLowerCase()))
    || employees[0];

  // Recursive tree builder for d3.hierarchy
  function buildNode(emp) {
    const kids = employees.filter(e =>
      e.reportsTo && e.reportsTo.toLowerCase() === emp.name.toLowerCase()
    );
    const n = { emp };
    if (kids.length) n.children = kids.map(buildNode);
    return n;
  }

  const NW = 172, NH = 64, HGAP = 32, VGAP = 92;

  const hier = d3.hierarchy(buildNode(rootEmp));
  d3.tree()
    .nodeSize([NW + HGAP, NH + VGAP])
    .separation((a, b) => a.parent === b.parent ? 1 : 1.45)
    (hier);

  // Compute bounding box of all nodes
  let x0 = Infinity, x1 = -Infinity, y1 = 0;
  hier.each(d => {
    x0 = Math.min(x0, d.x - NW / 2);
    x1 = Math.max(x1, d.x + NW / 2);
    y1 = Math.max(y1, d.y + NH);
  });
  const PAD  = 36;
  const svgW = (x1 - x0) + PAD * 2;
  const svgH = y1 + PAD * 2;

  // Scrollable container
  const wrap = document.createElement('div');
  wrap.className = 'org-svg-wrap';
  orgTree.appendChild(wrap);

  const svg = d3.select(wrap)
    .append('svg')
    .attr('width',  svgW)
    .attr('height', svgH)
    .style('display', 'block');

  // Translate so leftmost node has PAD margin
  const g = svg.append('g')
    .attr('transform', `translate(${-x0 + PAD},${PAD})`);

  // ── Links (smooth bezier from parent-bottom to child-top) ──
  g.selectAll('.org-link')
    .data(hier.links())
    .join('path')
    .attr('class', 'org-link')
    .attr('d', lk => {
      const sx = lk.source.x, sy = lk.source.y + NH;
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
    .attr('transform', d => `translate(${d.x - NW / 2},${d.y})`);

  nodeG.append('rect')
    .attr('class', 'org-rect')
    .attr('width', NW)
    .attr('height', NH)
    .attr('rx', 8);

  nodeG.append('text')
    .attr('class', 'org-label-name')
    .attr('x', NW / 2)
    .attr('y', NH / 2 - 9)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .text(d => d.data.emp.name);

  nodeG.append('text')
    .attr('class', 'org-label-role')
    .attr('x', NW / 2)
    .attr('y', NH / 2 + 12)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .text(d => clip(firstRole(d.data.emp.roles), 26));

  // ── Info panel (positioned within the scrollable wrap) ──
  const panel = document.createElement('div');
  panel.className = 'org-panel hidden';
  wrap.appendChild(panel);

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

    // Position relative to click point in scroll-content coordinates
    const wRect  = wrap.getBoundingClientRect();
    const PW     = 290;
    let   left   = event.clientX - wRect.left + wrap.scrollLeft + 16;
    let   top    = event.clientY - wRect.top  + wrap.scrollTop  - 16;

    // Flip left if panel would overflow the right edge
    if (left + PW > wrap.scrollWidth - 8)
      left = event.clientX - wRect.left + wrap.scrollLeft - PW - 16;

    panel.style.left = Math.max(4, left) + 'px';
    panel.style.top  = Math.max(4, top)  + 'px';
  }

  function hidePanel() {
    panel.classList.add('hidden');
    nodeG.classed('org-selected', false);
  }

  // Node click: select + show panel
  nodeG.on('click', (event, d) => {
    event.stopPropagation();
    nodeG.classed('org-selected', false);
    d3.select(event.currentTarget).classed('org-selected', true);
    showPanel(d.data.emp, event);
  });

  // SVG background click: dismiss
  svg.on('click', hidePanel);
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

// ── Modal (Employee Detail) ───────────────────────────────────────────────────
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

function clip(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
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
