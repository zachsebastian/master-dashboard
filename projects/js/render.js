// ── Helpers ──
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
function byPriority(a, b) { return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1); }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function uid() { return Math.random().toString(36).slice(2, 9); }
function statusLabel(s) {
  return { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'done': 'Done', 'on-hold': 'On Hold' }[s] || s;
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dueMeta_(p) {
  if (!p.dueDate) return null;
  const due = new Date(p.dueDate + 'T12:00:00');
  const now = new Date();
  const days = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (p.status === 'done') return null;
  if (days < 0) return { label: `Overdue by ${-days}d`, cls: 'overdue' };
  if (days <= 7) return { label: `Due in ${days}d`, cls: 'soon' };
  return { label: `Due ${fmtDate(p.dueDate)}`, cls: '' };
}
function circleProgress(pct, color) {
  const r = 24, cx = 30, cy = 30;
  const circ = 2 * Math.PI * r;
  const full = pct >= 100;
  const dash = full ? circ : (pct / 100) * circ;
  const dashArray = full ? `${circ} 0` : `${dash} ${circ}`;
  const linecap = full ? 'butt' : 'round';
  return `<svg class="circ-svg" width="60" height="60" viewBox="0 0 60 60">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="5"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
      stroke-dasharray="${dashArray}" stroke-dashoffset="${circ / 4}" stroke-linecap="${linecap}"
      transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dasharray 0.5s ease"/>
  </svg>`;
}

// ── Render ──
function render() {
  renderSidebar();
  renderContent();
  updateThemeUI();
}

function renderSidebar() {
  const list = document.getElementById('project-list');
  const completedList = document.getElementById('completed-list');
  if (!list) return;
  const sidebar = document.getElementById('sidebar');
  if (state.sidebarOpen) sidebar.classList.remove('collapsed');
  else sidebar.classList.add('collapsed');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  if (toggleBtn) toggleBtn.textContent = state.sidebarOpen ? 'hide sidebar' : 'show sidebar';

  const activeProjects = state.projects.filter(p => p.status !== 'done').sort(byPriority);
  const completedProjects = state.projects.filter(p => p.status === 'done').sort(byPriority);

  const buildItem = p => {
    const active = p.id === state.activeProject ? 'active' : '';
    return `<div class="project-item ${active}" style="--item-color:${p.color}" onclick="selectProject('${p.id}')">
      <div class="p-dot" style="background:${p.color}"></div>
      <div class="p-body">
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-mini-progress">
          <div class="p-mini-fill" style="width:${p.completion}%;background:${p.color}"></div>
        </div>
      </div>
      <span class="status-pill ${p.status}">${statusLabel(p.status)}</span>
    </div>`;
  };

  list.innerHTML = activeProjects.length
    ? activeProjects.map(buildItem).join('')
    : `<div style="padding:8px;font-size:12px;color:var(--text-3)">No active projects.</div>`;

  if (completedList) {
    completedList.innerHTML = completedProjects.length
      ? completedProjects.map(buildItem).join('')
      : `<div style="padding:8px;font-size:12px;color:var(--text-3);font-style:italic">None yet.</div>`;
  }
}

function renderContent() {
  const el = document.getElementById('content');
  if (!el) return;
  if (state.view === 'summary') el.innerHTML = renderSummaryView();
  else el.innerHTML = renderDetailView();
  if (state.view === 'detail') {
    const p = state.projects.find(x => x.id === state.activeProject);
    if (p && p.entries.length > 1) drawChart(p);
  }
}

// ── Summary View ──
function renderSummaryView() {
  const projects = state.projects;
  const total = projects.length;
  const done = projects.filter(p => p.status === 'done').length;
  const inProg = projects.filter(p => p.status === 'in-progress').length;
  const openProjects = projects.filter(p => p.status !== 'done');
  const avgCompletion = openProjects.length ? Math.round(openProjects.reduce((s, p) => s + p.completion, 0) / openProjects.length) : 0;
  const overdue = projects.filter(p => p.dueDate && new Date(p.dueDate) < new Date() && p.status !== 'done').length;

  const strip = `<div class="summary-strip">
    <div class="summary-card"><div class="sc-label">Total</div><div class="sc-value">${total}</div><div class="sc-sub">projects</div></div>
    <div class="summary-card"><div class="sc-label">In Progress</div><div class="sc-value" style="color:var(--blue)">${inProg}</div><div class="sc-sub">active</div></div>
    <div class="summary-card"><div class="sc-label">Completed</div><div class="sc-value" style="color:var(--green)">${done}</div><div class="sc-sub">done</div></div>
    <div class="summary-card"><div class="sc-label">Avg. Progress</div><div class="sc-value">${avgCompletion}%</div><div class="sc-sub">overall</div></div>
    ${overdue ? `<div class="summary-card"><div class="sc-label">Overdue</div><div class="sc-value" style="color:var(--red)">${overdue}</div><div class="sc-sub">past due</div></div>` : ''}
  </div>`;

  if (!projects.length) {
    return strip + `<div class="empty-state">
      <div class="empty-icon">📂</div>
      <div class="empty-title">No projects yet</div>
      <div class="empty-sub">Click "Add project" in the sidebar to get started.</div>
    </div>`;
  }

  const buildCard = p => {
    const dueMeta = dueMeta_(p);
    const lastEntry = p.entries.length ? p.entries[p.entries.length - 1] : null;
    const totalTasks = (p.tasks || []).length;
    const doneTasks = (p.tasks || []).filter(t => t.completedInEntry).length;
    const remainingTasks = totalTasks - doneTasks;
    const taskRow = totalTasks > 0 ? `
      <div style="display:flex;gap:0;margin-top:8px;border:1px solid var(--border-md);border-radius:var(--r-sm);overflow:hidden">
        <div style="flex:1;padding:5px 8px;text-align:center;border-right:1px solid var(--border-md)">
          <div style="font-size:13px;font-weight:700;line-height:1.1">${totalTasks}</div>
          <div style="font-size:9px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-top:1px">Total</div>
        </div>
        <div style="flex:1;padding:5px 8px;text-align:center;border-right:1px solid var(--border-md)">
          <div style="font-size:13px;font-weight:700;line-height:1.1;color:var(--green)">${doneTasks}</div>
          <div style="font-size:9px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-top:1px">Done</div>
        </div>
        <div style="flex:1;padding:5px 8px;text-align:center">
          <div style="font-size:13px;font-weight:700;line-height:1.1;color:${remainingTasks > 0 ? 'var(--blue)' : 'var(--text-3)'}">${remainingTasks}</div>
          <div style="font-size:9px;color:var(--text-3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-top:1px">Left</div>
        </div>
      </div>` : '';
    const tagsRow = p.tags.length ? `<div class="project-card-meta-row">${p.tags.map(t => `<span class="chip tag">${esc(t)}</span>`).join('')}</div>` : '';
    const dueRow = dueMeta ? `<div class="project-card-meta-row"><span class="chip due ${dueMeta.cls}">📅 ${dueMeta.label}</span></div>` : '';
    const blockerRow = p.blockers.length ? `<div class="project-card-meta-row"><span class="chip" style="background:var(--red-bg);color:var(--red);border-color:transparent">⚠️ ${p.blockers.length} blocker${p.blockers.length > 1 ? 's' : ''}</span></div>` : '';
    return `<div class="project-card" onclick="openDetail('${p.id}')">
      <div class="project-card-stripe" style="background:${p.color}"></div>
      <div class="project-card-header">
        <div class="project-card-title">${esc(p.name)}</div>
        <div class="project-card-badges">
          <select class="status-select-inline ${p.status}" onclick="event.stopPropagation()" onchange="updateProjectStatus('${p.id}',this.value)">
            <option value="not-started" ${p.status === 'not-started' ? 'selected' : ''}>Not Started</option>
            <option value="in-progress" ${p.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="on-hold" ${p.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
            <option value="done" ${p.status === 'done' ? 'selected' : ''}>Done</option>
          </select>
          <select class="priority-select ${p.priority}" onclick="event.stopPropagation()" onchange="updateProjectPriority('${p.id}',this.value)">
            <option value="high" ${p.priority === 'high' ? 'selected' : ''}>High</option>
            <option value="medium" ${p.priority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="low" ${p.priority === 'low' ? 'selected' : ''}>Low</option>
          </select>
        </div>
      </div>
      <div class="project-card-body">
        <div>
          <div class="progress-track" style="margin-bottom:6px"><div class="progress-fill" style="width:${p.completion}%;background:${p.color}"></div></div>
          <div class="progress-label"><span>${lastEntry ? fmtDate(lastEntry.date) : 'No entries'}</span><span style="font-weight:700;color:var(--text)">${p.completion}%</span></div>
        </div>
        ${taskRow}
        ${dueRow}
        ${tagsRow}
        ${blockerRow}
      </div>
    </div>`;
  };

  const activeProjects = projects.filter(p => p.status !== 'done').sort(byPriority);
  const completedProjects = projects.filter(p => p.status === 'done').sort(byPriority);

  const completedSection = completedProjects.length ? `
    <div style="margin-top:36px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="font-size:16px;font-weight:700;letter-spacing:-0.3px;color:var(--text-2)">Completed Projects</div>
        <div style="font-size:12px;color:var(--text-3)">${completedProjects.length} project${completedProjects.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="project-grid" style="opacity:0.75">${completedProjects.map(buildCard).join('')}</div>
    </div>` : '';

  return `<div class="page-header">
    <div><div class="page-title">Projects</div><div class="page-subtitle">${total} project${total !== 1 ? 's' : ''} · ${inProg} in progress</div></div>
    <div class="page-header-right">
      <button class="btn btn-primary" onclick="openAddProjectModal()">+ Add project</button>
    </div>
  </div>
  ${strip}
  <div class="project-grid">${activeProjects.map(buildCard).join('')}</div>
  ${completedSection}`;
}

// ── Detail View ──
function renderDetailView() {
  const p = state.projects.find(x => x.id === state.activeProject);
  if (!p) {
    return `<div class="empty-state">
      <div class="empty-icon">👈</div>
      <div class="empty-title">Select a project</div>
      <div class="empty-sub">Choose a project from the sidebar to view details.</div>
    </div>`;
  }

  const dueMeta = dueMeta_(p);
  const sortedEntries = [...p.entries].sort((a, b) => new Date(b.date) - new Date(a.date));

  const entriesHTML = sortedEntries.length ? sortedEntries.map(e => `
    <div class="entry-row" onclick="openEditEntryModal('${p.id}','${e.id}')">
      <div class="entry-date">${fmtDate(e.date)}</div>
      <div class="entry-body">
        <div class="entry-pct">${e.completion}%
          <span class="entry-status-chip ${e.status}" style="background:${e.status === 'done' ? 'var(--green-bg)' : e.status === 'in-progress' ? 'var(--blue-bg)' : e.status === 'on-hold' ? 'var(--orange-bg)' : 'var(--surface-3)'};color:${e.status === 'done' ? 'var(--green)' : e.status === 'in-progress' ? 'var(--blue)' : e.status === 'on-hold' ? 'var(--orange)' : 'var(--text-3)'}">${statusLabel(e.status)}</span>
        </div>
        ${e.note ? `<div class="entry-note">${esc(e.note)}</div>` : ''}
        ${e.nextSteps ? `<div class="entry-meta-row"><span class="entry-meta-item">→ ${esc(e.nextSteps)}</span></div>` : ''}
      </div>
    </div>
  `).join('') : `<div style="padding:20px"><div class="entry-empty">No entries yet. Add your first progress update.</div></div>`;

  const tasks = p.tasks || [];
  const openTasks = tasks.filter(t => !t.completedInEntry);
  const doneTasks = tasks.filter(t => t.completedInEntry);
  const tasksHTML = tasks.length ? tasks.map(t => {
    const isDone = !!t.completedInEntry;
    const entry = isDone ? p.entries.find(e => e.id === t.completedInEntry) : null;
    return `<div class="task-row">
      <div class="task-text${isDone ? ' done' : ''}">${esc(t.text)}</div>
      ${isDone && entry ? `<span class="task-meta">Done ${fmtDate(entry.date)}</span>` : ''}
      ${!isDone ? `<div style="display:flex;gap:4px">
        <button class="btn btn-sm" style="padding:2px 7px;font-size:11px" onclick="openEditTaskModal('${p.id}','${t.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" style="padding:2px 7px;font-size:11px" onclick="deleteTask('${p.id}','${t.id}')">✕</button>
      </div>` : ''}
    </div>`;
  }).join('') : `<div style="padding:16px 20px;font-size:12px;color:var(--text-3);font-style:italic">No tasks yet.</div>`;

  const blockersHTML = p.blockers.length ? p.blockers.map((b, i) => `
    <div class="blocker-row">
      <div class="blocker-text">${esc(b)}</div>
      <button class="btn btn-sm" onclick="resolveBlocker('${p.id}',${i})" title="Mark resolved">✓</button>
    </div>
  `).join('') : `<div style="font-size:12px;color:var(--text-3);font-style:italic">No active blockers.</div>`;

  return `
  <button onclick="setView('summary')" style="background:none;border:none;cursor:pointer;font-size:12px;font-weight:600;color:var(--text-3);padding:0 0 14px 0;display:flex;align-items:center;gap:4px;transition:color 0.1s" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text-3)'">← Back to Summary</button>
  <div class="detail-header">
    <div>
      <div class="detail-title" style="color:${p.color}">${esc(p.name)}</div>
      <div class="detail-subtitle">${esc(p.description || '')}</div>
    </div>
    <div class="detail-actions">
      <button class="btn btn-sm" onclick="openEditProjectModal('${p.id}')">✏️ Edit</button>
      <button class="btn btn-sm btn-primary" onclick="openAddEntryModal('${p.id}')">+ Log Update</button>
      <button class="btn btn-sm btn-danger" onclick="deleteProject('${p.id}')">Delete</button>
    </div>
  </div>

  <div class="chip-row" style="margin-bottom:20px">
    <select class="status-select-inline ${p.status}" onchange="updateProjectStatus('${p.id}',this.value)">
      <option value="not-started" ${p.status === 'not-started' ? 'selected' : ''}>Not Started</option>
      <option value="in-progress" ${p.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
      <option value="on-hold" ${p.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
      <option value="done" ${p.status === 'done' ? 'selected' : ''}>Done</option>
    </select>
    <select class="priority-select ${p.priority}" onchange="updateProjectPriority('${p.id}',this.value)">
      <option value="high" ${p.priority === 'high' ? 'selected' : ''}>High</option>
      <option value="medium" ${p.priority === 'medium' ? 'selected' : ''}>Medium</option>
      <option value="low" ${p.priority === 'low' ? 'selected' : ''}>Low</option>
    </select>
    ${dueMeta ? `<span class="chip due ${dueMeta.cls}">📅 ${dueMeta.label}</span>` : ''}
    ${p.tags.map(t => `<span class="chip tag">${esc(t)}</span>`).join('')}
  </div>

  <div class="panel" style="margin-bottom:16px">
    <div class="panel-header"><span class="panel-title">Progress</span></div>
    <div style="padding:16px 20px 4px">
      <div class="circ-wrap">
        ${circleProgress(p.completion, p.color)}
        <div>
          <div class="circ-pct">${p.completion}% complete</div>
          <div class="circ-label">${p.entries.length} update${p.entries.length !== 1 ? 's' : ''} logged</div>
        </div>
      </div>
      <div class="progress-track" style="margin-top:14px;height:9px">
        <div class="progress-fill" style="width:${p.completion}%;background:${p.color}"></div>
      </div>
    </div>
    ${p.entries.length > 1 ? `<div class="chart-wrap"><div class="chart-header"><span class="chart-title">Progress over time</span></div><svg class="proj-chart" id="proj-chart-${p.id}"></svg></div>` : ''}
  </div>

  <div class="panel" style="margin-bottom:16px">
    <div class="panel-header">
      <span class="panel-title">✅ Tasks <span style="font-weight:400;opacity:0.6">${openTasks.length} open · ${doneTasks.length} done</span></span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="openImportTasksModal('${p.id}')">Import</button>
        <button class="btn btn-sm btn-primary" onclick="openAddTaskModal('${p.id}')">+ Add task</button>
      </div>
    </div>
    <div class="task-list">${tasksHTML}</div>
  </div>

  <div class="detail-grid">
    <div class="panel" style="grid-column:1/-1">
      <div class="panel-header">
        <span class="panel-title">Update log</span>
        <button class="btn btn-sm btn-primary" onclick="openAddEntryModal('${p.id}')">+ Log Update</button>
      </div>
      <div class="entry-list">${entriesHTML}</div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">⚠️ Blockers</span>
        <button class="btn btn-sm" onclick="openAddBlockerModal('${p.id}')">+ Add</button>
      </div>
      <div class="panel-body"><div class="blocker-list">${blockersHTML}</div></div>
    </div>

    <div class="panel">
      <div class="panel-header"><span class="panel-title">🎯 Next steps & notes</span></div>
      <div class="panel-body">
        ${p.nextSteps ? `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-3);margin-bottom:5px">Next Steps</div><div style="font-size:13px;color:var(--text-2);line-height:1.65">${esc(p.nextSteps)}</div></div>` : ''}
        ${p.notes ? `<div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-3);margin-bottom:5px">Notes</div><div style="font-size:13px;color:var(--text-2);line-height:1.65;white-space:pre-wrap">${esc(p.notes)}</div></div>` : `<div style="font-size:12px;color:var(--text-3);font-style:italic">No notes.</div>`}
      </div>
    </div>
  </div>
  `;
}

// ── Chart ──
function drawChart(p) {
  const svg = document.getElementById(`proj-chart-${p.id}`);
  if (!svg) return;
  const sorted = [...p.entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  const W = svg.clientWidth || 500, H = 160;
  const pad = { t: 14, r: 24, b: 28, l: 36 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  if (sorted.length < 2) return;

  const xs = sorted.map(e => new Date(e.date).getTime());
  const minX = xs[0], maxX = xs[xs.length - 1], rangeX = maxX - minX || 1;
  const toX = t => pad.l + ((t - minX) / rangeX) * iW;
  const toY = v => pad.t + iH - (v / 100) * iH;

  const pts = sorted.map((e, i) => `${toX(xs[i])},${toY(e.completion)}`).join(' ');
  const polyPts = `${pad.l},${pad.t + iH} ` + sorted.map((e, i) => `${toX(xs[i])},${toY(e.completion)}`).join(' ') + ` ${toX(xs[xs.length - 1])},${pad.t + iH}`;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridC = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const labelC = isDark ? '#505050' : '#999999';

  let gridLines = '';
  [0, 25, 50, 75, 100].forEach(v => {
    const y = toY(v);
    gridLines += `<line x1="${pad.l}" y1="${y}" x2="${pad.l + iW}" y2="${y}" stroke="${gridC}" stroke-width="1"/>`;
    gridLines += `<text x="${pad.l - 5}" y="${y + 4}" text-anchor="end" font-size="9" fill="${labelC}">${v}</text>`;
  });

  let xLabels = '';
  sorted.forEach((e, i) => {
    if (i === 0 || i === sorted.length - 1 || sorted.length <= 5) {
      xLabels += `<text x="${toX(xs[i])}" y="${H - 4}" text-anchor="middle" font-size="9" fill="${labelC}">${fmtDateShort(e.date)}</text>`;
    }
  });

  const areaId = `area-${p.id}`;
  svg.innerHTML = `
    <defs>
      <linearGradient id="${areaId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${p.color}" stop-opacity="0.03"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <polygon points="${polyPts}" fill="url(#${areaId})"/>
    <polyline points="${pts}" fill="none" stroke="${p.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${sorted.map((e, i) => `<circle cx="${toX(xs[i])}" cy="${toY(e.completion)}" r="4" fill="${p.color}" stroke="${isDark ? '#1a1a1a' : '#fff'}" stroke-width="2"/>`).join('')}
    ${xLabels}
  `;
}

// ── Actions ──
function selectProject(id) {
  state.activeProject = id;
  render();
}
function openDetail(id) {
  state.activeProject = id;
  state.view = 'detail';
  setView('detail');
}
function setView(v) {
  state.view = v;
  document.getElementById('tab-summary').classList.toggle('active', v === 'summary');
  document.getElementById('tab-detail').classList.toggle('active', v === 'detail');
  renderContent();
  saveState();
}
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  renderSidebar();
  saveState();
}
function updateProjectStatus(id, val) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  p.status = val;
  p.completion = calcCompletion(p);
  saveState(); render();
}
function updateProjectPriority(id, val) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  p.priority = val;
  saveState(); render();
}
function resolveBlocker(id, idx) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  p.blockers.splice(idx, 1);
  saveState(); render();
}
function deleteProject(id) {
  if (!confirm('Delete this project and all its data?')) return;
  state.projects = state.projects.filter(x => x.id !== id);
  if (state.activeProject === id) state.activeProject = state.projects[0]?.id || null;
  saveState(); render();
}
