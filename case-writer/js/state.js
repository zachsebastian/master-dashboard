// ── Tiny uid ──
function _uid() { return Math.random().toString(36).slice(2, 9); }

// ── State ──
let _templates       = [];
let _drafts          = [];
let _tickets         = [];
let _currentUser     = null;
let _view            = 'list';   // 'list' | 'form' | 'manage' | 'edit-template'
let _activeTemplate  = null;     // template currently being filled out
let _activeDraft     = null;     // draft being continued (null = new ticket)
let _editingTemplate = null;     // template currently being edited in manage view
let _cwAnthropicKey  = null;     // cached Anthropic key for AI fill

// ── Load Anthropic key (lazy, cached) ──
async function loadCwAnthropicKey() {
  if (_cwAnthropicKey) return _cwAnthropicKey;
  const { data } = await sb
    .from('profiles')
    .select('anthropic_api_key')
    .eq('user_id', _currentUser.id)
    .maybeSingle();
  _cwAnthropicKey = data?.anthropic_api_key?.trim() || null;
  return _cwAnthropicKey;
}

// ── Pick best available model for the key ──
async function pickCwModel(apiKey) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key':                                 apiKey,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!resp.ok) return 'claude-haiku-4-20250307';
    const json = await resp.json();
    const ids  = (json.data || []).map(m => m.id);
    for (const pref of ['haiku', 'sonnet', 'opus']) {
      const match = ids.find(id => id.toLowerCase().includes(pref));
      if (match) return match;
    }
    return ids[0] || 'claude-haiku-4-20250307';
  } catch {
    return 'claude-haiku-4-20250307';
  }
}

// ── Load ──
async function loadTemplates() {
  const { data, error } = await sb
    .from('case_writer_templates')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('sort_order');

  if (error) { console.error('loadTemplates:', error); return; }
  _templates = data || [];
}

async function loadDrafts() {
  const { data, error } = await sb
    .from('case_writer_drafts')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('updated_at', { ascending: false });

  if (error) { console.error('loadDrafts:', error); return; }
  _drafts = data || [];
}

async function loadTickets() {
  const { data, error } = await sb
    .from('case_writer_tickets')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('submitted_at', { ascending: false });

  if (error) { console.error('loadTickets:', error); return; }
  _tickets = data || [];
}

// ── Ticket CRUD ──
async function saveSubmittedTicket(title, contentHtml, fieldValues) {
  const row = {
    user_id:       _currentUser.id,
    template_id:   _activeTemplate.id,
    template_name: _activeTemplate.name,
    title:         title || 'Untitled',
    content_html:  contentHtml,
    field_values:  fieldValues,
  };
  const { data, error } = await sb
    .from('case_writer_tickets')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('saveSubmittedTicket:', error); return null; }
  _tickets.unshift(data);
  return data;
}

async function deleteTicket(id) {
  await sb.from('case_writer_tickets').delete().eq('id', id);
  _tickets = _tickets.filter(t => t.id !== id);
}

async function updateTicketDate(id, dateStr) {
  // Store as start-of-day ISO so digest range comparisons work correctly
  const iso = new Date(dateStr + 'T12:00:00').toISOString();
  const { error } = await sb
    .from('case_writer_tickets')
    .update({ submitted_at: iso })
    .eq('id', id);
  if (error) { console.error('updateTicketDate:', error); return false; }
  const ticket = _tickets.find(t => t.id === id);
  if (ticket) ticket.submitted_at = iso;
  return true;
}

async function updateTicketJira(id, jiraTicket) {
  const { error } = await sb
    .from('case_writer_tickets')
    .update({ jira_ticket: jiraTicket })
    .eq('id', id);
  if (error) { console.error('updateTicketJira:', error); return false; }
  const ticket = _tickets.find(t => t.id === id);
  if (ticket) ticket.jira_ticket = jiraTicket;
  return true;
}

