// ── State ──
let _currentUser = null;
let _entries     = [];
let _summaries   = [];
let _anthropicKey = null;

function setCurrentUser(u) { _currentUser = u; }
function getEntries()      { return _entries; }
function getSummaries()    { return _summaries; }

// ── Load ──
async function loadEntries() {
  const { data, error } = await sb.from('feedback_entries')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { console.error('loadEntries:', error); return; }
  _entries = data || [];
}

async function loadSummaries() {
  const { data, error } = await sb.from('feedback_summaries')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('updated_at', { ascending: false });
  if (error) { console.error('loadSummaries:', error); return; }
  _summaries = data || [];
}

// ── Entry CRUD ──
async function addEntry({ subject, note, sentiment, entry_date }) {
  const { data, error } = await sb.from('feedback_entries').insert({
    user_id:    _currentUser.id,
    subject:    subject.trim(),
    note:       (note || '').trim(),
    sentiment:  sentiment || 'neutral',
    entry_date: entry_date || new Date().toISOString().slice(0, 10),
  }).select().single();
  if (error) { console.error('addEntry:', error); return; }
  _entries.unshift(data);
}

async function updateEntry(id, changes) {
  const { error } = await sb.from('feedback_entries')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('updateEntry:', error); return; }
  const e = _entries.find(x => x.id === id);
  if (e) Object.assign(e, changes);
}

async function deleteEntry(id) {
  const { error } = await sb.from('feedback_entries')
    .delete().eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('deleteEntry:', error); return; }
  _entries = _entries.filter(x => x.id !== id);
}

// ── Summary CRUD ──
async function saveSummary(target, summary, generated_at) {
  const row = {
    user_id: _currentUser.id,
    target:  target.trim(),
    summary: summary,
    updated_at: new Date().toISOString(),
  };
  if (generated_at) row.generated_at = generated_at;
  const { data, error } = await sb.from('feedback_summaries')
    .upsert(row, { onConflict: 'user_id,target' })
    .select().single();
  if (error) { console.error('saveSummary:', error); return null; }
  const idx = _summaries.findIndex(s => s.id === data.id);
  if (idx === -1) _summaries.unshift(data); else _summaries[idx] = data;
  return data;
}

async function deleteSummary(id) {
  const { error } = await sb.from('feedback_summaries')
    .delete().eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('deleteSummary:', error); return; }
  _summaries = _summaries.filter(s => s.id !== id);
}

// Distinct subjects (for the filter / quick targets), most-used first.
function distinctSubjects() {
  const counts = {};
  _entries.forEach(e => { const s = (e.subject || '').trim(); if (s) counts[s] = (counts[s] || 0) + 1; });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
}

// ── Anthropic API (same approach as the Weekly Digest) ──
async function ensureApiKey() {
  if (_anthropicKey) return _anthropicKey;
  const { data } = await sb.from('profiles')
    .select('anthropic_api_key').eq('user_id', _currentUser.id).maybeSingle();
  _anthropicKey = data?.anthropic_api_key?.trim() || null;
  return _anthropicKey;
}

async function _pickModel(apiKey) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const ids = (json.data || []).map(m => m.id);
    for (const pref of ['sonnet', 'haiku', 'opus']) {
      const match = ids.find(id => id.toLowerCase().includes(pref));
      if (match) return match;
    }
    return ids[0] || null;
  } catch { return null; }
}

// Build the source text fed to Claude. `target` null = overview of everyone.
function _buildFeedbackText(target) {
  const lines = [];
  const list = _entries;
  for (const e of list) {
    const sent = e.sentiment === 'positive' ? '+' : e.sentiment === 'negative' ? '-' : '·';
    lines.push(`[${e.entry_date}] (${sent}) ${e.subject}: ${e.note}`);
  }
  return lines.join('\n');
}

// Generate a summary. target = string (person/group) or null for an overview.
// Returns { text } or { error, message }.
async function generateSummary(target) {
  const key = await ensureApiKey();
  if (!key) return { error: 'no_key' };
  if (!_entries.length) return { error: 'no_entries' };

  const model = await _pickModel(key);
  if (!model) return { error: 'no_model', message: 'No models available on this API key.' };

  const source = _buildFeedbackText(target);
  const system = target
    ? `You are organizing private notes someone keeps about colleagues, teams, and parts of their company. \
Summarize the feedback that concerns "${target}". Account for spelling variations and informal references — \
entries that clearly point to the same person or group should be treated together, even if named slightly differently. \
Ignore entries that don't relate to "${target}".

Write a balanced, professional summary the author could refine and potentially share with leadership later: \
group recurring themes, note both strengths and concerns, and reference rough timeframes where useful. \
Each entry is prefixed with its date and a sentiment marker (+ positive, - negative, · neutral). \
Do not invent anything not supported by the notes. If nothing relates to "${target}", say so plainly.`
    : `You are organizing private notes someone keeps about colleagues, teams, and parts of their company. \
Produce an overview grouped by person/team/entity, reconciling spelling variations so the same person or group \
is grouped together. For each, give a short, balanced, professional summary of the recurring themes (strengths and \
concerns) with rough timeframes. Each entry is prefixed with its date and a sentiment marker (+ positive, - negative, \
· neutral). Do not invent anything beyond the notes.`;

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: source }],
      }),
    });
  } catch (e) {
    return { error: 'network', message: e.message };
  }
  if (!resp.ok) {
    const body = await resp.text();
    return { error: 'api', status: resp.status, message: body };
  }
  const json = await resp.json();
  return { text: json?.content?.[0]?.text || '' };
}
