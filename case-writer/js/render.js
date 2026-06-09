// ── Quill instances (keyed by field id) ──
let _quillEditors = {};

// ── Escape helper ──
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Loading ──
function renderLoading() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
}

// ── Top-level render ──
function render() {
  _quillEditors = {}; // clear stale instances on every view change
  const app = document.getElementById('app');
  if (!app) return;

  if (_view === 'list')               app.innerHTML = _renderList();
  else if (_view === 'form')          app.innerHTML = _renderForm();
  else if (_view === 'manage')        app.innerHTML = _renderManage();
  else if (_view === 'edit-template') app.innerHTML = _renderEditTemplate();

  _bindEvents();
}

// ─────────────────────────────────────────
// ── List view ──
// ─────────────────────────────────────────
function _renderList() {
  const templatesHtml = _templates.length === 0 ? `
    <div class="cw-empty">
      <div class="cw-empty-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div class="cw-empty-title">No templates yet</div>
      <div class="cw-empty-sub">Create your first template to start writing tickets.</div>
    </div>` : `
    <div class="cw-template-grid">
      ${_templates.map(t => `
        <div class="cw-template-card" data-template-id="${escHtml(t.id)}">
          <div class="cw-template-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div class="cw-template-card-body">
            <div class="cw-template-card-name">${escHtml(t.name)}</div>
            <div class="cw-template-card-meta">${t.fields.length} field${t.fields.length !== 1 ? 's' : ''}</div>
          </div>
          <button class="btn btn-primary cw-start-btn" data-template-id="${escHtml(t.id)}">New Ticket →</button>
        </div>
      `).join('')}
    </div>`;

  const draftsHtml = _drafts.length === 0 ? '' : `
    <div class="cw-drafts-section">
      <div class="cw-section-label">Drafts</div>
      <div class="cw-drafts-list">
        ${_drafts.map(d => `
          <div class="cw-draft-row">
            <div class="cw-draft-body">
              <div class="cw-draft-title">${escHtml(d.title || 'Untitled Draft')}</div>
              <div class="cw-draft-meta">${escHtml(d.template_name)} · ${escHtml(_fmtRelativeTime(d.updated_at))}</div>
            </div>
            <div class="cw-draft-actions">
              <button class="btn btn-sm cw-continue-draft-btn" data-draft-id="${escHtml(d.id)}">Continue →</button>
              <button class="btn btn-sm btn-danger cw-delete-draft-btn" data-draft-id="${escHtml(d.id)}">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;

  return `
    <div class="cw-wrap">
      <div class="cw-page-header">
        <div class="cw-page-title">Case Writer</div>
        <button class="btn" id="cw-manage-btn">Manage Templates</button>
      </div>
      ${templatesHtml}
      ${draftsHtml}
      ${_renderTicketsSection()}
    </div>`;
}

function _renderTicketRow(t) {
  return `
    <div class="cw-ticket-row${t.completed ? ' cw-ticket-completed' : ''}" data-ticket-id="${escHtml(t.id)}">
      <div class="cw-ticket-header">
        <div class="cw-ticket-check-wrap">
          <button class="cw-ticket-check-btn${t.completed ? ' checked' : ''}"
                  data-complete-id="${escHtml(t.id)}"
                  title="${t.completed ? 'Mark incomplete' : 'Mark complete'}">
            ${t.completed ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
          </button>
        </div>
        <div class="cw-ticket-info">
          <div class="cw-ticket-title">${escHtml(t.title || 'Untitled')}</div>
          <div class="cw-ticket-meta">${escHtml(t.template_name)} · ${escHtml(_fmtDate(t.submitted_at))}${t.jira_ticket ? ` · <span class="cw-ticket-jira-badge">${escHtml(t.jira_ticket)}</span>` : ''}</div>
        </div>
        <div class="cw-ticket-actions">
          ${!t.completed ? `<button class="btn btn-sm cw-reopen-ticket-btn" data-ticket-id="${escHtml(t.id)}">Re-open as Draft</button>` : ''}
          <button class="btn btn-sm btn-danger cw-delete-ticket-btn" data-ticket-id="${escHtml(t.id)}">Delete</button>
          <span class="cw-ticket-chevron">›</span>
        </div>
      </div>
      <div class="cw-ticket-content" style="display:none">
        <div class="cw-ticket-meta-row">
          <div class="cw-ticket-meta-field">
            <label class="cw-ticket-jira-label" for="cw-jira-${escHtml(t.id)}">Jira Ticket #</label>
            <div class="cw-ticket-jira-input-wrap">
              <input class="cw-input cw-ticket-jira-input" id="cw-jira-${escHtml(t.id)}" type="text" placeholder="e.g. PROJ-1234" value="${escHtml(t.jira_ticket || '')}">
              <button class="btn btn-sm cw-save-jira-btn" data-ticket-id="${escHtml(t.id)}">Save</button>
            </div>
          </div>
          <div class="cw-ticket-meta-field">
            <label class="cw-ticket-jira-label" for="cw-date-${escHtml(t.id)}">Date Submitted</label>
            <div class="cw-ticket-jira-input-wrap">
              <input class="cw-input cw-ticket-jira-input" id="cw-date-${escHtml(t.id)}" type="date" value="${escHtml(t.submitted_at ? t.submitted_at.split('T')[0] : '')}">
              <button class="btn btn-sm cw-save-date-btn" data-ticket-id="${escHtml(t.id)}">Save</button>
            </div>
          </div>
        </div>
        <div class="cw-ticket-body-content">${t.content_html}</div>
      </div>
    </div>`;
}

