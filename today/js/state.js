// ── Tiny uid generator (matches projects module) ──
function _uid() { return Math.random().toString(36).slice(2, 9); }

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

  // Determine next sort_order offset — assign orders up front so DB + local state match
  const maxOrder = todayItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
  let nextOrder = maxOrder + 1;
  const sortOrders = toCarry.map(() => nextOrder++);

  await Promise.all(toCarry.map((item, i) =>
    sb.from('today_items')
      .update({ item_date: today, sort_order: sortOrders[i] })
      .eq('id', item.id)
  ));

  // Mirror into local state
  toCarry.forEach((item, i) => {
    item.item_date  = today;
    item.sort_order = sortOrders[i];
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
async function autoPullFromProjects(topUp = false) {
  const uid   = _currentUser.id;
  const today = getTodayDate();

  // On a normal boot, only pull if today's list is completely empty.
  // After carry-forward/archive (topUp=true), fill up to 5.
  if (!topUp && todayItems.length > 0) return;

  const uncompletedCount = todayItems.filter(i => !i.completed).length;
  const slotsOpen = 5 - uncompletedCount;
  if (slotsOpen <= 0) return;

  // Tasks already in today's list — skip by task id OR text to catch items without source_task_id
  const existingTaskIds = new Set(todayItems.map(i => i.source_task_id).filter(Boolean));
  const existingTexts   = new Set(todayItems.map(i => i.text.trim().toLowerCase()));

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

    // Build set of task IDs blocked by an active blocker on this project
    const blockedTaskIds = new Set(
      (project.blockers || [])
        .filter(b => typeof b === 'object' && !b.resolved && b.taskId)
        .map(b => b.taskId)
    );

    const incompleteTasks = (project.tasks || []).filter(
      t => t.completedInEntry == null
        && !existingTaskIds.has(t.id)
        && !existingTexts.has(t.text.trim().toLowerCase())
        && !blockedTaskIds.has(t.id)
    );
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

  // Sort by score desc, fill only the open slots
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, slotsOpen);

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
      source_task_id:   task.id,
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

  // Write-back: keep the originating project task in sync
  if (item.source === 'project' && item.source_ref_id) {
    await _syncProjectTask(item, next);
  }
}

// ── Sync a project task when its today_item is checked/unchecked ──
async function _syncProjectTask(item, completing) {
  const uid = _currentUser.id;

  // Load all dashboard rows so we can find the project
  const { data: dashRows } = await sb
    .from('dashboards')
    .select('data')
    .eq('user_id', uid);

  if (!dashRows?.length) return;

  // Find the row + project + task
  let targetRow = null;
  let targetProject = null;
  let targetTask = null;

  for (const row of dashRows) {
    const project = (row.data?.projects || []).find(p => p.id === item.source_ref_id);
    if (project) {
      // Match by task id if available, fall back to text match for older items
      const task = item.source_task_id
        ? (project.tasks || []).find(t => t.id === item.source_task_id)
        : (project.tasks || []).find(t => t.text.trim() === item.text.trim());
      if (task) {
        targetRow     = row;
        targetProject = project;
        targetTask    = task;
        // Backfill source_task_id so future toggles use the fast id-based path
        if (!item.source_task_id) {
          item.source_task_id = task.id;
          sb.from('today_items').update({ source_task_id: task.id }).eq('id', item.id);
        }
        break;
      }
    }
  }

  if (!targetRow || !targetProject || !targetTask) return;

  if (completing) {
    // Skip if already marked complete via a log entry
    if (targetTask.completedInEntry) return;

    const entryId = _uid();
    const entry = {
      id:         entryId,
      date:       getTodayDate(),
      note:       'Completed via Today List',
      nextSteps:  '',
      completion: 0,
      status:     targetProject.status || 'in-progress',
    };

    targetTask.completedInEntry = entryId;
    targetProject.entries = [...(targetProject.entries || []), entry];

    // Recalculate project completion %
    const tasks = targetProject.tasks || [];
    const pct   = tasks.length ? Math.round(tasks.filter(t => t.completedInEntry).length / tasks.length * 100) : 0;
    targetProject.completion = pct;
    entry.completion         = pct;

  } else {
    // Uncompleting — only reverse if the entry was auto-created by Today List
    if (!targetTask.completedInEntry) return;

    const entryId    = targetTask.completedInEntry;
    const entryIndex = (targetProject.entries || []).findIndex(
      e => e.id === entryId && e.note === 'Completed via Today List'
    );

    targetTask.completedInEntry = null;

    if (entryIndex !== -1) {
      targetProject.entries.splice(entryIndex, 1);
    }

    // Recalculate project completion %
    const tasks = targetProject.tasks || [];
    const pct   = tasks.length ? Math.round(tasks.filter(t => t.completedInEntry).length / tasks.length * 100) : 0;
    targetProject.completion = pct;
  }

  await sb
    .from('dashboards')
    .update({ data: targetRow.data, updated_at: new Date().toISOString() })
    .eq('user_id', uid);
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
