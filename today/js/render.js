// ── Drag state ──
let _dragSrcId  = null;
let _dragOverId = null;

// ── Escape helper ──
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Date formatting ──
function _fmtTodayLabel() {
  return new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function _fmtHistoryDate(dateStr) {
  // dateStr is 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Loading ──
function renderLoading() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
}

// ── Top-level render ──
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const sorted = getSortedTodayItems();
  const completed   = sorted.filter(i =>  i.completed);
  const uncompleted = sorted.filter(i => !i.completed);
  const total = sorted.length;
  const doneCount = completed.length;

  app.innerHTML = `
    ${_resetNeeded ? _renderResetModal() : ''}
    <div class="today-wrap">
      ${_renderHeader()}
      ${_view === 'today' ? _renderTodayView(uncompleted, completed, total, doneCount) : _renderHistoryView()}
    </div>
  `;

  bindEvents();
}

// ── Header ──
function _renderHeader() {
  return `
    <div class="today-header">
      <div class="today-header-left">
        <div class="today-title">Today List</div>
        <div class="today-date">${escHtml(_fmtTodayLabel())}</div>
      </div>
      <div class="today-view-toggle">
        <button class="today-view-btn${_view === 'today' ? ' active' : ''}"
          data-view="today">Today</button>
        <button class="today-view-btn${_view === 'history' ? ' active' : ''}"
          data-view="history">History</button>
      </div>
    </div>`;
}

// ── Today view ──
function _renderTodayView(uncompleted, completed, total, doneCount) {
  return `
    ${_renderStats(doneCount, total)}
    <div class="today-section-label">Today's Priorities</div>
    <div class="today-list" id="today-list">
      ${uncompleted.length === 0 && completed.length === 0
        ? _renderEmpty()
        : uncompleted.map(item => _renderItem(item)).join('')
      }
    </div>
    ${completed.length > 0 ? `
      <div class="today-completed-divider">
        <div class="today-completed-divider-line"></div>
        <div class="today-completed-divider-label">Completed (${escHtml(String(doneCount))})</div>
        <div class="today-completed-divider-line"></div>
      </div>
      <div class="today-list">
        ${completed.map(item => _renderItem(item)).join('')}
      </div>` : ''}
    <div class="today-add-row">
      <input
        type="text"
        id="today-add-input"
        class="today-add-input"
        placeholder="Add a priority for today…"
        maxlength="500">
      <button class="btn btn-primary" id="today-add-btn">Add</button>
    </div>`;
}

// ── Single item ──
function _renderItem(item) {
  const isDraggable = !item.completed;
  return `
    <div class="today-item${item.completed ? ' completed' : ''}"
         data-id="${escHtml(item.id)}"
         ${isDraggable ? `draggable="true"` : ''}>
      <div class="today-item-check${item.completed ? ' checked' : ''}"
           data-check-id="${escHtml(item.id)}"
           title="${item.completed ? 'Mark incomplete' : 'Mark complete'}"></div>
      <div class="today-item-body">
        <span class="today-item-text">${escHtml(item.text)}</span>
        ${item.source === 'project' && item.source_ref_name
          ? `<span class="today-item-source">${escHtml(item.source_ref_name)}</span>`
          : ''}
      </div>
      <div class="today-item-right">
        ${isDraggable ? `<span class="today-drag-handle" title="Drag to reorder">⠿</span>` : ''}
        <button class="today-delete-btn" data-delete-id="${escHtml(item.id)}" title="Delete">×</button>
      </div>
    </div>`;
}

// ── Stats ──
function _renderStats(doneCount, total) {
  if (total === 0) return '';
  return `
    <div class="today-stats">
      <div class="today-stat">
        <div class="today-stat-value">${escHtml(String(doneCount))} / ${escHtml(String(total))}</div>
        <div class="today-stat-label">Completed</div>
      </div>
    </div>`;
}

// ── Empty state ──
function _renderEmpty() {
  return `
    <div class="today-empty">
      <div class="today-empty-title">Nothing here yet</div>
      <div class="today-empty-sub">Add items below or they'll be pulled in from your active projects.</div>
    </div>`;
}

// ── History view ──
function _renderHistoryView() {
  const groups = getHistoryGrouped();
  if (!groups.length) {
    return `
      <div class="today-empty">
        <div class="today-empty-title">No history yet</div>
        <div class="today-empty-sub">Past days will appear here once you've used the Today List.</div>
      </div>`;
  }

  return groups.map(({ date, items }) => {
    const done  = items.filter(i => i.completed).length;
    const total = items.length;
    return `
      <div class="history-day">
        <div class="history-day-header">
          <div class="history-day-date">${escHtml(_fmtHistoryDate(date))}</div>
          <div class="history-day-stats">${escHtml(String(done))} / ${escHtml(String(total))} completed</div>
        </div>
        ${items.map(item => `
          <div class="history-item${item.completed ? ' completed' : ''}">
            <div class="history-item-check${item.completed ? ' checked' : ''}"></div>
            <div class="history-item-body">
              <span class="history-item-text">${escHtml(item.text)}</span>
              ${item.source === 'project' && item.source_ref_name
                ? `<span class="today-item-source">${escHtml(item.source_ref_name)}</span>`
                : ''}
            </div>
          </div>`).join('')}
      </div>`;
  }).join('');
}

