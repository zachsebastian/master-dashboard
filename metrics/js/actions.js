// ── View ──
function setView(v) { state.view = v; save(); render(); }
function toggleSidebar() { state.summarySidebarVisible = !state.summarySidebarVisible; save(); render(); }
function togglePresentation() { state.presentationMode = !state.presentationMode; save(); render(); }
function setActive(id, goDetail) {
  state.activeMetric = id;
  if (goDetail) state.view = 'detail';
  save(); render();
}
function toggleVisible(id) {
  state.metrics = state.metrics.map(m => m.id === id ? { ...m, visible: !m.visible } : m);
  save(); render();
}

// ── Modal ──
function openModal(type, extra) {
  modalData = extra ? { ...extra } : {};
  if (type === 'edit-metric') {
    const m = state.metrics.find(m => m.id === state.activeMetric);
    if (m) modalData = { name: m.name, color: m.color, fields: JSON.parse(JSON.stringify(m.fields)) };
  }
  if (type === 'edit-entry') {
    const m = state.metrics.find(m => m.id === state.activeMetric);
    const entry = m?.entries.find(e => e.id === extra.entryId);
    if (entry) modalData = { entryId: entry.id, period: entry.period, periodStart: entry.periodStart||'', periodEnd: entry.periodEnd||'', values: { ...entry.values }, why: entry.why||'', prediction: entry.prediction||'', proposal: entry.proposal||'' };
  }
  if (type === 'add-entry') {
    const r = rolling30();
    modalData = { periodStart: r.start, periodEnd: r.end, period: periodFromDates(r.start, r.end), values: {} };
  }
  state.modal = type;
  render();
}
function closeModal() { state.modal = null; modalData = {}; render(); }

// ── Rocks ──
function setMetricStatus(metricId, status) {
  if (!state.metricStatus) state.metricStatus = {};
  state.metricStatus[metricId] = status;
  save(); render();
}
function setMetricRock(metricId, rockId) {
  if (!state.metricRocks) state.metricRocks = {};
  state.metricRocks[metricId] = rockId || null;
  save(); render();
}
function setEntryIndex(metricId, idx) {
  if (!state.metricEntryIndex) state.metricEntryIndex = {};
  state.metricEntryIndex[metricId] = parseInt(idx, 10) || 0;
  save(); render();
}

// ── Period helpers ──
function updatePeriodLabel() {
  const s = document.getElementById('e-start')?.value || '';
  const e = document.getElementById('e-end')?.value || '';
  const lbl = periodFromDates(s, e);
  const el = document.getElementById('e-period');
  if (el && lbl) el.value = lbl;
  modalData.periodStart = s; modalData.periodEnd = e; modalData.period = lbl;
}
function clearEntryDates() {
  const s = document.getElementById('e-start');
  const e = document.getElementById('e-end');
  if (s) s.value = '';
  if (e) e.value = '';
  modalData.periodStart = ''; modalData.periodEnd = '';
}
function setRolling30() {
  const r = rolling30();
  const s = document.getElementById('e-start');
  const e = document.getElementById('e-end');
  if (s) s.value = r.start;
  if (e) e.value = r.end;
  updatePeriodLabel();
}

// ── Metric CRUD ──
function addField(type) {
  if (!modalData.fields) modalData.fields = [];
  modalData.fields.push({ id: 'f' + (modalData.fields.length + 1), name: '', type, formula: '' });
  render();
}
function saveNewMetric() {
  const name = (document.getElementById('md-name')?.value || '').trim();
  if (!name) return;
  const m = { id: 'm'+Date.now(), name, color: modalData.color || COLORS[0], visible: true, fields: (modalData.fields||[]).filter(f=>f.name.trim()), entries: [] };
  state.metrics.push(m);
  state.activeMetric = m.id;
  state.view = 'detail';
  state.modal = null; modalData = {};
  save(); render();
}
function saveEditMetric() {
  const name = (document.getElementById('md-name')?.value || '').trim();
  if (!name) return;
  state.metrics = state.metrics.map(m => m.id === state.activeMetric
    ? { ...m, name, color: modalData.color || m.color, fields: (modalData.fields||[]).filter(f=>f.name.trim()) }
    : m
  );
  state.modal = null; modalData = {};
  save(); render();
}
function deleteMetric(id) {
  if (!confirm('Delete this metric and all its entries?')) return;
  state.metrics = state.metrics.filter(m => m.id !== id);
  state.activeMetric = state.metrics[0]?.id || null;
  state.view = 'summary';
  state.modal = null;
  save(); render();
}
function moveMetric(metricId, delta) {
  const metrics = [...state.metrics];
  const idx = metrics.findIndex(m => m.id === metricId);
  if (idx < 0) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= metrics.length) return;
  const tmp = metrics[idx]; metrics[idx] = metrics[newIdx]; metrics[newIdx] = tmp;
  state.metrics = metrics;
  save(); render();
}

