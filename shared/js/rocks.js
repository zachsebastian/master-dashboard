// ── Shared rocks helper ──
// Single source of truth for the company > team > individual rock hierarchy.
// Used by the Rock Management module, projects, metrics, and the weekly digest.
// Relies on the global `sb` (supabase client).

const ROCK_LEVELS = ['company', 'team', 'individual'];
const ROCK_CHILD_LEVEL  = { company: 'team', team: 'individual', individual: null };
const ROCK_PARENT_LEVEL = { company: null, team: 'company', individual: 'team' };

function _escRock(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _rockOrder(a, b) {
  return (a.sort_order || 0) - (b.sort_order || 0)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''));
}

// ── Read ──
async function loadRocks(userId) {
  const { data, error } = await sb.from('rocks')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order')
    .order('created_at');
  if (error) { console.error('loadRocks:', error); return []; }
  return data || [];
}

function rockById(rocks, id) {
  return (rocks || []).find(r => r.id === id) || null;
}

function rocksByLevel(rocks, level, parentId) {
  return (rocks || [])
    .filter(r => r.level === level && (parentId === undefined || r.parent_id === parentId))
    .sort(_rockOrder);
}

// Lineage from the top down, e.g. [company, team] or [company, team, individual].
function rockLineage(rocks, id) {
  const chain = [];
  let cur = rockById(rocks, id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent_id ? rockById(rocks, cur.parent_id) : null;
  }
  return chain;
}

// Nested tree of company nodes: { ...rock, children: [ team nodes... ] }.
function buildRockTree(rocks) {
  const node = r => ({ ...r, children: rocksByLevel(rocks, ROCK_CHILD_LEVEL[r.level], r.id).map(node) });
  return rocksByLevel(rocks, 'company').map(node);
}

// ── Option builders for <select> pickers ──

// Team rocks only, grouped under their company. For the PROJECT picker.
// Caller is responsible for any leading "no rock" <option>.
function teamRockOptionsHtml(rocks, selectedId) {
  return rocksByLevel(rocks, 'company').map(c => {
    const teams = rocksByLevel(rocks, 'team', c.id);
    if (!teams.length) return '';
    const opts = teams.map(t =>
      `<option value="${_escRock(t.id)}" ${t.id === selectedId ? 'selected' : ''}>${_escRock(t.name)}</option>`
    ).join('');
    return `<optgroup label="${_escRock(c.name)}">${opts}</optgroup>`;
  }).join('');
}

// Every rock at every level, indented by depth. For the METRICS picker.
function anyRockOptionsHtml(rocks, selectedId) {
  const out = [];
  const emit = (r, depth) => {
    const pad = depth === 0 ? '' : (depth === 1 ? '› ' : '·· ');
    out.push(`<option value="${_escRock(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${pad}${_escRock(r.name)}</option>`);
    rocksByLevel(rocks, ROCK_CHILD_LEVEL[r.level], r.id).forEach(child => emit(child, depth + 1));
  };
  rocksByLevel(rocks, 'company').forEach(c => emit(c, 0));
  return out.join('');
}

// ── Read-only bubble (team-name pill) ──
function rockBubbleHtml(rocks, id) {
  const r = rockById(rocks, id);
  if (!r) return '';
  return `<span class="rock-bubble" title="Rock: ${_escRock(r.name)}">🪨 ${_escRock(r.name)}</span>`;
}

// ── One-time legacy migration ──
// Lifts the flat rocks that lived in metrics.data.rocks into the rocks table as
// company-level rows (preserving ids so metricRocks keeps resolving), then drops
// them from the metrics blob. Idempotent: a no-op once the user has any rocks.
async function ensureRocksMigrated(userId) {
  const { data: existing, error: exErr } = await sb.from('rocks')
    .select('id').eq('user_id', userId).limit(1);
  if (exErr) { console.error('ensureRocksMigrated check:', exErr); return { migrated: false, error: exErr }; }
  if (existing && existing.length) return { migrated: false };

  const { data: mRow, error: mErr } = await sb.from('metrics')
    .select('id, data').eq('user_id', userId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (mErr) { console.error('ensureRocksMigrated metrics read:', mErr); return { migrated: false, error: mErr }; }

  const legacy = (mRow && mRow.data && Array.isArray(mRow.data.rocks)) ? mRow.data.rocks : [];
  if (!legacy.length) return { migrated: false };

  const rows = legacy.map((r, i) => ({
    id: r.id, user_id: userId, name: r.name || 'Untitled rock',
    level: 'company', parent_id: null, sort_order: i,
  }));
  const { error: insErr } = await sb.from('rocks').insert(rows);
  if (insErr) { console.error('ensureRocksMigrated insert:', insErr); return { migrated: false, error: insErr }; }

  const newData = { ...mRow.data };
  delete newData.rocks;
  const { error: upErr } = await sb.from('metrics').update({ data: newData }).eq('id', mRow.id);
  if (upErr) console.error('ensureRocksMigrated metrics cleanup:', upErr); // non-fatal

  return { migrated: true, count: rows.length };
}
