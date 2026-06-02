// ── State ──
let _currentUser       = null;
const _storedMode = localStorage.getItem('digestWeekMode');
let _weekMode = (_storedMode === 'rolling' || _storedMode === 'sun' || _storedMode === 'custom') ? _storedMode : 'rolling';
let _customRange = {
  start: localStorage.getItem('digestCustomStart') || null,
  end:   localStorage.getItem('digestCustomEnd')   || null,
};
let _digestData        = null;
let _reflection        = { wins: '', blockers: '', carry_forwards: '', ai_summary: null, ai_generated_at: null };
let _reflectionHistory = []; // past weeks, sorted descending
let _aiSummary         = null;
let _anthropicKey      = null;
let _aiQuestions       = null;       // null = not fetched | [] = no Qs | [...] = pending answers
let _aiSummaryHistory  = [];         // all generations across all weeks, desc

// ── Week range ──
function getWeekRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let start, end;

  if (_weekMode === 'custom' && _customRange.start && _customRange.end) {
    return {
      start: _customRange.start,
      end:   _customRange.end,
      label: `${new Date(_customRange.start + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(_customRange.end + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`,
    };
  }

  if (_weekMode === 'sun') {
    const day = today.getDay();
    start = new Date(today);
    start.setDate(today.getDate() - day);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else { // rolling (default)
    start = new Date(today.getTime() - 6 * 86400000);
    end   = new Date(today);
  }

  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
    label: `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`,
  };
}

function applyCustomRange(start, end) {
  _customRange = { start, end };
  _weekMode    = 'custom';
  localStorage.setItem('digestWeekMode', 'custom');
  localStorage.setItem('digestCustomStart', start);
  localStorage.setItem('digestCustomEnd', end);
}