// ── Entry CRUD ──
function collectEntryData(metricId) {
  const pStart = document.getElementById('e-start')?.value || modalData.periodStart || '';
  const pEnd = document.getElementById('e-end')?.value || modalData.periodEnd || '';
  const label = (document.getElementById('e-period')?.value || '').trim() || periodFromDates(pStart, pEnd);
  if (!label) return null;
  const metric = state.metrics.find(m => m.id === metricId);
  if (!metric) return null;
  const values = {};
  metric.fields.filter(f => f.type === 'input').forEach(f => {
    const el = document.getElementById('ev-' + f.id);
    values[f.id] = el ? parseFloat(el.value) || 0 : 0;
  });
  const why = document.getElementById('e-why')?.value || '';
  const prediction = document.getElementById('e-prediction')?.value || '';
  const proposal = document.getElementById('e-proposal')?.value || '';
  return { period: label, periodStart: pStart, periodEnd: pEnd, values, why, prediction, proposal };
}
function saveEntry(metricId) {
  const data = collectEntryData(metricId);
  if (!data) return;
  const entry = { id: 'e'+Date.now(), ...data };
  state.metrics = state.metrics.map(m => m.id === metricId ? { ...m, entries: [entry, ...m.entries] } : m);
  state.modal = null; modalData = {};
  save(); render();
}
function saveEditEntry(metricId, entryId) {
  const data = collectEntryData(metricId);
  if (!data) return;
  state.metrics = state.metrics.map(m => {
    if (m.id !== metricId) return m;
    return { ...m, entries: m.entries.map(e => e.id === entryId ? { ...e, ...data } : e) };
  });
  state.modal = null; modalData = {};
  save(); render();
}
function deleteEntry(metricId, entryId) {
  const btn = document.querySelector(`[data-delete-entry="${entryId}"]`);
  if (btn && !btn.dataset.confirmed) {
    btn.dataset.confirmed = '1'; btn.textContent = 'Sure?'; btn.style.background = 'var(--red)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--red)';
    setTimeout(() => { if (btn) { delete btn.dataset.confirmed; btn.textContent = 'Remove'; btn.style.cssText = ''; } }, 2500);
    return;
  }
  state.metrics = state.metrics.map(m => m.id === metricId ? { ...m, entries: m.entries.filter(e => e.id !== entryId) } : m);
  save(); render();
}
function deleteEntryModal(metricId, entryId) {
  state.metrics = state.metrics.map(m => m.id === metricId ? { ...m, entries: m.entries.filter(e => e.id !== entryId) } : m);
  state.modal = null; modalData = {};
  save(); render();
}
function moveEntry(metricId, entryId, delta) {
  const m = state.metrics.find(m => m.id === metricId);
  if (!m) return;
  const entries = [...m.entries];
  const idx = entries.findIndex(e => e.id === entryId);
  if (idx < 0) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= entries.length) return;
  const tmp = entries[idx]; entries[idx] = entries[newIdx]; entries[newIdx] = tmp;
  state.metrics = state.metrics.map(m => m.id === metricId ? { ...m, entries } : m);
  save(); render();
}

// ── Task actions ──
let _editingTaskId = null;

function addTask(metricId) {
  const inp = document.getElementById('task-add-input-' + metricId);
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) return;
  const m = state.metrics.find(m => m.id === metricId);
  if (!m) return;
  if (!m.tasks) m.tasks = [];
  m.tasks.push({ id: 't' + Date.now(), name, status: 'not-started' });
  state.metrics = state.metrics.map(mx => mx.id === metricId ? m : mx);
  inp.value = '';
  save(); render();
}
function setTaskStatus(metricId, taskId, status) {
  state.metrics = state.metrics.map(m => {
    if (m.id !== metricId) return m;
    return { ...m, tasks: (m.tasks||[]).map(t => {
      if (t.id !== taskId) return t;
      const completedDate = status === 'complete' ? (t.completedDate || new Date().toISOString().slice(0, 10)) : (status !== 'complete' ? '' : t.completedDate);
      return { ...t, status, completedDate };
    })};
  });
  save(); render();
}
function setTaskCompletedDate(metricId, taskId, date) {
  state.metrics = state.metrics.map(m => {
    if (m.id !== metricId) return m;
    return { ...m, tasks: (m.tasks||[]).map(t => t.id === taskId ? { ...t, completedDate: date } : t) };
  });
  save();
}
function deleteTask(metricId, taskId) {
  const btn = document.querySelector(`[data-delete-task="${taskId}"]`);
  if (btn && !btn.dataset.confirmed) {
    btn.dataset.confirmed = '1'; btn.textContent = '?'; btn.style.color = 'var(--red)';
    setTimeout(() => { if (btn) { delete btn.dataset.confirmed; btn.textContent = '×'; btn.style.color = ''; } }, 2000);
    return;
  }
  state.metrics = state.metrics.map(m => m.id !== metricId ? m : { ...m, tasks: (m.tasks||[]).filter(t => t.id !== taskId) });
  save(); render();
}
function editTask(taskId) {
  _editingTaskId = taskId;
  render();
  const inp = document.getElementById('task-edit-' + taskId);
  if (inp) { inp.focus(); inp.select(); }
}
function saveTaskEdit(metricId, taskId) {
  const inp = document.getElementById('task-edit-' + taskId);
  if (!inp) return;
  const name = inp.value.trim();
  if (name) {
    state.metrics = state.metrics.map(m => m.id !== metricId ? m : { ...m, tasks: (m.tasks||[]).map(t => t.id === taskId ? { ...t, name } : t) });
    save();
  }
  _editingTaskId = null;
  render();
}
function cancelTaskEdit() { _editingTaskId = null; render(); }

