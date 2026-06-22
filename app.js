// ── Config ──────────────────────────────────────────────────────────────────
const SHEET_ID = '1BlJeuTjcWaORjc323ggMacMC_zRfv24xJ8FcgnyQilw';
// Public CSV export URL — no API key needed when the sheet is publicly readable
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

// ── State ────────────────────────────────────────────────────────────────────
let employees = [];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const loadingEl  = document.getElementById('loading');
const errorEl    = document.getElementById('error');
const errorMsg   = document.getElementById('error-msg');
const tabPanels  = document.querySelectorAll('.tab-panel');
const tabBtns    = document.querySelectorAll('.tab-btn');
const cardsGrid  = document.getElementById('cards-grid');
const orgTree    = document.getElementById('org-tree');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');

// ── Init ─────────────────────────────────────────────────────────────────────
document.getElementById('yr').textContent = new Date().getFullYear();
document.getElementById('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

searchInput.addEventListener('input', debounce(doSearch, 220));

loadData();

// ── Data Loading ─────────────────────────────────────────────────────────────
async function loadData() {
  showLoading(true);
  try {
    const res = await fetch(SHEET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    employees = parseCSV(csv);
    if (!employees.length) throw new Error('No employee data found in the sheet.');
    showLoading(false);
    renderAll();
  } catch (err) {
    showLoading(false);
    showError(err.message);
  }
}

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse a CSV line respecting quoted fields
  function parseLine(line) {
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  // Expected: employee_name, major_roles, job_duties, reports_to, available_tags, tag_selection

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

    const name = row['employee_name'] || row[headers[0]] || '';
    if (!name) continue;

    results.push({
      name:      name,
      roles:     row['major_roles']     || '',
      duties:    row['job_duties']      || '',
      reportsTo: row['reports_to']      || '',
      tags:      row['tag_selection']   || row['available_tags'] || '',
    });
  }
  return results;
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
    card.innerHTML = `
      <div class="emp-card-name">${esc(emp.name)}</div>
      <div class="emp-card-roles">${esc(emp.roles) || '<span style="color:#9e9e9e;font-weight:400;text-transform:none">No role listed</span>'}</div>
      ${emp.reportsTo ? `<div class="emp-card-reports">Reports to: <strong>${esc(emp.reportsTo)}</strong></div>` : ''}
      ${renderTags(emp.tags)}
    `;
    card.addEventListener('click', () => openModal(emp));
    cardsGrid.appendChild(card);
  });
}

