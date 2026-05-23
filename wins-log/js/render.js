// ── Wins Log – Render ──

// ── Helpers ──
function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function _formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function _catClass(category) {
  return (category || '').toLowerCase().replace(/\s+/g, '-');
}

// ── Modal state ──
let _modalCtx = null; // { type: 'add' | 'edit' | 'confirm', winId?, candidateId? }

// ── Main render ──
function renderLoading() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = '<div class="wl-loading">Loading wins log…</div>';
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const filtered = _getFilteredWins();

  app.innerHTML = `
    <div class="wl-layout">
      ${_renderCandidatesSection(_candidates)}
      ${_renderWinsSection(filtered)}
    </div>
    <div id="wl-modal-overlay" class="wl-modal-overlay" style="display:none;"></div>
  `;
}

// ── Section 1: AI Suggestions ──
function _renderCandidatesSection(candidates) {
  const count = candidates.length;
  return `
    <div class="wl-section" id="wl-candidates-section">
      <div class="wl-section-header">
        <div class="wl-section-title-wrap">
          <span class="wl-section-title">AI Suggestions</span>
          ${count > 0 ? `<span class="wl-count-badge">${count}</span>` : ''}
        </div>
        <button class="btn wl-scan-btn" onclick="runAiScan()"${_isScanning ? ' disabled' : ''}>
          ${_isScanning ? '⏳ Scanning…' : '✦ Scan for Wins'}
        </button>
      </div>
      ${count === 0
        ? `<div class="wl-empty-state wl-candidates-empty">
             <div class="wl-empty-icon">✦</div>
             <div class="wl-empty-text">No suggestions yet</div>
             <div class="wl-empty-sub">Click "Scan for Wins" to analyze your recent activity and surface wins worth logging.</div>
           </div>`
        : `<div class="wl-candidates-grid">${candidates.map(_renderCandidateCard).join('')}</div>`
      }
    </div>
  `;
}

function _renderCandidateCard(c) {
  return `
    <div class="wl-candidate-card" data-id="${_escHtml(c.id)}">
      <div class="wl-card-badges">
        <span class="wl-badge wl-badge-category wl-cat-${_catClass(c.category)}">${_escHtml(c.category)}</span>
        <span class="wl-badge wl-badge-source">${_escHtml(c.source)}</span>
        ${c.win_date ? `<span class="wl-badge wl-badge-date">${_formatDate(c.win_date)}</span>` : ''}
      </div>
      <div class="wl-card-title">${_escHtml(c.title)}</div>
      ${c.summary ? `<div class="wl-card-summary">${_escHtml(c.summary)}</div>` : ''}
      <div class="wl-card-actions">
        <button class="btn wl-btn-confirm" onclick="openConfirmCandidate('${_escHtml(c.id)}')">Confirm as Win</button>
        <button class="btn wl-btn-dismiss" onclick="dismissCandidateAndRender('${_escHtml(c.id)}')">Dismiss</button>
      </div>
    </div>
  `;
}