function _renderTicketsSection() {
  if (_tickets.length === 0) return '';

  const activeTickets    = _tickets.filter(t => !t.completed);
  const completedTickets = _tickets.filter(t =>  t.completed);
  const missingJira      = activeTickets.filter(t => !t.jira_ticket);
  const hasJira          = activeTickets.filter(t =>  t.jira_ticket);

  const missingBtnHtml = missingJira.length > 0 ? `
    <button class="btn btn-sm" id="cw-check-jira-btn" title="${missingJira.length} ticket${missingJira.length !== 1 ? 's' : ''} missing a Jira number">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      Check Submissions
      <span class="cw-jira-missing-badge">${missingJira.length}</span>
    </button>` : '';
  const statusBtnHtml = hasJira.length > 0 ? `
    <button class="btn btn-sm" id="cw-check-status-btn" title="Check completion status for ${hasJira.length} ticket${hasJira.length !== 1 ? 's' : ''} in Jira">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      Check Status
      <span class="cw-jira-status-badge">${hasJira.length}</span>
    </button>` : '';

  const completedSectionHtml = completedTickets.length > 0 ? `
    <div class="cw-tickets-completed-divider">
      <div class="cw-tickets-completed-line"></div>
      <div class="cw-tickets-completed-label">Completed (${completedTickets.length})</div>
      <div class="cw-tickets-completed-line"></div>
    </div>
    <div class="cw-tickets-list">
      ${completedTickets.map(t => _renderTicketRow(t)).join('')}
    </div>` : '';

  return `
    <div class="cw-tickets-section">
      <div class="cw-section-label-row">
        <div class="cw-section-label">Submitted Tickets</div>
        <div class="cw-section-label-actions">
          ${missingBtnHtml}
          ${statusBtnHtml}
        </div>
      </div>
      <div class="cw-tickets-list">
        ${activeTickets.length > 0
          ? activeTickets.map(t => _renderTicketRow(t)).join('')
          : '<div class="cw-tickets-empty">No active submitted tickets.</div>'}
      </div>
      ${completedSectionHtml}
    </div>`;
}

