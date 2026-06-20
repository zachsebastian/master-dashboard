// ── Helpers ──
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
function _checked(name) { const e = document.querySelector(`input[name="${name}"]:checked`); return e ? e.value : ''; }
function _today() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  if (!d) return '';
  const dt = String(d).length <= 10 ? new Date(d + 'T12:00:00') : new Date(d);
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
const SENT_ICON = { positive: '👍', neutral: '😐', negative: '👎' };

// ── UI state ──
let _editingId    = null;   // entry being edited inline
let _draftSummary = null;   // { label, scope, text, generated_at } — scope null = overview
let _busy         = false;  // an API call is in flight
let _summaryError = null;

function renderLoading() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
}

// ── Main render ──
function render() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="fb-wrap">
      <div class="fb-head">
        <h1 class="fb-title">Feedback Log</h1>
        <p class="fb-sub">Private notes on people, teams, and parts of the org — kept to yourself. Never appears in the Weekly Digest or Today List.</p>
      </div>
      ${renderAddForm()}
      ${renderSummarizePanel()}
      ${renderSummariesList()}
      ${renderEntriesList()}
    </div>`;
}

// ── Sentiment segmented control ──
function sentimentRadios(name, selected) {
  return `<div class="fb-sentiment">
    ${['positive', 'neutral', 'negative'].map(v =>
      `<label class="fb-sent-opt fb-sent-opt--${v}" title="${v}">
        <input type="radio" name="${name}" value="${v}" ${v === (selected || 'neutral') ? 'checked' : ''}>
        <span>${SENT_ICON[v]}</span>
      </label>`).join('')}
  </div>`;
}

// ── Add entry ──
function renderAddForm() {
  return `
    <div class="fb-card">
      <div class="fb-row">
        <input id="fb-subject" class="fb-input" placeholder="Who or what? (person, team, vertical…)">
        <input id="fb-date" class="fb-input fb-date" type="date" value="${_today()}">
      </div>
      <textarea id="fb-note" class="fb-textarea" rows="3" placeholder="Your feedback, qualm, or observation…"></textarea>
      <div class="fb-card-foot">
        ${sentimentRadios('fb-sent', 'neutral')}
        <button class="btn btn-primary" onclick="submitEntry()">Add entry</button>
      </div>
    </div>`;
}

async function submitEntry() {
  const subject = _val('fb-subject').trim();
  if (!subject) { const el = document.getElementById('fb-subject'); if (el) el.focus(); return; }
  await addEntry({
    subject,
    note:       _val('fb-note'),
    sentiment:  _checked('fb-sent') || 'neutral',
    entry_date: _val('fb-date') || _today(),
  });
  render();
}

// ── Summarize panel ──
function renderSummarizePanel() {
  const subjects = distinctSubjects();
  return `
    <div class="fb-card fb-summarize">
      <div class="fb-sec-title">Summarize feedback</div>
      <div class="fb-row">
        <input id="fb-target" class="fb-input" list="fb-subjects" placeholder="Person or group to summarize…" ${_busy ? 'disabled' : ''}>
        <button class="btn btn-primary" onclick="doSummarize()" ${_busy ? 'disabled' : ''}>${_busy ? 'Summarizing…' : 'Summarize'}</button>
        <button class="btn" onclick="doOverview()" ${_busy ? 'disabled' : ''}>Everything</button>
      </div>
      <datalist id="fb-subjects">${subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      ${_summaryError ? `<div class="fb-error">${esc(_summaryError)}</div>` : ''}
      ${_draftSummary ? renderDraftEditor() : ''}
    </div>`;
}

function renderDraftEditor() {
  return `
    <div class="fb-draft">
      <div class="fb-draft-head">Draft summary — <strong>${esc(_draftSummary.label)}</strong> <span class="fb-hint">(edit freely before saving)</span></div>
      <textarea class="fb-textarea fb-summary-text" id="fb-draft-text" rows="10">${esc(_draftSummary.text)}</textarea>
      <div class="fb-draft-foot">
        <button class="btn" onclick="regenDraft()" ${_busy ? 'disabled' : ''}>${_busy ? 'Regenerating…' : 'Regenerate'}</button>
        <div class="fb-spacer"></div>
        <button class="btn" onclick="discardDraft()">Discard</button>
        <button class="btn btn-primary" onclick="saveDraft()">Save summary</button>
      </div>
    </div>`;
}

function mapSummaryError(r) {
  switch (r.error) {
    case 'no_key':     return 'Add your Anthropic API key on the Profile page (Settings) to generate summaries.';
    case 'no_entries': return 'Add some feedback entries first.';
    case 'no_model':   return r.message || 'No models available on your API key.';
    case 'api':        return `Anthropic API error${r.status ? ` (${r.status})` : ''}: ${String(r.message || '').slice(0, 240)}`;
    case 'network':    return `Network error: ${r.message || ''}`;
    default:           return 'Could not generate a summary.';
  }
}

async function _runGenerate(label, scope) {
  _busy = true; _summaryError = null; render();
  const res = await generateSummary(scope);
  _busy = false;
  if (res.error) { _summaryError = mapSummaryError(res); _draftSummary = null; render(); return; }
  _draftSummary = { label, scope, text: res.text, generated_at: new Date().toISOString() };
  render();
}

async function doSummarize() {
  const target = _val('fb-target').trim();
  if (!target) { _summaryError = 'Enter a person or group to summarize.'; render(); return; }
  await _runGenerate(target, target);
}

async function doOverview() {
  await _runGenerate('Everyone — overview', null);
}

async function regenDraft() {
  if (!_draftSummary) return;
  await _runGenerate(_draftSummary.label, _draftSummary.scope);
}

function discardDraft() { _draftSummary = null; _summaryError = null; render(); }

async function saveDraft() {
  if (!_draftSummary) return;
  const text = _val('fb-draft-text');
  await saveSummary(_draftSummary.label, text, _draftSummary.generated_at);
  _draftSummary = null;
  render();
}

// ── Saved summaries ──
function renderSummariesList() {
  if (!_summaries.length) return '';
  return `
    <div class="fb-card">
      <div class="fb-sec-title">Saved summaries</div>
      <div class="fb-summaries">${_summaries.map(renderSavedSummary).join('')}</div>
    </div>`;
}

function renderSavedSummary(s) {
  return `
    <div class="fb-summary">
      <div class="fb-summary-head">
        <span class="fb-summary-target">${esc(s.target)}</span>
        <span class="fb-summary-date">${s.generated_at ? 'generated ' + fmtDate(s.generated_at) : ''}</span>
        <div class="fb-summary-actions">
          <button class="btn btn-sm" onclick="editSummary('${esc(s.id)}')">Edit</button>
          <button class="btn btn-sm" onclick="regenSummary('${esc(s.id)}')" ${_busy ? 'disabled' : ''}>Regenerate</button>
          <button class="btn btn-sm btn-danger" onclick="removeSummary('${esc(s.id)}')">Delete</button>
        </div>
      </div>
      <div class="fb-summary-body">${esc(s.summary)}</div>
    </div>`;
}

function editSummary(id) {
  const s = _summaries.find(x => x.id === id);
  if (!s) return;
  _draftSummary = { label: s.target, scope: s.target, text: s.summary, generated_at: s.generated_at };
  _summaryError = null;
  render();
  const ta = document.getElementById('fb-draft-text');
  if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

async function regenSummary(id) {
  const s = _summaries.find(x => x.id === id);
  if (!s) return;
  await _runGenerate(s.target, s.target);
}

async function removeSummary(id) {
  const s = _summaries.find(x => x.id === id);
  if (!confirm(`Delete the saved summary for "${s ? s.target : 'this target'}"?`)) return;
  await deleteSummary(id);
  render();
}

// ── Entries list ──
function renderEntriesList() {
  const entries = getEntries();
  const header = `
    <div class="fb-entries-header">
      <span class="fb-sec-title">Entries · ${entries.length}</span>
      ${entries.length ? `<input id="fb-filter" class="fb-input fb-filter" placeholder="Filter by subject…" oninput="applyEntryFilter(this.value)">` : ''}
    </div>`;
  if (!entries.length) {
    return header + `<div class="fb-empty">No feedback logged yet. Capture your first thought above.</div>`;
  }
  return header + `<div class="fb-entries">${entries.map(renderEntry).join('')}</div>`;
}

function renderEntry(e) {
  const id = esc(e.id);
  if (_editingId === e.id) {
    return `
      <div class="fb-entry is-editing" data-subject="${esc(String(e.subject || '').toLowerCase())}">
        <div class="fb-row">
          <input class="fb-input" id="fb-edit-subject-${id}" value="${esc(e.subject)}">
          <input class="fb-input fb-date" type="date" id="fb-edit-date-${id}" value="${esc(e.entry_date)}">
        </div>
        <textarea class="fb-textarea" id="fb-edit-note-${id}" rows="3">${esc(e.note)}</textarea>
        <div class="fb-card-foot">
          ${sentimentRadios('fb-edit-sent-' + id, e.sentiment)}
          <div class="fb-entry-edit-actions">
            <button class="btn btn-sm" onclick="cancelEdit()">Cancel</button>
            <button class="btn btn-sm btn-primary" onclick="saveEdit('${id}')">Save</button>
          </div>
        </div>
      </div>`;
  }
  return `
    <div class="fb-entry" data-subject="${esc(String(e.subject || '').toLowerCase())}">
      <div class="fb-entry-head">
        <span class="fb-sent-icon" title="${esc(e.sentiment)}">${SENT_ICON[e.sentiment] || SENT_ICON.neutral}</span>
        <span class="fb-entry-subject">${esc(e.subject)}</span>
        <span class="fb-entry-date">${fmtDate(e.entry_date)}</span>
        <div class="fb-entry-actions">
          <button class="btn btn-sm" onclick="startEdit('${id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="removeEntry('${id}')">Delete</button>
        </div>
      </div>
      ${e.note ? `<div class="fb-entry-note">${esc(e.note)}</div>` : ''}
    </div>`;
}

function applyEntryFilter(q) {
  const t = q.toLowerCase().trim();
  document.querySelectorAll('.fb-entry').forEach(el => {
    el.style.display = (!t || (el.dataset.subject || '').includes(t)) ? '' : 'none';
  });
}

function startEdit(id)  { _editingId = id; render(); }
function cancelEdit()   { _editingId = null; render(); }

async function saveEdit(id) {
  const subject = _val(`fb-edit-subject-${id}`).trim();
  if (!subject) return;
  await updateEntry(id, {
    subject,
    note:       _val(`fb-edit-note-${id}`),
    sentiment:  _checked(`fb-edit-sent-${id}`) || 'neutral',
    entry_date: _val(`fb-edit-date-${id}`) || _today(),
  });
  _editingId = null;
  render();
}

async function removeEntry(id) {
  if (!confirm('Delete this entry? This can\'t be undone.')) return;
  await deleteEntry(id);
  render();
}
