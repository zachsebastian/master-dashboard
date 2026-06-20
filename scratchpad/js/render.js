// ── HTML escape ──
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── UI state ──
let _editingId      = null;   // note id being edited inline
let _reviewingId    = null;   // note id awaiting review-note input before being marked reviewed
let _exportOpen     = false;  // export modal visible
let _exportFilter   = { unreviewed: true, reviewed: true }; // which notes to export
let _delegationBound = false; // #app click delegation bound once

// Modules a note can point to — every module the user has enabled (from the
// shared APP_MODULES registry), minus the scratchpad itself. New modules show
// up here automatically once added to the registry and granted to the user.
function availableModules() {
  return APP_MODULES.filter(m => m.id !== 'scratchpad' && _enabledModuleIds.has(m.id));
}

function moduleSelectHtml(selected) {
  const list = availableModules();
  // If a note already points at a module that's since been disabled, keep it
  // selectable so the existing tag isn't silently dropped on edit.
  if (selected && !list.some(m => m.id === selected)) {
    const extra = appModuleById(selected);
    if (extra) list.push(extra);
  }
  return `<option value="">— No module —</option>` +
    list.map(m => `<option value="${m.id}"${m.id === selected ? ' selected' : ''}>${escHtml(m.name)}</option>`).join('');
}

function moduleBadge(note) {
  if (!note.module) return '';
  const m = appModuleById(note.module);
  if (!m) return '';
  return `<a class="scratch-module-badge" href="${m.href}" title="Flesh this out in ${escHtml(m.name)}">→ ${escHtml(m.name)}</a>`;
}

// ── Loading state ──
function renderLoading() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
}