function _openJiraStatusModal() {
  if (document.getElementById('cw-jira-status-modal')) return;

  const hasJira = _tickets.filter(t => t.jira_ticket && !t.completed);
  if (!hasJira.length) return;

  const ticketList = hasJira.map((t, i) =>
    `${i + 1}. ${t.title || 'Untitled'} → ${t.jira_ticket}`
  ).join('\n');

  const prompt = `/jira-ticket-status\n\n${ticketList}`;

  const listItemsHtml = hasJira.map(t => `
    <div class="cw-jira-missing-item">
      <span class="cw-jira-status-dot"></span>
      <div>
        <div class="cw-jira-missing-title">${escHtml(t.title || 'Untitled')}</div>
        <div class="cw-jira-missing-meta">${escHtml(t.jira_ticket)} · ${escHtml(_fmtDate(t.submitted_at))}</div>
      </div>
    </div>`).join('');

  const modal = document.createElement('div');
  modal.id        = 'cw-jira-status-modal';
  modal.className = 'cw-ai-modal-overlay';
  modal.innerHTML = `
    <div class="cw-ai-modal cw-jira-modal-inner">
      <div class="cw-ai-modal-header">
        <div class="cw-ai-modal-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Check Ticket Status
        </div>
        <button class="cw-ai-modal-close" id="cw-jira-status-modal-close">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="cw-ai-modal-body">
        <p class="cw-ai-modal-intro">${hasJira.length} ticket${hasJira.length !== 1 ? 's' : ''} with Jira numbers. Use this prompt to check their completion status:</p>
        <div class="cw-jira-missing-list">
          ${listItemsHtml}
        </div>
        <div class="cw-jira-prompt-label">Claude prompt — copy and paste this to check status:</div>
        <div class="cw-jira-prompt-box">${escHtml(prompt)}</div>
      </div>
      <div class="cw-ai-modal-footer">
        <button class="btn" id="cw-jira-status-close-btn">Close</button>
        <button class="btn btn-primary" id="cw-jira-status-copy-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy Prompt
        </button>
      </div>
    </div>`;

  modal.addEventListener('mousedown', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  document.getElementById('cw-jira-status-modal-close')?.addEventListener('click', () => modal.remove());
  document.getElementById('cw-jira-status-close-btn')?.addEventListener('click',   () => modal.remove());
  document.getElementById('cw-jira-status-copy-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('cw-jira-status-copy-btn');
    await navigator.clipboard.writeText(prompt);
    if (btn) {
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      setTimeout(() => {
        if (document.getElementById('cw-jira-status-copy-btn'))
          document.getElementById('cw-jira-status-copy-btn').innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Prompt`;
      }, 2000);
    }
  });
}

// ─────────────────────────────────────────
// ── Form view ──
// ─────────────────────────────────────────
function _renderForm() {
  const t           = _activeTemplate;
  const savedValues = _activeDraft ? (_activeDraft.field_values || {}) : {};

  return `
    <div class="cw-wrap">
      <div class="cw-page-header">
        <button class="btn" id="cw-back-btn">← Back</button>
        <div class="cw-page-title">${escHtml(t.name)}</div>
        <div class="cw-form-header-actions">
          <button class="btn" id="cw-save-draft-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            ${_activeDraft ? 'Update Draft' : 'Save Draft'}
          </button>
          <button class="btn" id="cw-clear-btn">Clear</button>
        </div>
      </div>

      <div class="cw-form" id="cw-form">
        ${t.fields.map(f => _renderField(f, savedValues[f.id] || null)).join('')}
      </div>

      <div class="cw-form-footer">
        <button class="btn cw-ai-fill-btn" id="cw-ai-fill-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
          AI Assist
        </button>
        <button class="btn btn-primary" id="cw-generate-btn">Generate Ticket</button>
      </div>

      <div class="cw-output-wrap" id="cw-output-wrap" style="display:none">
        <div class="cw-output-header">
          <div class="cw-output-label">Generated Ticket</div>
          <div class="cw-output-header-actions">
            <button class="btn btn-primary" id="cw-submit-ticket-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Save as Submitted
            </button>
            <button class="btn" id="cw-copy-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>
        </div>
        <div class="cw-output-content" id="cw-output-content"></div>
      </div>
    </div>`;
}

function _renderField(f, savedState) {
  const enabled    = savedState ? savedState.enabled : true;
  const savedValue = savedState ? savedState.value   : null;

  let inputHtml = '';

  if (f.type === 'text') {
    const val = typeof savedValue === 'string' ? savedValue : '';
    inputHtml = `<input type="text" class="cw-input" data-field-id="${escHtml(f.id)}" value="${escHtml(val)}" ${enabled ? '' : 'disabled'}>`;

  } else if (f.type === 'textarea') {
    // Quill container — initialized after render in _bindFormEvents
    inputHtml = `<div class="cw-quill-wrap${enabled ? '' : ' cw-quill-disabled'}">
      <div class="cw-quill-editor" data-field-id="${escHtml(f.id)}"></div>
    </div>`;

  } else if (f.type === 'dropdown') {
    const val  = typeof savedValue === 'string' ? savedValue : '';
    const opts = (f.options || []).map(o =>
      `<option value="${escHtml(o)}" ${val === o ? 'selected' : ''}>${escHtml(o)}</option>`
    ).join('');
    inputHtml = `<select class="cw-select" data-field-id="${escHtml(f.id)}" ${enabled ? '' : 'disabled'}><option value="">— Select —</option>${opts}</select>`;

  } else if (f.type === 'numbered_list') {
    const items = Array.isArray(savedValue) && savedValue.length > 0 ? savedValue : [''];
    inputHtml = `
      <div class="cw-numbered-list" data-field-id="${escHtml(f.id)}">
        ${items.map((item, i) => `
          <div class="cw-list-row" data-index="${i}">
            <span class="cw-list-num">${i + 1}.</span>
            <input type="text" class="cw-input cw-list-input" value="${escHtml(item)}" ${enabled ? '' : 'disabled'}>
            <button class="cw-list-remove" title="Remove" ${enabled ? '' : 'disabled'}>×</button>
          </div>`).join('')}
        <button class="cw-list-add" ${enabled ? '' : 'disabled'}>+ Add item</button>
      </div>`;
  }

  return `
    <div class="cw-field-row${enabled ? '' : ' cw-field-disabled'}" data-field-id="${escHtml(f.id)}">
      <div class="cw-field-left">
        <input type="checkbox" class="cw-checkbox" data-field-id="${escHtml(f.id)}" ${enabled ? 'checked' : ''}>
        <label class="cw-field-label">${escHtml(f.label)}</label>
      </div>
      <div class="cw-field-input">
        ${inputHtml}
      </div>
    </div>`;
}

// ─────────────────────────────────────────
// ── Manage view ──
// ─────────────────────────────────────────
function _renderManage() {
  return `
    <div class="cw-wrap">
      <div class="cw-page-header">
        <button class="btn" id="cw-back-btn">← Back</button>
        <div class="cw-page-title">Manage Templates</div>
        <button class="btn btn-primary" id="cw-new-template-btn">+ New Template</button>
      </div>
      ${_templates.length === 0 ? `
        <div class="cw-empty">
          <div class="cw-empty-title">No templates yet</div>
          <div class="cw-empty-sub">Click "+ New Template" to create your first one.</div>
        </div>` : `
        <div class="cw-manage-list">
          ${_templates.map(t => `
            <div class="cw-manage-row">
              <div class="cw-manage-row-body">
                <div class="cw-manage-row-name">${escHtml(t.name)}</div>
                <div class="cw-manage-row-meta">${t.fields.length} field${t.fields.length !== 1 ? 's' : ''}</div>
              </div>
              <div class="cw-manage-row-actions">
                <button class="btn btn-sm cw-edit-template-btn" data-template-id="${escHtml(t.id)}">Edit</button>
                <button class="btn btn-sm btn-danger cw-delete-template-btn" data-template-id="${escHtml(t.id)}">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>`}
    </div>`;
}

// ─────────────────────────────────────────
// ── Edit Template view ──
// ─────────────────────────────────────────
function _renderEditTemplate() {
  const t    = _editingTemplate;
  const isNew = !t.id;

  return `
    <div class="cw-wrap">
      <div class="cw-page-header">
        <button class="btn" id="cw-back-btn">← Cancel</button>
        <div class="cw-page-title">${isNew ? 'New Template' : 'Edit Template'}</div>
        <button class="btn btn-primary" id="cw-save-template-btn">Save</button>
      </div>
      <div class="cw-edit-form">
        <div class="cw-edit-name-row">
          <label class="cw-edit-section-label">Template Name</label>
          <input type="text" class="cw-input" id="cw-template-name"
            value="${escHtml(t.name)}" placeholder="e.g. Bug Ticket" maxlength="80">
        </div>
        <div class="cw-edit-fields-header">
          <label class="cw-edit-section-label">Fields</label>
          <button class="btn" id="cw-add-field-btn">+ Add Field</button>
        </div>
        <div class="cw-edit-fields-list" id="cw-edit-fields-list">
          ${(t.fields || []).map((f, i) => _renderEditField(f, i)).join('')}
        </div>
        ${(t.fields || []).length === 0 ? `<div class="cw-edit-empty">Add your first field above.</div>` : ''}
      </div>
    </div>`;
}

function _renderEditField(f, idx) {
  const typeOptions = [
    ['text',          'Single line'],
    ['textarea',      'Rich text'],
    ['dropdown',      'Dropdown'],
    ['numbered_list', 'Numbered list'],
  ].map(([val, label]) =>
    `<option value="${val}" ${f.type === val ? 'selected' : ''}>${label}</option>`
  ).join('');

  return `
    <div class="cw-edit-field-row" data-idx="${idx}" data-field-id="${escHtml(f.id || '')}">
      <div class="cw-edit-field-main">
        <span class="cw-drag-handle" title="Drag to reorder">⠿</span>
        <input type="text" class="cw-input cw-edit-field-label-input"
          placeholder="Field label" value="${escHtml(f.label || '')}">
        <select class="cw-select cw-edit-field-type-select">
          ${typeOptions}
        </select>
        <button class="btn btn-sm btn-danger cw-remove-field-btn" title="Remove field">×</button>
      </div>
      <div class="cw-edit-field-options-wrap" style="${f.type === 'dropdown' ? '' : 'display:none'}">
        <label class="cw-edit-options-label">Options (one per line)</label>
        <textarea class="cw-textarea cw-edit-options-ta" rows="3">${escHtml((f.options || []).join('\n'))}</textarea>
      </div>
    </div>`;
}

// ─────────────────────────────────────────
// ── Event binding ──
// ─────────────────────────────────────────
function _bindEvents() {
  if (_view === 'list')               _bindListEvents();
  else if (_view === 'form')          _bindFormEvents();
  else if (_view === 'manage')        _bindManageEvents();
  else if (_view === 'edit-template') _bindEditTemplateEvents();
}

// ── List ──
function _bindListEvents() {
  document.getElementById('cw-manage-btn')?.addEventListener('click', () => {
    _view = 'manage'; render();
  });
  document.querySelectorAll('.cw-start-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const t = _templates.find(t => t.id === btn.dataset.templateId);
      if (t) { _activeTemplate = t; _activeDraft = null; _view = 'form'; render(); }
    });
  });
  document.querySelectorAll('.cw-template-card').forEach(card => {
    card.addEventListener('click', () => {
      const t = _templates.find(t => t.id === card.dataset.templateId);
      if (t) { _activeTemplate = t; _activeDraft = null; _view = 'form'; render(); }
    });
  });
  document.querySelectorAll('.cw-continue-draft-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const draft = _drafts.find(d => d.id === btn.dataset.draftId);
      if (!draft) return;
      const t = _templates.find(t => t.id === draft.template_id);
      if (!t) return;
      _activeTemplate = t; _activeDraft = draft; _view = 'form'; render();
    });
  });
  document.querySelectorAll('.cw-delete-draft-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this draft? This cannot be undone.')) return;
      btn.disabled = true;
      await deleteDraft(btn.dataset.draftId);
      render();
    });
  });

  // ── Mark complete / incomplete ──
  document.querySelectorAll('[data-complete-id]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.disabled = true;
      await toggleTicketCompleted(btn.dataset.completeId);
      render();
    });
  });

  // ── Jira check buttons ──
  document.getElementById('cw-check-jira-btn')?.addEventListener('click',   _openJiraCheckModal);
  document.getElementById('cw-check-status-btn')?.addEventListener('click', _openJiraStatusModal);

  // ── Submitted ticket rows ──
  document.querySelectorAll('.cw-ticket-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('button')) return; // let buttons handle themselves
      const row     = header.closest('.cw-ticket-row');
      const content = row.querySelector('.cw-ticket-content');
      const chevron = row.querySelector('.cw-ticket-chevron');
      const open    = content.style.display !== 'none';
      content.style.display = open ? 'none' : 'block';
      if (chevron) chevron.textContent = open ? '›' : '‹';
    });
  });

  document.querySelectorAll('.cw-reopen-ticket-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const ticket = _tickets.find(t => t.id === btn.dataset.ticketId);
      if (!ticket) return;
      btn.disabled = true;
      const ok = await reopenTicketAsDraft(ticket);
      if (ok) render();
      else btn.disabled = false;
    });
  });

  document.querySelectorAll('.cw-delete-ticket-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this submitted ticket? This cannot be undone.')) return;
      btn.disabled = true;
      await deleteTicket(btn.dataset.ticketId);
      render();
    });
  });

  document.querySelectorAll('.cw-save-date-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id    = btn.dataset.ticketId;
      const input = document.getElementById(`cw-date-${id}`);
      if (!input || !input.value) return;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const ok = await updateTicketDate(id, input.value);
      if (ok) {
        btn.textContent = '✓ Saved';
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Save'; }, 2000);
        // Update the visible meta line
        const row    = btn.closest('.cw-ticket-row');
        const meta   = row?.querySelector('.cw-ticket-meta');
        const ticket = _tickets.find(t => t.id === id);
        if (meta && ticket) {
          const jiraBadge = ticket.jira_ticket ? ` · <span class="cw-ticket-jira-badge">${escHtml(ticket.jira_ticket)}</span>` : '';
          meta.innerHTML = `${escHtml(ticket.template_name)} · ${escHtml(_fmtDate(ticket.submitted_at))}${jiraBadge}`;
        }
      } else {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    });
  });

  document.querySelectorAll('.cw-save-jira-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id    = btn.dataset.ticketId;
      const input = document.getElementById(`cw-jira-${id}`);
      if (!input) return;
      const val = input.value.trim();
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const ok = await updateTicketJira(id, val);
      if (ok) {
        btn.textContent = '✓ Saved';
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Save'; }, 2000);
        // Update the badge in the header without re-rendering
        const row    = btn.closest('.cw-ticket-row');
        const meta   = row?.querySelector('.cw-ticket-meta');
        if (meta) {
          const ticket = _tickets.find(t => t.id === id);
          if (ticket) meta.innerHTML = `${escHtml(ticket.template_name)} · ${escHtml(_fmtDate(ticket.submitted_at))}${val ? ` · <span class="cw-ticket-jira-badge">${escHtml(val)}</span>` : ''}`;
        }
      } else {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    });
  });
}