function renderTags(tagsStr) {
  if (!tagsStr) return '';
  const tags = tagsStr.split(/[,;]+/).map(t => t.trim()).filter(Boolean);
  if (!tags.length) return '';
  return `<div class="emp-card-tags">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;
}

// ── Org Chart ─────────────────────────────────────────────────────────────────
function renderOrgChart() {
  orgTree.innerHTML = '';

  // Build adjacency: reportsTo → [children]
  const childrenOf = {};
  const nameSet = new Set(employees.map(e => e.name.toLowerCase()));

  employees.forEach(emp => {
    const boss = emp.reportsTo.trim();
    if (!childrenOf[boss]) childrenOf[boss] = [];
    childrenOf[boss].push(emp);
  });

  // Find roots: employees who report to nobody OR report to a name not in the list
  const roots = employees.filter(emp => {
    const boss = emp.reportsTo.trim().toLowerCase();
    return !boss || !nameSet.has(boss);
  });

  // If no clear root found, just use first employee
  const treeRoots = roots.length ? roots : [employees[0]];

  const treeEl = buildOrgSubtree(treeRoots, childrenOf, 0);
  orgTree.appendChild(treeEl);
}

function buildOrgSubtree(nodes, childrenOf, depth) {
  const row = document.createElement('div');
  row.className = 'org-level';
  row.style.gap = depth === 0 ? '2rem' : '1rem';

  nodes.forEach(emp => {
    const branch = document.createElement('div');
    branch.className = 'org-branch';

    const node = document.createElement('div');
    node.className = `org-node${depth === 0 ? ' root' : depth === 1 ? ' level-1' : ''}`;
    node.innerHTML = `
      <div class="org-node-name">${esc(emp.name)}</div>
      <div class="org-node-role">${esc(firstRole(emp.roles))}</div>
    `;
    node.addEventListener('click', () => openModal(emp));
    branch.appendChild(node);

    const children = childrenOf[emp.name] || [];
    if (children.length) {
      const connDown = document.createElement('div');
      connDown.className = 'org-connector-down';
      branch.appendChild(connDown);

      const childrenRow = buildOrgSubtree(children, childrenOf, depth + 1);
      childrenRow.style.borderTop = '2px solid #E0E0E0';
      childrenRow.style.paddingTop = '0';

      // Horizontal line spanning children
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.alignItems = 'center';

      // Build connector structure
      const childrenContainer = document.createElement('div');
      childrenContainer.style.display = 'flex';
      childrenContainer.style.gap = '1rem';
      childrenContainer.style.position = 'relative';

      children.forEach(child => {
        const subBranch = document.createElement('div');
        subBranch.style.display = 'flex';
        subBranch.style.flexDirection = 'column';
        subBranch.style.alignItems = 'center';

        const subDown = document.createElement('div');
        subDown.className = 'org-connector-down';

        const subNode = document.createElement('div');
        const childDepth = depth + 1;
        subNode.className = `org-node${childDepth === 1 ? ' level-1' : ''}`;
        subNode.innerHTML = `
          <div class="org-node-name">${esc(child.name)}</div>
          <div class="org-node-role">${esc(firstRole(child.roles))}</div>
        `;
        subNode.addEventListener('click', () => openModal(child));

        subBranch.appendChild(subDown);
        subBranch.appendChild(subNode);

        // Recurse for grandchildren
        const grandchildren = childrenOf[child.name] || [];
        if (grandchildren.length) {
          const gcDown = document.createElement('div');
          gcDown.className = 'org-connector-down';
          subBranch.appendChild(gcDown);
          const gcRow = buildFlatChildren(grandchildren, childrenOf, depth + 2);
          subBranch.appendChild(gcRow);
        }

        childrenContainer.appendChild(subBranch);
      });

      branch.appendChild(childrenContainer);
    }

    row.appendChild(branch);
  });

  return row;
}

function buildFlatChildren(nodes, childrenOf, depth) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '0.75rem';
  row.style.flexWrap = 'wrap';
  row.style.justifyContent = 'center';

  nodes.forEach(emp => {
    const node = document.createElement('div');
    node.className = 'org-node';
    node.innerHTML = `
      <div class="org-node-name">${esc(emp.name)}</div>
      <div class="org-node-role">${esc(firstRole(emp.roles))}</div>
    `;
    node.addEventListener('click', () => openModal(emp));
    row.appendChild(node);

    const children = childrenOf[emp.name] || [];
    if (children.length) {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.alignItems = 'center';
      const subRow = buildFlatChildren(children, childrenOf, depth + 1);
      wrap.appendChild(node.cloneNode(true));
      row.appendChild(subRow);
    }
  });

  return row;
}

function firstRole(roles) {
  if (!roles) return '';
  return roles.split(/[,;\/]+/)[0].trim();
}

// ── Search ────────────────────────────────────────────────────────────────────
function renderSearchPlaceholder() {
  searchResults.innerHTML = '<p class="search-placeholder">Start typing to search roles and duties…</p>';
}

function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { renderSearchPlaceholder(); return; }

  const hits = [];
  employees.forEach(emp => {
    const searchable = [emp.name, emp.roles, emp.duties, emp.tags].join(' ').toLowerCase();
    if (searchable.includes(q)) {
      // Find which field matched and extract snippet
      const matchField = getMatchField(emp, q);
      hits.push({ emp, matchField });
    }
  });

  if (!hits.length) {
    searchResults.innerHTML = `<p class="search-placeholder">No results for "<strong>${esc(q)}</strong>".</p>`;
    return;
  }

  searchResults.innerHTML = hits.map(({ emp, matchField }) => `
    <div class="search-result-card" data-name="${esc(emp.name)}">
      <div class="sr-name">${highlight(emp.name, q)}</div>
      <div class="sr-match">${esc(emp.roles ? emp.roles : '')}${matchField ? ` — ${matchField}` : ''}</div>
    </div>
  `).join('');

  searchResults.querySelectorAll('.search-result-card').forEach(card => {
    card.addEventListener('click', () => {
      const emp = employees.find(e => e.name === card.dataset.name);
      if (emp) openModal(emp);
    });
  });
}

function getMatchField(emp, q) {
  if (emp.duties.toLowerCase().includes(q)) {
    return 'Duty: ' + highlight(snippetAround(emp.duties, q, 60), q);
  }
  if (emp.tags.toLowerCase().includes(q)) {
    return 'Tag: ' + highlight(snippetAround(emp.tags, q, 60), q);
  }
  return '';
}

function snippetAround(text, q, maxLen) {
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + q.length + 40);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function highlight(text, q) {
  if (!q) return esc(text);
  const regex = new RegExp(`(${escRegex(q)})`, 'gi');
  return esc(text).replace(regex, '<mark>$1</mark>');
}

function escRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Modal / Reporting Chain ───────────────────────────────────────────────────
function openModal(emp) {
  const chain = buildChain(emp);
  const duties = emp.duties
    ? `<ul>${emp.duties.split(/[;\n]+/).map(d => d.trim()).filter(Boolean).map(d => `<li>${esc(d)}</li>`).join('')}</ul>`
    : '<em>Not listed</em>';

  const tagsHtml = emp.tags
    ? emp.tags.split(/[,;]+/).map(t => t.trim()).filter(Boolean).map(t => `<span class="tag">${esc(t)}</span>`).join('')
    : '<em>None</em>';

  modalContent.innerHTML = `
    <div class="modal-name">${esc(emp.name)}</div>
    <div class="modal-roles">${esc(emp.roles) || 'No role listed'}</div>
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
    <div class="modal-section">
      <div class="modal-section-title">Tags</div>
      <div class="modal-section-body">
        <div class="emp-card-tags" style="margin-top:0">${tagsHtml}</div>
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
  // Walk up the reporting tree
  const chain = [];
  const visited = new Set();
  let current = emp;
  while (current) {
    if (visited.has(current.name)) break; // cycle guard
    visited.add(current.name);
    chain.unshift(current);
    if (!current.reportsTo) break;
    current = employees.find(e => e.name.toLowerCase() === current.reportsTo.trim().toLowerCase());
  }
  return chain;
}

function renderChain(chain, selfName) {
  return chain.map((e, i) => {
    const isSelf = e.name === selfName;
    const arrow = i > 0 ? `<span class="chain-arrow">&#x25B2;</span>` : '';
    return `
      <div class="chain-item${isSelf ? ' chain-self' : ''}">
        ${arrow}
        <span class="chain-name">${esc(e.name)}</span>
        <span class="chain-role">${esc(firstRole(e.roles))}</span>
      </div>
    `;
  }).join('');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  tabPanels.forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tab}`);
    p.classList.toggle('hidden', p.id !== `tab-${tab}`);
  });
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
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
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
