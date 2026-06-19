// ── Rock Management render ──

// Ids whose children are collapsed (hidden). Survives re-renders within a session.
let _collapsed = new Set();
let _openMenu  = null;   // rock id whose ⋯ menu is open
let _detailsId = null;   // rock id whose details modal is open
let _menuCloserInstalled = false;

// Collapse everything by default — each level is revealed by clicking it.
function collapseAll() {
  _collapsed = new Set(_rocks.map(r => r.id));
}

function toggleCollapse(id) {
  if (_collapsed.has(id)) _collapsed.delete(id);
  else _collapsed.add(id);
  render();
}

function render() {
  const app = document.getElementById('app');
  const companies = rocksByLevel(_rocks, 'company').filter(c => !c.archived);

  app.innerHTML = `
    <div class="rm-wrap">
      <div class="rm-head">
        <div>
          <h1 class="rm-title">🪨 Rocks</h1>
          <p class="rm-sub">Company rocks roll down to teams, and teams to individuals. Projects and metrics can attach to a rock at any level.</p>
        </div>
        <button class="btn btn-primary" onclick="handleAddCompany()">+ Company rock</button>
      </div>
      ${companies.length
        ? `<div class="rm-tree">${companies.map(renderCompany).join('')}</div>`
        : (_rocks.length ? '' : renderEmpty())}
      ${renderArchivedSection()}
    </div>
    ${renderRockDetailsModal()}`;

  _bindRockDrag();
  _installMenuCloser();
}

function renderEmpty() {
  return `
    <div class="rm-empty">
      <div class="rm-empty-icon">🪨</div>
      <div class="rm-empty-title">No rocks yet</div>
      <div class="rm-empty-msg">Start with a company rock, then nest team and individual rocks beneath it.</div>
    </div>`;
}

function renderCompany(c) {
  const teams = rocksByLevel(_rocks, 'team', c.id).filter(t => !t.archived);
  return `
    <div class="rm-company">
      ${renderRow(c, 'company', { addLabel: '+ Team', addLevel: 'team' })}
      ${_collapsed.has(c.id) ? '' : `<div class="rm-children">
        ${teams.map(renderTeam).join('')}
        ${teams.length ? '' : `<div class="rm-hint">No team rocks yet — add one.</div>`}
      </div>`}
    </div>`;
}

function renderTeam(t) {
  const indivs = rocksByLevel(_rocks, 'individual', t.id).filter(i => !i.archived);
  return `
    <div class="rm-team">
      ${renderRow(t, 'team', { addLabel: '+ Individual', addLevel: 'individual' })}
      ${(_collapsed.has(t.id) || !indivs.length) ? '' : `<div class="rm-children rm-children--deep">
        ${indivs.map(i => renderRow(i, 'individual')).join('')}
      </div>`}
    </div>`;
}

const ROCK_LABELS = { company: 'Company', team: 'Team', individual: 'Individual' };

// opts: { addLabel, addLevel }. Only renders active rocks; archived rocks live
// in the Archived section. Reparent/reorder is via drag (the ⠿ grip handle).
function renderRow(r, level, opts = {}) {
  const id = _escRock(r.id);
  const childLevel  = ROCK_CHILD_LEVEL[level];
  const hasChildren = !!(childLevel && rocksByLevel(_rocks, childLevel, r.id).some(c => !c.archived));
  const collapsed   = _collapsed.has(r.id);
  const caret = hasChildren
    ? `<button class="rm-caret${collapsed ? ' is-collapsed' : ''}" title="${collapsed ? 'Expand' : 'Collapse'}" onclick="toggleCollapse('${id}')">▾</button>`
    : `<span class="rm-caret rm-caret--none"></span>`;
  const addItem = opts.addLevel
    ? `<button class="rm-menu-item" onclick="handleAddChild('${id}', '${opts.addLevel}')">${opts.addLabel}</button>`
    : '';
  const menuOpen = _openMenu === r.id;
  return `
    <div class="rm-row rm-row--${level}" data-rock-id="${id}" data-level="${level}">
      <span class="rm-drag" title="Drag to move or reorder">⠿</span>
      ${caret}
      <span class="rm-badge rm-badge--${level}${hasChildren ? ' rm-badge--toggle' : ''}"${hasChildren ? ` onclick="toggleCollapse('${id}')"` : ''}>${ROCK_LABELS[level]}</span>
      <input class="rm-name" data-rock-id="${id}" value="${_escRock(r.name)}"
        onchange="handleRename('${id}', this)"
        onkeydown="if(event.key==='Enter')this.blur()">
      <div class="rm-row-actions">
        <div class="rm-menu-wrap">
          <button class="btn btn-sm rm-more" title="More" onclick="toggleRockMenu('${id}', event)">⋯</button>
          ${menuOpen ? `<div class="rm-menu">
            ${addItem}
            <button class="rm-menu-item" onclick="openRockDetails('${id}')">Details…</button>
            <button class="rm-menu-item" onclick="handleArchive('${id}', true)">Archive</button>
          </div>` : ''}
        </div>
        <button class="btn btn-sm btn-danger rm-del" title="Delete" onclick="handleDelete('${id}')">×</button>
      </div>
    </div>`;
}

