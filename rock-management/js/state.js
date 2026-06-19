// ── Rock Management state ──
// CRUD lives here; read/tree/lineage helpers come from shared/js/rocks.js.
let _rocks       = [];
let _currentUser = null;

function setCurrentUser(user) { _currentUser = user; }
function getRocks()           { return _rocks; }

async function loadAll() {
  await ensureRocksMigrated(_currentUser.id);
  _rocks = await loadRocks(_currentUser.id);
}

// ── Create ──
// level is implied by the parent: a company root, or a child one level down.
async function createRock(level, parentId, name) {
  const siblings = rocksByLevel(_rocks, level, parentId || null);
  const maxOrder = siblings.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
  const id = (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now() + Math.random().toString(16).slice(2));
  const row = {
    id, user_id: _currentUser.id,
    name: (name || '').trim() || defaultRockName(level),
    level, parent_id: parentId || null, sort_order: maxOrder + 1,
  };
  const { data, error } = await sb.from('rocks').insert(row).select().single();
  if (error) throw error;
  _rocks.push(data);
  return data;
}

function defaultRockName(level) {
  return level === 'company' ? 'New company rock'
       : level === 'team'    ? 'New team rock'
       : 'New individual rock';
}

// ── Update ──
async function renameRock(id, name) {
  const clean = (name || '').trim();
  if (!clean) return;
  const { error } = await sb.from('rocks')
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('renameRock:', error); return; }
  const r = rockById(_rocks, id);
  if (r) r.name = clean;
}

async function updateRockDetails(id, fields) {
  const { error } = await sb.from('rocks')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('updateRockDetails:', error); return; }
  const r = rockById(_rocks, id);
  if (r) Object.assign(r, fields);
}

async function archiveRock(id, archived) {
  let ids;
  if (archived) {
    // Cascade down: archive this rock and everything beneath it, so the active
    // tree never has children dangling under an archived parent.
    const descendants = _rocks.filter(r => r.id !== id && rockLineage(_rocks, r.id).some(a => a.id === id));
    ids = [id, ...descendants.map(r => r.id)];
  } else {
    // Restore this rock plus its ancestors, so it rejoins a valid active tree.
    ids = rockLineage(_rocks, id).map(r => r.id);
  }
  const { error } = await sb.from('rocks')
    .update({ archived, updated_at: new Date().toISOString() })
    .in('id', ids).eq('user_id', _currentUser.id);
  if (error) { console.error('archiveRock:', error); return; }
  ids.forEach(rid => { const r = rockById(_rocks, rid); if (r) r.archived = archived; });
}

// Drag-and-drop move: set the dragged rock's parent and re-sequence the
// destination siblings' sort_order so it lands at the requested spot.
// targetId === null means "append" (used when dropping onto a parent rock).
async function dropRock(dragId, parentId, targetId, pos) {
  const drag = rockById(_rocks, dragId);
  if (!drag) return;
  drag.parent_id = parentId || null;

  const sibs = _rocks
    .filter(r => r.level === drag.level && r.parent_id === (parentId || null) && !r.archived && r.id !== dragId)
    .sort(_rockOrder);

  if (targetId == null) {
    sibs.push(drag);
  } else {
    const ti = sibs.findIndex(s => s.id === targetId);
    const at = ti < 0 ? sibs.length : (pos === 'before' ? ti : ti + 1);
    sibs.splice(at, 0, drag);
  }

  const now = new Date().toISOString();
  sibs.forEach((s, i) => { s.sort_order = i; });
  await Promise.all(sibs.map(s =>
    sb.from('rocks').update(
      s.id === dragId
        ? { parent_id: drag.parent_id, sort_order: s.sort_order, updated_at: now }
        : { sort_order: s.sort_order, updated_at: now }
    ).eq('id', s.id).eq('user_id', _currentUser.id)
  ));
}

// ── Delete (DB cascades to descendants via self-referencing FK) ──
async function deleteRock(id) {
  const { error } = await sb.from('rocks')
    .delete().eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('deleteRock:', error); return; }
  _rocks = await loadRocks(_currentUser.id); // reload so cascaded children drop locally
}
