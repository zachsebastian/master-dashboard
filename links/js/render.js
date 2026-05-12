// ── Hero helpers ──
let _weather    = null; // populated by app.js after wttr.in fetch
let _heroTimer  = null;

function _greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good evening';
}
function _fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function _fmtDate(d) {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
function _firstName() {
  if (!_currentUser) return '';
  const meta = _currentUser.user_metadata || {};
  const full  = meta.full_name || meta.name || '';
  if (full) return full.split(' ')[0];
  const prefix = (_currentUser.email || '').split('@')[0].split(/[._]/)[0];
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

function faviconEl(item, imgClass, monoClass) {
  const letter = esc((item.name || '?').charAt(0).toUpperCase());
  const src = item.iconUrl || faviconUrl(item.url);
  if (!src) return `<span class="${monoClass}">${letter}</span>`;
  return `<img class="${imgClass}" src="${esc(src)}" onerror="this.outerHTML='<span class=\\'${monoClass}\\'>${letter}</span>'">`;
}

function renderHero() {
  const name = _firstName();
  const now  = new Date();
  const weatherPart = _weather
    ? `<span class="hero-sep">·</span><span class="hero-weather-inline">${esc(String(_weather.tempF))}° ${esc(_weather.condition)}${_weather.location ? ' · ' + esc(_weather.location) : ''}</span>`
    : '';
  return `
    <div class="links-hero">
      <div class="hero-content">
        <div class="hero-greeting">
          <span class="hero-greeting-verb" data-hero-greeting>${esc(_greeting())}</span>${name ? `<span class="hero-comma">,</span> <span class="hero-name">${esc(name)}</span>` : ''}<span class="hero-period">.</span>
        </div>
        <div class="hero-meta">
          <span data-hero-date>${esc(_fmtDate(now))}</span>
          <span class="hero-sep">·</span>
          <span data-hero-time>${esc(_fmtTime(now))}</span>
          ${weatherPart}
        </div>
      </div>
    </div>`;
}

function startHeroClock() {
  clearInterval(_heroTimer);
  _heroTimer = setInterval(() => {
    const d = new Date();
    const tEl = document.querySelector('[data-hero-time]');
    const gEl = document.querySelector('[data-hero-greeting]');
    const dEl = document.querySelector('[data-hero-date]');
    if (tEl) tEl.textContent = _fmtTime(d);
    if (gEl) gEl.textContent = _greeting();
    if (dEl) dEl.textContent = _fmtDate(d);
  }, 30000);
}

// ── Top-level render ──
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  applyZoom();
  searchQuery.trim() ? renderSearchView(app) : renderGridView(app);
  rebalanceIconGrids();
}

function applyZoom() {
  document.documentElement.style.setProperty('--lz', state.settings.zoom);
}

// ── Grid view ──
function renderGridView(app) {
  clearInterval(_heroTimer);
  const cols = state.settings.gridCols;
  app.innerHTML = `
    ${renderHero()}
    ${renderToolbar()}
    <div id="links-grid" class="links-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))"
         ondragover="onGridDragOver(event)" ondrop="onGridDrop(event)">
      ${state.cards.map(c => renderCard(c)).join('')}
      ${editMode ? `<button class="add-card-tile" onclick="addCard()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Card
      </button>` : state.cards.length === 0 ? renderEmptyPage() : ''}
    </div>`;
  startHeroClock();
}

function renderToolbar() {
  const cols = state.settings.gridCols;
  const zoom = state.settings.zoom;
  return `
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="search-wrap">
          <button class="search-btn" id="search-btn" onclick="toggleSearch()" title="Search links">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <input type="text" id="search-input" class="search-input hidden"
            placeholder="Search links…"
            oninput="onSearch(this.value)"
            onkeydown="if(event.key==='Escape')clearSearch()">
        </div>
      </div>
      <div class="toolbar-right">
        <div class="grid-controls">
          <label class="slider-label" title="Grid columns">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="4" height="18" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
            <input type="range" id="cols-slider" min="1" max="8" value="${cols}" oninput="onColsChange(+this.value)">
            <span class="slider-val" id="cols-val">${cols}</span>
          </label>
          <label class="slider-label" title="Zoom">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            <input type="range" id="zoom-slider" min="0.7" max="1.4" step="0.05" value="${zoom}" oninput="onZoomChange(+this.value)">
          </label>
        </div>
        ${editMode
          ? `<button class="edit-mode-btn cancel" onclick="cancelEditMode()">Cancel</button>
             <button class="edit-mode-btn active" onclick="toggleEditMode()">Done</button>`
          : `<button class="edit-mode-btn" onclick="toggleEditMode()">Edit</button>`}
      </div>
    </div>`;
}

function renderEmptyPage() {
  return `
    <div class="empty-page" style="grid-column:1/-1">
      <div class="empty-page-title">Your link board is empty</div>
      <p class="empty-page-sub">Click <strong>Edit</strong> to start adding cards and organizing your bookmarks.</p>
    </div>`;
}

// ── Card ──
function renderCard(card) {
  const activeIdx = Math.min(activeGroups[card.id] || 0, Math.max(0, card.groups.length - 1));
  const activeGroup = card.groups[activeIdx] || null;
  const cols = Math.min(card.colSpan, state.settings.gridCols);

  return `
    <div class="link-card${editMode ? ' edit-active' : ''}"
         data-card-id="${card.id}"
         style="grid-column:span ${cols};grid-row:span ${card.rowSpan}"
         ${editMode ? `draggable="true"
           ondragstart="onCardDragStart(event,'${card.id}')"
           ondragover="onCardDragOver(event,'${card.id}')"
           ondrop="onCardDrop(event,'${card.id}')"
           ondragleave="onCardDragLeave(event)"
           ondragend="onCardDragEnd(event)"` : ''}>

      ${editMode ? `<div class="card-drag-handle" title="Drag to reorder">⠿</div>` : ''}

      <div class="card-header">
        ${editMode
          ? `<input class="card-name-input" value="${esc(card.name)}"
               onchange="updateCard('${card.id}',{name:this.value})"
               onclick="event.stopPropagation()">`
          : `<span class="card-name">${esc(card.name)}</span>`}
        ${editMode ? renderCardActions(card) : ''}
      </div>

      ${renderTabs(card, activeIdx)}

      <div class="card-body">
        ${activeGroup ? renderGroupBody(card, activeGroup) : `<div class="empty-group">No tabs</div>`}
      </div>
      ${activeGroup && card.mode === 'list' ? renderListPagination(activeGroup) : ''}
    </div>`;
}

function renderCardActions(card) {
  const atMinCol = card.colSpan <= 1;
  const atMaxCol = card.colSpan >= state.settings.gridCols;
  const atMinRow = card.rowSpan <= 1;
  const modeTitle = card.mode === 'list' ? 'Switch to icon grid' : 'Switch to list';
  const modeIcon  = card.mode === 'list'
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>`;

  return `
    <div class="card-header-actions">
      <button class="card-btn mode-btn" title="${modeTitle}"
        onclick="updateCard('${card.id}',{mode:'${card.mode==='list'?'icon-grid':'list'}',});render();">
        ${modeIcon}
      </button>
      <div class="resize-controls">
        <button class="card-btn" title="Fewer columns" onclick="resizeCard('${card.id}','col',-1)" ${atMinCol?'disabled':''}>◀</button>
        <span class="resize-label">${card.colSpan}×${card.rowSpan}</span>
        <button class="card-btn" title="More columns"  onclick="resizeCard('${card.id}','col',1)"  ${atMaxCol?'disabled':''}>▶</button>
        <button class="card-btn" title="Fewer rows"    onclick="resizeCard('${card.id}','row',-1)" ${atMinRow?'disabled':''}>▲</button>
        <button class="card-btn" title="More rows"     onclick="resizeCard('${card.id}','row',1)">▼</button>
      </div>
      <button class="card-btn danger" title="Delete card" onclick="confirmDeleteCard('${card.id}')">×</button>
    </div>`;
}

// ── Tabs ──
function renderTabs(card, activeIdx) {
  if (!card.groups.length && !editMode) return '';
  if (card.groups.length <= 1 && !editMode) return '';
  return `
    <div class="card-tabs"
         ${editMode ? `ondragover="onTabBarDragOver(event)" ondrop="onTabBarDrop(event)"` : ''}>
      ${card.groups.map((g, i) => `
        <button class="card-tab${i===activeIdx?' active':''}"
          data-group-id="${g.id}"
          onclick="setActiveGroup('${card.id}',${i})"
          ${editMode ? `draggable="true"
            ondragstart="onTabDragStart(event,'${g.id}')"
            ondragover="onTabDragOver(event,'${g.id}')"
            ondrop="onTabDrop(event,'${g.id}')"
            ondragend="onTabDragEnd(event)"` : ''}>
          ${editMode ? `
            <span class="tab-name" contenteditable="true" spellcheck="false"
              onclick="event.stopPropagation()"
              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
              onblur="updateGroup('${g.id}',{name:this.textContent.trim()||'Tab'})">${esc(g.name)}</span>
            <button class="tab-action-btn" title="Move to another card"
              onclick="event.stopPropagation();showMoveGroupMenu('${g.id}')">↗</button>
            <button class="tab-action-btn" title="Delete tab"
              onclick="event.stopPropagation();confirmDeleteGroup('${g.id}')">×</button>
          ` : esc(g.name)}
        </button>`).join('')}
      ${editMode ? `<button class="card-tab add-tab-btn" title="Add tab" onclick="addGroup('${card.id}')">+</button>` : ''}
    </div>`;
}

// ── Group body (list or icon-grid) ──
const PAGE_SIZE = 6;

function renderGroupBody(card, group) {
  return card.mode === 'icon-grid'
    ? renderIconGrid(card, group)
    : renderLinkList(card, group);
}

function renderLinkList(card, group) {
  if (!group.items.length && !editMode) {
    return `<div class="empty-group">No links yet</div>`;
  }
  const page = editMode ? 0 : (activePages[group.id] || 0);
  const totalPages = Math.ceil(group.items.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const items = editMode ? group.items : group.items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  return `
    <ul class="link-list" data-group-id="${group.id}">
      ${items.map(item => `
        <li class="link-item${editMode?' edit-item':''}" data-item-id="${item.id}"
          ${editMode ? `draggable="true"
            ondragstart="onItemDragStart(event,'${item.id}')"
            ondragover="onItemDragOver(event,'${item.id}')"
            ondrop="onItemDrop(event,'${item.id}')"
            ondragleave="onItemDragLeave(event)"
            ondragend="onItemDragEnd(event)"` : ''}>
          ${editMode ? `<span class="item-drag-handle">⠿</span>` : ''}
          ${faviconEl(item, 'link-favicon', 'link-favicon-mono')}
          ${editMode
            ? `<span class="link-name-static">${esc(item.name)}</span>
               <button class="item-btn edit" onclick="openItemEdit('${item.id}')" title="Edit">✎</button>
               <button class="item-btn del"  onclick="deleteItem('${item.id}')"   title="Delete">×</button>`
            : `<a class="link-anchor" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.name)}</a>`}
        </li>`).join('')}
      ${editMode ? `<li class="add-item-row"><button class="add-item-btn" onclick="addItem('${group.id}')">+ Add link</button></li>` : ''}
    </ul>`;
}

function renderListPagination(group) {
  const page = activePages[group.id] || 0;
  const totalPages = Math.ceil(group.items.length / PAGE_SIZE);
  if (totalPages <= 1) return '';
  const safePage = Math.min(page, totalPages - 1);
  return `
    <div class="list-page-arrows">
      <button class="list-page-arrow prev${safePage === 0 ? ' hidden' : ''}" onclick="setListPage('${group.id}',${safePage - 1})" title="Previous page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="list-page-indicator">${safePage + 1} / ${totalPages}</span>
      <button class="list-page-arrow next${safePage === totalPages - 1 ? ' hidden' : ''}" onclick="setListPage('${group.id}',${safePage + 1})" title="Next page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>`;
}

