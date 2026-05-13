// ── State ──
let todayItems   = [];   // items where item_date = today
let historyItems = [];   // items where item_date < today
let _currentUser = null;
let _view        = 'today';   // 'today' | 'history'
let _resetNeeded = false;
let _unfinishedCount = 0;

// ── Date helpers ──
function getTodayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── Load ──
async function loadTodayState() {
  const uid   = _currentUser.id;
  const today = getTodayDate();

  const { data, error } = await sb
    .from('today_items')
    .select('*')
    .eq('user_id', uid)
    .order('sort_order');

  if (error) { console.error('loadTodayState:', error); return; }

  const all = data || [];
  todayItems   = all.filter(i => i.item_date === today);
  historyItems = all.filter(i => i.item_date < today);

  const pastUncompleted = historyItems.filter(i => !i.completed);
  if (pastUncompleted.length > 0) {
    _resetNeeded     = true;
    _unfinishedCount = pastUncompleted.length;
  } else {
    _resetNeeded     = false;
    _unfinishedCount = 0;
  }
}

// ── Reset actions ──
async function carryForwardItems() {
  const uid   = _currentUser.id;
  const today = getTodayDate();

  const toCarry = historyItems.filter(i => !i.completed);
  if (!toCarry.length) { _resetNeeded = false; return; }

  // Determine next sort_order offset
  const maxOrder = todayItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
  let nextOrder = maxOrder + 1;

  await Promise.all(toCarry.map(item =>
    sb.from('today_items')
      .update({ item_date: today, sort_order: nextOrder++ })
      .eq('id', item.id)
  ));

  // Move them into todayItems locally
  toCarry.forEach(item => {
    item.item_date  = today;
    item.sort_order = nextOrder++;
    todayItems.push(item);
  });
  historyItems = historyItems.filter(i => i.completed);
  _resetNeeded = false;
}

async function archiveItems() {
  // Past items stay as-is; just dismiss the modal
  _resetNeeded = false;
}

// ── Auto-pull from Projects ──
async function autoPullFromProjects() {
  const uid   = _currentUser.id;
  const today = getTodayDate();

  // Only run if there are no project-sourced items today
  const alreadyPulled = todayItems.filter(i => i.source === 'project');
  if (alreadyPulled.length > 0) return;

  // Fetch the dashboard blob
  const { data: dashRows, error } = await sb
    .from('dashboards')
    .select('data')
    .eq('user_id', uid)
    .maybeSingle();

  if (error || !dashRows?.data?.projects) return;

  const projects = dashRows.data.projects || [];
  const todayParsed = new Date(today + 'T00:00:00');

  const candidates = [];

  for (const project of projects) {
    if (project.status !== 'in-progress') continue;

    const incompleteTasks = (project.tasks || []).filter(t => t.completedInEntry == null);
    if (!incompleteTasks.length) continue;

    // Score the project
    const priorityMap = { high: 3, medium: 2, low: 1 };
    const priorityScore = priorityMap[project.priority] || 0;

    let dueDateScore = 0;
    if (project.dueDate) {
      const due = new Date(project.dueDate + 'T00:00:00');
      const diffDays = Math.floor((due - todayParsed) / (1000 * 60 * 60 * 24));
      if (diffDays < 0)        dueDateScore = 5;  // overdue
      else if (diffDays === 0) dueDateScore = 4;  // due today
      else if (diffDays <= 3)  dueDateScore = 3;
      else if (diffDays <= 7)  dueDateScore = 2;
      else if (diffDays <= 14) dueDateScore = 1;
    }

    const score = priorityScore + dueDateScore;

    for (const task of incompleteTasks) {
      candidates.push({ task, project, score });
    }
  }

  if (!candidates.length) return;

  // Sort by score desc, take up to 5
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 5);

  const maxOrder = todayItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
  let nextOrder = maxOrder + 1;

  for (const { task, project } of top) {
    const row = {
      user_id:          uid,
      text:             task.text,
      completed:        false,
      source:           'project',
      source_ref_id:    project.id,
      source_ref_name:  project.name,
      sort_order:       nextOrder++,
      item_date:        today,
    };

    const { data: inserted, error: insErr } = await sb
      .from('today_items')
      .insert(row)
      .select()
      .single();

    if (!insErr && inserted) {
      todayItems.push(inserted);
    }
  }
}

// ── CRUD ──
async function addManualItem(text) {
  const uid   = _currentUser.id;
  const today = getTodayDate();
  const maxOrder = todayItems.reduce((m, i) => Math.max(m, i.sort_order), -1);

  const row = {
    user_id:    uid,
    text:       text.trim(),
    completed:  false,
    source:     'manual',
    sort_order: maxOrder + 1,
    item_date:  today,
  };

  const { data, error } = await sb
    .from('today_items')
    .insert(row)
    .select()
    .single();

  if (error) { console.error('addManualItem:', error); return; }
  todayItems.push(data);
}

async function toggleItem(id) {
  const item = todayItems.find(i => i.id === id);
  if (!item) return;

  const next = !item.completed;
  item.completed = next;

  // Re-assign sort_order: uncompleted items keep their order, completed ones get pushed to the end
  _resortItems();

  await sb
    .from('today_items')
    .update({ completed: next, sort_order: item.sort_order })
    .eq('id', id);
}

async function deleteItem(id) {
  todayItems = todayItems.filter(i => i.id !== id);
  await sb.from('today_items').delete().eq('id', id);
}

async function reorderItems(orderedIds) {
  orderedIds.forEach((id, i) => {
    const item = todayItems.find(it => it.id === id);
    if (item) item.sort_order = i;
  });
  todayItems.sort((a, b) => a.sort_order - b.sort_order);

  await Promise.all(orderedIds.map((id, i) =>
    sb.from('today_items').update({ sort_order: i }).eq('id', id)
  ));
}

// ── Helpers ──
function _resortItems() {
  const uncompleted = todayItems.filter(i => !i.completed).sort((a, b) => a.sort_order - b.sort_order);
  const completed   = todayItems.filter(i =>  i.completed).sort((a, b) => a.sort_order - b.sort_order);
  let order = 0;
  for (const item of uncompleted) item.sort_order = order++;
  for (const item of completed)   item.sort_order = order++;
  todayItems.sort((a, b) => a.sort_order - b.sort_order);
}

function getSortedTodayItems() {
  return [...todayItems].sort((a, b) => a.sort_order - b.sort_order);
}

function getHistoryGrouped() {
  // Group historyItems by date descending
  const map = new Map();
  for (const item of historyItems) {
    if (!map.has(item.item_date)) map.set(item.item_date, []);
    map.get(item.item_date).push(item);
  }
  // Sort dates descending
  const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  return sorted.map(([date, items]) => ({
    date,
    items: items.sort((a, b) => a.sort_order - b.sort_order),
  }));
}
