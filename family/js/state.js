// ── State ──
let _currentUser = null;
let _household = null;   // household id (shared with linked family members)
let _members   = [];     // fam_members rows (linked users + kids/pets/etc.)
let _tasks     = [];
let _topics    = [];
let _shopping  = [];
let _events    = [];
let _renewals  = [];

// ── Constants shared with render ──
const FAM_TASK_CATS   = ['kids', 'pets', 'health', 'home', 'errands', 'admin', 'other'];
const FAM_STORES      = ['any', 'kroger', 'aldi', 'target', 'costco', 'amazon', 'other'];
const FAM_SHOP_CATS   = ['grocery', 'pantry', 'baby', 'pet', 'household', 'other'];
const FAM_EVENT_STATS = ['idea', 'invited', 'deciding', 'confirmed', 'declined', 'done'];
const FAM_RENEW_CATS  = ['license', 'subscription', 'medication', 'pet', 'other'];
const FAM_RENEW_FREQS = ['once', 'monthly', 'quarterly', 'annual'];
const FAM_MEMBER_KINDS = ['adult', 'child', 'pet', 'other'];

function famToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Load everything ──
async function loadFamilyState() {
  // Bootstrap (or fetch) my household — creates one with a self member on first use
  const { data: hid, error: hErr } = await sb.rpc('fam_my_household');
  if (hErr) { console.error('fam_my_household:', hErr); return; }
  _household = hid;

  const [m, t, d, s, e, r] = await Promise.all([
    sb.from('fam_members').select('*').eq('household_id', hid).order('created_at'),
    sb.from('fam_tasks').select('*').eq('household_id', hid).order('created_at'),
    sb.from('fam_topics').select('*').eq('household_id', hid).order('created_at'),
    sb.from('fam_shopping').select('*').eq('household_id', hid).order('created_at'),
    sb.from('fam_events').select('*').eq('household_id', hid).order('event_date', { ascending: true, nullsFirst: false }),
    sb.from('fam_renewals').select('*').eq('household_id', hid).order('due_date'),
  ]);
  _members  = m.data || [];
  _tasks    = t.data || [];
  _topics   = d.data || [];
  _shopping = s.data || [];
  _events   = e.data || [];
  _renewals = r.data || [];
}

// ── Generic helpers ──
const _famTables = {
  fam_tasks:    () => _tasks,
  fam_topics:   () => _topics,
  fam_shopping: () => _shopping,
  fam_events:   () => _events,
  fam_renewals: () => _renewals,
};

async function famInsert(table, row) {
  const { data, error } = await sb
    .from(table)
    .insert({ ...row, user_id: _currentUser.id, household_id: _household })
    .select()
    .single();
  if (error) { console.error(`insert ${table}:`, error); return null; }
  _famTables[table]().push(data);
  return data;
}

async function famUpdate(table, id, patch) {
  const list = _famTables[table]();
  const item = list.find(i => i.id === id);
  if (!item) return;
  Object.assign(item, patch);
  const { error } = await sb.from(table).update(patch).eq('id', id);
  if (error) console.error(`update ${table}:`, error);
}

async function famDelete(table, id) {
  const list = _famTables[table]();
  const idx = list.findIndex(i => i.id === id);
  if (idx !== -1) list.splice(idx, 1);
  await sb.from(table).delete().eq('id', id);
}

// ── Members (People) ──
function famMemberNames() {
  return _members.map(m => m.name);
}

async function famMemberAdd(name, kind) {
  const { data, error } = await sb
    .from('fam_members')
    .insert({ household_id: _household, name, kind })
    .select()
    .single();
  if (error) { console.error('famMemberAdd:', error); return null; }
  _members.push(data);
  return data;
}

async function famMemberRemove(id) {
  const idx = _members.findIndex(m => m.id === id);
  if (idx !== -1) _members.splice(idx, 1);
  await sb.from('fam_members').delete().eq('id', id);
}

// Search a dashboard user by Dashboard ID (only users with the family module)
async function famSearchUser(code) {
  const { data, error } = await sb.rpc('fam_search_user', { code });
  if (error) { console.error('famSearchUser:', error); return { error: error.message }; }
  return { result: (data && data[0]) || null };
}

// Link a dashboard user into my family by Dashboard ID
async function famAddLinkedMember(code) {
  const { data, error } = await sb.rpc('fam_add_linked_member', { code });
  if (error) return { error: error.message };
  _members.push(data);
  return { member: data };
}

// ── Section-specific actions ──
async function famToggleTask(id) {
  const t = _tasks.find(x => x.id === id);
  if (!t) return;
  const next = !t.completed;
  await famUpdate('fam_tasks', id, {
    completed: next,
    completed_at: next ? new Date().toISOString() : null,
  });
}

async function famToggleTopic(id, outcome) {
  const t = _topics.find(x => x.id === id);
  if (!t) return;
  const next = !t.resolved;
  await famUpdate('fam_topics', id, {
    resolved: next,
    outcome: next ? (outcome || t.outcome || null) : null,
  });
}

async function famToggleShopping(id) {
  const s = _shopping.find(x => x.id === id);
  if (!s) return;
  await famUpdate('fam_shopping', id, { purchased: !s.purchased });
}

// Mark a renewal done: 'once' completes it; recurring ones advance the due date.
async function famCompleteRenewal(id) {
  const r = _renewals.find(x => x.id === id);
  if (!r) return;
  if (r.frequency === 'once') {
    await famUpdate('fam_renewals', id, { completed: true, last_done: famToday() });
    return;
  }
  const d = new Date(r.due_date + 'T00:00:00');
  const months = { monthly: 1, quarterly: 3, annual: 12 }[r.frequency] || 12;
  d.setMonth(d.getMonth() + months);
  const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await famUpdate('fam_renewals', id, { due_date: next, last_done: famToday() });
}

// ── Overview helpers ──
// Everything with a date, merged and sorted: tasks (due), events, renewals.
function famDatedItems() {
  const items = [];
  for (const t of _tasks) {
    if (!t.completed && t.due_date) items.push({ kind: 'task', date: t.due_date, label: t.text, sub: t.person || t.category, id: t.id });
  }
  for (const e of _events) {
    if (!['declined', 'done'].includes(e.status) && e.event_date) {
      items.push({ kind: 'event', date: e.event_date, label: e.title, sub: [e.event_time, e.logistics].filter(Boolean).join(' · ') || e.status, id: e.id });
    }
  }
  for (const r of _renewals) {
    if (!r.completed) items.push({ kind: 'renewal', date: r.due_date, label: r.name, sub: r.frequency === 'once' ? 'deadline' : r.frequency, id: r.id });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