function renderIconGrid(card, group) {
  if (!group.items.length && !editMode) {
    return `<div class="empty-group">No links yet</div>`;
  }
  return `
    <div class="icon-grid" data-group-id="${group.id}">
      ${group.items.map(item => `
        <div class="icon-item-wrap" data-item-id="${item.id}"
          ${editMode ? `draggable="true"
            ondragstart="onItemDragStart(event,'${item.id}')"
            ondragover="onItemDragOver(event,'${item.id}')"
            ondrop="onItemDrop(event,'${item.id}')"
            ondragleave="onItemDragLeave(event)"
            ondragend="onItemDragEnd(event)"` : ''}>
          ${editMode
            ? `<div class="icon-item editing-icon" onclick="openItemEdit('${item.id}')">
                 <div class="icon-img-wrap">
                   ${faviconEl(item, 'icon-img', 'icon-img-mono')}
                   <div class="icon-edit-overlay">✎</div>
                 </div>
                 <span class="icon-label">${esc(item.name)}</span>
               </div>
               <button class="icon-del-btn" onclick="event.stopPropagation();deleteItem('${item.id}')" title="Delete">×</button>`
            : `<a class="icon-item" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">
                 <div class="icon-img-wrap">
                   ${faviconEl(item, 'icon-img', 'icon-img-mono')}
                 </div>
                 ${item.showLabel ? `<span class="icon-label">${esc(item.name)}</span>` : ''}
               </a>`}
        </div>`).join('')}
      ${editMode ? `
        <div class="icon-item-wrap">
          <button class="add-icon-btn" onclick="addItem('${group.id}')">
            <div class="add-icon-plus">+</div>
            <span class="icon-label">Add</span>
          </button>
        </div>` : ''}
    </div>`;
}