// ── Form ──
function _bindFormEvents() {
  // Initialize Quill editors for all textarea-type fields
  _initQuillEditors();

  // Back
  document.getElementById('cw-back-btn')?.addEventListener('click', () => {
    _view = 'list'; render();
  });

  // Save Draft
  document.getElementById('cw-save-draft-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('cw-save-draft-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const ok = await saveDraftFromForm();
    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = ok
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved`
        : 'Save Draft';
      if (ok) setTimeout(() => {
        if (document.getElementById('cw-save-draft-btn'))
          document.getElementById('cw-save-draft-btn').innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Update Draft`;
      }, 2000);
    }
  });

  // Clear
  document.getElementById('cw-clear-btn')?.addEventListener('click', () => {
    // Clear plain inputs & selects
    document.querySelectorAll('#cw-form .cw-input:not(.cw-list-input), #cw-form .cw-select').forEach(el => {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    // Clear Quill editors
    Object.values(_quillEditors).forEach(q => q.setContents([]));
    // Reset numbered lists
    document.querySelectorAll('.cw-numbered-list').forEach(list => {
      const addBtn = list.querySelector('.cw-list-add');
      list.querySelectorAll('.cw-list-row').forEach((r, i) => {
        if (i === 0) r.querySelector('input').value = '';
        else r.remove();
      });
      _bindListRowEvents(list);
    });
    // Re-enable all checkboxes
    document.querySelectorAll('.cw-checkbox').forEach(cb => {
      cb.checked = true;
      const row = cb.closest('.cw-field-row');
      if (row) _applyFieldEnabled(row, true);
    });
    const out = document.getElementById('cw-output-wrap');
    if (out) out.style.display = 'none';
  });

  // Checkboxes
  document.querySelectorAll('.cw-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const row = cb.closest('.cw-field-row');
      if (row) _applyFieldEnabled(row, cb.checked);
    });
  });

  // Numbered lists
  document.querySelectorAll('.cw-numbered-list').forEach(list => _bindListRowEvents(list));

  // AI Fill
  document.getElementById('cw-ai-fill-btn')?.addEventListener('click', _openAiFillModal);

  // Generate
  document.getElementById('cw-generate-btn')?.addEventListener('click', _generateTicket);

  // Save as Submitted Ticket
  document.getElementById('cw-submit-ticket-btn')?.addEventListener('click', _submitTicket);

  // Copy (rich text to clipboard)
  document.getElementById('cw-copy-btn')?.addEventListener('click', _copyOutput);
}

