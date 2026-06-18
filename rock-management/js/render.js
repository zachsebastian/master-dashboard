// ── Rock Management render ──

function render() {
  const app = document.getElementById('app');
  const companies = rocksByLevel(_rocks, 'company');

  app.innerHTML = `
    <div class="rm-wrap">
      <div class="rm-head">
        <div>
          <h1 class="rm-title">🪨 Rocks</h1>
          <p class="rm-sub">Company rocks roll down to teams, and teams to individuals. Projects attach to <strong>team</strong> rocks; metrics can attach to a rock at any level.</p>
        </div>
        <button class="btn btn-primary" onclick="handleAddCompany()">+ Company rock</button>
      </div>
      ${companies.length
        ? `<div class="rm-tree">${companies.map(renderCompany).join('')}</div>`
        : renderEmpty()}
    </div>`;
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
  const teams = rocksByLevel(_rocks, 'team', c.id);
  return `
    <div class="rm-company">
      ${renderRow(c, 'company', { addLabel: '+ Team', addLevel: 'team' })}
      <div class="rm-children">
        ${teams.map(renderTeam).join('')}
        ${teams.length ? '' : `<div class="rm-hint">No team rocks yet — add one.</div>`}
      </div>
    </div>`;
}

function renderTeam(t) {
  const indivs = rocksByLevel(_rocks, 'individual', t.id);
  return `
    <div class="rm-team">
      ${renderRow(t, 'team', { addLabel: '+ Individual', addLevel: 'individual', move: 'company' })}
      <div class="rm-children rm-children--deep">
        ${indivs.map(i => renderRow(i, 'individual', { move: 'team' })).join('')}
      </div>
    </div>`;
}

// opts: { addLabel, addLevel, move }  — move = 'company' | 'team' (which level of parent to offer)
function renderRow(r, level, opts = {}) {
  const labels = { company: 'Company', team: 'Team', individual: 'Individual' };
  const moveSelect = opts.move
    ? `<select class="rm-move" title="Move to another ${opts.move}" onchange="handleReparent('${_escRock(r.id)}', this)">
         ${opts.move === 'company' ? companyMoveOptions(r.parent_id) : teamMoveOptions(r.parent_id)}
       </select>`
    : '';
  const addBtn = opts.addLevel
    ? `<button class="btn btn-sm rm-add" onclick="handleAddChild('${_escRock(r.id)}', '${opts.addLevel}')">${opts.addLabel}</button>`
    : '';
  return `
    <div class="rm-row rm-row--${level}">
      <span class="rm-badge rm-badge--${level}">${labels[level]}</span>
      <input class="rm-name" data-rock-id="${_escRock(r.id)}" value="${_escRock(r.name)}"
        onchange="handleRename('${_escRock(r.id)}', this)"
        onkeydown="if(event.key==='Enter')this.blur()">
      <div class="rm-row-actions">
        ${moveSelect}
        ${addBtn}
        <button class="btn btn-sm btn-danger rm-del" title="Delete" onclick="handleDelete('${_escRock(r.id)}')">×</button>
      </div>
    </div>`;
}

function companyMoveOptions(currentParentId) {
  return rocksByLevel(_rocks, 'company').map(c =>
    `<option value="${_escRock(c.id)}" ${c.id === currentParentId ? 'selected' : ''}>${_escRock(c.name)}</option>`
  ).join('');
}

function teamMoveOptions(currentParentId) {
  return rocksByLevel(_rocks, 'company').map(c => {
    const teams = rocksByLevel(_rocks, 'team', c.id);
    if (!teams.length) return '';
    const opts = teams.map(t =>
      `<option value="${_escRock(t.id)}" ${t.id === currentParentId ? 'selected' : ''}>${_escRock(t.name)}</option>`
    ).join('');
    return `<optgroup label="${_escRock(c.name)}">${opts}</optgroup>`;
  }).join('');
}

// ── Handlers ──
async function handleAddCompany() {
  const r = await createRock('company', null);
  render();
  focusRock(r.id);
}

async function handleAddChild(parentId, level) {
  const r = await createRock(level, parentId);
  render();
  focusRock(r.id);
}

async function handleRename(id, el) {
  await renameRock(id, el.value);
}

async function handleReparent(id, el) {
  if (!el.value) return;
  await reparentRock(id, el.value);
  render();
}

async function handleDelete(id) {
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

function descendantCount(id) {
  return _rocks.filter(r => r.id !== id && rockLineage(_rocks, r.id).some(a => a.id === id)).length;
}

function focusRock(id) {
  setTimeout(() => {
    const el = document.querySelector(`.rm-name[data-rock-id="${CSS.escape(id)}"]`);
    if (el) { el.focus(); el.select(); }
  }, 0);
}