// ── Search view ──
function renderSearchView(app) {
  const q = searchQuery.toLowerCase();
  const results = [];
  for (const card of state.cards) {
    for (const group of card.groups) {
      for (const item of group.items) {
        if (item.name.toLowerCase().includes(q) || item.url.toLowerCase().includes(q)) {
          results.push({ card, group, item });
        }
      }
    }
  }

  app.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="search-wrap">
          <button class="search-btn active" onclick="clearSearch()" title="Close search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <input type="text" id="search-input" class="search-input"
            placeholder="Search links…"
            value="${esc(searchQuery)}"
            oninput="onSearch(this.value)"
            onkeydown="if(event.key==='Escape')clearSearch()"
            autofocus>
        </div>
      </div>
      <div class="toolbar-right">
        <span class="search-count">${results.length} result${results.length!==1?'s':''}</span>
        ${editMode
          ? `<button class="edit-mode-btn cancel" onclick="cancelEditMode()">Cancel</button>
             <button class="edit-mode-btn active" onclick="toggleEditMode()">Done</button>`
          : `<button class="edit-mode-btn" onclick="toggleEditMode()">Edit</button>`}
      </div>
    </div>
    <div class="search-results">
      ${results.length
        ? results.map(({card, group, item}) => `
            <a class="search-result-item"
               href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">
              <img class="link-favicon"
                src="${esc(item.iconUrl || faviconUrl(item.url) || '')}"
                onerror="this.style.display='none'"
                ${(!item.iconUrl && !faviconUrl(item.url)) ? 'style="display:none"' : ''}>
              <div class="search-result-text">
                <span class="search-result-name">${esc(item.name)}</span>
                <span class="search-result-meta">${esc(card.name)} › ${esc(group.name)}</span>
              </div>
              <span class="search-result-url">${esc(item.url)}</span>
            </a>`).join('')
        : `<div class="search-empty">No results for "${esc(searchQuery)}"</div>`}
    </div>`;

  const input = document.getElementById('search-input');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

// ── Utilities ──
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function renderLoading() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
}