// ── Reset modal ──
function _renderResetModal() {
  return `
    <div class="reset-overlay" id="reset-overlay">
      <div class="reset-modal">
        <div class="reset-modal-title">Unfinished items from yesterday</div>
        <div class="reset-modal-body">
          You have <strong>${escHtml(String(_unfinishedCount))} unfinished item${_unfinishedCount !== 1 ? 's' : ''}</strong>
          from a previous day. What would you like to do?
        </div>
        <div class="reset-modal-actions">
          <button class="btn" id="reset-archive-btn">Leave as Archive</button>
          <button class="btn btn-primary" id="reset-carry-btn">Carry Forward</button>
        </div>
      </div>
    </div>`;
}

// ── Event binding ──
function bindEvents() {
  // View toggle
  document.querySelectorAll('.today-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _view = btn.dataset.view;
      render();
    });
  });

  // Reset modal buttons
  const carryBtn   = document.getElementById('reset-carry-btn');
  const archiveBtn = document.getElementById('reset-archive-btn');
  if (carryBtn) {
    carryBtn.addEventListener('click', async () => {
      carryBtn.disabled = true;
      carryBtn.textContent = 'Moving…';
      await carryForwardItems();
      await autoPullFromProjects();
      render();
    });
  }
  if (archiveBtn) {
    archiveBtn.addEventListener('click', async () => {
      await archiveItems();
      await autoPullFromProjects();
      render();
    });
  }

  // Checkboxes
  document.querySelectorAll('[data-check-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.checkId;
      await toggleItem(id);
      render();
    });
  });

  // Delete buttons
  document.querySelectorAll('[data-delete-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.deleteId;
      await deleteItem(id);
      render();
    });
  });

  // Add item
  const addInput = document.getElementById('today-add-input');
  const addBtn   = document.getElementById('today-add-btn');

  if (addBtn && addInput) {
    addBtn.addEventListener('click', async () => {
      const text = addInput.value.trim();
      if (!text) return;
      addBtn.disabled   = true;
      addInput.disabled = true;
      await addManualItem(text);
      addBtn.disabled   = false;
      addInput.disabled = false;
      render();
      // Re-focus input after render
      const newInput = document.getElementById('today-add-input');
      if (newInput) newInput.focus();
    });

    addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addBtn.click();
    });
  }

  // Drag-to-reorder (uncompleted items only)
  _bindDragEvents();
}

// ── Drag-to-reorder ──
function _bindDragEvents() {
  const list = document.getElementById('today-list');
  if (!list) return;

  const items = list.querySelectorAll('.today-item[draggable="true"]');

  items.forEach(el => {
    el.addEventListener('dragstart', e => {
      _dragSrcId = el.dataset.id;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragSrcId);
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      list.querySelectorAll('.today-item').forEach(i => i.classList.remove('drag-over'));
      _dragSrcId  = null;
      _dragOverId = null;
    });

    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (el.dataset.id === _dragSrcId) return;
      list.querySelectorAll('.today-item').forEach(i => i.classList.remove('drag-over'));
      el.classList.add('drag-over');
      _dragOverId = el.dataset.id;
    });

    el.addEventListener('dragleave', e => {
      // Only remove if truly leaving this element
      if (!el.contains(e.relatedTarget)) {
        el.classList.remove('drag-over');
      }
    });

    el.addEventListener('drop', async e => {
      e.preventDefault();
      if (!_dragSrcId || _dragSrcId === _dragOverId) return;

      list.querySelectorAll('.today-item').forEach(i => i.classList.remove('drag-over'));

      // Build new order: only uncompleted items are in this list
      const uncompletedIds = Array.from(list.querySelectorAll('.today-item[draggable="true"]'))
        .map(el => el.dataset.id);

      const srcIdx  = uncompletedIds.indexOf(_dragSrcId);
      const destIdx = uncompletedIds.indexOf(_dragOverId);
      if (srcIdx === -1 || destIdx === -1) return;

      // Reorder array
      uncompletedIds.splice(srcIdx, 1);
      uncompletedIds.splice(destIdx, 0, _dragSrcId);

      // Append completed ids at the end to keep their relative order
      const completedIds = getSortedTodayItems()
        .filter(i => i.completed)
        .map(i => i.id);

      await reorderItems([...uncompletedIds, ...completedIds]);
      render();
    });
  });
}
