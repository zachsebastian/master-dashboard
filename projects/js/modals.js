// ── Modal state ──
let _modalTags = [];

// ── Sync project task completion back to Today List ──
async function _syncTasksToTodayList(projectId, completedTaskIds, uncompletedTaskIds) {
  if (!_currentUser) return;
  if (!completedTaskIds.length && !uncompletedTaskIds.length) return;

  const allTaskIds = [...completedTaskIds, ...uncompletedTaskIds];

  // Find matching today_items by source_task_id
  const { data: items, error } = await sb
    .from('today_items')
    .select('id, source_task_id, completed')
    .eq('user_id', _currentUser.id)
    .eq('source_ref_id', projectId)
    .in('source_task_id', allTaskIds);

  if (error || !items?.length) return;

  await Promise.all(items.map(item => {
    const shouldComplete   = completedTaskIds.includes(item.source_task_id);
    const shouldUncomplete = uncompletedTaskIds.includes(item.source_task_id);
    if (shouldComplete && !item.completed) {
      return sb.from('today_items').update({ completed: true }).eq('id', item.id);
    }
    if (shouldUncomplete && item.completed) {
      return sb.from('today_items').update({ completed: false }).eq('id', item.id);
    }
  }));
}

// ── Modal openers ──
function openAddProjectModal() { renderModal('add-project', {}); }
function openEditProjectModal(id) { renderModal('edit-project', { id }); }
function openAddEntryModal(pid) { renderModal('add-entry', { pid }); }
function openEditEntryModal(pid, eid) { renderModal('edit-entry', { pid, eid }); }
function openAddBlockerModal(pid) { renderModal('add-blocker', { pid }); }
function openAddTaskModal(pid) { renderModal('add-task', { pid }); }
function openImportTasksModal(pid) { renderModal('import-tasks', { pid }); }
function openEditTaskModal(pid, tid) { renderModal('edit-task', { pid, tid }); }

// ── Modal entry point ──
function renderModal(type, data) {
  const container = document.getElementById('modal-container');
  container.innerHTML = buildModal(type, data);
}
function closeModal() {
  document.getElementById('modal-container').innerHTML = '';
  _modalTags = [];
}

// ── Modal completion auto-update ──
function updateModalCompletion(totalTasks, alreadyDone) {
  if (!totalTasks) return;
  const checked = document.querySelectorAll('.task-checkbox:checked').length;
  const pct = Math.round((alreadyDone + checked) / totalTasks * 100);
  const el = document.getElementById('e-completion-display');
  if (el) el.textContent = pct + '%';
}