function saveTaskNarrative(metricId) {
  const why = document.getElementById('tn-why')?.value || '';
  const prediction = document.getElementById('tn-prediction')?.value || '';
  const proposal = document.getElementById('tn-proposal')?.value || '';
  state.metrics = state.metrics.map(m => m.id !== metricId ? m : { ...m, why, prediction, proposal });
  save();
  const editPanel = document.getElementById('task-narrative-edit');
  const readPanel = document.getElementById('task-narrative-read');
  if (editPanel) editPanel.style.display = 'none';
  if (readPanel) {
    readPanel.style.display = 'block';
    const m = state.metrics.find(m => m.id === metricId);
    readPanel.innerHTML = renderTaskNarrativeRead(m);
  }
}

// ── Drag & drop ──
function initTaskDrag(metricId) {
  const rows = document.querySelectorAll('.task-row[data-task-id]');
  let dragSrc = null;
  rows.forEach(row => {
    row.addEventListener('dragstart', e => { dragSrc = row; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); document.querySelectorAll('.task-row.drag-over').forEach(r => r.classList.remove('drag-over')); dragSrc = null; });
    row.addEventListener('dragover', e => { e.preventDefault(); if (dragSrc && row !== dragSrc) { document.querySelectorAll('.task-row.drag-over').forEach(r => r.classList.remove('drag-over')); row.classList.add('drag-over'); } });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === row) return;
      const m = state.metrics.find(m => m.id === metricId);
      if (!m) return;
      const tasks = [...(m.tasks||[])];
      const fromIdx = tasks.findIndex(t => t.id === dragSrc.dataset.taskId);
      const toIdx = tasks.findIndex(t => t.id === row.dataset.taskId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = tasks.splice(fromIdx, 1); tasks.splice(toIdx, 0, moved);
      state.metrics = state.metrics.map(mx => mx.id === metricId ? { ...mx, tasks } : mx);
      const contentEl = document.querySelector('.content');
      const scrollTop = contentEl ? contentEl.scrollTop : 0;
      save(); render();
      requestAnimationFrame(() => { const el = document.querySelector('.content'); if (el) el.scrollTop = scrollTop; });
    });
  });
}

function initEntryDrag(metricId) {
  const rows = document.querySelectorAll('tr.entry-row[data-entry-id]');
  let dragSrc = null;
  rows.forEach(row => {
    row.addEventListener('dragstart', e => { dragSrc = row; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); document.querySelectorAll('tr.entry-row.drag-over').forEach(r => r.classList.remove('drag-over')); dragSrc = null; });
    row.addEventListener('dragover', e => { e.preventDefault(); if (dragSrc && row !== dragSrc) { document.querySelectorAll('tr.entry-row.drag-over').forEach(r => r.classList.remove('drag-over')); row.classList.add('drag-over'); } });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === row) return;
      const m = state.metrics.find(m => m.id === metricId);
      if (!m) return;
      const entries = [...(m.entries||[])];
      const fromIdx = entries.findIndex(en => en.id === dragSrc.dataset.entryId);
      const toIdx = entries.findIndex(en => en.id === row.dataset.entryId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = entries.splice(fromIdx, 1); entries.splice(toIdx, 0, moved);
      state.metrics = state.metrics.map(mx => mx.id === metricId ? { ...mx, entries } : mx);
      const contentEl = document.querySelector('.content');
      const scrollTop = contentEl ? contentEl.scrollTop : 0;
      save(); render();
      requestAnimationFrame(() => { const el = document.querySelector('.content'); if (el) el.scrollTop = scrollTop; });
    });
  });
}