// ── Load all digest data ──
async function loadDigestData() {
  const uid = _currentUser.id;
  const { start, end, label } = getWeekRange();

  // Fetch manually-added today_items completed in range (exclude project-pulled tasks
  // since those already appear under their project in the digest)
  const { data: todayItems } = await sb
    .from('today_items')
    .select('id, text, item_date, completed, source')
    .eq('user_id', uid)
    .eq('completed', true)
    .eq('source', 'manual')
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

  // Filter projects with entries in the date range, enriching each entry
  // with the tasks that were marked complete in that specific log update
  const projects = allProjects
    .map(p => {
      const allTasks = p.tasks || [];
      const entries = (p.entries || [])
        .filter(e => e.date >= start && e.date <= end)
        .map(e => ({
          date:           e.date,
          note:           e.note || '',
          nextSteps:      e.nextSteps || '',
          completedTasks: allTasks
            .filter(t => t.completedInEntry === e.id)
            .map(t => t.text),
        }));
      if (!entries.length) return null;
      return {
        name:      p.name,
        status:    p.status,
        nextSteps: p.nextSteps || '',
        blockers:  p.blockers  || [],
        entries,
      };
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

  // Fetch submitted Case Writer tickets in range
  const { data: caseTickets } = await sb
    .from('case_writer_tickets')
    .select('id, title, template_name, submitted_at, jira_ticket')
    .eq('user_id', uid)
    .gte('submitted_at', start + 'T00:00:00')
    .lte('submitted_at', end   + 'T23:59:59')
    .order('submitted_at', { ascending: true });

  _digestData = { weekRange: { start, end, label }, todayItems: todayItems || [], projects, metrics, caseTickets: caseTickets || [] };
  return _digestData;
}

// ── Load reflection for current week ──
async function loadReflection() {
  const uid = _currentUser.id;
  const { start } = getWeekRange();

  const { data } = await sb
    .from('weekly_reflections')
    .select('wins, blockers, carry_forwards, ai_summary, ai_generated_at')
    .eq('user_id', uid)
    .eq('week_start', start)
    .maybeSingle();

  _reflection = {
    wins:             data?.wins             || '',
    blockers:         data?.blockers         || '',
    carry_forwards:   data?.carry_forwards   || '',
    ai_summary:       data?.ai_summary       || null,
    ai_generated_at:  data?.ai_generated_at  || null,
  };
  // Restore any persisted AI summary for this week
  if (_reflection.ai_summary) _aiSummary = _reflection.ai_summary;
  return _reflection;
}

// ── Load past reflections (all weeks before current) ──
async function loadReflectionHistory() {
  const uid = _currentUser.id;
  const { start } = getWeekRange();

  const { data } = await sb
    .from('weekly_reflections')
    .select('week_start, wins, blockers, carry_forwards, ai_summary, ai_generated_at')
    .eq('user_id', uid)
    .lt('week_start', start)
    .order('week_start', { ascending: false })
    .limit(24); // up to ~6 months back

  _reflectionHistory = data || [];
  return _reflectionHistory;
}

// ── Load AI summary history (all generations, all weeks) ──
async function loadAiSummaryHistory() {
  const uid = _currentUser.id;

  const { data } = await sb
    .from('ai_summary_history')
    .select('id, week_start, summary, generated_at')
    .eq('user_id', uid)
    .order('week_start',   { ascending: false })
    .order('generated_at', { ascending: false });

  _aiSummaryHistory = data || [];
  return _aiSummaryHistory;
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
  const { weekRange, todayItems, projects, metrics, caseTickets } = data;
  const lines = [`Week of ${weekRange.label}`, ''];

  // Manual today-list tasks (not from projects)
  if (todayItems && todayItems.length) {
    lines.push(`OTHER COMPLETED TASKS (${todayItems.length}):`);
    for (const t of todayItems) lines.push(`  ✓ ${t.text}`);
    lines.push('');
  }

  // Projects
  lines.push(`PROJECTS UPDATED (${projects.length}):`);
  if (projects.length) {
    for (const p of projects) {
      lines.push(`  ${p.name}${p.status ? ` [${p.status}]` : ''}:`);
      for (const e of p.entries) {
        lines.push(`    ${e.date}: ${e.note || '(no note)'}`);
        if (e.completedTasks.length) {
          lines.push(`      Tasks completed in this update:`);
          for (const t of e.completedTasks) lines.push(`        ✓ ${t}`);
        }
        if (e.nextSteps) lines.push(`      Next steps after this update: ${e.nextSteps}`);
      }
      if (p.nextSteps) lines.push(`    Current next steps: ${p.nextSteps}`);
      if (p.blockers.length) {
        const active   = p.blockers.filter(b => !(typeof b === 'object' ? b.resolved : false));
        const resolved = p.blockers.filter(b =>  (typeof b === 'object' ? b.resolved : false));
        if (active.length) {
          lines.push(`    Active blockers:`);
          for (const b of active) lines.push(`      ⚠ ${typeof b === 'object' ? (b.text || '') : b}`);
        }
        if (resolved.length) {
          lines.push(`    Resolved blockers:`);
          for (const b of resolved) lines.push(`      ✓ ${typeof b === 'object' ? (b.text || '') : b}`);
        }
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
  lines.push('');

  // Case Writer tickets
  if (caseTickets && caseTickets.length) {
    lines.push(`DEVELOPMENT TICKETS CREATED (${caseTickets.length}):`);
    for (const t of caseTickets) {
      const date = t.submitted_at ? new Date(t.submitted_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
      const jira = t.jira_ticket ? ` · ${t.jira_ticket}` : '';
      lines.push(`  ✓ [${t.template_name}] ${t.title}${date ? ` · ${date}` : ''}${jira}`);
    }
    lines.push('');
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

// ── Save a manually-edited current week summary ──
async function updateCurrentAiSummary(text) {
  const uid     = _currentUser.id;
  const { start } = getWeekRange();
  const trimmed = text.trim();

  _aiSummary                   = trimmed;
  _reflection.ai_summary       = trimmed;

  await sb.from('weekly_reflections').upsert({
    user_id:         uid,
    week_start:      start,
    wins:            _reflection.wins,
    blockers:        _reflection.blockers,
    carry_forwards:  _reflection.carry_forwards,
    ai_summary:      trimmed,
    ai_generated_at: _reflection.ai_generated_at,
    updated_at:      new Date().toISOString(),
  }, { onConflict: 'user_id,week_start' });
}

// ── Save a manually-edited historical summary entry ──
async function updateAiHistoryEntry(id, text) {
  const trimmed = text.trim();

  // Update local state
  const entry = _aiSummaryHistory.find(h => h.id === id);
  if (entry) entry.summary = trimmed;

  await sb.from('ai_summary_history').update({ summary: trimmed }).eq('id', id);
}

// ── Fetch pre-analysis clarifying questions ──
async function fetchAiQuestions() {
  const uid = _currentUser.id;

  // Fetch (and cache) key if not already loaded
  if (!_anthropicKey) {
    const { data: profile } = await sb
      .from('profiles')
      .select('anthropic_api_key')
      .eq('user_id', uid)
      .maybeSingle();
    _anthropicKey = profile?.anthropic_api_key?.trim() || null;
  }

  if (!_anthropicKey) return { error: 'no_key' };
  if (!_digestData)   return { error: 'no_data' };

  const model = await _pickModel(_anthropicKey);
  if (!model) return { error: 'no_model', message: 'No models available on this API key.' };

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
        max_tokens: 300,
        system: `You are reviewing a weekly productivity digest before writing a detailed analysis. \
Identify up to 3 concise clarifying questions that would meaningfully improve your analysis — \
things you genuinely cannot infer from the data alone (e.g. the reason behind a blocker, \
context for an unexpected metric change, or ambiguity in a project's status).

Return ONLY a valid JSON array of question strings. \
If the data is self-explanatory and you have no questions, return an empty array [].

Return absolutely nothing else — no explanation, no markdown fences, just the JSON array.`,
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
  const raw  = (json?.content?.[0]?.text || '').trim();
  let questions = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) questions = parsed.filter(q => typeof q === 'string' && q.trim());
  } catch { /* malformed — treat as no questions */ }

  _aiQuestions = questions;
  return { questions };
}

// ── Generate AI summary via Anthropic API ──
// qaContext: optional array of { q, a } objects from the pre-analysis Q&A
// feedback:  optional string — user's critique of a previous summary to guide revision
async function generateAiSummary(qaContext, feedback) {
  const uid = _currentUser.id;

  // Reuse cached key if fetchAiQuestions already loaded it
  if (!_anthropicKey) {
    const { data: profile } = await sb
      .from('profiles')
      .select('anthropic_api_key')
      .eq('user_id', uid)
      .maybeSingle();
    _anthropicKey = profile?.anthropic_api_key?.trim() || null;
  }

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

  // Prepend any Q&A context the user provided
  const answeredQa = (qaContext || []).filter(qa => qa.a && qa.a.trim());
  let userContent = summaryText;
  if (answeredQa.length) {
    const qaBlock = answeredQa.map(qa => `Q: ${qa.q}\nA: ${qa.a}`).join('\n\n');
    userContent = `ADDITIONAL CONTEXT (answers to clarifying questions):\n${qaBlock}\n\n---\n\n${summaryText}`;
  }
  if (feedback && feedback.trim()) {
    userContent = `FEEDBACK ON THE PREVIOUS SUMMARY — please revise to address this:\n${feedback.trim()}\n\n---\n\n${userContent}`;
  }

  const systemPrompt = `Write a weekly progress update in first person, as if this person wrote it \
themselves. The reader is a senior non-technical leader who is detail-aware but not detail-dependent — \
she wants to understand what is happening and why it matters, not just a list of tasks. \
She will not follow technical jargon, but she will notice if an explanation is vague or evasive.

Tone: professional but conversational. Confident, not performative. The kind of update a \
trusted team member would send — clear enough that she could summarize it to someone else.

Format:
- One or two opening sentences giving an honest sense of how the week went overall
- A short paragraph per active project: name the work, briefly explain what it moves forward \
  or solves, and note any concrete output (numbers, deliverables, completed items)
- If there are blockers, name them plainly and state what is needed — one sentence, no hedging
- Close with two or three sentences on what's coming next and why it matters

Hard rules:
- Write in first person throughout
- When something is technical, add a brief plain-English explanation of why it matters \
  (e.g. "…which means the tool no longer requires an internet connection to function")
- Never use: tribal knowledge, architectural simplification, foundational infrastructure, \
  scalability, operational efficiency, platform enablement, validation-ready, or similar \
  abstract corporate filler language
- No passive blame framing — state what is needed directly
- Aim for 280–350 words: enough context to understand, not so much it becomes a report
- It should read like a real person wrote it

If additional context was provided at the top of the message, weave it naturally into the \
update — do not reference or call it out explicitly.`;

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
        max_tokens: 650,
        system:     systemPrompt,
        messages: [{ role: 'user', content: userContent }],
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

  // Persist the analysis to weekly_reflections for this week
  const { start } = getWeekRange();
  await sb.from('weekly_reflections').upsert({
    user_id:          uid,
    week_start:       start,
    wins:             _reflection.wins,
    blockers:         _reflection.blockers,
    carry_forwards:   _reflection.carry_forwards,
    ai_summary:       text,
    ai_generated_at:  new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  }, { onConflict: 'user_id,week_start' });

  _reflection.ai_summary      = text;
  _reflection.ai_generated_at = new Date().toISOString();

  // Append to permanent history log
  const generatedAt = new Date().toISOString();
  await sb.from('ai_summary_history').insert({
    user_id:      uid,
    week_start:   start,
    summary:      text,
    generated_at: generatedAt,
  });
  _aiSummaryHistory.unshift({ week_start: start, summary: text, generated_at: generatedAt });

  return { text };
}
