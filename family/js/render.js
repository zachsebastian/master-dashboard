// ── UI state ──
let _famView    = 'overview';   // overview | tasks | discuss | shopping | events | renewals
let _famEditing = null;         // { table, id, field } — row text being edited inline
let _famResolvingTopic = null;  // topic id showing the outcome prompt

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
  if (!dateStr) return '';
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

// Inline-editable text span (click ✎ elsewhere sets _famEditing)
function famText(table, id, field, value, cls) {
  const editing = _famEditing && _famEditing.table === table && _famEditing.id === id && _famEditing.field === field;
  if (editing) {
    return `<input class="fam-edit-input" id="fam-edit-input" data-table="${table}" data-id="${id}" data-field="${field}" value="${escHtml(value)}" maxlength="500">`;
  }
  return `<span class="${cls || 'fam-row-text'}">${escHtml(value)}</span>`;
}

function famRowBtns(table, id, field) {
  return `
    <button class="fam-icon-btn" data-fam-edit="${table}|${id}|${field}" title="Edit">✎</button>
    <button class="fam-icon-btn danger" data-fam-del="${table}|${id}" title="Delete">×</button>`;
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

// ── To-Dos ──
function _renderTasks() {
  const open = _tasks.filter(t => !t.completed)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const done = _tasks.filter(t => t.completed);

  return `
    <div class="fam-add-card">
      <input class="fam-input fam-grow" id="fam-task-text" placeholder="Add a to-do… (e.g. Schedule dentist for Ellie)" maxlength="500">
      <select class="fam-select" id="fam-task-cat">${famOpts(FAM_TASK_CATS, 'other')}</select>
      <input class="fam-input fam-sm" id="fam-task-person" placeholder="Who?" maxlength="60">
      <input class="fam-input" type="date" id="fam-task-due">
      <button class="btn btn-primary" id="fam-task-add">Add</button>
    </div>
    <div class="fam-list">
      ${open.length ? open.map(t => `
        <div class="fam-row">
          <div class="fam-check" data-fam-toggle="fam_tasks|${t.id}"></div>
          <div class="fam-row-body">
            ${famText('fam_tasks', t.id, 'text', t.text)}
            <div class="fam-row-meta">
              <span class="fam-cat-pill">${famCap(t.category)}</span>
              ${t.person ? `<span class="fam-meta-item">👤 ${escHtml(t.person)}</span>` : ''}
              ${famDateBadge(t.due_date)}
            </div>
          </div>
          <div class="fam-row-actions">${famRowBtns('fam_tasks', t.id, 'text')}</div>
        </div>`).join('') : `<div class="fam-empty">No open to-dos.</div>`}
    </div>
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

  return `
    <div class="fam-add-card">
      <input class="fam-input fam-grow" id="fam-topic-text" placeholder="Something to bring up… (e.g. Ask about Magic night on 10/7)" maxlength="500">
      <input class="fam-input fam-sm" id="fam-topic-who" placeholder="With whom?" maxlength="60">
      <button class="btn btn-primary" id="fam-topic-add">Add</button>
    </div>
    <div class="fam-list">
      ${open.length ? open.map(t => _famResolvingTopic === t.id ? `
        <div class="fam-row is-resolving">
          <div class="fam-row-body">
            <span class="fam-row-text">${escHtml(t.text)}</span>
            <input class="fam-input" id="fam-topic-outcome" placeholder="What was decided? (optional)" maxlength="500">
            <div class="fam-inline-actions">
              <button class="btn btn-sm btn-primary" data-fam-topic-confirm="${t.id}">Mark discussed</button>
              <button class="btn btn-sm" data-fam-topic-cancel="1">Cancel</button>
            </div>
          </div>
        </div>` : `
        <div class="fam-row">
          <div class="fam-check" data-fam-topic-resolve="${t.id}" title="Mark discussed"></div>
          <div class="fam-row-body">
            ${famText('fam_topics', t.id, 'text', t.text)}
            ${t.with_whom ? `<div class="fam-row-meta"><span class="fam-meta-item">with ${escHtml(t.with_whom)}</span></div>` : ''}
          </div>
          <div class="fam-row-actions">${famRowBtns('fam_topics', t.id, 'text')}</div>
        </div>`).join('') : `<div class="fam-empty">Nothing waiting to be discussed.</div>`}
    </div>
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
        <div class="fam-list">
          ${byStore[store].map(s => `
            <div class="fam-row">
              <div class="fam-check" data-fam-toggle="fam_shopping|${s.id}"></div>
              <div class="fam-row-body">
                ${famText('fam_shopping', s.id, 'item', s.item)}
                <div class="fam-row-meta">
                  <span class="fam-cat-pill">${famCap(s.category)}</span>
                  ${s.note ? `<span class="fam-meta-item">${escHtml(s.note)}</span>` : ''}
                </div>
              </div>
              <div class="fam-row-actions">${famRowBtns('fam_shopping', s.id, 'item')}</div>
            </div>`).join('')}
        </div>
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

  const row = e => `
    <div class="fam-row${['declined', 'done'].includes(e.status) ? ' done' : ''}">
      <div class="fam-row-body">
        ${famText('fam_events', e.id, 'title', e.title)}
        <div class="fam-row-meta">
          ${famDateBadge(e.event_date)}
          ${e.event_time ? `<span class="fam-meta-item">🕐 ${escHtml(e.event_time)}</span>` : ''}
          ${e.logistics ? `<span class="fam-meta-item">🚗 ${escHtml(e.logistics)}</span>` : ''}
          ${e.cost != null ? `<span class="fam-meta-item">💵 $${escHtml(String(e.cost))}</span>` : ''}
        </div>
      </div>
      <div class="fam-row-actions">
        <select class="fam-select fam-status-select ${e.status}" data-fam-event-status="${e.id}">${famOpts(FAM_EVENT_STATS, e.status)}</select>
        ${famRowBtns('fam_events', e.id, 'title')}
      </div>
    </div>`;

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
    <div class="fam-list">
      ${active.length ? active.map(row).join('') : `<div class="fam-empty">No upcoming events or plans.</div>`}
    </div>
    ${past.length ? `
      <div class="fam-divider">Past / settled (${past.length})</div>
      <div class="fam-list">${past.map(row).join('')}</div>` : ''}`;
}

// ── Renewals ──
function _renderRenewals() {
  const active = _renewals.filter(r => !r.completed);
  const done = _renewals.filter(r => r.completed);

  return `
    <div class="fam-add-card fam-add-card--wrap">
      <input class="fam-input fam-grow" id="fam-renew-name" placeholder="Add a renewal, refill, or deadline… (e.g. COBA license, dog flea meds)" maxlength="300">
      <select class="fam-select" id="fam-renew-cat">${famOpts(FAM_RENEW_CATS, 'other')}</select>
      <input class="fam-input" type="date" id="fam-renew-due">
      <select class="fam-select" id="fam-renew-freq">${famOpts(FAM_RENEW_FREQS, 'once')}</select>
      <button class="btn btn-primary" id="fam-renew-add">Add</button>
    </div>
    <div class="fam-list">
      ${active.length ? active.map(r => `
        <div class="fam-row">
          <div class="fam-row-body">
            ${famText('fam_renewals', r.id, 'name', r.name)}
            <div class="fam-row-meta">
              <span class="fam-cat-pill">${famCap(r.category)}</span>
              <span class="fam-meta-item">${r.frequency === 'once' ? 'One-time' : famCap(r.frequency)}</span>
              ${famDateBadge(r.due_date)}
              ${r.last_done ? `<span class="fam-meta-item">last done ${escHtml(famFmtDate(r.last_done))}</span>` : ''}
              ${r.notes ? `<span class="fam-meta-item">${escHtml(r.notes)}</span>` : ''}
            </div>
          </div>
          <div class="fam-row-actions">
            <button class="btn btn-sm" data-fam-renew-done="${r.id}" title="${r.frequency === 'once' ? 'Mark complete' : 'Mark done — advances the due date'}">✓ Done</button>
            ${famRowBtns('fam_renewals', r.id, 'name')}
          </div>
        </div>`).join('') : `<div class="fam-empty">No renewals or deadlines tracked yet.</div>`}
    </div>
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

// ── Events binding ──
function bindFamEvents() {
  // Tabs
  document.querySelectorAll('[data-fam-tab]').forEach(el => {
    el.addEventListener('click', () => { _famView = el.dataset.famTab; _famEditing = null; _famResolvingTopic = null; render(); });
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

  // Generic inline edit
  document.querySelectorAll('[data-fam-edit]').forEach(el => {
    el.addEventListener('click', () => {
      const [table, id, field] = el.dataset.famEdit.split('|');
      _famEditing = { table, id, field };
      render();
      const input = document.getElementById('fam-edit-input');
      if (input) { input.focus(); input.select(); }
    });
  });
  const editInput = document.getElementById('fam-edit-input');
  if (editInput) {
    const save = async () => {
      const { table, id, field } = editInput.dataset;
      const val = editInput.value.trim();
      _famEditing = null;
      if (val) await famUpdate(table, id, { [field]: val });
      render();
    };
    editInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { _famEditing = null; render(); }
    });
    editInput.addEventListener('blur', save);
  }

  // Add: task
  _famBindAdd('fam-task-add', async () => {
    const text = document.getElementById('fam-task-text').value.trim();
    if (!text) return false;
    await famInsert('fam_tasks', {
      text,
      category: document.getElementById('fam-task-cat').value,
      person: document.getElementById('fam-task-person').value.trim() || null,
      due_date: document.getElementById('fam-task-due').value || null,
    });
    return true;
  });

  // Add: topic
  _famBindAdd('fam-topic-add', async () => {
    const text = document.getElementById('fam-topic-text').value.trim();
    if (!text) return false;
    await famInsert('fam_topics', {
      text,
      with_whom: document.getElementById('fam-topic-who').value.trim() || null,
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

  // Topic resolve flow
  document.querySelectorAll('[data-fam-topic-resolve]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.famTopicResolve;
      const topic = _topics.find(t => t.id === id);
      if (topic && !topic.resolved) { _famResolvingTopic = id; render(); document.getElementById('fam-topic-outcome')?.focus(); }
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