async function reopenTicketAsDraft(ticket) {
  const t = _templates.find(t => t.id === ticket.template_id);
  if (!t) return false;
  const row = {
    user_id:       _currentUser.id,
    template_id:   ticket.template_id,
    template_name: ticket.template_name,
    title:         ticket.title,
    field_values:  ticket.field_values,
  };
  const { data, error } = await sb
    .from('case_writer_drafts')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('reopenTicketAsDraft:', error); return false; }
  _drafts.unshift(data);
  _activeTemplate = t;
  _activeDraft    = data;
  _view = 'form';
  return true;
}

// ── Template CRUD ──
async function createTemplate(name, fields) {
  const maxOrder = _templates.reduce((m, t) => Math.max(m, t.sort_order), -1);
  const row = {
    user_id:    _currentUser.id,
    name:       name.trim(),
    fields,
    sort_order: maxOrder + 1,
  };
  const { data, error } = await sb
    .from('case_writer_templates')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createTemplate:', error); return null; }
  _templates.push(data);
  return data;
}

async function updateTemplate(id, name, fields) {
  const { error } = await sb
    .from('case_writer_templates')
    .update({ name: name.trim(), fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('updateTemplate:', error); return false; }
  const idx = _templates.findIndex(t => t.id === id);
  if (idx !== -1) { _templates[idx].name = name.trim(); _templates[idx].fields = fields; }
  return true;
}

async function deleteTemplate(id) {
  await sb.from('case_writer_templates').delete().eq('id', id);
  _templates = _templates.filter(t => t.id !== id);
}

// ── Draft CRUD ──
async function saveDraftFromForm() {
  const fieldValues = _collectFormValues();
  const title       = _getDraftTitle(fieldValues);

  if (_activeDraft) {
    // Update existing
    const { error } = await sb
      .from('case_writer_drafts')
      .update({ title, field_values: fieldValues, updated_at: new Date().toISOString() })
      .eq('id', _activeDraft.id);
    if (error) { console.error('saveDraft update:', error); return false; }
    _activeDraft.title        = title;
    _activeDraft.field_values = fieldValues;
    _activeDraft.updated_at   = new Date().toISOString();
    const idx = _drafts.findIndex(d => d.id === _activeDraft.id);
    if (idx !== -1) _drafts[idx] = { ..._drafts[idx], title, field_values: fieldValues, updated_at: _activeDraft.updated_at };
  } else {
    // Create new
    const row = {
      user_id:       _currentUser.id,
      template_id:   _activeTemplate.id,
      template_name: _activeTemplate.name,
      title,
      field_values:  fieldValues,
    };
    const { data, error } = await sb
      .from('case_writer_drafts')
      .insert(row)
      .select()
      .single();
    if (error) { console.error('saveDraft insert:', error); return false; }
    _activeDraft = data;
    _drafts.unshift(data);
  }
  return true;
}

async function deleteDraft(id) {
  await sb.from('case_writer_drafts').delete().eq('id', id);
  _drafts = _drafts.filter(d => d.id !== id);
  if (_activeDraft?.id === id) _activeDraft = null;
}

// ── Helpers ──
function _collectFormValues() {
  const values = {};
  if (!_activeTemplate) return values;
  for (const f of _activeTemplate.fields) {
    const row = document.querySelector(`.cw-field-row[data-field-id="${f.id}"]`);
    if (!row) continue;
    const cb      = row.querySelector('.cw-checkbox');
    const enabled = cb ? cb.checked : true;
    let value;
    if (f.type === 'numbered_list') {
      value = Array.from(row.querySelectorAll('.cw-list-input')).map(i => i.value);
    } else if (f.type === 'textarea') {
      value = _quillEditors[f.id] ? _quillEditors[f.id].root.innerHTML : '';
    } else {
      const input = row.querySelector('.cw-input, .cw-select');
      value = input ? input.value : '';
    }
    values[f.id] = { enabled, value };
  }
  return values;
}

function _getDraftTitle(fieldValues) {
  if (!_activeTemplate) return 'Untitled Draft';
  // Look for a "title" field first
  const titleField = _activeTemplate.fields.find(f =>
    f.label.toLowerCase().includes('title')
  );
  if (titleField) {
    const saved = fieldValues[titleField.id];
    const val   = typeof saved?.value === 'string' ? saved.value.trim() : '';
    if (val) return val;
  }
  return 'Untitled Draft';
}

function _fmtDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function _fmtRelativeTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
