// ── HTML escape ──
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Loading state ──
function renderLoading() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
}

// ── Note card ──
function renderNote(note) {
  const pinLabel      = note.pinned   ? 'Unpin'              : 'Pin';
  const reviewedLabel = note.reviewed ? 'Mark Unreviewed'    : 'Mark Reviewed';

  const badges = [
    note.pinned   ? `<span class="scratch-badge pinned">Pinned</span>`        : '',
    !note.reviewed ? `<span class="scratch-badge unreviewed">Unreviewed</span>` : '',
  ].join('');

  return `
    <div class="scratch-note${note.pinned ? ' is-pinned' : ''}" data-note-id="${escHtml(note.id)}">
      <p class="scratch-note-text">${escHtml(note.text)}</p>
      <div class="scratch-note-meta">
        <span class="scratch-note-time">${escHtml(formatTimestamp(note.created_at))}</span>
        ${badges}
        <div class="scratch-note-actions">
          <button class="scratch-action-btn"
                  data-action="pin"
                  data-id="${escHtml(note.id)}"
                  title="${escHtml(pinLabel)}">${escHtml(pinLabel)}</button>
          <button class="scratch-action-btn"
                  data-action="reviewed"
                  data-id="${escHtml(note.id)}"
                  title="${escHtml(reviewedLabel)}">${escHtml(reviewedLabel)}</button>
          <button class="scratch-action-btn danger"
                  data-action="delete"
                  data-id="${escHtml(note.id)}"
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
<button class="btn btn-primary" id="scratch-submit">Capture</button>
        </div>
      </div>
      ${listHtml}
    </div>`;

  bindRenderEvents();
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

  // Action buttons (pin, reviewed, delete)
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = btn.dataset.id;
      if (!id) return;

      if (action === 'delete') {
        if (!confirm('Delete this note? This can\'t be undone.')) return;
        await deleteNote(id);
        render();
      } else if (action === 'pin') {
        await togglePin(id);
        render();
      } else if (action === 'reviewed') {
        await toggleReviewed(id);
        render();
      }
    });
  }
}

// ── Submit handler ──
async function handleSubmit() {
  const textarea = document.getElementById('scratch-textarea');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) return;
  const submitBtn = document.getElementById('scratch-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }
  await addNote(text);
  render();
  // Focus textarea again after render (render replaces DOM)
  const fresh = document.getElementById('scratch-textarea');
  if (fresh) fresh.focus();
}