// ─────────────────────────────────────────
// ── AI Fill ──
// ─────────────────────────────────────────

function _openAiFillModal() {
  if (document.getElementById('cw-ai-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'cw-ai-modal';
  modal.className = 'cw-ai-modal-overlay';
  modal.innerHTML = `
    <div class="cw-ai-modal">
      <div class="cw-ai-modal-header">
        <div class="cw-ai-modal-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
          AI Assist
        </div>
        <button class="cw-ai-modal-close" id="cw-ai-modal-close">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="cw-ai-modal-body">
        <p class="cw-ai-modal-intro">Provide context and AI will fill out the ticket fields for you. Answer what you have — leave anything blank you don't know yet.</p>
        <div class="cw-ai-field">
          <label class="cw-ai-field-label" for="cw-ai-q1">Client's initial ask / complaint / problem</label>
          <textarea class="cw-ai-textarea" id="cw-ai-q1" placeholder="Paste the client's message, ticket, or describe their request…" rows="4"></textarea>
        </div>
        <div class="cw-ai-field">
          <label class="cw-ai-field-label" for="cw-ai-q2">Your initial assessment</label>
          <textarea class="cw-ai-textarea" id="cw-ai-q2" placeholder="Your internal analysis — what's the root cause, what's the impact…" rows="4"></textarea>
        </div>
        <div class="cw-ai-field">
          <label class="cw-ai-field-label" for="cw-ai-q3">Additional internal input</label>
          <textarea class="cw-ai-textarea" id="cw-ai-q3" placeholder="Any direction received, decisions made, or other relevant context…" rows="3"></textarea>
        </div>
        <div class="cw-ai-modal-error" id="cw-ai-modal-error" style="display:none"></div>
      </div>
      <div class="cw-ai-modal-footer">
        <button class="btn" id="cw-ai-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="cw-ai-modal-submit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
          Generate with AI
        </button>
      </div>
    </div>`;

  modal.addEventListener('mousedown', e => { if (e.target === modal) _closeAiFillModal(); });
  document.body.appendChild(modal);

  document.getElementById('cw-ai-modal-close')?.addEventListener('click', _closeAiFillModal);
  document.getElementById('cw-ai-modal-cancel')?.addEventListener('click', _closeAiFillModal);
  document.getElementById('cw-ai-modal-submit')?.addEventListener('click', _submitAiFill);
}

function _closeAiFillModal() {
  document.getElementById('cw-ai-modal')?.remove();
}

// ─────────────────────────────────────────
// ── Jira check modal ──
// ─────────────────────────────────────────
function _openJiraCheckModal() {
  if (document.getElementById('cw-jira-modal')) return;

  const missingJira = _tickets.filter(t => !t.jira_ticket);
  if (!missingJira.length) return;

  const ticketList = missingJira.map((t, i) =>
    `${i + 1}. ${t.title || 'Untitled'}`
  ).join('\n');

  const prompt = `/jira-ticket-lookup\n\n${ticketList}`;

  const listItemsHtml = missingJira.map(t => `
    <div class="cw-jira-missing-item">
      <span class="cw-jira-missing-dot"></span>
      <div>
        <div class="cw-jira-missing-title">${escHtml(t.title || 'Untitled')}</div>
        <div class="cw-jira-missing-meta">${escHtml(t.template_name)} · ${escHtml(_fmtDate(t.submitted_at))}</div>
      </div>
    </div>`).join('');

  const modal = document.createElement('div');
  modal.id        = 'cw-jira-modal';
  modal.className = 'cw-ai-modal-overlay';
  modal.innerHTML = `
    <div class="cw-ai-modal cw-jira-modal-inner">
      <div class="cw-ai-modal-header">
        <div class="cw-ai-modal-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Tickets Missing Jira Numbers
        </div>
        <button class="cw-ai-modal-close" id="cw-jira-modal-close">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="cw-ai-modal-body">
        <p class="cw-ai-modal-intro">${missingJira.length} submitted ticket${missingJira.length !== 1 ? 's' : ''} ${missingJira.length !== 1 ? 'don\'t have' : 'doesn\'t have'} a Jira ticket number yet:</p>
        <div class="cw-jira-missing-list">
          ${listItemsHtml}
        </div>
        <div class="cw-jira-prompt-label">Claude prompt — copy and paste this to look them up:</div>
        <div class="cw-jira-prompt-box" id="cw-jira-prompt-text">${escHtml(prompt)}</div>
      </div>
      <div class="cw-ai-modal-footer">
        <button class="btn" id="cw-jira-modal-close-btn">Close</button>
        <button class="btn btn-primary" id="cw-jira-copy-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy Prompt
        </button>
      </div>
    </div>`;

  modal.addEventListener('mousedown', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  document.getElementById('cw-jira-modal-close')?.addEventListener('click', () => modal.remove());
  document.getElementById('cw-jira-modal-close-btn')?.addEventListener('click', () => modal.remove());
  document.getElementById('cw-jira-copy-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('cw-jira-copy-btn');
    await navigator.clipboard.writeText(prompt);
    if (btn) {
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      setTimeout(() => {
        if (document.getElementById('cw-jira-copy-btn'))
          document.getElementById('cw-jira-copy-btn').innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Prompt`;
      }, 2000);
    }
  });
}

async function _submitAiFill() {
  const q1 = document.getElementById('cw-ai-q1')?.value.trim() || '';
  const q2 = document.getElementById('cw-ai-q2')?.value.trim() || '';
  const q3 = document.getElementById('cw-ai-q3')?.value.trim() || '';

  if (!q1 && !q2 && !q3) {
    _showAiFillError('Please fill in at least one field before generating.');
    return;
  }

  const submitBtn = document.getElementById('cw-ai-modal-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = `<span class="cw-ai-spinner"></span> Generating…`; }

  const apiKey = await loadCwAnthropicKey();
  if (!apiKey) {
    _showAiFillError('No Anthropic API key found. Add one in Profile Settings.');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg> Generate with AI`; }
    return;
  }
  const model = await pickCwModel(apiKey);

  // Build field schema for the prompt
  const fields = _activeTemplate.fields.map(f => {
    const base = { id: f.id, label: f.label, type: f.type };
    if (f.type === 'dropdown' && f.options) base.options = f.options;
    return base;
  });

  const fieldSchema = fields.map(f => {
    let typeNote = '';
    if (f.type === 'text')          typeNote = 'short plain text string';
    else if (f.type === 'textarea') typeNote = 'rich HTML using only <p>, <ul>, <ol>, <li>, <strong>, <em> tags — no inline styles, no background-color';
    else if (f.type === 'dropdown') typeNote = `one of these exact options: ${(f.options || []).join(', ')}`;
    else if (f.type === 'numbered_list') typeNote = 'JSON array of plain text strings';
    return `- id: "${f.id}", label: "${f.label}", type: ${typeNote}`;
  }).join('\n');

  const userContent = [
    q1 ? `CLIENT'S ASK / PROBLEM:\n${q1}` : '',
    q2 ? `INTERNAL ASSESSMENT:\n${q2}` : '',
    q3 ? `ADDITIONAL INTERNAL INPUT:\n${q3}` : '',
  ].filter(Boolean).join('\n\n');

  const systemPrompt = `You are filling out a structured ticket form. Based on the context provided, generate appropriate content for each field.

Template fields:
${fieldSchema}

Rules:
- Return ONLY a valid JSON object. No markdown fences, no explanation — just the raw JSON.
- Keys are the field "id" values listed above.
- For text fields: return a plain string.
- For textarea fields: return clean HTML using only <p>, <ul>, <ol>, <li>, <strong>, <em>. No inline styles, no colors, no <h1>/<h2>/<h3>.
- For dropdown fields: return exactly one of the listed options.
- For numbered_list fields: return a JSON array of plain text strings.
- If you don't have enough information to fill a field confidently, return an empty string "" (or [] for numbered_list).
- Write in a professional, clear tone appropriate for internal Jira/product tickets.`;

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':                                 apiKey,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type':                              'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });
  } catch (e) {
    _showAiFillError(`Network error: ${e.message}`);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg> Generate with AI`; }
    return;
  }

  if (!resp.ok) {
    const body = await resp.text();
    _showAiFillError(`API error (${resp.status}): ${body}`);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg> Generate with AI`; }
    return;
  }

  const json    = await resp.json();
  let rawText   = (json?.content?.[0]?.text || '').trim();
  console.log('[AI Assist] raw response:', rawText);

  // Strip markdown code fences if the model wrapped the JSON anyway
  rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  // If still not starting with {, try to extract the first {...} block
  if (!rawText.startsWith('{')) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) rawText = match[0];
  }

  let fieldValues;
  try {
    fieldValues = JSON.parse(rawText);
  } catch (e) {
    console.error('[AI Assist] JSON parse failed:', e, 'raw:', rawText);
    _showAiFillError('AI returned an unexpected response. Please try again.');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg> Generate with AI`; }
    return;
  }

  _closeAiFillModal();
  _applyAiFieldValues(fieldValues);
  _generateTicket();
}

function _showAiFillError(msg) {
  const el = document.getElementById('cw-ai-modal-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function _applyAiFieldValues(fieldValues) {
  for (const f of _activeTemplate.fields) {
    const val = fieldValues[f.id];
    if (val === undefined || val === null || val === '') continue;

    const row = document.querySelector(`.cw-field-row[data-field-id="${f.id}"]`);
    if (!row) continue;

    // Make sure the field is enabled
    const cb = row.querySelector('.cw-checkbox');
    if (cb && !cb.checked) {
      cb.checked = true;
      _applyFieldEnabled(row, true);
    }

    if (f.type === 'textarea') {
      const editor = _quillEditors[f.id];
      if (editor) {
        editor.root.innerHTML = typeof val === 'string' ? val : '';
      }
    } else if (f.type === 'numbered_list') {
      const items = Array.isArray(val) ? val.filter(Boolean) : [];
      if (!items.length) continue;
      const list = row.querySelector('.cw-numbered-list');
      if (!list) continue;
      // Remove all existing rows except the template structure, rebuild
      list.querySelectorAll('.cw-list-row').forEach(r => r.remove());
      items.forEach((text, i) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'cw-list-row';
        rowEl.innerHTML = `
          <span class="cw-list-num">${i + 1}.</span>
          <input class="cw-input cw-list-input" type="text" value="${escHtml(text)}" placeholder="Item ${i + 1}">
          <button class="cw-list-remove" title="Remove">×</button>`;
        list.insertBefore(rowEl, list.querySelector('.cw-list-add'));
      });
      _bindListRowEvents(list);
    } else if (f.type === 'dropdown') {
      const select = row.querySelector('.cw-select');
      if (select) {
        const match = Array.from(select.options).find(o => o.value === val || o.text === val);
        if (match) select.value = match.value;
      }
    } else {
      const input = row.querySelector('.cw-input');
      if (input) input.value = typeof val === 'string' ? val : '';
    }
  }
}

function _initQuillEditors() {
  _quillEditors = {};
  const savedValues = _activeDraft ? (_activeDraft.field_values || {}) : {};

  document.querySelectorAll('.cw-quill-editor').forEach(el => {
    const fieldId = el.dataset.fieldId;
    const field   = _activeTemplate?.fields.find(f => f.id === fieldId);
    const enabled = savedValues[fieldId]?.enabled !== false;

    const quill = new Quill(el, {
      theme: 'snow',
      placeholder: field ? `Enter ${field.label.toLowerCase()}…` : 'Enter details…',
      modules: {
        toolbar: [
          ['bold', 'italic'],
          [{ header: 2 }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ],
      },
    });

    // Restore saved HTML content
    const saved = savedValues[fieldId]?.value;
    if (saved && typeof saved === 'string') quill.root.innerHTML = saved;

    if (!enabled) quill.enable(false);

    _quillEditors[fieldId] = quill;
  });
}

function _applyFieldEnabled(row, enabled) {
  row.classList.toggle('cw-field-disabled', !enabled);
  // Plain inputs / selects / numbered-list buttons
  row.querySelectorAll('input:not(.cw-checkbox), select, button.cw-list-remove, button.cw-list-add').forEach(el => {
    el.disabled = !enabled;
  });
  // Quill editor
  const quillEl = row.querySelector('.cw-quill-editor');
  if (quillEl) {
    const editor = _quillEditors[quillEl.dataset.fieldId];
    if (editor) editor.enable(enabled);
    row.querySelector('.cw-quill-wrap')?.classList.toggle('cw-quill-disabled', !enabled);
  }
}

function _bindListRowEvents(list) {
  list.querySelectorAll('.cw-list-remove').forEach(btn => {
    btn.addEventListener('click', () => _removeListRow(list, btn.closest('.cw-list-row')));
  });
  list.querySelector('.cw-list-add')?.addEventListener('click', () => _addListRow(list));
}

function _addListRow(list) {
  const addBtn = list.querySelector('.cw-list-add');
  const count  = list.querySelectorAll('.cw-list-row').length;
  const row    = document.createElement('div');
  row.className     = 'cw-list-row';
  row.dataset.index = count;
  row.innerHTML     = `
    <span class="cw-list-num">${count + 1}.</span>
    <input type="text" class="cw-input cw-list-input">
    <button class="cw-list-remove" title="Remove">×</button>`;
  row.querySelector('.cw-list-remove').addEventListener('click', () => _removeListRow(list, row));
  list.insertBefore(row, addBtn);
  row.querySelector('input').focus();
}

function _removeListRow(list, row) {
  if (list.querySelectorAll('.cw-list-row').length <= 1) {
    row.querySelector('input').value = ''; return;
  }
  row.remove();
  list.querySelectorAll('.cw-list-row').forEach((r, i) => {
    r.dataset.index = i;
    const num = r.querySelector('.cw-list-num');
    if (num) num.textContent = `${i + 1}.`;
  });
}

// ── Strip pasted-in background/foreground colors from Quill HTML ──
function _sanitizeQuillHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('[style]').forEach(el => {
    let style = el.getAttribute('style') || '';
    // Remove background-color and color declarations
    style = style.replace(/background-color\s*:[^;]+;?/gi, '');
    style = style.replace(/\bcolor\s*:[^;]+;?/gi, '');
    style = style.trim().replace(/;$/, '');
    if (style) el.setAttribute('style', style);
    else el.removeAttribute('style');
  });
  return tmp.innerHTML;
}

// ── Generate ticket ──
function _generateTicket() {
  const t        = _activeTemplate;
  const sections = [];

  for (const f of t.fields) {
    const row = document.querySelector(`.cw-field-row[data-field-id="${f.id}"]`);
    if (!row) continue;
    const cb = row.querySelector('.cw-checkbox');
    if (!cb || !cb.checked) continue;

    let contentHtml = '';

    if (f.type === 'numbered_list') {
      const items = Array.from(row.querySelectorAll('.cw-list-input'))
        .map(i => i.value.trim()).filter(Boolean);
      contentHtml = items.length
        ? `<ol>${items.map(item => `<li>${escHtml(item)}</li>`).join('')}</ol>`
        : '';
    } else if (f.type === 'textarea') {
      const editor = _quillEditors[f.id];
      contentHtml = editor ? _sanitizeQuillHtml(editor.root.innerHTML) : '';
    } else if (f.type === 'dropdown') {
      const select = row.querySelector('.cw-select');
      const val    = select ? select.value.trim() : '';
      contentHtml  = val ? `<p>${escHtml(val)}</p>` : '';
    } else {
      const input = row.querySelector('.cw-input');
      const val   = input ? input.value.trim() : '';
      contentHtml = val ? `<p>${escHtml(val)}</p>` : '';
    }

    sections.push({ label: f.label, contentHtml });
  }

  // ── Display HTML (shown in module, uses CSS) ──
  const displayHtml = sections.map(s => `
    <div class="cw-output-section">
      <div class="cw-output-field-label">${escHtml(s.label)}</div>
      <div class="cw-output-field-content">${s.contentHtml || '<p class="cw-output-empty">—</p>'}</div>
    </div>`).join('');

  // ── Clipboard HTML (inline styles, portable) ──
  const clipSections = sections.map(s => `
    <div style="margin-bottom:20px;">
      <p style="margin:0 0 5px 0;font-size:14px;font-weight:700;color:#111;">${escHtml(s.label)}</p>
      <div style="font-size:14px;line-height:1.6;color:#111;">${s.contentHtml || ''}</div>
    </div>`).join('');

  const clipHtml = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#111;max-width:700px;">${clipSections}</body></html>`;

  const outputWrap    = document.getElementById('cw-output-wrap');
  const outputContent = document.getElementById('cw-output-content');
  if (outputWrap && outputContent) {
    outputContent.innerHTML        = displayHtml;
    outputWrap.dataset.clipHtml    = '';
    outputWrap._clipHtml           = clipHtml;
    outputWrap._sections           = sections;
    outputWrap.style.display       = 'block';
    outputWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── Save as Submitted Ticket ──
async function _submitTicket() {
  const btn        = document.getElementById('cw-submit-ticket-btn');
  const outputWrap = document.getElementById('cw-output-wrap');
  if (!outputWrap?._sections) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const fieldValues  = _collectFormValues();
  const title        = _getDraftTitle(fieldValues);
  const contentHtml  = document.getElementById('cw-output-content')?.innerHTML || '';

  const ticket = await saveSubmittedTicket(title, contentHtml, fieldValues);

  if (ticket) {
    if (btn) {
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Submitted`;
      btn.disabled  = false;
      setTimeout(() => {
        if (document.getElementById('cw-submit-ticket-btn'))
          document.getElementById('cw-submit-ticket-btn').innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Save as Submitted`;
      }, 2000);
    }
    // If this ticket was from a draft, delete the draft
    if (_activeDraft) {
      await deleteDraft(_activeDraft.id);
      _activeDraft = null;
    }
  } else {
    if (btn) { btn.disabled = false; btn.textContent = 'Save as Submitted'; }
  }
}

// ── Copy rich text to clipboard ──
async function _copyOutput() {
  const outputWrap = document.getElementById('cw-output-wrap');
  const btn        = document.getElementById('cw-copy-btn');
  if (!outputWrap?._clipHtml) return;

  try {
    const htmlBlob  = new Blob([outputWrap._clipHtml], { type: 'text/html' });
    // Plain text fallback: extract readable text from sections
    const sections  = outputWrap._sections || [];
    const plainText = sections.map(s => {
      const tmp = document.createElement('div');
      tmp.innerHTML = s.contentHtml;
      return `${s.label}:\n${tmp.innerText || tmp.textContent || ''}`;
    }).join('\n\n');
    const textBlob = new Blob([plainText], { type: 'text/plain' });

    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
    ]);
  } catch (_) {
    // Fallback: copy plain text
    const sections  = outputWrap._sections || [];
    const plainText = sections.map(s => {
      const tmp = document.createElement('div');
      tmp.innerHTML = s.contentHtml;
      return `${s.label}:\n${tmp.innerText || ''}`;
    }).join('\n\n');
    navigator.clipboard.writeText(plainText);
  }

  if (btn) {
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied`;
    setTimeout(() => {
      if (document.getElementById('cw-copy-btn'))
        document.getElementById('cw-copy-btn').innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
    }, 2000);
  }
}

// ── Manage ──
function _bindManageEvents() {
  document.getElementById('cw-back-btn')?.addEventListener('click', () => {
    _view = 'list'; render();
  });
  document.getElementById('cw-new-template-btn')?.addEventListener('click', () => {
    _editingTemplate = { id: null, name: '', fields: [] }; _view = 'edit-template'; render();
  });
  document.querySelectorAll('.cw-edit-template-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const t = _templates.find(t => t.id === btn.dataset.templateId);
      if (t) { _editingTemplate = JSON.parse(JSON.stringify(t)); _view = 'edit-template'; render(); }
    });
  });
  document.querySelectorAll('.cw-delete-template-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const t = _templates.find(t => t.id === btn.dataset.templateId);
      if (!t || !confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
      btn.disabled = true;
      await deleteTemplate(t.id); render();
    });
  });
}

// ── Edit Template ──
let _editDragSrc = null;

function _bindEditTemplateEvents() {
  document.getElementById('cw-back-btn')?.addEventListener('click', () => {
    _view = 'manage'; render();
  });
  document.getElementById('cw-add-field-btn')?.addEventListener('click', () => {
    const list    = document.getElementById('cw-edit-fields-list');
    const empty   = list.parentElement.querySelector('.cw-edit-empty');
    if (empty) empty.remove();
    const idx     = list.querySelectorAll('.cw-edit-field-row').length;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = _renderEditField({ id: _uid(), label: '', type: 'text' }, idx);
    const row = wrapper.firstElementChild;
    list.appendChild(row);
    _bindEditFieldRowEvents(row);
    row.querySelector('.cw-edit-field-label-input')?.focus();
  });
  document.querySelectorAll('.cw-edit-field-row').forEach(row => _bindEditFieldRowEvents(row));
  document.getElementById('cw-save-template-btn')?.addEventListener('click', _saveTemplate);
  _bindFieldDragEvents();
}

function _bindEditFieldRowEvents(row) {
  row.querySelector('.cw-edit-field-type-select')?.addEventListener('change', e => {
    const wrap = row.querySelector('.cw-edit-field-options-wrap');
    if (wrap) wrap.style.display = e.target.value === 'dropdown' ? '' : 'none';
  });
  row.querySelector('.cw-remove-field-btn')?.addEventListener('click', () => {
    row.remove();
    document.querySelectorAll('.cw-edit-field-row').forEach((r, i) => r.dataset.idx = i);
  });
}

function _bindFieldDragEvents() {
  const list = document.getElementById('cw-edit-fields-list');
  if (!list) return;

  list.querySelectorAll('.cw-edit-field-row').forEach(row => {
    const handle = row.querySelector('.cw-drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', () => { row.draggable = true; });
      handle.addEventListener('mouseup',   () => { row.draggable = false; });
    }
    row.addEventListener('dragstart', e => {
      _editDragSrc = row;
      row.classList.add('cw-drag-active');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.draggable = false;
      _editDragSrc  = null;
      list.querySelectorAll('.cw-edit-field-row').forEach(r =>
        r.classList.remove('cw-drag-active', 'cw-drag-over')
      );
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (row === _editDragSrc) return;
      list.querySelectorAll('.cw-edit-field-row').forEach(r => r.classList.remove('cw-drag-over'));
      row.classList.add('cw-drag-over');
    });
    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget)) row.classList.remove('cw-drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!_editDragSrc || _editDragSrc === row) return;
      list.querySelectorAll('.cw-edit-field-row').forEach(r => r.classList.remove('cw-drag-over'));
      const rect  = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      if (after) row.after(_editDragSrc);
      else       row.before(_editDragSrc);
      list.querySelectorAll('.cw-edit-field-row').forEach((r, i) => r.dataset.idx = i);
    });
  });
}

async function _saveTemplate() {
  const nameEl = document.getElementById('cw-template-name');
  const name   = nameEl?.value.trim() || '';
  if (!name) { nameEl?.focus(); return; }

  const fields = [];
  document.querySelectorAll('.cw-edit-field-row').forEach(row => {
    const label   = row.querySelector('.cw-edit-field-label-input')?.value.trim() || '';
    const type    = row.querySelector('.cw-edit-field-type-select')?.value || 'text';
    const optText = row.querySelector('.cw-edit-options-ta')?.value || '';
    const options = type === 'dropdown'
      ? optText.split('\n').map(o => o.trim()).filter(Boolean) : undefined;
    if (label) {
      const field = { id: row.dataset.fieldId || _uid(), label, type };
      if (options) field.options = options;
      fields.push(field);
    }
  });

  const btn = document.getElementById('cw-save-template-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const t = _editingTemplate;
  if (t.id) await updateTemplate(t.id, name, fields);
  else      await createTemplate(name, fields);

  _view = 'manage'; render();
}
