// ── Icon grid rebalancing ──
function rebalanceIconGrids() {
  requestAnimationFrame(() => {
    const lz = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lz')) || 1;
    const minW = 76 * lz;
    const gap  = 8  * lz;
    const padX = 12 * lz * 2;

    document.querySelectorAll('.icon-grid').forEach(grid => {
      const n = grid.querySelectorAll('.icon-item-wrap[data-item-id]').length;
      if (n === 0) { grid.style.gridTemplateColumns = ''; return; }

      const containerW = grid.clientWidth - padX;
      const maxCols = Math.max(1, Math.floor((containerW + gap) / (minW + gap)));

      // Only rebalance when items span more than one row
      if (n <= maxCols) { grid.style.gridTemplateColumns = ''; return; }

      // Find column count (≤ maxCols) with fewest empty spots in the last row
      let bestCols = maxCols;
      let bestEmpty = maxCols - ((n % maxCols) || maxCols);

      for (let c = maxCols - 1; c >= Math.max(1, Math.ceil(n / 2)); c--) {
        const empty = c - ((n % c) || c);
        if (empty < bestEmpty) { bestEmpty = empty; bestCols = c; }
        if (empty === 0) break;
      }

      grid.style.gridTemplateColumns = `repeat(${bestCols}, 1fr)`;
    });
  });
}

// ── List pagination ──
function setListPage(groupId, page) {
  activePages[groupId] = page;
  const card = findCardForGroup(groupId);
  if (!card) return;
  const sy = window.scrollY;
  render();
  window.scrollTo(0, sy);
}

// ── Edit mode ──
function toggleEditMode() {
  editMode = !editMode;
  render();
}

// ── Search ──
let _searchTimer = null;

function toggleSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  if (input.classList.contains('hidden')) {
    input.classList.remove('hidden');
    input.focus();
  } else {
    clearSearch();
  }
}

function onSearch(val) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { searchQuery = val; render(); }, 120);
}

function clearSearch() {
  searchQuery = '';
  render();
  // Re-hide input after re-render
  requestAnimationFrame(() => {
    const input = document.getElementById('search-input');
    if (input) input.classList.add('hidden');
  });
}

// ── Grid settings ──
function onColsChange(val) {
  state.settings.gridCols = val;
  // Update display value
  const el = document.getElementById('cols-val');
  if (el) el.textContent = val;
  // Update grid live without full re-render
  const grid = document.getElementById('links-grid');
  if (grid) grid.style.gridTemplateColumns = `repeat(${val},minmax(0,1fr))`;
  clearTimeout(_settingsTimer);
  _settingsTimer = setTimeout(saveSettings, 800);
}

function onZoomChange(val) {
  state.settings.zoom = val;
  document.documentElement.style.setProperty('--lz', val);
  const el = document.getElementById('zoom-val');
  if (el) el.textContent = Math.round(val * 100) + '%';
  rebalanceIconGrids();
  clearTimeout(_settingsTimer);
  _settingsTimer = setTimeout(saveSettings, 800);
}

// ── Active tab ──
function setActiveGroup(cardId, idx) {
  activeGroups[cardId] = idx;
  const sy = window.scrollY;
  render();
  window.scrollTo(0, sy);
}

// ── Card resize ──
async function resizeCard(cardId, axis, delta) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  if (axis === 'col') {
    card.colSpan = Math.max(1, Math.min(state.settings.gridCols, card.colSpan + delta));
    await updateCard(cardId, { colSpan: card.colSpan });
  } else {
    card.rowSpan = Math.max(1, card.rowSpan + delta);
    await updateCard(cardId, { rowSpan: card.rowSpan });
  }
  render();
}

// ── Confirm deletes ──
function confirmDeleteCard(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  if (!confirm(`Delete card "${card.name}"?\n\nAll tabs and links inside will be permanently deleted.`)) return;
  deleteCard(cardId);
}

function confirmDeleteGroup(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  if (!confirm(`Delete tab "${group.name}" and all its links?`)) return;
  deleteGroup(groupId);
}