// ── Note card ──
function renderNote(note) {
  const id = escHtml(note.id);

  // Edit mode: inline textarea with Save / Cancel
  if (_editingId === note.id) {
    return `
      <div class="scratch-note is-editing" data-note-id="${id}">
        <textarea class="scratch-edit-textarea" id="scratch-edit-${id}" rows="3">${escHtml(note.text)}</textarea>
        <div class="scratch-note-meta scratch-note-meta--edit">
          <label class="scratch-module-inline">
            <span>Module</span>
            <select class="scratch-module-select" id="scratch-edit-module-${id}">${moduleSelectHtml(note.module || '')}</select>
          </label>
          <div class="scratch-note-actions scratch-note-actions--edit">
            <button class="scratch-action-btn primary" data-action="save-edit" data-id="${id}">Save</button>
            <button class="scratch-action-btn" data-action="cancel-edit" data-id="${id}">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  const pinLabel      = note.pinned   ? 'Unpin'           : 'Pin';
  const reviewedLabel = note.reviewed ? 'Mark Unreviewed' : 'Mark Reviewed';

  const badges = [
    note.pinned    ? `<span class="scratch-badge pinned">Pinned</span>`        : '',
    !note.reviewed ? `<span class="scratch-badge unreviewed">Unreviewed</span>` : '',
  ].join('');

  // Inline prompt shown after clicking "Mark Reviewed" — lets user optionally
  // record what they did before confirming the review.
  if (_reviewingId === note.id) {
    return `
      <div class="scratch-note is-reviewing" data-note-id="${id}">
        <p class="scratch-note-text">${escHtml(note.text)}</p>
        <div class="scratch-review-prompt">
          <label class="scratch-review-label">What did you do about this? <span class="scratch-review-optional">(optional)</span></label>
          <textarea class="scratch-review-textarea" id="scratch-review-${id}" rows="2" placeholder="Add a follow-up note…"></textarea>
          <div class="scratch-note-actions scratch-note-actions--edit">
            <button class="scratch-action-btn primary" data-action="review-confirm" data-id="${id}">Mark as Reviewed</button>
            <button class="scratch-action-btn" data-action="review-cancel" data-id="${id}">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  const reviewedNoteHtml = note.reviewed && note.reviewed_note
    ? `<p class="scratch-review-note">↳ ${escHtml(note.reviewed_note)}</p>`
    : '';

  return `
    <div class="scratch-note${note.pinned ? ' is-pinned' : ''}" data-note-id="${id}">
      <p class="scratch-note-text">${escHtml(note.text)}</p>
      ${reviewedNoteHtml}
      <div class="scratch-note-meta">
        <span class="scratch-note-time">${escHtml(formatTimestamp(note.created_at))}</span>
        ${badges}
        ${moduleBadge(note)}
        <div class="scratch-note-actions">
          <button class="scratch-action-btn"
                  data-action="edit"
                  data-id="${id}"
                  title="Edit">Edit</button>
          <button class="scratch-action-btn"
                  data-action="pin"
                  data-id="${id}"
                  title="${escHtml(pinLabel)}">${escHtml(pinLabel)}</button>
          <button class="scratch-action-btn"
                  data-action="reviewed"
                  data-id="${id}"
                  title="${escHtml(reviewedLabel)}">${escHtml(reviewedLabel)}</button>
          <button class="scratch-action-btn danger"
                  data-action="delete"
                  data-id="${id}"
                  title="Delete">Delete</button>
        </div>
      </div>
    </div>`;
}

// ── Main render ──
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const unreviewed = notes.filter(n => !n.reviewed);
  const reviewed   = notes.filter(n =>  n.reviewed);

  let listHtml;
  if (!notes.length) {
    listHtml = `<div class="scratch-empty">
         <div class="scratch-empty-title">No notes yet</div>
         <div>Capture a thought above to get started.</div>
       </div>`;
  } else {
    const unreviewedHtml = unreviewed.length
      ? `<div class="scratch-list">${unreviewed.map(renderNote).join('')}</div>`
      : `<div class="scratch-empty-section">Nothing unreviewed — you're all caught up.</div>`;

    const reviewedHtml = reviewed.length
      ? `<div class="scratch-reviewed-section">
           <div class="scratch-reviewed-header">Reviewed</div>
           <div class="scratch-list scratch-list--reviewed">${reviewed.map(renderNote).join('')}</div>
         </div>`
      : '';

    listHtml = unreviewedHtml + reviewedHtml;
  }

  app.innerHTML = `
    <div class="scratch-wrap">
      <div class="scratch-input-area">
        <textarea
          id="scratch-textarea"
          class="scratch-textarea"
          placeholder="What's on your mind?"
          rows="3"
        ></textarea>
        <div class="scratch-input-actions">
          <label class="scratch-module-inline">
            <span>Module</span>
            <select class="scratch-module-select" id="scratch-module">${moduleSelectHtml('')}</select>
          </label>
          <div class="scratch-input-buttons">
            <button class="btn btn-primary" id="scratch-submit">Capture</button>
          </div>
        </div>
      </div>
      ${notes.length ? `<div class="scratch-list-header">
        <span class="scratch-list-count">${notes.length} note${notes.length === 1 ? '' : 's'}</span>
        <button class="btn btn-sm" data-action="export-open">Export notes</button>
      </div>` : ''}
      ${listHtml}
    </div>
    ${_exportOpen ? renderExportModal() : ''}`;

  bindRenderEvents();
}

// ── Export modal ──
function exportNotes() {
  return notes.filter(n => n.reviewed ? _exportFilter.reviewed : _exportFilter.unreviewed);
}

function toggleExportFilter(which, checked) {
  _exportFilter[which] = checked;
  render();
}

function compileNotesText() {
  return exportNotes()
    .map(n => {
      const body = String(n.text || '').replace(/\s*\n\s*/g, ' ').trim();
      const m = n.module && appModuleById(n.module);
      return `- ${body}${m ? `  [→ ${m.name}]` : ''}`;
    })
    .join('\n');
}

function renderExportModal() {
  const text       = compileNotesText();
  const unrevCount = notes.filter(n => !n.reviewed).length;
  const revCount   = notes.filter(n =>  n.reviewed).length;
  const count      = exportNotes().length;
  return `
    <div class="scratch-modal-backdrop">
      <div class="scratch-modal">
        <div class="scratch-modal-head">
          <div class="scratch-modal-title">Export notes</div>
          <button class="scratch-action-btn" data-action="export-close" title="Close">Close</button>
        </div>
        <div class="scratch-export-filters">
          <label class="scratch-export-filter">
            <input type="checkbox" ${_exportFilter.unreviewed ? 'checked' : ''}
              onchange="toggleExportFilter('unreviewed', this.checked)">
            Unreviewed (${unrevCount})
          </label>
          <label class="scratch-export-filter">
            <input type="checkbox" ${_exportFilter.reviewed ? 'checked' : ''}
              onchange="toggleExportFilter('reviewed', this.checked)">
            Reviewed (${revCount})
          </label>
        </div>
        <p class="scratch-modal-sub">${count} note${count === 1 ? '' : 's'} selected — copy and paste anywhere.</p>
        <textarea class="scratch-export-text" id="scratch-export-text" readonly rows="12" placeholder="No notes selected.">${escHtml(text)}</textarea>
        <div class="scratch-modal-foot">
          <button class="scratch-action-btn" data-action="export-close">Close</button>
          <button class="btn btn-primary" data-action="export-copy">Copy to clipboard</button>
        </div>
      </div>
    </div>`;
}