// ── Archived section ──
function renderArchivedSection() {
  const archived = _rocks.filter(r => r.archived)
    .sort((a, b) => ROCK_LEVELS.indexOf(a.level) - ROCK_LEVELS.indexOf(b.level) || _rockSortName(a, b));
  if (!archived.length) return '';
  return `
    <div class="rm-archived-section">
      <div class="rm-archived-head">Archived <span class="rm-archived-count">${archived.length}</span></div>
      <div class="rm-archived-list">${archived.map(renderArchivedRow).join('')}</div>
    </div>`;
}

function _rockSortName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function renderArchivedRow(r) {
  const id = _escRock(r.id);
  const lineage = rockLineage(_rocks, r.id).slice(0, -1); // ancestors only
  const crumb = lineage.length
    ? `<span class="rm-breadcrumb">${lineage.map(a => _escRock(a.name)).join(' › ')} ›</span>`
    : '';
  return `
    <div class="rm-row rm-row--archived">
      <span class="rm-badge rm-badge--${r.level}">${ROCK_LABELS[r.level]}</span>
      <div class="rm-archived-name">${crumb}<span class="rm-archived-title">${_escRock(r.name)}</span></div>
      <div class="rm-row-actions">
        <button class="btn btn-sm rm-unarchive" onclick="handleArchive('${id}', false)">Unarchive</button>
        <button class="btn btn-sm btn-danger rm-del" title="Delete" onclick="handleDelete('${id}')">×</button>
      </div>
    </div>`;
}

// ── Drag and drop (reparent + reorder) ──
let _rockDragId = null;

function _bindRockDrag() {
  document.querySelectorAll('.rm-row[data-rock-id]').forEach(row => {
    const handle = row.querySelector('.rm-drag');
    // Only the grip arms dragging, so the name <input> stays selectable.
    if (handle) {
      handle.addEventListener('mousedown',  () => row.setAttribute('draggable', 'true'));
      handle.addEventListener('touchstart', () => row.setAttribute('draggable', 'true'), { passive: true });
    }

    row.addEventListener('dragstart', e => {
      _rockDragId = row.dataset.rockId;
      row.classList.add('rm-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _rockDragId);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('rm-dragging');
      row.removeAttribute('draggable');
      _clearRockDropMarks();
      _rockDragId = null;
    });
    row.addEventListener('dragover', e => {
      const intent = _rockDropIntent(row, e);
      if (!intent) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      _clearRockDropMarks();
      if (intent.type === 'reparent') row.classList.add('rm-drop-into');
      else row.classList.add(intent.pos === 'before' ? 'rm-drop-before' : 'rm-drop-after');
    });
    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget)) _clearRockDropMarks(row);
    });
    row.addEventListener('drop', async e => {
      const intent = _rockDropIntent(row, e);
      if (!intent) return;
      e.preventDefault();
      const dragId = _rockDragId;
      _clearRockDropMarks();
      _rockDragId = null;
      await dropRock(dragId, intent.parentId, intent.targetId, intent.pos);
      render();
    });
  });
}

// Decide what dropping the dragged rock onto `row` means, honoring level rules.
function _rockDropIntent(row, e) {
  if (!_rockDragId || _rockDragId === row.dataset.rockId) return null;
  const drag   = rockById(_rocks, _rockDragId);
  const target = rockById(_rocks, row.dataset.rockId);
  if (!drag || !target) return null;

  // Same level → reorder as a sibling (also reparents if target sits elsewhere)
  if (target.level === drag.level) {
    const rect = row.getBoundingClientRect();
    const pos  = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    return { type: 'reorder', parentId: target.parent_id, targetId: target.id, pos };
  }
  // Target is exactly one level up → reparent under it (append)
  if (target.level === ROCK_PARENT_LEVEL[drag.level]) {
    return { type: 'reparent', parentId: target.id, targetId: null, pos: null };
  }
  return null;
}

