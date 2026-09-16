// ── UI state ──
let _famView    = 'overview';   // overview | tasks | discuss | shopping | events | renewals | people
let _famEdit    = null;         // { section, id } — row being edited in the expanded form
let _famResolvingTopic = null;  // topic id showing the outcome prompt
let _famSearchResult   = null;  // { code, result } | { code, error } — Dashboard ID search state

// ── Helpers ──
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function famFmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function famDateBadge(dateStr) {
  if (!dateStr) return '<span class="fam-td-muted">—</span>';
  const today = famToday();
  let cls = 'future';
  if (dateStr < today) cls = 'overdue';
  else if (dateStr === today) cls = 'today';
  else {
    const diff = (new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000;
    if (diff <= 7) cls = 'soon';
  }
  return `<span class="fam-date-badge ${cls}">${escHtml(famFmtDate(dateStr))}</span>`;
}

function famCap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function famOpts(values, selected) {
  return values.map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${famCap(v)}</option>`).join('');
}

const FAM_REPEAT_LABELS = { none: 'No repeat', daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };
function famRepeatOpts(selected) {
  return FAM_TASK_REPEATS.map(v =>
    `<option value="${v}"${v === (selected || 'none') ? ' selected' : ''}>${FAM_REPEAT_LABELS[v]}</option>`).join('');
}

// Person picker fed by household members (keeps a stale value selectable).
function famMemberSelect(id, selected, blankLabel) {
  const names = famMemberNames();
  if (selected && !names.includes(selected)) names.push(selected);
  return `
    <select class="fam-select" id="${id}">
      <option value="">${escHtml(blankLabel || '— Who? —')}</option>
      ${names.map(n => `<option value="${escHtml(n)}"${n === selected ? ' selected' : ''}>${escHtml(n)}</option>`).join('')}
    </select>`;
}

function famIsEditing(section, id) {
  return _famEdit && _famEdit.section === section && _famEdit.id === id;
}

function famRowBtns(section, table, id) {
  return `
    <button class="fam-icon-btn" data-fam-edit="${section}|${id}" title="Edit">✎</button>
    <button class="fam-icon-btn danger" data-fam-del="${table}|${id}" title="Delete">×</button>`;
}

function famEditActions() {
  return `
    <div class="fam-inline-actions">
      <button class="btn btn-sm btn-primary" id="fam-edit-save">Save</button>
      <button class="btn btn-sm" id="fam-edit-cancel">Cancel</button>
    </div>`;
}

// ── Loading ──
function renderLoading() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
}

// ── Top-level render ──
const FAM_TABS = [
  ['overview', 'Overview'], ['tasks', 'To-Dos'], ['discuss', 'Discuss'],
  ['shopping', 'Shopping'], ['events', 'Events'], ['renewals', 'Renewals'],
  ['people', 'People'],
];

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const counts = {
    tasks:    _tasks.filter(t => !t.completed).length,
    discuss:  _topics.filter(t => !t.resolved).length,
    shopping: _shopping.filter(s => !s.purchased).length,
    events:   _events.filter(e => !['declined', 'done'].includes(e.status)).length,
    renewals: _renewals.filter(r => !r.completed).length,
  };

  const sections = {
    overview: _renderOverview, tasks: _renderTasks, discuss: _renderDiscuss,
    shopping: _renderShopping, events: _renderEvents, renewals: _renderRenewals,
    people: _renderPeople,
  };

  app.innerHTML = `
    <div class="fam-wrap">
      <div class="fam-tabs">
        ${FAM_TABS.map(([id, label]) => `
          <button class="fam-tab${_famView === id ? ' active' : ''}" data-fam-tab="${id}">
            ${label}${counts[id] ? `<span class="fam-tab-count">${counts[id]}</span>` : ''}
          </button>`).join('')}
      </div>
      ${(sections[_famView] || _renderOverview)()}
    </div>`;

  bindFamEvents();
}

// ── Overview ──
function _renderOverview() {
  const today = famToday();
  const dated = famDatedItems();
  const horizon = new Date(new Date(today + 'T00:00:00').getTime() + 14 * 86400000).toISOString().slice(0, 10);
  const overdue  = dated.filter(i => i.date < today);
  const upcoming = dated.filter(i => i.date >= today && i.date <= horizon);
  const openTopics = _topics.filter(t => !t.resolved);
  const shopOpen = _shopping.filter(s => !s.purchased);

  const item = i => `
    <div class="fam-ov-item">
      <span class="fam-ov-kind ${i.kind}">${i.kind === 'task' ? 'To-Do' : famCap(i.kind)}</span>
      <span class="fam-ov-label">${escHtml(i.label)}</span>
      ${i.sub ? `<span class="fam-ov-sub">${escHtml(i.sub)}</span>` : ''}
      ${famDateBadge(i.date)}
    </div>`;

  const storeCounts = {};
  shopOpen.forEach(s => { storeCounts[s.store] = (storeCounts[s.store] || 0) + 1; });

  return `
    ${overdue.length ? `
    <div class="fam-card fam-card--alert">
      <div class="fam-card-title">⚠️ Needs attention (${overdue.length})</div>
      ${overdue.map(item).join('')}
    </div>` : ''}
    <div class="fam-card">
      <div class="fam-card-title">📅 Next 14 days</div>
      ${upcoming.length ? upcoming.map(item).join('') : `<div class="fam-empty">Nothing scheduled. Enjoy the quiet.</div>`}
    </div>
    <div class="fam-card">
      <div class="fam-card-title">💬 Waiting to be brought up</div>
      ${openTopics.length ? openTopics.map(t => `
        <div class="fam-ov-item">
          <span class="fam-ov-label">${escHtml(t.text)}</span>
          ${t.with_whom ? `<span class="fam-ov-sub">with ${escHtml(t.with_whom)}</span>` : ''}
        </div>`).join('') : `<div class="fam-empty">No open discussion topics.</div>`}
    </div>
    <div class="fam-card">
      <div class="fam-card-title">🛒 Shopping list</div>
      ${shopOpen.length
        ? `<div class="fam-ov-stores">${Object.entries(storeCounts).map(([store, n]) =>
            `<span class="fam-store-pill">${famCap(store)} · ${n}</span>`).join('')}</div>`
        : `<div class="fam-empty">Nothing on the list.</div>`}
    </div>`;
}

// ── Table scaffolding ──
function famTable(mod, headers, rowsHtml) {
  return `
    <div class="fam-table fam-table--${mod}">
      <div class="fam-thead">${headers.map(h => `<div class="fam-th">${h}</div>`).join('')}</div>
      ${rowsHtml}
    </div>`;
}

// ── To-Dos ──
function _renderTasks() {
  const open = _tasks.filter(t => !t.completed)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const done = _tasks.filter(t => t.completed);

  const rows = open.map(t => famIsEditing('tasks', t.id) ? `
    <div class="fam-tr-wide fam-edit-form">
      <div class="fam-edit-grid">
        <input class="fam-input fam-grow" id="fam-e-text" value="${escHtml(t.text)}" maxlength="500">
        <select class="fam-select" id="fam-e-cat">${famOpts(FAM_TASK_CATS, t.category)}</select>
        ${famMemberSelect('fam-e-person', t.person || '', '— Who? —')}
        <input class="fam-input" type="date" id="fam-e-due" value="${escHtml(t.due_date || '')}">
        <select class="fam-select" id="fam-e-repeat">${famRepeatOpts(t.repeat)}</select>
        <input class="fam-input fam-grow" id="fam-e-notes" placeholder="Notes…" value="${escHtml(t.notes || '')}" maxlength="500">
      </div>
      ${famEditActions()}
    </div>` : `
    <div class="fam-tr">
      <div class="fam-td"><div class="fam-check" data-fam-toggle="fam_tasks|${t.id}" title="${t.repeat && t.repeat !== 'none' ? `Done — rolls forward (${t.repeat})` : 'Mark complete'}"></div></div>
      <div class="fam-td fam-td-main"><span class="fam-row-text">${escHtml(t.text)}</span>
        ${t.notes ? `<div class="fam-td-note">${escHtml(t.notes)}</div>` : ''}</div>
      <div class="fam-td"><span class="fam-cat-pill">${famCap(t.category)}</span></div>
      <div class="fam-td">${t.person ? escHtml(t.person) : '<span class="fam-td-muted">—</span>'}</div>
      <div class="fam-td">${famDateBadge(t.due_date)}${t.repeat && t.repeat !== 'none' ? ` <span class="fam-repeat-pill" title="Repeats ${t.repeat === 'biweekly' ? 'every 2 weeks' : t.repeat}">↻</span>` : ''}</div>
      <div class="fam-td fam-td-actions">${famRowBtns('tasks', 'fam_tasks', t.id)}</div>
    </div>`).join('');

  return `
    <div class="fam-add-card">
      <input class="fam-input fam-grow" id="fam-task-text" placeholder="Add a to-do… (e.g. Schedule dentist for Ellie)" maxlength="500">
      <select class="fam-select" id="fam-task-cat">${famOpts(FAM_TASK_CATS, 'other')}</select>
      ${famMemberSelect('fam-task-person', '', '— Who? —')}
      <input class="fam-input" type="date" id="fam-task-due">
      <select class="fam-select" id="fam-task-repeat" title="Repeat">${famRepeatOpts('none')}</select>
      <button class="btn btn-primary" id="fam-task-add">Add</button>
    </div>
    ${open.length
      ? famTable('tasks', ['', 'Task', 'Category', 'Who', 'Due', ''], rows)
      : `<div class="fam-empty">No open to-dos.</div>`}
    ${done.length ? `
      <div class="fam-divider">Completed (${done.length})</div>
      <div class="fam-list">
        ${done.map(t => `
          <div class="fam-row done">
            <div class="fam-check checked" data-fam-toggle="fam_tasks|${t.id}"></div>
            <div class="fam-row-body"><span class="fam-row-text">${escHtml(t.text)}</span></div>
            <div class="fam-row-actions"><button class="fam-icon-btn danger" data-fam-del="fam_tasks|${t.id}" title="Delete">×</button></div>
          </div>`).join('')}
      </div>` : ''}`;
}

// ── Discuss ──
function _renderDiscuss() {
  const open = _topics.filter(t => !t.resolved);
  const resolved = _topics.filter(t => t.resolved);

  const rows = open.map(t => {
    if (famIsEditing('discuss', t.id)) return `
      <div class="fam-tr-wide fam-edit-form">
        <div class="fam-edit-grid">
          <input class="fam-input fam-grow" id="fam-e-text" value="${escHtml(t.text)}" maxlength="500">
          ${famMemberSelect('fam-e-who', t.with_whom || '', '— With whom? —')}
        </div>
        ${famEditActions()}
      </div>`;
    if (_famResolvingTopic === t.id) return `
      <div class="fam-tr-wide">
        <span class="fam-row-text">${escHtml(t.text)}</span>
        <input class="fam-input" id="fam-topic-outcome" placeholder="What was decided? (optional)" maxlength="500">
        <div class="fam-inline-actions">
          <button class="btn btn-sm btn-primary" data-fam-topic-confirm="${t.id}">Mark discussed</button>
          <button class="btn btn-sm" data-fam-topic-cancel="1">Cancel</button>
        </div>
      </div>`;
    return `
      <div class="fam-tr">
        <div class="fam-td"><div class="fam-check" data-fam-topic-resolve="${t.id}" title="Mark discussed"></div></div>
        <div class="fam-td fam-td-main"><span class="fam-row-text">${escHtml(t.text)}</span></div>
        <div class="fam-td">${t.with_whom ? escHtml(t.with_whom) : '<span class="fam-td-muted">—</span>'}</div>
        <div class="fam-td fam-td-actions">${famRowBtns('discuss', 'fam_topics', t.id)}</div>
      </div>`;
  }).join('');

  return `
    <div class="fam-add-card">
      <input class="fam-input fam-grow" id="fam-topic-text" placeholder="Something to bring up… (e.g. Ask about Magic night on 10/7)" maxlength="500">
      ${famMemberSelect('fam-topic-who', '', '— With whom? —')}
      <button class="btn btn-primary" id="fam-topic-add">Add</button>
    </div>
    ${open.length
      ? famTable('discuss', ['', 'Topic', 'With', ''], rows)
      : `<div class="fam-empty">Nothing waiting to be discussed.</div>`}
    ${resolved.length ? `
      <div class="fam-divider">Discussed (${resolved.length})</div>
      <div class="fam-list">
        ${resolved.map(t => `
          <div class="fam-row done">
            <div class="fam-check checked" data-fam-topic-resolve="${t.id}" title="Reopen"></div>
            <div class="fam-row-body">
              <span class="fam-row-text">${escHtml(t.text)}</span>
              ${t.outcome ? `<div class="fam-outcome">↳ ${escHtml(t.outcome)}</div>` : ''}
            </div>
            <div class="fam-row-actions"><button class="fam-icon-btn danger" data-fam-del="fam_topics|${t.id}" title="Delete">×</button></div>
          </div>`).join('')}
      </div>` : ''}`;
}

// ── Shopping ──
function _renderShopping() {
  const open = _shopping.filter(s => !s.purchased);
  const bought = _shopping.filter(s => s.purchased);

  const byStore = {};
  open.forEach(s => { (byStore[s.store] = byStore[s.store] || []).push(s); });
  const storeOrder = FAM_STORES.filter(s => byStore[s]);

  const rows = list => list.map(s => famIsEditing('shopping', s.id) ? `
    <div class="fam-tr-wide fam-edit-form">
      <div class="fam-edit-grid">
        <input class="fam-input fam-grow" id="fam-e-item" value="${escHtml(s.item)}" maxlength="300">
        <select class="fam-select" id="fam-e-store">${famOpts(FAM_STORES, s.store)}</select>
        <select class="fam-select" id="fam-e-cat">${famOpts(FAM_SHOP_CATS, s.category)}</select>
        <input class="fam-input fam-grow" id="fam-e-note" placeholder="Note…" value="${escHtml(s.note || '')}" maxlength="300">
      </div>
      ${famEditActions()}
    </div>` : `
    <div class="fam-tr">
      <div class="fam-td"><div class="fam-check" data-fam-toggle="fam_shopping|${s.id}"></div></div>
      <div class="fam-td fam-td-main"><span class="fam-row-text">${escHtml(s.item)}</span></div>
      <div class="fam-td"><span class="fam-cat-pill">${famCap(s.category)}</span></div>
      <div class="fam-td">${s.note ? escHtml(s.note) : '<span class="fam-td-muted">—</span>'}</div>
      <div class="fam-td fam-td-actions">${famRowBtns('shopping', 'fam_shopping', s.id)}</div>
    </div>`).join('');

  return `
    <div class="fam-add-card">
      <input class="fam-input fam-grow" id="fam-shop-item" placeholder="Add an item… (e.g. Formula — the purple can)" maxlength="300">
      <select class="fam-select" id="fam-shop-store">${famOpts(FAM_STORES, 'any')}</select>
      <select class="fam-select" id="fam-shop-cat">${famOpts(FAM_SHOP_CATS, 'grocery')}</select>
      <button class="btn btn-primary" id="fam-shop-add">Add</button>
    </div>
    ${open.length ? storeOrder.map(store => `
      <div class="fam-store-group">
        <div class="fam-store-header">${famCap(store)} <span class="fam-store-count">${byStore[store].length}</span></div>
        ${famTable('shopping', ['', 'Item', 'Category', 'Note', ''], rows(byStore[store]))}
      </div>`).join('') : `<div class="fam-empty">Shopping list is empty.</div>`}
    ${bought.length ? `
      <div class="fam-divider">
        In the cart (${bought.length})
        <button class="btn btn-sm" id="fam-shop-clear">Clear purchased</button>
      </div>
      <div class="fam-list">
        ${bought.map(s => `
          <div class="fam-row done">
            <div class="fam-check checked" data-fam-toggle="fam_shopping|${s.id}"></div>
            <div class="fam-row-body"><span class="fam-row-text">${escHtml(s.item)}</span></div>
            <div class="fam-row-actions"><button class="fam-icon-btn danger" data-fam-del="fam_shopping|${s.id}" title="Delete">×</button></div>
          </div>`).join('')}
      </div>` : ''}`;
}

// ── Events ──
function _renderEvents() {
  const today = famToday();
  const active = _events.filter(e => !['declined', 'done'].includes(e.status) && (!e.event_date || e.event_date >= today))
    .sort((a, b) => (a.event_date || '9999').localeCompare(b.event_date || '9999'));
  const past = _events.filter(e => ['declined', 'done'].includes(e.status) || (e.event_date && e.event_date < today));

  const row = e => famIsEditing('events', e.id) ? `
    <div class="fam-tr-wide fam-edit-form">
      <div class="fam-edit-grid">
        <input class="fam-input fam-grow" id="fam-e-title" value="${escHtml(e.title)}" maxlength="300">
        <input class="fam-input" type="date" id="fam-e-date" value="${escHtml(e.event_date || '')}">
        <input class="fam-input fam-sm" id="fam-e-time" placeholder="Time" value="${escHtml(e.event_time || '')}" maxlength="30">
        <input class="fam-input fam-md" id="fam-e-logistics" placeholder="Logistics" value="${escHtml(e.logistics || '')}" maxlength="300">
        <input class="fam-input fam-sm" type="number" step="0.01" id="fam-e-cost" placeholder="Cost $" value="${e.cost != null ? escHtml(String(e.cost)) : ''}">
        <input class="fam-input fam-grow" id="fam-e-notes" placeholder="Notes…" value="${escHtml(e.notes || '')}" maxlength="500">
      </div>
      ${famEditActions()}
    </div>` : `
    <div class="fam-tr${['declined', 'done'].includes(e.status) ? ' done' : ''}">
      <div class="fam-td fam-td-main"><span class="fam-row-text">${escHtml(e.title)}</span>
        ${e.notes ? `<div class="fam-td-note">${escHtml(e.notes)}</div>` : ''}</div>
      <div class="fam-td">${famDateBadge(e.event_date)}</div>
      <div class="fam-td">${e.event_time ? escHtml(e.event_time) : '<span class="fam-td-muted">—</span>'}</div>
      <div class="fam-td">${e.logistics ? escHtml(e.logistics) : '<span class="fam-td-muted">—</span>'}</div>
      <div class="fam-td">${e.cost != null ? '$' + escHtml(String(e.cost)) : '<span class="fam-td-muted">—</span>'}</div>
      <div class="fam-td"><select class="fam-select fam-status-select ${e.status}" data-fam-event-status="${e.id}">${famOpts(FAM_EVENT_STATS, e.status)}</select></div>
      <div class="fam-td fam-td-actions">${famRowBtns('events', 'fam_events', e.id)}</div>
    </div>`;

  const headers = ['Event', 'Date', 'Time', 'Logistics', 'Cost', 'Status', ''];

  return `
    <div class="fam-add-card fam-add-card--wrap">
      <input class="fam-input fam-grow" id="fam-event-title" placeholder="Add an event or plan… (e.g. Magic night at Chris's)" maxlength="300">
      <input class="fam-input" type="date" id="fam-event-date">
      <input class="fam-input fam-sm" id="fam-event-time" placeholder="Time" maxlength="30">
      <input class="fam-input fam-md" id="fam-event-logistics" placeholder="Logistics (who's taking whom?)" maxlength="300">
      <input class="fam-input fam-sm" type="number" step="0.01" id="fam-event-cost" placeholder="Cost $">
      <select class="fam-select" id="fam-event-status">${famOpts(FAM_EVENT_STATS, 'idea')}</select>
      <button class="btn btn-primary" id="fam-event-add">Add</button>
    </div>
    ${active.length
      ? famTable('events', headers, active.map(row).join(''))
      : `<div class="fam-empty">No upcoming events or plans.</div>`}
    ${past.length ? `
      <div class="fam-divider">Past / settled (${past.length})</div>
      ${famTable('events', headers, past.map(row).join(''))}` : ''}`;
}

// ── Renewals ──
function _renderRenewals() {
  const active = _renewals.filter(r => !r.completed);
  const done = _renewals.filter(r => r.completed);

  const rows = active.map(r => famIsEditing('renewals', r.id) ? `
    <div class="fam-tr-wide fam-edit-form">
      <div class="fam-edit-grid">
        <input class="fam-input fam-grow" id="fam-e-name" value="${escHtml(r.name)}" maxlength="300">
        <select class="fam-select" id="fam-e-cat">${famOpts(FAM_RENEW_CATS, r.category)}</select>
        <input class="fam-input" type="date" id="fam-e-due" value="${escHtml(r.due_date)}">
        <select class="fam-select" id="fam-e-freq">${famOpts(FAM_RENEW_FREQS, r.frequency)}</select>
        <input class="fam-input fam-grow" id="fam-e-notes" placeholder="Notes…" value="${escHtml(r.notes || '')}" maxlength="500">
      </div>
      ${famEditActions()}
    </div>` : `
    <div class="fam-tr">
      <div class="fam-td fam-td-main"><span class="fam-row-text">${escHtml(r.name)}</span>
        ${r.notes ? `<div class="fam-td-note">${escHtml(r.notes)}</div>` : ''}</div>
      <div class="fam-td"><span class="fam-cat-pill">${famCap(r.category)}</span></div>
      <div class="fam-td">${r.frequency === 'once' ? 'One-time' : famCap(r.frequency)}</div>
      <div class="fam-td">${famDateBadge(r.due_date)}</div>
      <div class="fam-td">${r.last_done ? escHtml(famFmtDate(r.last_done)) : '<span class="fam-td-muted">—</span>'}</div>
      <div class="fam-td fam-td-actions">
        <button class="btn btn-sm" data-fam-renew-done="${r.id}" title="${r.frequency === 'once' ? 'Mark complete' : 'Mark done — advances the due date'}">✓ Done</button>
        ${famRowBtns('renewals', 'fam_renewals', r.id)}
      </div>
    </div>`).join('');

  return `
    <div class="fam-add-card fam-add-card--wrap">
      <input class="fam-input fam-grow" id="fam-renew-name" placeholder="Add a renewal, refill, or deadline… (e.g. COBA license, dog flea meds)" maxlength="300">
      <select class="fam-select" id="fam-renew-cat">${famOpts(FAM_RENEW_CATS, 'other')}</select>
      <input class="fam-input" type="date" id="fam-renew-due">
      <select class="fam-select" id="fam-renew-freq">${famOpts(FAM_RENEW_FREQS, 'once')}</select>
      <button class="btn btn-primary" id="fam-renew-add">Add</button>
    </div>
    ${active.length
      ? famTable('renewals', ['Name', 'Category', 'Frequency', 'Due', 'Last done', ''], rows)
      : `<div class="fam-empty">No renewals or deadlines tracked yet.</div>`}
    ${done.length ? `
      <div class="fam-divider">Completed (${done.length})</div>
      <div class="fam-list">
        ${done.map(r => `
          <div class="fam-row done">
            <div class="fam-row-body"><span class="fam-row-text">${escHtml(r.name)}</span></div>
            <div class="fam-row-actions"><button class="fam-icon-btn danger" data-fam-del="fam_renewals|${r.id}" title="Delete">×</button></div>
          </div>`).join('')}
      </div>` : ''}`;
}

// ── People ──
function _renderPeople() {
  const linked = _members.filter(m => m.linked_user_id);
  const others = _members.filter(m => !m.linked_user_id);

  const search = _famSearchResult;
  let searchHtml = '';
  if (search) {
    if (search.error) {
      searchHtml = `<div class="fam-search-result error">${escHtml(search.error)}</div>`;
    } else if (!search.result) {
      searchHtml = `<div class="fam-search-result error">No user with Dashboard ID <strong>${escHtml(search.code)}</strong> has the Family module enabled.</div>`;
    } else if (search.result.already_in_my_family) {
      searchHtml = `<div class="fam-search-result">✓ <strong>${escHtml(search.result.display_name)}</strong> is already in your family.</div>`;
    } else {
      searchHtml = `
        <div class="fam-search-result">
          Found <strong>${escHtml(search.result.display_name)}</strong>
          <button class="btn btn-sm btn-primary" id="fam-link-confirm" data-code="${escHtml(search.code)}">Add to my family</button>
        </div>`;
    }
  }

  const memberRow = m => famIsEditing('people', m.id) ? `
    <div class="fam-tr-wide fam-edit-form">
      <div class="fam-edit-grid">
        <input class="fam-input fam-grow" id="fam-e-name" value="${escHtml(m.name)}" maxlength="80">
        <select class="fam-select" id="fam-e-kind">${famOpts(FAM_MEMBER_KINDS, m.kind)}</select>
      </div>
      ${famEditActions()}
    </div>` : `
    <div class="fam-tr">
      <div class="fam-td fam-td-main"><span class="fam-row-text">${escHtml(m.name)}</span></div>
      <div class="fam-td"><span class="fam-cat-pill">${famCap(m.kind)}</span></div>
      <div class="fam-td">${m.linked_user_id
        ? `<span class="fam-linked-badge">🔗 Dashboard account${m.linked_user_id === _currentUser.id ? ' (you)' : ''}</span>`
        : '<span class="fam-td-muted">—</span>'}</div>
      <div class="fam-td fam-td-actions">
        ${m.linked_user_id === _currentUser.id ? '' : `
        <button class="fam-icon-btn" data-fam-edit="people|${m.id}" title="Edit">✎</button>
        <button class="fam-icon-btn danger" data-fam-member-del="${m.id}" title="Remove">×</button>`}
      </div>
    </div>`;

  return `
    <div class="fam-card">
      <div class="fam-card-title">Link a dashboard user</div>
      <p class="fam-hint">Search by Dashboard ID (found on their My Profile page). Only users with the Family module enabled are searchable. Linked members share this entire family board — they can see and edit everything here.</p>
      <div class="fam-add-card fam-add-card--flush">
        <input class="fam-input fam-grow" id="fam-search-code" placeholder="Dashboard ID, e.g. A1B2-C3D4" maxlength="20">
        <button class="btn btn-primary" id="fam-search-btn">Search</button>
      </div>
      ${searchHtml}
    </div>
    <div class="fam-card">
      <div class="fam-card-title">Add a family member</div>
      <p class="fam-hint">Kids, pets, and anyone without a dashboard account. They become selectable in the "Who?" fields across the module.</p>
      <div class="fam-add-card fam-add-card--flush">
        <input class="fam-input fam-grow" id="fam-member-name" placeholder="Name… (e.g. Ellie, Biscuit the dog)" maxlength="80">
        <select class="fam-select" id="fam-member-kind">${famOpts(FAM_MEMBER_KINDS, 'child')}</select>
        <button class="btn btn-primary" id="fam-member-add">Add</button>
      </div>
    </div>
    ${famTable('people', ['Name', 'Kind', 'Account', ''],
      [...linked, ...others].map(memberRow).join(''))}`;
}

// ── Edit form save: per-section field readers ──
const FAM_EDIT_READERS = {
  tasks: () => ({
    table: 'fam_tasks',
    patch: {
      text: document.getElementById('fam-e-text').value.trim(),
      category: document.getElementById('fam-e-cat').value,
      person: document.getElementById('fam-e-person').value || null,
      due_date: document.getElementById('fam-e-due').value || null,
      repeat: document.getElementById('fam-e-repeat').value,
      notes: document.getElementById('fam-e-notes').value.trim() || null,
    },
    valid: p => !!p.text,
  }),
  discuss: () => ({
    table: 'fam_topics',
    patch: {
      text: document.getElementById('fam-e-text').value.trim(),
      with_whom: document.getElementById('fam-e-who').value || null,
    },
    valid: p => !!p.text,
  }),
  shopping: () => ({
    table: 'fam_shopping',
    patch: {
      item: document.getElementById('fam-e-item').value.trim(),
      store: document.getElementById('fam-e-store').value,
      category: document.getElementById('fam-e-cat').value,
      note: document.getElementById('fam-e-note').value.trim() || null,
    },
    valid: p => !!p.item,
  }),
  events: () => {
    const cost = document.getElementById('fam-e-cost').value;
    return {
      table: 'fam_events',
      patch: {
        title: document.getElementById('fam-e-title').value.trim(),
        event_date: document.getElementById('fam-e-date').value || null,
        event_time: document.getElementById('fam-e-time').value.trim() || null,
        logistics: document.getElementById('fam-e-logistics').value.trim() || null,
        cost: cost === '' ? null : parseFloat(cost),
        notes: document.getElementById('fam-e-notes').value.trim() || null,
      },
      valid: p => !!p.title,
    };
  },
  renewals: () => ({
    table: 'fam_renewals',
    patch: {
      name: document.getElementById('fam-e-name').value.trim(),
      category: document.getElementById('fam-e-cat').value,
      due_date: document.getElementById('fam-e-due').value,
      frequency: document.getElementById('fam-e-freq').value,
      notes: document.getElementById('fam-e-notes').value.trim() || null,
    },
    valid: p => !!p.name && !!p.due_date,
  }),
  people: () => ({
    table: 'fam_members',
    patch: {
      name: document.getElementById('fam-e-name').value.trim(),
      kind: document.getElementById('fam-e-kind').value,
    },
    valid: p => !!p.name,
  }),
};

async function famSaveEdit() {
  if (!_famEdit) return;
  const { section, id } = _famEdit;
  const { table, patch, valid } = FAM_EDIT_READERS[section]();
  if (!valid(patch)) return;
  _famEdit = null;
  if (table === 'fam_members') {
    const m = _members.find(x => x.id === id);
    if (m) Object.assign(m, patch);
    await sb.from('fam_members').update(patch).eq('id', id);
  } else {
    await famUpdate(table, id, patch);
  }
  render();
}

// ── Events binding ──
function bindFamEvents() {
  // Tabs
  document.querySelectorAll('[data-fam-tab]').forEach(el => {
    el.addEventListener('click', () => {
      _famView = el.dataset.famTab; _famEdit = null; _famResolvingTopic = null; _famSearchResult = null; render();
    });
  });

  // Generic toggles (tasks + shopping)
  document.querySelectorAll('[data-fam-toggle]').forEach(el => {
    el.addEventListener('click', async () => {
      const [table, id] = el.dataset.famToggle.split('|');
      if (table === 'fam_tasks') await famToggleTask(id);
      else if (table === 'fam_shopping') await famToggleShopping(id);
      render();
    });
  });

  // Generic delete
  document.querySelectorAll('[data-fam-del]').forEach(el => {
    el.addEventListener('click', async () => {
      if (!confirm('Delete this item?')) return;
      const [table, id] = el.dataset.famDel.split('|');
      await famDelete(table, id);
      render();
    });
  });

  // Open edit form
  document.querySelectorAll('[data-fam-edit]').forEach(el => {
    el.addEventListener('click', () => {
      const [section, id] = el.dataset.famEdit.split('|');
      _famEdit = { section, id };
      _famResolvingTopic = null;
      render();
      const form = document.querySelector('.fam-edit-form');
      const first = form?.querySelector('input');
      if (first) { first.focus(); first.select(); }
    });
  });

  // Edit form save/cancel + keyboard
  document.getElementById('fam-edit-save')?.addEventListener('click', famSaveEdit);
  document.getElementById('fam-edit-cancel')?.addEventListener('click', () => { _famEdit = null; render(); });
  document.querySelectorAll('.fam-edit-form input, .fam-edit-form select').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); famSaveEdit(); }
      else if (e.key === 'Escape') { _famEdit = null; render(); }
    });
  });

  // Add: task
  _famBindAdd('fam-task-add', async () => {
    const text = document.getElementById('fam-task-text').value.trim();
    if (!text) return false;
    await famInsert('fam_tasks', {
      text,
      category: document.getElementById('fam-task-cat').value,
      person: document.getElementById('fam-task-person').value || null,
      due_date: document.getElementById('fam-task-due').value || null,
      repeat: document.getElementById('fam-task-repeat').value,
    });
    return true;
  });

  // Add: topic
  _famBindAdd('fam-topic-add', async () => {
    const text = document.getElementById('fam-topic-text').value.trim();
    if (!text) return false;
    await famInsert('fam_topics', {
      text,
      with_whom: document.getElementById('fam-topic-who').value || null,
    });
    return true;
  });

  // Add: shopping
  _famBindAdd('fam-shop-add', async () => {
    const item = document.getElementById('fam-shop-item').value.trim();
    if (!item) return false;
    await famInsert('fam_shopping', {
      item,
      store: document.getElementById('fam-shop-store').value,
      category: document.getElementById('fam-shop-cat').value,
    });
    return true;
  });

  // Add: event
  _famBindAdd('fam-event-add', async () => {
    const title = document.getElementById('fam-event-title').value.trim();
    if (!title) return false;
    const cost = document.getElementById('fam-event-cost').value;
    await famInsert('fam_events', {
      title,
      event_date: document.getElementById('fam-event-date').value || null,
      event_time: document.getElementById('fam-event-time').value.trim() || null,
      logistics: document.getElementById('fam-event-logistics').value.trim() || null,
      cost: cost === '' ? null : parseFloat(cost),
      status: document.getElementById('fam-event-status').value,
    });
    return true;
  });

  // Add: renewal
  _famBindAdd('fam-renew-add', async () => {
    const name = document.getElementById('fam-renew-name').value.trim();
    const due = document.getElementById('fam-renew-due').value;
    if (!name || !due) { if (name && !due) alert('Renewals need a due date.'); return false; }
    await famInsert('fam_renewals', {
      name,
      category: document.getElementById('fam-renew-cat').value,
      due_date: due,
      frequency: document.getElementById('fam-renew-freq').value,
    });
    return true;
  });

  // Add: member (no account)
  _famBindAdd('fam-member-add', async () => {
    const name = document.getElementById('fam-member-name').value.trim();
    if (!name) return false;
    await famMemberAdd(name, document.getElementById('fam-member-kind').value);
    return true;
  });

  // Member remove
  document.querySelectorAll('[data-fam-member-del]').forEach(el => {
    el.addEventListener('click', async () => {
      if (!confirm('Remove this person from your family? Their entries stay; a linked user loses access to this board.')) return;
      await famMemberRemove(el.dataset.famMemberDel);
      render();
    });
  });

  // Dashboard-ID search + link
  const searchBtn = document.getElementById('fam-search-btn');
  if (searchBtn) {
    const doSearch = async () => {
      const code = document.getElementById('fam-search-code').value.trim();
      if (!code) return;
      searchBtn.disabled = true;
      const res = await famSearchUser(code);
      searchBtn.disabled = false;
      _famSearchResult = { code, ...res };
      render();
    };
    searchBtn.addEventListener('click', doSearch);
    document.getElementById('fam-search-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  }
  const linkBtn = document.getElementById('fam-link-confirm');
  if (linkBtn) {
    linkBtn.addEventListener('click', async () => {
      linkBtn.disabled = true;
      const res = await famAddLinkedMember(linkBtn.dataset.code);
      _famSearchResult = res.error ? { code: linkBtn.dataset.code, error: res.error } : null;
      render();
    });
  }

  // Topic resolve flow
  document.querySelectorAll('[data-fam-topic-resolve]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.famTopicResolve;
      const topic = _topics.find(t => t.id === id);
      if (topic && !topic.resolved) { _famResolvingTopic = id; _famEdit = null; render(); document.getElementById('fam-topic-outcome')?.focus(); }
      else { await famToggleTopic(id); render(); }
    });
  });
  document.querySelectorAll('[data-fam-topic-confirm]').forEach(el => {
    el.addEventListener('click', async () => {
      const outcome = document.getElementById('fam-topic-outcome')?.value.trim() || null;
      const id = el.dataset.famTopicConfirm;
      _famResolvingTopic = null;
      await famToggleTopic(id, outcome);
      render();
    });
  });
  document.querySelectorAll('[data-fam-topic-cancel]').forEach(el => {
    el.addEventListener('click', () => { _famResolvingTopic = null; render(); });
  });

  // Event status select
  document.querySelectorAll('[data-fam-event-status]').forEach(el => {
    el.addEventListener('change', async () => {
      await famUpdate('fam_events', el.dataset.famEventStatus, { status: el.value });
      render();
    });
  });

  // Renewal done
  document.querySelectorAll('[data-fam-renew-done]').forEach(el => {
    el.addEventListener('click', async () => {
      await famCompleteRenewal(el.dataset.famRenewDone);
      render();
    });
  });

  // Clear purchased
  const clearBtn = document.getElementById('fam-shop-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Remove all purchased items?')) return;
      const bought = _shopping.filter(s => s.purchased).map(s => s.id);
      await Promise.all(bought.map(id => famDelete('fam_shopping', id)));
      render();
    });
  }
}

// Enter-in-first-input triggers the section's Add button; button handles insert + rerender.
function _famBindAdd(btnId, action) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const ok = await action();
    btn.disabled = false;
    if (ok) render();
  });
  const card = btn.closest('.fam-add-card');
  card?.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  });
}
