// ── Wins Log – State ──

let _currentUser        = null;
let _wins               = [];
let _candidates         = [];
let _dismissedCandidates = [];
let _wlKey              = null;   // Anthropic key
let _isScanning         = false;
let _winsFilter         = { month: 'all', source: 'all', category: 'all' };

// ── Load ──
async function loadWins() {
  const { data, error } = await sb
    .from('wins')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('win_date', { ascending: false });
  if (error) { console.error('loadWins:', error); return; }
  _wins = data || [];
}

async function loadCandidates() {
  const { data, error } = await sb
    .from('win_candidates')
    .select('*')
    .eq('user_id', _currentUser.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { console.error('loadCandidates:', error); return; }
  _candidates = data || [];
}

async function loadDismissedCandidates() {
  const { data, error } = await sb
    .from('win_candidates')
    .select('*')
    .eq('user_id', _currentUser.id)
    .eq('status', 'dismissed')
    .order('dismissed_at', { ascending: false });
  if (error) { console.error('loadDismissedCandidates:', error); return; }
  _dismissedCandidates = data || [];
}

async function restoreCandidate(id) {
  await sb.from('win_candidates')
    .update({ status: 'pending', dismissed_at: null })
    .eq('id', id).eq('user_id', _currentUser.id);
  const candidate = _dismissedCandidates.find(c => c.id === id);
  if (candidate) {
    candidate.status       = 'pending';
    candidate.dismissed_at = null;
    _dismissedCandidates   = _dismissedCandidates.filter(c => c.id !== id);
    _candidates.unshift(candidate);
  }
}

// ── CRUD: wins ──
async function addManualWin({ title, summary, category, source, winDate }) {
  const row = {
    user_id:    _currentUser.id,
    title:      title.trim(),
    summary:    (summary || '').trim(),
    category:   category  || 'Delivery',
    source:     source    || 'Manual',
    win_date:   winDate   || new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from('wins').insert(row).select().single();
  if (error) { console.error('addManualWin:', error); throw error; }
  _wins.unshift(data);
  return data;
}

async function updateWin(id, updates) {
  const patch = { ...updates, updated_at: new Date().toISOString() };
  const { data, error } = await sb
    .from('wins').update(patch)
    .eq('id', id).eq('user_id', _currentUser.id)
    .select().single();
  if (error) { console.error('updateWin:', error); throw error; }
  const idx = _wins.findIndex(w => w.id === id);
  if (idx !== -1) _wins[idx] = data;
  return data;
}

async function deleteWin(id) {
  const { error } = await sb.from('wins').delete()
    .eq('id', id).eq('user_id', _currentUser.id);
  if (error) { console.error('deleteWin:', error); throw error; }
  _wins = _wins.filter(w => w.id !== id);
}

// ── CRUD: candidates ──
async function confirmCandidate(candidateId, { title, summary, category, source, winDate }) {
  const candidate = _candidates.find(c => c.id === candidateId);
  if (!candidate) return;

  const winRow = {
    user_id:    _currentUser.id,
    title:      (title    || candidate.title   || '').trim(),
    summary:    (summary  || candidate.summary || '').trim(),
    category:   category  || candidate.category || 'Delivery',
    source:     source    || candidate.source   || 'Manual',
    win_date:   winDate   || candidate.win_date || new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data: win, error: winErr } = await sb.from('wins').insert(winRow).select().single();
  if (winErr) { console.error('confirmCandidate – insert win:', winErr); throw winErr; }
  _wins.unshift(win);

  await sb.from('win_candidates')
    .update({ status: 'confirmed' })
    .eq('id', candidateId).eq('user_id', _currentUser.id);
  _candidates = _candidates.filter(c => c.id !== candidateId);
  return win;
}

async function dismissCandidate(id) {
  await sb.from('win_candidates')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', _currentUser.id);
  _candidates = _candidates.filter(c => c.id !== id);
}

// ── Anthropic model ──
async function _pickWlModel() {
  if (!_wlKey) return 'claude-haiku-4-5';
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': _wlKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!res.ok) return 'claude-haiku-4-5';
    const json = await res.json();
    const ids  = (json.data || []).map(m => m.id);
    const pref = ['haiku', 'sonnet', 'opus'];
    for (const p of pref) {
      const match = ids.find(id => id.toLowerCase().includes(p));
      if (match) return match;
    }
    return ids[0] || 'claude-haiku-4-5';
  } catch { return 'claude-haiku-4-5'; }
}

// ── AI Scan ──
async function fetchAndSaveAiCandidates() {
  if (!_wlKey) throw new Error('No Anthropic API key found. Add your key in profile settings.');
  _isScanning = true;

  try {
    const snapshot = await _buildActivitySnapshot();
    const model    = await _pickWlModel();

    // Recently dismissed titles — avoid re-surfacing
    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: dismissed } = await sb
      .from('win_candidates')
      .select('title')
      .eq('user_id', _currentUser.id)
      .eq('status', 'dismissed')
      .gte('dismissed_at', cutoff30);
    const dismissedTitles = (dismissed || []).map(d => d.title);

    // Recent confirmed win titles — avoid duplicates
    const recentWinTitles = _wins.slice(0, 20).map(w => w.title);

    const prompt = `You are analyzing a professional's recent work activity to identify notable wins and accomplishments worth documenting.

Here is a snapshot of recent activity (last 14 days):
${JSON.stringify(snapshot, null, 2)}
${dismissedTitles.length ? `\nDo NOT suggest these recently dismissed items:\n${dismissedTitles.map(t => `- ${t}`).join('\n')}` : ''}
${recentWinTitles.length ? `\nAlready logged wins (avoid duplicates):\n${recentWinTitles.map(t => `- ${t}`).join('\n')}` : ''}

Identify 2–5 specific, concrete wins from this activity. Focus on:
- Work that was actually completed (tasks, tickets, entries with meaningful notes)
- Things with customer impact, business value, or relationship-building
- Cases or tickets that resolved real issues
- Project milestones or meaningful progress
- Metrics that stayed steady or improved

For each win:
- title: Short, specific, first-person title (max 80 chars — e.g. "Resolved Zions reporting blocker ahead of deadline")
- summary: 1–2 sentences on what happened and why it matters
- category: Exactly one of: "Customer Impact", "Process Improvement", "Delivery", "Relationship"
- source: Exactly one of: "Projects", "Metrics", "Today List", "Case Writer", "Manual"
- win_date: ISO date YYYY-MM-DD when the win occurred

Only surface genuine, specific wins supported by the data. If nothing is truly noteworthy, return fewer or zero candidates.

Respond with ONLY valid JSON:
{
  "candidates": [
    {
      "title": "...",
      "summary": "...",
      "category": "...",
      "source": "...",
      "win_date": "..."
    }
  ]
}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': _wlKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const json    = await res.json();
    let rawText   = json.content?.[0]?.text || '';
    console.log('[Wins AI] raw response:', rawText);

    // Strip markdown fences
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    if (!rawText.startsWith('{')) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) rawText = match[0];
    }

    const parsed       = JSON.parse(rawText);
    const newCandidates = parsed.candidates || [];
    if (newCandidates.length === 0) return 0;

    const VALID_CATEGORIES = ['Customer Impact', 'Process Improvement', 'Delivery', 'Relationship'];
    const VALID_SOURCES    = ['Projects', 'Metrics', 'Today List', 'Case Writer', 'Manual'];

    const rows = newCandidates.map(c => ({
      user_id:    _currentUser.id,
      title:      (c.title   || '').slice(0, 200),
      summary:    (c.summary || '').slice(0, 1000),
      category:   VALID_CATEGORIES.includes(c.category) ? c.category : 'Delivery',
      source:     VALID_SOURCES.includes(c.source)      ? c.source   : 'Manual',
      win_date:   c.win_date || new Date().toISOString().split('T')[0],
      status:     'pending',
      created_at: new Date().toISOString(),
    }));

    const { data: inserted, error: insErr } = await sb
      .from('win_candidates').insert(rows).select();
    if (insErr) { console.error('insert candidates:', insErr); throw insErr; }

    _candidates = [...(inserted || []), ..._candidates];
    return inserted?.length || 0;

  } finally {
    _isScanning = false;
  }
}

async function _buildActivitySnapshot() {
  const today  = new Date().toISOString().split('T')[0];
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

  const [todayRes, dashRes, ticketsRes] = await Promise.all([
    sb.from('today_items')
      .select('text, item_date, source, source_ref_name')
      .eq('user_id', _currentUser.id)
      .eq('completed', true)
      .gte('item_date', cutoff)
      .lte('item_date', today)
      .order('item_date', { ascending: false }),
    sb.from('dashboards')
      .select('data')
      .eq('user_id', _currentUser.id)
      .maybeSingle(),
    sb.from('case_writer_tickets')
      .select('title, template_name, submitted_at, jira_ticket')
      .eq('user_id', _currentUser.id)
      .gte('submitted_at', cutoff + 'T00:00:00')
      .lte('submitted_at', today  + 'T23:59:59')
      .order('submitted_at', { ascending: false }),
  ]);

  // Today list completions
  const todayCompletions = (todayRes.data || []).map(i => ({
    text:    i.text,
    date:    i.item_date,
    source:  i.source,
    project: i.source_ref_name || null,
  }));

  // Project updates + task completions
  const projectActivity = [];
  const metricsActivity = [];
  const blob = dashRes.data?.data || {};

  for (const project of (blob.projects || [])) {
    for (const entry of (project.entries || [])) {
      if (!entry.date || entry.date < cutoff) continue;
      const completedTasks = (project.tasks || [])
        .filter(t => t.completedInEntry === entry.id)
        .map(t => t.text);
      projectActivity.push({
        project:         project.name,
        date:            entry.date,
        note:            entry.note    || '',
        nextSteps:       entry.nextSteps || '',
        status:          entry.status,
        tasksCompleted:  completedTasks,
        completion:      entry.completion || 0,
      });
    }
  }

  // Metrics entries
  for (const metric of (blob.metrics || [])) {
    for (const entry of (metric.entries || [])) {
      const d = entry.periodEnd || entry.periodStart;
      if (!d || d < cutoff) continue;
      const fields = {};
      for (const f of (metric.fields || [])) {
        const val = (entry.values || {})[f.id];
        if (val !== undefined && val !== '') fields[f.name] = val;
      }
      if (!Object.keys(fields).length) continue;
      metricsActivity.push({
        metric: metric.name,
        period: entry.period || d,
        values: fields,
        date:   d,
      });
    }
  }

  // Case writer tickets
  const caseTickets = (ticketsRes.data || []).map(t => ({
    title:    t.title,
    template: t.template_name,
    date:     (t.submitted_at || '').split('T')[0],
    jira:     t.jira_ticket || null,
  }));

  projectActivity.sort((a, b) => b.date.localeCompare(a.date));
  metricsActivity.sort((a, b) => b.date.localeCompare(a.date));

  return {
    dateRange:           `${cutoff} to ${today}`,
    projectUpdates:      projectActivity.slice(0, 15),
    todayListCompletions: todayCompletions.slice(0, 20),
    caseWriterTickets:   caseTickets.slice(0, 10),
    metricsUpdated:      metricsActivity.slice(0, 10),
  };
}

// ── Filter helpers ──
function _getFilteredWins() {
  return _wins.filter(w => {
    if (_winsFilter.month !== 'all') {
      const wm = (w.win_date || '').slice(0, 7);
      if (wm !== _winsFilter.month) return false;
    }
    if (_winsFilter.source !== 'all' && w.source !== _winsFilter.source) return false;
    if (_winsFilter.category !== 'all' && w.category !== _winsFilter.category) return false;
    return true;
  });
}

function _getWinMonths() {
  const months = new Set(_wins.map(w => (w.win_date || '').slice(0, 7)).filter(Boolean));
  return [...months].sort((a, b) => b.localeCompare(a)).map(m => {
    const [yr, mo] = m.split('-');
    const label = new Date(parseInt(yr), parseInt(mo) - 1, 1)
      .toLocaleDateString([], { month: 'long', year: 'numeric' });
    return { value: m, label };
  });
}