// ── Section 2: Your Wins ──
function _renderWinsSection(filtered) {
  const allMonths = _getWinMonths();
  const totalCount = _wins.length;

  return `
    <div class="wl-section" id="wl-wins-section">
      <div class="wl-section-header">
        <div class="wl-section-title-wrap">
          <span class="wl-section-title">Your Wins</span>
          ${totalCount > 0 ? `<span class="wl-wins-count">${totalCount} total</span>` : ''}
        </div>
        <div class="wl-filters">
          <select class="wl-filter-select" onchange="setWinsFilter('month', this.value)">
            <option value="all" ${_winsFilter.month === 'all' ? 'selected' : ''}>All time</option>
            ${allMonths.map(m =>
              `<option value="${_escHtml(m.value)}" ${_winsFilter.month === m.value ? 'selected' : ''}>${_escHtml(m.label)}</option>`
            ).join('')}
          </select>
          <select class="wl-filter-select" onchange="setWinsFilter('source', this.value)">
            <option value="all" ${_winsFilter.source === 'all' ? 'selected' : ''}>All sources</option>
            ${['Projects','Metrics','Today List','Case Writer','Manual'].map(s =>
              `<option value="${s}" ${_winsFilter.source === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <select class="wl-filter-select" onchange="setWinsFilter('category', this.value)">
            <option value="all" ${_winsFilter.category === 'all' ? 'selected' : ''}>All categories</option>
            ${['Customer Impact','Process Improvement','Delivery','Relationship'].map(c =>
              `<option value="${c}" ${_winsFilter.category === c ? 'selected' : ''}>${c}</option>`
            ).join('')}
          </select>
        </div>
        <button class="btn wl-add-btn" onclick="openAddWin()">+ Add Win</button>
      </div>
      ${filtered.length === 0
        ? `<div class="wl-empty-state">
            ${totalCount === 0
              ? `<div class="wl-empty-icon">🏆</div>
                 <div class="wl-empty-text">No wins logged yet</div>
                 <div class="wl-empty-sub">Use AI Scan above, or click "+ Add Win" to log one manually.</div>`
              : `<div class="wl-empty-text">No wins match these filters</div>
                 <div class="wl-empty-sub">Try adjusting the month, source, or category filter.</div>`
            }
           </div>`
        : `<div class="wl-wins-list">${filtered.map(_renderWinRow).join('')}</div>`
      }
    </div>
  `;
}

function _renderWinRow(win) {
  return `
    <div class="wl-win-row" data-id="${_escHtml(win.id)}">
      <div class="wl-win-badges">
        <span class="wl-badge wl-badge-category wl-cat-${_catClass(win.category)}">${_escHtml(win.category)}</span>
        <span class="wl-badge wl-badge-source">${_escHtml(win.source)}</span>
      </div>
      <div class="wl-win-body">
        <div class="wl-win-title">${_escHtml(win.title)}</div>
        ${win.summary ? `<div class="wl-win-summary">${_escHtml(win.summary)}</div>` : ''}
      </div>
      <div class="wl-win-meta">
        <span class="wl-win-date">${_formatDate(win.win_date)}</span>
        <div class="wl-win-actions">
          <button class="btn wl-btn-icon" onclick="openEditWin('${_escHtml(win.id)}')" title="Edit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn wl-btn-icon wl-btn-delete" onclick="deleteWinAndRender('${_escHtml(win.id)}')" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── Modal ──
function _renderWinModal({ title, win, candidate }) {
  const w = win || candidate || {};
  const today = new Date().toISOString().split('T')[0];
  return `
    <div class="wl-modal">
      <div class="wl-modal-header">
        <span class="wl-modal-title">${_escHtml(title)}</span>
        <button class="sc-close" onclick="closeWlModal()" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="wl-modal-body">
        <div class="wl-form-group">
          <label class="wl-form-label">Title</label>
          <input type="text" class="wl-form-input" id="wl-modal-title-input"
            value="${_escHtml(w.title || '')}"
            placeholder="What did you accomplish?">
        </div>
        <div class="wl-form-group">
          <label class="wl-form-label">Summary <span class="wl-form-optional">(optional)</span></label>
          <textarea class="wl-form-textarea" id="wl-modal-summary" rows="3"
            placeholder="Why does it matter?">${_escHtml(w.summary || '')}</textarea>
        </div>
        <div class="wl-form-row">
          <div class="wl-form-group">
            <label class="wl-form-label">Category</label>
            <select class="wl-form-select" id="wl-modal-category">
              ${['Customer Impact','Process Improvement','Delivery','Relationship'].map(c =>
                `<option value="${c}" ${(w.category || 'Delivery') === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
            </select>
          </div>
          <div class="wl-form-group">
            <label class="wl-form-label">Source</label>
            <select class="wl-form-select" id="wl-modal-source">
              ${['Projects','Metrics','Today List','Case Writer','Manual'].map(s =>
                `<option value="${s}" ${(w.source || 'Manual') === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
          <div class="wl-form-group">
            <label class="wl-form-label">Date</label>
            <input type="date" class="wl-form-input wl-date-input" id="wl-modal-date"
              value="${_escHtml(w.win_date || today)}">
          </div>
        </div>
        <div id="wl-modal-error" class="wl-modal-error" style="display:none;"></div>
      </div>
      <div class="wl-modal-footer">
        <button class="btn" onclick="closeWlModal()">Cancel</button>
        <button class="btn wl-btn-primary" id="wl-modal-submit">Save Win</button>
      </div>
    </div>
  `;
}

function _showModalError(msg) {
  const el = document.getElementById('wl-modal-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function _overlayBg(e) {
  if (e.target === e.currentTarget) closeWlModal();
}

// ── Global action handlers ──
function openAddWin() {
  _modalCtx = { type: 'add' };
  _openModal({ title: 'Add Win' });
}

function openEditWin(winId) {
  const win = _wins.find(w => w.id === winId);
  if (!win) return;
  _modalCtx = { type: 'edit', winId };
  _openModal({ title: 'Edit Win', win });
}

function openConfirmCandidate(candidateId) {
  const candidate = _candidates.find(c => c.id === candidateId);
  if (!candidate) return;
  _modalCtx = { type: 'confirm', candidateId };
  _openModal({ title: 'Confirm Win', candidate });
  const submitBtn = document.getElementById('wl-modal-submit');
  if (submitBtn) submitBtn.textContent = 'Confirm Win';
}

function _openModal(opts) {
  const overlay = document.getElementById('wl-modal-overlay');
  if (!overlay) return;
  overlay.innerHTML = _renderWinModal(opts);
  overlay.style.display = 'flex';
  overlay.addEventListener('mousedown', _overlayBg);
  document.getElementById('wl-modal-submit').addEventListener('click', _submitWinModal);
  const titleInput = document.getElementById('wl-modal-title-input');
  if (titleInput) setTimeout(() => titleInput.focus(), 50);
}

function closeWlModal() {
  const overlay = document.getElementById('wl-modal-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  overlay.innerHTML = '';
  overlay.removeEventListener('mousedown', _overlayBg);
  _modalCtx = null;
}

async function _submitWinModal() {
  const titleEl = document.getElementById('wl-modal-title-input');
  const title   = (titleEl?.value || '').trim();
  if (!title) {
    _showModalError('Please enter a title.');
    titleEl?.focus();
    return;
  }

  const summary  = (document.getElementById('wl-modal-summary')?.value  || '').trim();
  const category = document.getElementById('wl-modal-category')?.value || 'Delivery';
  const source   = document.getElementById('wl-modal-source')?.value   || 'Manual';
  const winDate  = document.getElementById('wl-modal-date')?.value     || new Date().toISOString().split('T')[0];

  const submitBtn = document.getElementById('wl-modal-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

  try {
    const ctx = _modalCtx;
    if (ctx.type === 'add') {
      await addManualWin({ title, summary, category, source, winDate });
    } else if (ctx.type === 'edit') {
      await updateWin(ctx.winId, { title, summary, category, source, win_date: winDate });
    } else if (ctx.type === 'confirm') {
      await confirmCandidate(ctx.candidateId, { title, summary, category, source, winDate });
    }
    closeWlModal();
    render();
  } catch (err) {
    _showModalError(err.message || 'Failed to save. Please try again.');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = _modalCtx?.type === 'confirm' ? 'Confirm Win' : 'Save Win';
    }
  }
}

async function dismissCandidateAndRender(id) {
  await dismissCandidate(id);
  render();
}

async function deleteWinAndRender(id) {
  if (!confirm('Delete this win? This cannot be undone.')) return;
  await deleteWin(id);
  render();
}

function setWinsFilter(key, value) {
  _winsFilter[key] = value;
  render();
}

async function runAiScan() {
  if (_isScanning) return;
  if (!_wlKey) {
    alert('No Anthropic API key found. Add your key in profile settings.');
    return;
  }

  const scanBtn = document.querySelector('.wl-scan-btn');
  if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = '⏳ Scanning…'; }

  try {
    const count = await fetchAndSaveAiCandidates();
    render();
    if (count === 0) {
      // Show a brief notice under the candidates section
      const section = document.getElementById('wl-candidates-section');
      if (section) {
        const notice = document.createElement('div');
        notice.className = 'wl-scan-notice';
        notice.textContent = 'No new wins detected in the last 14 days — try again after logging more activity.';
        section.appendChild(notice);
        setTimeout(() => notice.remove(), 5000);
      }
    }
  } catch (err) {
    console.error('[Wins AI] scan error:', err);
    // Restore button if render() didn't already replace it
    const scanBtn2 = document.querySelector('.wl-scan-btn');
    if (scanBtn2) { scanBtn2.disabled = false; scanBtn2.textContent = '✦ Scan for Wins'; }
    // Show error in a notice
    const section = document.getElementById('wl-candidates-section');
    if (section) {
      const notice = document.createElement('div');
      notice.className = 'wl-scan-notice wl-scan-error';
      notice.textContent = err.message || 'AI scan failed. Please try again.';
      section.appendChild(notice);
      setTimeout(() => notice.remove(), 6000);
    }
  }
}