function _clearRockDropMarks(except) {
  document.querySelectorAll('.rm-drop-into, .rm-drop-before, .rm-drop-after').forEach(el => {
    if (el !== except) el.classList.remove('rm-drop-into', 'rm-drop-before', 'rm-drop-after');
  });
}

// ── Handlers ──
async function handleAddCompany() {
  const r = await createRock('company', null);
  render();
  focusRock(r.id);
}

async function handleAddChild(parentId, level) {
  _openMenu = null;
  _collapsed.delete(parentId); // expand the parent so the new child is visible
  const r = await createRock(level, parentId);
  render();
  focusRock(r.id);
}

async function handleRename(id, el) {
  await renameRock(id, el.value);
}

async function handleArchive(id, archived) {
  _openMenu = null;
  await archiveRock(id, archived);
  render();
}

async function handleDelete(id) {
  _openMenu = null;
  const r = rockById(_rocks, id);
  if (!r) return;
  const kids = descendantCount(id);
  const msg = kids
    ? `Delete "${r.name}" and its ${kids} nested rock${kids === 1 ? '' : 's'}? This cannot be undone.`
    : `Delete "${r.name}"?`;
  if (!confirm(msg)) return;
  await deleteRock(id);
  render();
}

// ── Row ⋯ menu ──
function toggleRockMenu(id, e) {
  if (e) e.stopPropagation();
  _openMenu = _openMenu === id ? null : id;
  render();
}

function _installMenuCloser() {
  if (_menuCloserInstalled) return;
  _menuCloserInstalled = true;
  document.addEventListener('click', e => {
    if (_openMenu && !e.target.closest('.rm-menu-wrap')) { _openMenu = null; render(); }
  });
}

// ── Rock details modal (EOS fields) ──
const ROCK_DETAIL_FIELDS = [
  { key: 'best_result',      label: 'Best Result',               ph: 'If this rock goes great, what does done look like?' },
  { key: 'worst_result',     label: 'Worst Result',              ph: 'If it stalls or fails, what happens?' },
  { key: 'success_criteria', label: 'Success Criteria',          ph: 'How will you know it’s complete? (measurable)' },
  { key: 'resources',        label: 'People & Resources Needed', ph: 'Who and what is required to land this rock?' },
];

function openRockDetails(id) {
  _openMenu = null;
  _detailsId = id;
  render();
}

function closeRockDetails(e) {
  if (e && e.target.closest('.rm-modal')) return; // ignore clicks inside the card
  _detailsId = null;
  render();
}

async function saveRockDetails() {
  if (!_detailsId) return;
  const fields = {};
  ROCK_DETAIL_FIELDS.forEach(f => {
    const el = document.getElementById(`rm-d-${f.key}`);
    fields[f.key] = el ? el.value.trim() : '';
  });
  const id = _detailsId;
  _detailsId = null;
  await updateRockDetails(id, fields);
  render();
}

function renderRockDetailsModal() {
  if (!_detailsId) return '';
  const r = rockById(_rocks, _detailsId);
  if (!r) return '';
  const lineage = rockLineage(_rocks, r.id).slice(0, -1)
    .map(a => _escRock(a.name)).join(' › ');
  return `
    <div class="rm-modal-backdrop" onclick="closeRockDetails(event)">
      <div class="rm-modal">
        <div class="rm-modal-head">
          <div>
            <div class="rm-modal-eyebrow">${ROCK_LABELS[r.level]}${lineage ? ` · ${lineage}` : ''}</div>
            <div class="rm-modal-title">${_escRock(r.name)}</div>
          </div>
          <button class="rm-modal-close" onclick="closeRockDetails()">×</button>
        </div>
        <div class="rm-modal-body">
          ${ROCK_DETAIL_FIELDS.map(f => `
            <label class="rm-field-label" for="rm-d-${f.key}">${f.label}</label>
            <textarea class="rm-field" id="rm-d-${f.key}" rows="3" placeholder="${f.ph}">${_escRock(r[f.key] || '')}</textarea>
          `).join('')}
        </div>
        <div class="rm-modal-foot">
          <button class="btn btn-sm" onclick="closeRockDetails()">Cancel</button>
          <button class="btn btn-sm btn-primary" onclick="saveRockDetails()">Save details</button>
        </div>
      </div>
    </div>`;
}

function descendantCount(id) {
  return _rocks.filter(r => r.id !== id && rockLineage(_rocks, r.id).some(a => a.id === id)).length;
}

function focusRock(id) {
  setTimeout(() => {
    const el = document.querySelector(`.rm-name[data-rock-id="${CSS.escape(id)}"]`);
    if (el) { el.focus(); el.select(); }
  }, 0);
}