// ── Build modal HTML ──
function buildModal(type, data) {
  // ── Add / Edit Project ──
  if (type === 'add-project' || type === 'edit-project') {
    const isEdit = type === 'edit-project';
    const p = isEdit ? state.projects.find(x => x.id === data.id) : null;
    _modalTags = p ? [...p.tags] : [];
    const colorOptions = COLORS.map((c, i) => `
      <div onclick="selectModalColor('${c}',this)" style="width:20px;height:20px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${(p && p.color === c) || (!p && i === 0) ? 'var(--text)' : 'transparent'}" data-color="${c}"></div>
    `).join('');

    return `<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header"><div class="modal-title">${isEdit ? 'Edit project' : 'New project'}</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Project name</label>
          <input class="form-input" id="m-name" placeholder="e.g. Website Redesign" value="${esc(p?.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="m-desc" placeholder="Short description" value="${esc(p?.description || '')}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-input" id="m-status">
              <option value="not-started" ${(!p || p.status === 'not-started') ? 'selected' : ''}>Not Started</option>
              <option value="in-progress" ${p?.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
              <option value="on-hold" ${p?.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
              <option value="done" ${p?.status === 'done' ? 'selected' : ''}>Done</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-input" id="m-priority">
              <option value="high" ${p?.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="medium" ${(!p || p.priority === 'medium') ? 'selected' : ''}>Medium</option>
              <option value="low" ${p?.priority === 'low' ? 'selected' : ''}>Low</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Due date</label>
          <input class="form-input" type="date" id="m-due" value="${p?.dueDate || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Tags <span style="color:var(--text-3);font-weight:400">(press Enter to add)</span></label>
          <div class="tags-wrap" onclick="document.getElementById('m-tag-input').focus()" id="tags-wrap-modal">
            ${_modalTags.map((t, i) => `<div class="tag-chip" id="tag-${i}">${esc(t)}<button class="tag-chip-del" onclick="removeModalTag(${i})">×</button></div>`).join('')}
            <input class="tags-input" id="m-tag-input" placeholder="Add tag…" onkeydown="handleTagKey(event)">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center" id="color-swatches">${colorOptions}</div>
          <input type="hidden" id="m-color" value="${p?.color || COLORS[0]}">
        </div>
        <hr class="form-divider">
        <div class="form-group">
          <label class="form-label">Next steps</label>
          <input class="form-input" id="m-nextsteps" placeholder="What needs to happen next?" value="${esc(p?.nextSteps || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="log-area" id="m-notes" placeholder="Ongoing notes, context, decisions…">${esc(p?.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left">
          ${isEdit ? `<button class="btn btn-sm btn-danger" onclick="deleteProject('${p.id}');closeModal()">Delete project</button>` : ''}
        </div>
        <div class="modal-footer-right">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="${isEdit ? `saveEditProject('${p.id}')` : 'saveAddProject()'}">${isEdit ? 'Save changes' : 'Create project'}</button>
        </div>
      </div>
    </div></div>`;
  }

  // ── Add / Edit Entry ──
  if (type === 'add-entry' || type === 'edit-entry') {
    const isEdit = type === 'edit-entry';
    const p = state.projects.find(x => x.id === data.pid);
    const e = isEdit ? p?.entries.find(x => x.id === data.eid) : null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const allTasks = p?.tasks || [];
    const completedInThisEntry = isEdit ? allTasks.filter(t => t.completedInEntry === e?.id) : [];
    const selectableTasks = isEdit
      ? [...allTasks.filter(t => !t.completedInEntry), ...completedInThisEntry]
      : allTasks.filter(t => !t.completedInEntry);
    const totalTasks = allTasks.length;
    const alreadyDoneCount = isEdit
      ? allTasks.filter(t => t.completedInEntry && t.completedInEntry !== e?.id).length
      : allTasks.filter(t => t.completedInEntry).length;
    const initialPct = totalTasks ? Math.round(alreadyDoneCount / totalTasks * 100) : 0;
    const taskCheckboxes = selectableTasks.length ? `
      <hr class="form-divider">
      <div class="form-group">
        <label class="form-label">✅ Tasks completed in this update</label>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
          ${selectableTasks.map(t => {
            const checked = completedInThisEntry.some(ct => ct.id === t.id) ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13px;color:var(--text)">
              <input type="checkbox" class="task-checkbox" data-task-id="${t.id}" ${checked} onchange="updateModalCompletion(${totalTasks},${alreadyDoneCount})" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue);flex-shrink:0">
              <span>${esc(t.text)}</span>
            </label>`;
          }).join('')}
        </div>
      </div>` : '';

    return `<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header"><div class="modal-title">${isEdit ? 'Edit update' : 'Log Update'} — ${esc(p?.name || '')}</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" type="date" id="e-date" value="${e?.date || todayStr}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">% Completion</label>
            <div class="form-input" style="color:var(--text-2);background:var(--surface-2);cursor:default"><span id="e-completion-display">${initialPct}%</span> <span style="font-size:11px;color:var(--text-3)">(auto from tasks)</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-input" id="e-status">
              <option value="not-started" ${e?.status === 'not-started' ? 'selected' : ''}>Not Started</option>
              <option value="in-progress" ${(!e || e.status === 'in-progress') ? 'selected' : ''}>In Progress</option>
              <option value="on-hold" ${e?.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
              <option value="done" ${e?.status === 'done' ? 'selected' : ''}>Done</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">📝 Update note</label>
          <div class="form-hint" style="margin-bottom:6px">What happened? What did you accomplish?</div>
          <textarea class="log-area" id="e-note" placeholder="e.g. Completed wireframes for 3 core pages, approved by stakeholder…">${esc(e?.note || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">🎯 Next steps</label>
          <input class="form-input" id="e-nextsteps" placeholder="What's next?" value="${esc(e?.nextSteps || p?.nextSteps || '')}">
        </div>
        ${taskCheckboxes}
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left">
          ${isEdit ? `<button class="btn btn-sm btn-danger" onclick="deleteEntry('${data.pid}','${data.eid}')">Delete entry</button>` : ''}
        </div>
        <div class="modal-footer-right">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="${isEdit ? `saveEditEntry('${data.pid}','${data.eid}')` : `saveAddEntry('${data.pid}')`}">${isEdit ? 'Save changes' : 'Save update'}</button>
        </div>
      </div>
    </div></div>`;
  }

  // ── Add Task ──
  if (type === 'add-task') {
    return `<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()" style="width:440px">
      <div class="modal-header"><div class="modal-title">Add task</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Task</label>
          <input class="form-input" id="t-text" placeholder="e.g. Write copy for landing page" autofocus>
        </div>
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left"></div>
        <div class="modal-footer-right">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveAddTask('${data.pid}')">Add task</button>
        </div>
      </div>
    </div></div>`;
  }

  // ── Edit Task ──
  if (type === 'edit-task') {
    const p = state.projects.find(x => x.id === data.pid);
    const task = p ? (p.tasks || []).find(t => t.id === data.tid) : null;
    const otherProjects = state.projects.filter(x => x.id !== data.pid);
    const byName = (a, b) => a.name.localeCompare(b.name);
    const active    = otherProjects.filter(x => x.status !== 'done' && x.status !== 'on-hold').sort(byName);
    const onHold    = otherProjects.filter(x => x.status === 'on-hold').sort(byName);
    const completed = otherProjects.filter(x => x.status === 'done').sort(byName);
    const buildOpts = arr => arr.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    const projectOptions = otherProjects.length ? [
      active.length    ? `<optgroup label="Active">${buildOpts(active)}</optgroup>`    : '',
      onHold.length    ? `<optgroup label="On Hold">${buildOpts(onHold)}</optgroup>`   : '',
      completed.length ? `<optgroup label="Completed">${buildOpts(completed)}</optgroup>` : '',
    ].join('') : `<option value="" disabled>No other projects</option>`;
    return `<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()" style="width:440px">
      <div class="modal-header"><div class="modal-title">Edit task</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Task</label>
          <input class="form-input" id="t-edit-text" value="${task ? esc(task.text) : ''}" autofocus>
        </div>
        <div id="move-task-section" style="display:none;margin-top:4px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Move to project</label>
            <select class="form-input" id="t-move-dest">${projectOptions}</select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left">
          <button class="btn" id="move-task-toggle-btn" onclick="toggleMoveTaskSection('${data.pid}','${data.tid}')">Move to project…</button>
        </div>
        <div class="modal-footer-right">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" id="save-task-btn" onclick="saveEditTask('${data.pid}','${data.tid}')">Save</button>
        </div>
      </div>
    </div></div>`;
  }

  // ── Import Tasks ──
  if (type === 'import-tasks') {
    return `<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header"><div class="modal-title">Import tasks</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Paste tasks — one per line</label>
          <textarea class="log-area" id="t-import" style="min-height:140px" placeholder="Design homepage mockup&#10;Write copy for 3 landing pages&#10;Get stakeholder sign-off"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left"></div>
        <div class="modal-footer-right">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveImportTasks('${data.pid}')">Import</button>
        </div>
      </div>
    </div></div>`;
  }

  // ── Add Blocker ──
  if (type === 'add-blocker') {
    const p = state.projects.find(x => x.id === data.pid);
    const tasks = (p?.tasks || []);
    const taskOptions = tasks.length
      ? `<option value="">— None —</option>` + tasks.map(t =>
          `<option value="${esc(t.id)}">${esc(t.text)}${t.completedInEntry ? ' ✓' : ''}</option>`
        ).join('')
      : `<option value="">No tasks yet</option>`;
    return `<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()" style="width:400px">
      <div class="modal-header"><div class="modal-title">Add blocker</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Blocker description</label>
          <input class="form-input" id="b-text" placeholder="e.g. Waiting on legal sign-off…" autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Blocking which task? <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
          <select class="form-input" id="b-task">${taskOptions}</select>
        </div>
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left"></div>
        <div class="modal-footer-right">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveBlocker('${data.pid}')">Add blocker</button>
        </div>
      </div>
    </div></div>`;
  }

  // ── Edit Blocker ──
  if (type === 'edit-blocker') {
    const p = state.projects.find(x => x.id === data.pid);
    const raw = p?.blockers?.[data.idx];
    const current  = raw ? esc(typeof raw === 'string' ? raw : raw.text) : '';
    const linkedId = (raw && typeof raw === 'object') ? (raw.taskId || '') : '';
    const tasks = (p?.tasks || []);
    const taskOptions = `<option value="">— None —</option>` + tasks.map(t =>
      `<option value="${esc(t.id)}"${t.id === linkedId ? ' selected' : ''}>${esc(t.text)}${t.completedInEntry ? ' ✓' : ''}</option>`
    ).join('');
    return `<div class="modal-backdrop" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()" style="width:400px">
      <div class="modal-header"><div class="modal-title">Edit blocker</div><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Blocker description</label>
          <input class="form-input" id="b-text" value="${current}" autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Blocking which task? <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
          <select class="form-input" id="b-task">${taskOptions}</select>
        </div>
      </div>
      <div class="modal-footer">
        <div class="modal-footer-left"></div>
        <div class="modal-footer-right">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveEditBlocker('${data.pid}',${data.idx})">Save</button>
        </div>
      </div>
    </div></div>`;
  }

  return '';
}

// ── Tag helpers ──
function handleTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(',', '');
    if (val && !_modalTags.includes(val)) {
      _modalTags.push(val);
      refreshTagsUI();
    }
    e.target.value = '';
  }
}
function removeModalTag(i) {
  _modalTags.splice(i, 1);
  refreshTagsUI();
}
function refreshTagsUI() {
  const wrap = document.getElementById('tags-wrap-modal');
  const input = document.getElementById('m-tag-input');
  if (!wrap || !input) return;
  const chips = _modalTags.map((t, i) => {
    const d = document.createElement('div');
    d.className = 'tag-chip';
    d.id = `tag-${i}`;
    d.innerHTML = `${esc(t)}<button class="tag-chip-del" onclick="removeModalTag(${i})">×</button>`;
    return d;
  });
  Array.from(wrap.children).forEach(c => { if (c !== input) wrap.removeChild(c); });
  chips.forEach(c => wrap.insertBefore(c, input));
}
function selectModalColor(c, el) {
  document.getElementById('m-color').value = c;
  document.querySelectorAll('#color-swatches > div').forEach(d => d.style.borderColor = d.dataset.color === c ? 'var(--text)' : 'transparent');
}

// ── Save handlers ──
function saveAddProject() {
  const name = document.getElementById('m-name').value.trim();
  if (!name) { alert('Please enter a project name.'); return; }
  const p = {
    id: uid(), name,
    description: document.getElementById('m-desc').value.trim(),
    status: document.getElementById('m-status').value,
    priority: document.getElementById('m-priority').value,
    dueDate: document.getElementById('m-due').value || '',
    tags: [..._modalTags],
    color: document.getElementById('m-color').value,
    completion: 0,
    entries: [],
    blockers: [],
    tasks: [],
    nextSteps: document.getElementById('m-nextsteps').value.trim(),
    notes: document.getElementById('m-notes').value.trim(),
  };
  state.projects.push(p);
  state.activeProject = p.id;
  closeModal(); saveState(); render();
}

function saveEditProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  const name = document.getElementById('m-name').value.trim();
  if (!name) { alert('Please enter a project name.'); return; }
  p.name = name;
  p.description = document.getElementById('m-desc').value.trim();
  p.status = document.getElementById('m-status').value;
  p.priority = document.getElementById('m-priority').value;
  p.dueDate = document.getElementById('m-due').value || '';
  p.tags = [..._modalTags];
  p.color = document.getElementById('m-color').value;
  p.nextSteps = document.getElementById('m-nextsteps').value.trim();
  p.notes = document.getElementById('m-notes').value.trim();
  closeModal(); saveState(); render();
}

function getCheckedTaskIds() {
  return Array.from(document.querySelectorAll('.task-checkbox:checked')).map(el => el.dataset.taskId);
}

function saveAddEntry(pid) {
  const p = state.projects.find(x => x.id === pid);
  if (!p) return;
  const e = {
    id: uid(),
    date: document.getElementById('e-date').value || new Date().toISOString().slice(0, 10),
    completion: 0,
    status: document.getElementById('e-status').value,
    note: document.getElementById('e-note').value.trim(),
    nextSteps: document.getElementById('e-nextsteps').value.trim(),
  };
  const checkedIds = getCheckedTaskIds();
  (p.tasks || []).forEach(t => { if (checkedIds.includes(t.id)) t.completedInEntry = e.id; });
  e.completion = calcCompletion(p);
  p.entries.push(e);
  p.completion = e.completion;
  p.nextSteps = e.nextSteps || p.nextSteps;
  if (e.status === 'done') p.status = 'done';
  closeModal(); saveState(); render();
  _syncTasksToTodayList(p.id, checkedIds, []);
  if (e.completion === 100 && p.status !== 'done') {
    if (confirm('🎉 All tasks complete! Mark this project as Done?')) {
      p.status = 'done';
      saveState(); render();
    }
  }
}

function saveEditEntry(pid, eid) {
  const p = state.projects.find(x => x.id === pid);
  const e = p?.entries.find(x => x.id === eid);
  if (!e) return;
  e.date = document.getElementById('e-date').value;
  e.status = document.getElementById('e-status').value;
  e.note = document.getElementById('e-note').value.trim();
  e.nextSteps = document.getElementById('e-nextsteps').value.trim();
  const checkedIds = getCheckedTaskIds();
  const nowCompleted   = [];
  const nowUncompleted = [];
  (p.tasks || []).forEach(t => {
    if (t.completedInEntry === eid && !checkedIds.includes(t.id)) {
      t.completedInEntry = null;
      nowUncompleted.push(t.id);
    }
    if (!t.completedInEntry && checkedIds.includes(t.id)) {
      t.completedInEntry = eid;
      nowCompleted.push(t.id);
    }
  });
  e.completion = calcCompletion(p);
  p.completion = e.completion;
  closeModal(); saveState(); render();
  _syncTasksToTodayList(p.id, nowCompleted, nowUncompleted);
}

function deleteEntry(pid, eid) {
  if (!confirm('Delete this entry?')) return;
  const p = state.projects.find(x => x.id === pid);
  if (!p) return;
  (p.tasks || []).forEach(t => { if (t.completedInEntry === eid) t.completedInEntry = null; });
  p.entries = p.entries.filter(e => e.id !== eid);
  p.completion = calcCompletion(p);
  closeModal(); saveState(); render();
}

// ── Migrate blockers from legacy string format to objects ──
function _migrateBlockers(p) {
  if (!p.blockers) { p.blockers = []; return; }
  p.blockers = p.blockers.map(b =>
    typeof b === 'string'
      ? { id: uid(), text: b, resolved: false, resolvedAt: null }
      : b
  );
}

function saveBlocker(pid) {
  const p = state.projects.find(x => x.id === pid);
  const text   = document.getElementById('b-text').value.trim();
  const taskId = document.getElementById('b-task')?.value || null;
  if (!text) { alert('Please enter a blocker description.'); return; }
  _migrateBlockers(p);
  p.blockers.push({ id: uid(), text, taskId: taskId || null, resolved: false, resolvedAt: null });
  closeModal(); saveState(); render();
}

function openEditBlockerModal(pid, idx) {
  renderModal('edit-blocker', { pid, idx });
}

function saveEditBlocker(pid, idx) {
  const p = state.projects.find(x => x.id === pid);
  if (!p) return;
  _migrateBlockers(p);
  const b = p.blockers[idx];
  if (!b) return;
  const text   = document.getElementById('b-text').value.trim();
  const taskId = document.getElementById('b-task')?.value || null;
  if (!text) { alert('Please enter a blocker description.'); return; }
  b.text   = text;
  b.taskId = taskId || null;
  closeModal(); saveState(); render();
}

function resolveBlocker(pid, idx) {
  const p = state.projects.find(x => x.id === pid);
  if (!p) return;
  _migrateBlockers(p);
  const b = p.blockers[idx];
  if (!b) return;
  b.resolved   = true;
  b.resolvedAt = new Date().toISOString().slice(0, 10);
  saveState(); render();
}

function saveAddTask(pid) {
  const p = state.projects.find(x => x.id === pid);
  const text = document.getElementById('t-text').value.trim();
  if (!text) { alert('Please enter a task.'); return; }
  if (!p.tasks) p.tasks = [];
  p.tasks.push({ id: uid(), text, completedInEntry: null });
  p.completion = calcCompletion(p);
  closeModal(); saveState(); render();
}

function saveImportTasks(pid) {
  const p = state.projects.find(x => x.id === pid);
  const lines = document.getElementById('t-import').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) { alert('Please enter at least one task.'); return; }
  if (!p.tasks) p.tasks = [];
  lines.forEach(text => p.tasks.push({ id: uid(), text, completedInEntry: null }));
  p.completion = calcCompletion(p);
  closeModal(); saveState(); render();
}

function deleteTask(pid, tid) {
  if (!confirm('Delete this task?')) return;
  const p = state.projects.find(x => x.id === pid);
  if (!p) return;
  p.tasks = (p.tasks || []).filter(t => t.id !== tid);
  p.completion = calcCompletion(p);
  saveState(); render();
}

function saveEditTask(pid, tid) {
  const p = state.projects.find(x => x.id === pid);
  if (!p) return;
  const text = document.getElementById('t-edit-text').value.trim();
  if (!text) { alert('Task cannot be empty.'); return; }
  const task = (p.tasks || []).find(t => t.id === tid);
  if (task) task.text = text;
  closeModal(); saveState(); render();
}

function toggleMoveTaskSection(pid, tid) {
  const section = document.getElementById('move-task-section');
  const toggleBtn = document.getElementById('move-task-toggle-btn');
  const saveBtn = document.getElementById('save-task-btn');
  if (!section) return;
  const isOpen = section.style.display !== 'none';
  if (isOpen) {
    section.style.display = 'none';
    toggleBtn.textContent = 'Move to project…';
    toggleBtn.classList.remove('btn-active');
    saveBtn.style.display = '';
  } else {
    section.style.display = 'block';
    toggleBtn.textContent = 'Cancel move';
    toggleBtn.classList.add('btn-active');
    saveBtn.style.display = 'none';
    // Swap the primary action to Move
    const footer = toggleBtn.closest('.modal-footer');
    if (footer && !footer.querySelector('#move-task-confirm-btn')) {
      const moveBtn = document.createElement('button');
      moveBtn.className = 'btn btn-primary';
      moveBtn.id = 'move-task-confirm-btn';
      moveBtn.textContent = 'Move task';
      moveBtn.onclick = () => moveTask(pid, tid);
      footer.querySelector('.modal-footer-right').appendChild(moveBtn);
    }
  }
}

function moveTask(pid, tid) {
  const destId = document.getElementById('t-move-dest')?.value;
  if (!destId) return;
  const src  = state.projects.find(x => x.id === pid);
  const dest = state.projects.find(x => x.id === destId);
  if (!src || !dest) return;
  const taskIdx = (src.tasks || []).findIndex(t => t.id === tid);
  if (taskIdx === -1) return;
  const [task] = src.tasks.splice(taskIdx, 1);
  // Reset completion so it shows as open in the destination project
  task.completedInEntry = null;
  if (!dest.tasks) dest.tasks = [];
  dest.tasks.push(task);
  src.completion  = calcCompletion(src);
  dest.completion = calcCompletion(dest);
  closeModal(); saveState(); render();
}

// ── Add project task to Today List manually ──
async function addTaskToToday(pid, tid, btn) {
  const p    = state.projects.find(x => x.id === pid);
  const task = (p?.tasks || []).find(t => t.id === tid);
  if (!p || !task || !_currentUser) return;

  const today = new Date().toISOString().slice(0, 10);

  // Check for duplicate
  const { data: existing } = await sb
    .from('today_items')
    .select('id')
    .eq('user_id', _currentUser.id)
    .eq('source_task_id', tid)
    .eq('item_date', today)
    .maybeSingle();

  if (existing) {
    btn.textContent = 'Already added';
    btn.disabled = true;
    return;
  }

  btn.textContent = 'Adding…';
  btn.disabled = true;

  // Get max sort_order for today
  const { data: todayRows } = await sb
    .from('today_items')
    .select('sort_order')
    .eq('user_id', _currentUser.id)
    .eq('item_date', today)
    .order('sort_order', { ascending: false })
    .limit(1);

  const maxOrder = todayRows?.[0]?.sort_order ?? -1;

  const { error } = await sb.from('today_items').insert({
    user_id:         _currentUser.id,
    text:            task.text,
    completed:       false,
    source:          'project',
    source_ref_id:   p.id,
    source_ref_name: p.name,
    source_task_id:  task.id,
    sort_order:      maxOrder + 1,
    item_date:       today,
  });

  if (error) {
    btn.textContent = 'Failed';
    btn.disabled = false;
    return;
  }

  btn.textContent = '✓ Added';
}