// ── Move tab to another card ──
function showMoveGroupMenu(groupId) {
  const group    = findGroup(groupId);
  const srcCard  = findCardForGroup(groupId);
  if (!group || !srcCard) return;

  const others = state.cards.filter(c => c.id !== srcCard.id);
  if (!others.length) {
    alert('There are no other cards to move this tab to.');
    return;
  }

  document.getElementById('move-group-menu')?.remove();

  const menu = document.createElement('div');
  menu.id = 'move-group-menu';
  menu.className = 'context-menu';
  menu.innerHTML = `
    <div class="context-menu-title">Move "${esc(group.name)}" to</div>
    ${others.map(c => `
      <button class="context-menu-item"
        onclick="moveGroup('${groupId}','${c.id}');document.getElementById('move-group-menu')?.remove()">
        ${esc(c.name)}
      </button>`).join('')}
    <button class="context-menu-cancel"
      onclick="document.getElementById('move-group-menu')?.remove()">Cancel</button>`;
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    });
  }, 0);
}

// ── Item edit modal ──
function openItemEdit(itemId) {
  const item   = findItem(itemId);
  const card   = findCardForItem(itemId);
  if (!item || !card) return;

  document.getElementById('item-edit-modal')?.remove();

  const iconSrc = item.iconUrl || faviconUrl(item.url) || '';

  const modal = document.createElement('div');
  modal.id = 'item-edit-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Edit Link</span>
        <button class="modal-close" onclick="document.getElementById('item-edit-modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <label class="form-label">Name</label>
        <input class="form-input" id="iem-name" value="${esc(item.name)}" placeholder="Link name" autocomplete="off">

        <label class="form-label">URL</label>
        <input class="form-input" id="iem-url" value="${esc(item.url)}" placeholder="https://"
          autocomplete="off" oninput="onItemUrlInput(this.value)">

        <label class="form-label">Icon</label>
        <div class="icon-preview-row">
          <div class="icon-preview-box">
            <img id="iem-icon-preview" src="${esc(iconSrc)}" onerror="this.style.display='none'"
              style="${iconSrc ? '' : 'display:none'}">
          </div>
          <div class="icon-btn-row">
            <button class="btn-sm" onclick="fetchFaviconForEdit()">Fetch favicon</button>
            <label class="btn-sm upload-label">Upload icon
              <input type="file" accept="image/*" style="display:none" onchange="onIconUpload(event)">
            </label>
            <button class="btn-sm" onclick="clearIconInEdit()">Clear</button>
          </div>
        </div>

        ${card.mode === 'icon-grid' ? `
          <div class="toggle-row">
            <label class="form-label" style="margin:0">Show label</label>
            <button class="toggle-btn${item.showLabel?' on':''}" id="iem-label-toggle"
              onclick="this.classList.toggle('on')">
              <span class="toggle-knob"></span>
            </button>
          </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn-sm" onclick="document.getElementById('item-edit-modal').remove()">Cancel</button>
        <button class="btn-primary" style="width:auto;padding:8px 20px"
          onclick="saveItemEdit('${itemId}')">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('iem-name').focus();
  document.getElementById('iem-name').select();
}

function onItemUrlInput(url) {
  const img = document.getElementById('iem-icon-preview');
  if (!img) return;
  const furl = faviconUrl(url);
  if (furl) {
    img.src = furl;
    img.style.display = '';
    img.onerror = () => { img.style.display = 'none'; };
  }
}

function fetchFaviconForEdit() {
  const url   = document.getElementById('iem-url')?.value;
  const img   = document.getElementById('iem-icon-preview');
  if (!img || !url) return;
  const furl = faviconUrl(url);
  if (!furl) return;
  img.src = furl;
  img.style.display = '';
  img.onerror = () => { img.style.display = 'none'; };
  // Mark as fetched (no custom override)
  const modal = document.getElementById('item-edit-modal');
  if (modal) { delete modal.dataset.pendingIcon; modal.dataset.clearIcon = ''; }
}

function onIconUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    const data = await resizeImage(ev.target.result, 64);
    const img  = document.getElementById('iem-icon-preview');
    if (img) { img.src = data; img.style.display = ''; }
    const modal = document.getElementById('item-edit-modal');
    if (modal) modal.dataset.pendingIcon = data;
  };
  reader.readAsDataURL(file);
}

function clearIconInEdit() {
  const img = document.getElementById('iem-icon-preview');
  if (img) { img.src = ''; img.style.display = 'none'; }
  const modal = document.getElementById('item-edit-modal');
  if (modal) { modal.dataset.pendingIcon = ''; modal.dataset.clearIcon = 'true'; }
}

async function saveItemEdit(itemId) {
  const name  = document.getElementById('iem-name')?.value.trim();
  const url   = document.getElementById('iem-url')?.value.trim();
  const modal = document.getElementById('item-edit-modal');
  const labelBtn = document.getElementById('iem-label-toggle');

  if (!name) { alert('Please enter a name.'); return; }
  if (!url)  { alert('Please enter a URL.'); return; }

  const fields = { name, url };

  if (modal?.dataset.clearIcon === 'true') {
    fields.iconUrl = null;
  } else if (modal?.dataset.pendingIcon) {
    fields.iconUrl = modal.dataset.pendingIcon;
  }
  if (labelBtn) fields.showLabel = labelBtn.classList.contains('on');

  await updateItem(itemId, fields);
  modal.remove();
  render();
}

// ── Image resize util ──
function resizeImage(dataUrl, maxPx) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale  = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

// ── Card drag-and-drop ──
let _dragCardId   = null;

function onCardDragStart(e, cardId) {
  _dragCardId = cardId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', cardId);
  requestAnimationFrame(() => {
    document.querySelector(`[data-card-id="${cardId}"]`)?.classList.add('dragging');
  });
}

function onCardDragOver(e, cardId) {
  if (!_dragCardId || _dragCardId === cardId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.link-card.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelector(`[data-card-id="${cardId}"]`)?.classList.add('drag-over');
}

function onCardDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function onCardDragEnd(e) {
  document.querySelectorAll('.link-card').forEach(el => el.classList.remove('dragging', 'drag-over'));
  _dragCardId = null;
}

function onCardDrop(e, targetCardId) {
  e.preventDefault();
  if (!_dragCardId || _dragCardId === targetCardId) return;
  document.querySelectorAll('.link-card').forEach(el => el.classList.remove('dragging', 'drag-over'));

  const fromIdx = state.cards.findIndex(c => c.id === _dragCardId);
  const toIdx   = state.cards.findIndex(c => c.id === targetCardId);
  if (fromIdx === -1 || toIdx === -1) return;

  const [moved] = state.cards.splice(fromIdx, 1);
  state.cards.splice(toIdx, 0, moved);
  reorderCards(state.cards.map(c => c.id));
  _dragCardId = null;
}

// ── Item drag-and-drop ──
let _dragItemId = null;

function onItemDragStart(e, itemId) {
  _dragItemId = itemId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', itemId);
  e.stopPropagation();
  requestAnimationFrame(() => {
    document.querySelector(`[data-item-id="${itemId}"]`)?.classList.add('dragging');
  });
}

function onItemDragOver(e, itemId) {
  if (!_dragItemId || _dragItemId === itemId) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('[data-item-id].drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelector(`[data-item-id="${itemId}"]`)?.classList.add('drag-over');
}

function onItemDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onItemDragEnd(e) {
  document.querySelectorAll('[data-item-id]').forEach(el => el.classList.remove('dragging', 'drag-over'));
  _dragItemId = null;
}

async function onItemDrop(e, targetItemId) {
  e.preventDefault();
  e.stopPropagation();
  if (!_dragItemId || _dragItemId === targetItemId) return;
  document.querySelectorAll('[data-item-id]').forEach(el => el.classList.remove('dragging', 'drag-over'));

  let srcGroup = null, tgtGroup = null;
  for (const c of state.cards) {
    for (const g of c.groups) {
      if (g.items.find(i => i.id === _dragItemId)) srcGroup = g;
      if (g.items.find(i => i.id === targetItemId)) tgtGroup = g;
    }
  }
  if (!srcGroup || !tgtGroup) { _dragItemId = null; return; }

  const srcItem = srcGroup.items.find(i => i.id === _dragItemId);
  srcGroup.items = srcGroup.items.filter(i => i.id !== _dragItemId);

  const tgtIdx = tgtGroup.items.findIndex(i => i.id === targetItemId);
  tgtGroup.items.splice(tgtIdx, 0, srcItem);
  srcItem.groupId = tgtGroup.id;

  await Promise.all(tgtGroup.items.map((item, i) =>
    sb.from('link_items').update({ sort_order: i, group_id: tgtGroup.id }).eq('id', item.id)
  ));
  if (srcGroup.id !== tgtGroup.id) {
    await Promise.all(srcGroup.items.map((item, i) =>
      sb.from('link_items').update({ sort_order: i }).eq('id', item.id)
    ));
  }

  _dragItemId = null;
  render();
  showSaved();
}

// ── Tab drag-and-drop (reorder within same card) ──
let _dragTabId = null;

function onTabDragStart(e, groupId) {
  _dragTabId = groupId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', groupId);
  e.stopPropagation();
}

let _tabHoverTimer = null;

function onTabDragOver(e, cardId, groupIdx, groupId) {
  if (_dragItemId) {
    // Item drag — hover over a tab to switch to it after a short delay
    e.preventDefault();
    e.stopPropagation();
    if ((activeGroups[cardId] || 0) !== groupIdx) {
      if (!e.currentTarget.dataset.hoverPending) {
        e.currentTarget.dataset.hoverPending = '1';
        clearTimeout(_tabHoverTimer);
        _tabHoverTimer = setTimeout(() => {
          delete e.currentTarget.dataset.hoverPending;
          activeGroups[cardId] = groupIdx;
          const sy = window.scrollY;
          render();
          window.scrollTo(0, sy);
        }, 600);
      }
    }
    return;
  }
  // Tab reorder drag
  if (!_dragTabId || _dragTabId === groupId) return;
  e.preventDefault();
  e.stopPropagation();
}

function onTabDragLeave(e) {
  clearTimeout(_tabHoverTimer);
  delete e.currentTarget.dataset.hoverPending;
}

// ── List / icon-grid drop zone (drop into group, not onto a specific item) ──
function onListDragOver(e, groupId) {
  if (!_dragItemId) return;
  if (e.target.closest('[data-item-id]')) return;
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.add('drop-target');
}

function onListDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drop-target');
  }
}

async function onListDrop(e, groupId) {
  if (!_dragItemId) return;
  if (e.target.closest('[data-item-id]')) return;
  e.preventDefault();
  e.stopPropagation();

  const tgtGroup = findGroup(groupId);
  if (!tgtGroup) { _dragItemId = null; return; }

  let srcGroup = null;
  for (const c of state.cards) {
    for (const g of c.groups) {
      if (g.items.find(i => i.id === _dragItemId)) { srcGroup = g; break; }
    }
    if (srcGroup) break;
  }
  if (!srcGroup || srcGroup.id === groupId) {
    e.currentTarget.classList.remove('drop-target');
    _dragItemId = null;
    return;
  }

  const item = srcGroup.items.find(i => i.id === _dragItemId);
  srcGroup.items = srcGroup.items.filter(i => i.id !== _dragItemId);
  item.groupId   = groupId;
  item.sortOrder = tgtGroup.items.length;
  tgtGroup.items.push(item);

  await Promise.all([
    sb.from('link_items').update({ group_id: groupId, sort_order: item.sortOrder }).eq('id', item.id),
    ...srcGroup.items.map((i, idx) => sb.from('link_items').update({ sort_order: idx }).eq('id', i.id)),
  ]);

  _dragItemId = null;
  render();
  showSaved();
}

function onTabDrop(e, targetGroupId) {
  e.preventDefault();
  e.stopPropagation();
  if (!_dragTabId || _dragTabId === targetGroupId) return;

  for (const c of state.cards) {
    const fromIdx = c.groups.findIndex(g => g.id === _dragTabId);
    const toIdx   = c.groups.findIndex(g => g.id === targetGroupId);
    if (fromIdx === -1 || toIdx === -1) continue;

    const [moved] = c.groups.splice(fromIdx, 1);
    c.groups.splice(toIdx, 0, moved);
    Promise.all(c.groups.map((g, i) =>
      sb.from('link_groups').update({ sort_order: i }).eq('id', g.id)
    ));
    render();
    showSaved();
    break;
  }
  _dragTabId = null;
}
