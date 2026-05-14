// ── State ──
let _currentUser  = null;
let _weekMode     = localStorage.getItem('digestWeekMode') || 'rolling'; // 'rolling' | 'mon' | 'sun'
let _digestData   = null;
let _reflection   = { wins: '', blockers: '', carry_forwards: '' };
let _aiSummary    = null;
let _anthropicKey = null;

// ── Week range ──
function getWeekRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let start, end;

  if (_weekMode === 'rolling') {
    start = new Date(today.getTime() - 6 * 86400000);
    end   = new Date(today);
  } else if (_weekMode === 'mon') {
    const day  = today.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    start = new Date(today);
    start.setDate(today.getDate() + diff);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else { // sun
    const day = today.getDay();
    start = new Date(today);
    start.setDate(today.getDate() - day);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  }

  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
    label: `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`,
  };
}

// ── Load all digest data ──
async function loadDigestData() {
  const uid = _currentUser.id;
  const { start, end, label } = getWeekRange();

  // Fetch today_items completed in range
  const { data: todayItems } = await sb
    .from('today_items')
    .select('id, text, item_date, completed')
    .eq('user_id', uid)
    .eq('completed', true)
    .gte('item_date', start)
    .lte('item_date', end)
    .order('item_date', { ascending: true });

  // Fetch dashboards blob (one row per user, contains both projects + metrics)
  const { data: dashRows } = await sb
    .from('dashboards')
    .select('data')
    .eq('user_id', uid);

  // Merge all data blobs — projects and metrics may be in separate rows
  let allProjects = [];
  let allMetrics  = [];
  for (const row of (dashRows || [])) {
    const blob = row.data || {};
    if (Array.isArray(blob.projects)) allProjects = allProjects.concat(blob.projects);
    if (Array.isArray(blob.metrics))  allMetrics  = allMetrics.concat(blob.metrics);
  }

  // Filter projects with entries in the date range
  const projects = allProjects
    .map(p => {
      const entries = (p.entries || []).filter(e => e.date >= start && e.date <= end);
      return entries.length ? { name: p.name, status: p.status, entries } : null;
    })
    .filter(Boolean);

  // Filter metrics with entries in the date range
  const metrics = allMetrics
    .map(m => {
      const entries = (m.entries || []).filter(e => e.date >= start && e.date <= end);
      if (!entries.length) return null;
      // Find old value: last entry strictly before start
      const priorEntries = (m.entries || [])
        .filter(e => e.date < start)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const oldValue = priorEntries.length ? priorEntries[0].value : null;
      const newValue = entries[entries.length - 1].value;
      return { name: m.name, entries, oldValue, newValue };
    })
    .filter(Boolean);

  _digestData = { weekRange: { start, end, label }, todayItems: todayItems || [], projects, metrics };
  return _digestData;
}

// ── Load reflection for current week ──
async function loadReflection() {
  const uid = _currentUser.id;
  const { start } = getWeekRange();

  const { data } = await sb
    .from('weekly_reflections')
    .select('wins, blockers, carry_forwards')
    .eq('user_id', uid)
    .eq('week_start', start)
    .maybeSingle();

  _reflection = {
    wins:           data?.wins           || '',
    blockers:       data?.blockers       || '',
    carry_forwards: data?.carry_forwards || '',
  };
  return _reflection;
}

// ── Save (upsert) reflection ──
async function saveReflection(wins, blockers, carry_forwards) {
  const uid   = _currentUser.id;
  const { start } = getWeekRange();

  const { error } = await sb
    .from('weekly_reflections')
    .upsert(
      {
        user_id:        uid,
        week_start:     start,
        wins,
        blockers,
        carry_forwards,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'user_id,week_start' }
    );

  if (!error) {
    _reflection = { wins, blockers, carry_forwards };
  }
  return !error;
}

// ── Build summary text from digest data ──
function _buildSummaryText(data) {
  const { weekRange, todayItems, projects, metrics } = data;
  const lines = [`Week of ${weekRange.label}`, ''];

  // Completed tasks
  lines.push(`COMPLETED TASKS (${todayItems.length} total):`);
  if (todayItems.length) {
    // Group by date
    const byDate = {};
    for (const item of todayItems) {
      if (!byDate[item.item_date]) byDate[item.item_date] = [];
      byDate[item.item_date].push(item.text);
    }
    for (const [date, texts] of Object.entries(byDate)) {
      lines.push(`  ${date}:`);
      for (const t of texts) lines.push(`    - ${t}`);
    }
  } else {
    lines.push('  (none)');
  }
  lines.push('');

  // Projects
  lines.push(`PROJECTS UPDATED (${projects.length}):`);
  if (projects.length) {
    for (const p of projects) {
      lines.push(`  ${p.name}${p.status ? ` [${p.status}]` : ''}:`);
      for (const e of p.entries) {
        lines.push(`    ${e.date}: ${e.note || '(no note)'}`);
      }
    }
  } else {
    lines.push('  (none)');
  }
  lines.push('');

  // Metrics
  lines.push(`METRICS TRACKED (${metrics.length}):`);
  if (metrics.length) {
    for (const m of metrics) {
      const change = m.oldValue !== null
        ? ` (${m.oldValue} → ${m.newValue})`
        : ` (latest: ${m.newValue})`;
      lines.push(`  ${m.name}${change}`);
    }
  } else {
    lines.push('  (none)');
  }

  return lines.join('\n');
}

// ── Discover best available model for this API key ──
async function _pickModel(apiKey) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key':                                 apiKey,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const ids = (json.data || []).map(m => m.id);
    // Prefer fastest/cheapest: haiku > sonnet > opus
    for (const pref of ['haiku', 'sonnet', 'opus']) {
      const match = ids.find(id => id.toLowerCase().includes(pref));
      if (match) return match;
    }
    return ids[0] || null;
  } catch {
    return null;
  }
}

// ── Generate AI summary via Anthropic API ──
async function generateAiSummary() {
  const uid = _currentUser.id;

  // Fetch API key from profile
  const { data: profile } = await sb
    .from('profiles')
    .select('anthropic_api_key')
    .eq('user_id', uid)
    .maybeSingle();

  _anthropicKey = profile?.anthropic_api_key?.trim() || null;

  if (!_anthropicKey) {
    return { error: 'no_key' };
  }

  if (!_digestData) {
    return { error: 'no_data' };
  }

  // Discover which model to use from this key's available models
  const model = await _pickModel(_anthropicKey);
  if (!model) {
    return { error: 'no_model', message: 'No models available on this API key. Check that your Anthropic account has active billing.' };
  }

  const summaryText = _buildSummaryText(_digestData);

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':                                 _anthropicKey,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type':                              'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system:     'You are a personal work assistant. Summarize the user\'s week concisely and positively in 3-5 sentences. Focus on what they accomplished.',
        messages: [{ role: 'user', content: summaryText }],
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
  const text = json?.content?.[0]?.text || '';
  _aiSummary = text;
  return { text };
}
