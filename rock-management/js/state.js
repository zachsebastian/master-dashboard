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

async function reparentRock(id, newParentId) {
  const { error } = await sb.from('rocks')
    .update({ parent_id: newParentId, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('reparentRock:', error); return; }
  const r = rockById(_rocks, id);
  if (r) r.parent_id = newParentId;
}

// ── Delete (DB cascades to descendants via self-referencing FK) ──
async function deleteRock(id) {
  const { error } = await sb.from('rocks')
    .delete().eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('deleteRock:', error); return; }
  _rocks = await loadRocks(_currentUser.id); // reload so cascaded children drop locally
}