async function copyExport(btn) {
  const text = compileNotesText();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) { /* fall back below */ }
  if (!ok) {
    const ta = document.getElementById('scratch-export-text');
    if (ta) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (_) {} }
  }
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = ok ? 'Copied!' : 'Press ⌘C to copy';
    setTimeout(() => { if (document.body.contains(btn)) btn.textContent = orig; }, 1600);
  }
}

// ── Event binding (called after every render) ──
function bindRenderEvents() {
  const textarea = document.getElementById('scratch-textarea');
  const submitBtn = document.getElementById('scratch-submit');

  // Auto-grow textarea
  function autoGrow() {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }
  if (textarea) {
    textarea.addEventListener('input', autoGrow);
    // Allow Cmd+Enter / Ctrl+Enter to submit
    textarea.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    });
  }

  // Submit button
  if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmit);
  }

  // Delegate note/export actions. Bind once — #app persists across renders,
  // so re-adding here every render would stack duplicate handlers.
  if (!_delegationBound) {
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.addEventListener('click', onAppClick);
      _delegationBound = true;
    }
  }
}

// ── Delegated click handler (bound once) ──
async function onAppClick(e) {
  // Click on the dimmed backdrop (outside the card) closes the export modal
  if (e.target.classList && e.target.classList.contains('scratch-modal-backdrop')) {
    _exportOpen = false; render(); return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;

  switch (action) {
    case 'delete':
      if (!confirm('Delete this note? This can\'t be undone.')) return;
      await deleteNote(id); render(); break;
    case 'pin': await togglePin(id); render(); break;
    case 'reviewed': {
      const note = notes.find(n => n.id === id);
      if (!note) break;
      if (note.reviewed) {
        // Un-reviewing: no prompt needed
        await toggleReviewed(id); render();
      } else {
        // Marking reviewed: show inline note prompt first
        _reviewingId = id; render();
        document.getElementById(`scratch-review-${id}`)?.focus();
      }
      break;
    }
    case 'review-confirm': {
      const ta = document.getElementById(`scratch-review-${id}`);
      const reviewNote = ta ? ta.value.trim() : '';
      await toggleReviewed(id, reviewNote || null);
      _reviewingId = null; render(); break;
    }
    case 'review-cancel': _reviewingId = null; render(); break;
    case 'edit': {
      _editingId = id; render();
      const ta = document.getElementById(`scratch-edit-${id}`);
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
      break;
    }
    case 'save-edit': {
      const ta  = document.getElementById(`scratch-edit-${id}`);
      const ms  = document.getElementById(`scratch-edit-module-${id}`);
      const val = ta ? ta.value.trim() : '';
      if (val) await editNote(id, val, ms ? ms.value : '');
      _editingId = null; render(); break;
    }
    case 'cancel-edit': _editingId = null; render(); break;
    case 'export-open':  _exportOpen = true;  render(); break;
    case 'export-close': _exportOpen = false; render(); break;
    case 'export-copy':  await copyExport(btn); break;
  }
}

// ── Submit handler ──
async function handleSubmit() {
  const textarea = document.getElementById('scratch-textarea');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) return;
  const moduleSel = document.getElementById('scratch-module');
  const module = moduleSel ? moduleSel.value : '';
  const submitBtn = document.getElementById('scratch-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }
  await addNote(text, module);
  render();
  // Focus textarea again after render (render replaces DOM)
  const fresh = document.getElementById('scratch-textarea');
  if (fresh) fresh.focus();
}
