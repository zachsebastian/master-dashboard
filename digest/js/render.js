// ── Escape helper ──
function esc(str) {
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

// ── Format date label (e.g. "Mon May 12") ──
function _fmtDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Truncate note snippet ──
function _snippet(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

// ── Render today-items section ──
function renderTodaySection(todayItems) {
  if (!todayItems || !todayItems.length) {
    return `<p class="digest-empty-section">No completed tasks this week.</p>`;
  }

  // Group by date
  const byDate = {};
  for (const item of todayItems) {
    if (!byDate[item.item_date]) byDate[item.item_date] = [];
    byDate[item.item_date].push(item);
  }

  return Object.entries(byDate).map(([date, items]) => `
    <div class="digest-day-group">
      <div class="digest-day-label">${esc(_fmtDayLabel(date))}</div>
      ${items.map(item => `
        <div class="digest-item">
          <div class="digest-item-dot green"></div>
          <div class="digest-item-text">
            <div class="digest-item-label">${esc(item.text || '(untitled)')}</div>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

// ── Render projects section ──
function renderProjectsSection(projects) {
  if (!projects || !projects.length) {
    return `<p class="digest-empty-section">No project updates this week.</p>`;
  }

  return projects.map(p => `
    <div class="digest-day-group">
      <div class="digest-day-label">${esc(p.name)}${p.status ? ` · ${esc(p.status)}` : ''}</div>

      ${p.entries.map(e => `
        <div class="digest-item">
          <div class="digest-item-dot blue"></div>
          <div class="digest-item-text">
            <div class="digest-item-label">${esc(_fmtDayLabel(e.date))}</div>
            ${e.note ? `<div class="digest-item-note">${esc(_snippet(e.note, 200))}</div>` : ''}
            ${e.completedTasks && e.completedTasks.length ? `
              <div class="digest-task-list">
                ${e.completedTasks.map(t => `
                  <div class="digest-task-item">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>
                    ${esc(t)}
                  </div>`).join('')}
              </div>` : ''}
          </div>
        </div>`).join('')}

      ${p.nextSteps ? `
        <div class="digest-project-meta">
          <span class="digest-meta-label">Next steps</span>
          <span class="digest-meta-value">${esc(_snippet(p.nextSteps, 200))}</span>
        </div>` : ''}

      ${p.blockers && p.blockers.length ? `
        <div class="digest-project-meta digest-project-meta--blocker">
          <span class="digest-meta-label">Blockers</span>
          <div>${p.blockers.map(b => `<div class="digest-meta-value">⚠ ${esc(b)}</div>`).join('')}</div>
        </div>` : ''}

    </div>`).join('');
}

// ── Render past reflections history ──
function _fmtWeekLabel(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end   = new Date(start.getTime() + 6 * 86400000);
  const fmt   = d => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const year  = end.getFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
}

function _renderReflectionHistory() {
  if (!_reflectionHistory.length) return '';

  const cards = _reflectionHistory.map((r, i) => {
    const label   = _fmtWeekLabel(r.week_start);
    const hasData = r.wins || r.blockers || r.carry_forwards || r.ai_summary;
    if (!hasData) return '';

    return `
      <div class="rh-card" id="rh-card-${i}">
        <button class="rh-card-header" onclick="toggleRhCard(${i})">
          <span class="rh-card-week">${esc(label)}</span>
          <span class="rh-card-chips">
            ${r.wins          ? `<span class="rh-chip rh-chip--green">Wins</span>` : ''}
            ${r.blockers      ? `<span class="rh-chip rh-chip--red">Blockers</span>` : ''}
            ${r.carry_forwards? `<span class="rh-chip">Carry-fwds</span>` : ''}
            ${r.ai_summary    ? `<span class="rh-chip rh-chip--ai">✨ AI</span>` : ''}
          </span>
          <svg class="rh-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l4 4 4-4"/></svg>
        </button>
        <div class="rh-card-body" id="rh-body-${i}" style="display:none">
          ${r.wins ? `
            <div class="rh-field">
              <div class="rh-field-label">Wins</div>
              <div class="rh-field-text">${esc(r.wins)}</div>
            </div>` : ''}
          ${r.blockers ? `
            <div class="rh-field">
              <div class="rh-field-label">Blockers &amp; challenges</div>
              <div class="rh-field-text">${esc(r.blockers)}</div>
            </div>` : ''}
          ${r.carry_forwards ? `
            <div class="rh-field">
              <div class="rh-field-label">Carry forwards</div>
              <div class="rh-field-text">${esc(r.carry_forwards)}</div>
            </div>` : ''}
          ${r.ai_summary ? `
            <div class="rh-ai-block">
              <div class="rh-ai-label">✨ AI Analysis</div>
              <div class="rh-ai-text">${esc(r.ai_summary)}</div>
              ${r.ai_generated_at ? `<div class="rh-ai-date">Generated ${new Date(r.ai_generated_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : ''}
            </div>` : ''}
        </div>
      </div>`;
  }).filter(Boolean).join('');

  if (!cards) return '';

  return `
    <div class="rh-section">
      <div class="rh-section-title">Past Reflections</div>
      <div class="rh-list">${cards}</div>
    </div>`;
}

function toggleRhCard(i) {
  const body    = document.getElementById(`rh-body-${i}`);
  const card    = document.getElementById(`rh-card-${i}`);
  const isOpen  = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  card.classList.toggle('open', !isOpen);
}

// ── Render metrics section ──
function renderMetricsSection(metrics) {
  if (!metrics || !metrics.length) {
    return `<p class="digest-empty-section">No metric changes this week.</p>`;
  }

  return metrics.map(m => {
    const changeNote = m.oldValue !== null
      ? `${esc(String(m.oldValue))} → ${esc(String(m.newValue))}`
      : `Latest: ${esc(String(m.newValue))}`;
    return `
      <div class="digest-item">
        <div class="digest-item-dot purple"></div>
        <div class="digest-item-text">
          <div class="digest-item-label">${esc(m.name)}</div>
          <div class="digest-item-note">${changeNote}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Render AI summary card ──
function renderAiCard() {
  if (!_aiSummary) return `<div class="ai-summary-card" id="ai-summary-card"></div>`;
  return `
    <div class="ai-summary-card visible" id="ai-summary-card">
      <div class="ai-summary-label">✨ AI Summary</div>
      <div class="ai-summary-text">${esc(_aiSummary)}</div>
    </div>`;
}

// ── Main render ──
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const data = _digestData || { weekRange: { start: '', end: '', label: '—' }, todayItems: [], projects: [], metrics: [] };
  const { weekRange, todayItems, projects, metrics } = data;

  const taskCount    = todayItems.length;
  const projectCount = projects.length;
  const metricCount  = metrics.length;

  const aiLabel = _aiSummary ? 'Regenerate Summary' : '✨ Generate AI Summary';

  app.innerHTML = `
    <div class="digest-wrap">

      <!-- Page header -->
      <div class="digest-header">
        <div class="digest-title-group">
          <div class="digest-title">Weekly Digest</div>
          <div class="digest-week-range" id="digest-week-range">${esc(weekRange.label)}</div>
        </div>
        <div class="digest-week-toggle" id="digest-week-toggle">
          <button class="digest-week-btn${_weekMode === 'rolling' ? ' active' : ''}" data-mode="rolling">Rolling 7d</button>
          <button class="digest-week-btn${_weekMode === 'mon'     ? ' active' : ''}" data-mode="mon">Mon–Sun</button>
          <button class="digest-week-btn${_weekMode === 'sun'     ? ' active' : ''}" data-mode="sun">Sun–Sat</button>
        </div>
      </div>

      <!-- AI button -->
      <button class="digest-ai-btn" id="digest-ai-btn">${esc(aiLabel)}</button>

      <!-- AI no-key message -->
      <div class="ai-no-key-msg" id="ai-no-key-msg" style="display:none">
        Add your Anthropic API key in Profile Settings to use this feature.
      </div>

      <!-- AI summary card -->
      ${renderAiCard()}

      <!-- Today List section -->
      <div class="digest-section">
        <div class="digest-section-header">
          <span class="digest-section-title">Today List · ${taskCount} completed</span>
          <span class="digest-section-count">${taskCount}</span>
        </div>
        ${renderTodaySection(todayItems)}
      </div>

      <!-- Projects section -->
      <div class="digest-section">
        <div class="digest-section-header">
          <span class="digest-section-title">Projects · ${projectCount} updated</span>
          <span class="digest-section-count">${projectCount}</span>
        </div>
        ${renderProjectsSection(projects)}
      </div>

      <!-- Metrics section -->
      <div class="digest-section">
        <div class="digest-section-header">
          <span class="digest-section-title">Metrics · ${metricCount} tracked</span>
          <span class="digest-section-count">${metricCount}</span>
        </div>
        ${renderMetricsSection(metrics)}
      </div>

      <!-- Reflections -->
      <div class="reflection-section">
        <div class="reflection-title">Weekly Reflections</div>

        <div class="reflection-field">
          <label class="reflection-label" for="reflection-wins">Wins this week</label>
          <textarea class="reflection-textarea" id="reflection-wins" placeholder="What went well this week?">${esc(_reflection.wins)}</textarea>
        </div>

        <div class="reflection-field">
          <label class="reflection-label" for="reflection-blockers">Blockers &amp; challenges</label>
          <textarea class="reflection-textarea" id="reflection-blockers" placeholder="What slowed you down or presented obstacles?">${esc(_reflection.blockers)}</textarea>
        </div>

        <div class="reflection-field">
          <label class="reflection-label" for="reflection-carry">Carry forwards to next week</label>
          <textarea class="reflection-textarea" id="reflection-carry" placeholder="What tasks or ideas carry over to next week?">${esc(_reflection.carry_forwards)}</textarea>
        </div>

        <button class="reflection-save-btn" id="reflection-save-btn">Save Reflections</button>
        <span class="reflection-save-status" id="reflection-save-status">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Saved
        </span>
      </div>

      <!-- Past reflections history -->
      ${_renderReflectionHistory()}

    </div>`;

  _bindEvents();
}

// ── Bind interactive events after render ──
function _bindEvents() {
  // Week mode toggle
  const toggle = document.getElementById('digest-week-toggle');
  if (toggle) {
    toggle.addEventListener('click', async e => {
      const btn = e.target.closest('.digest-week-btn');
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (!mode || mode === _weekMode) return;
      _weekMode = mode;
      localStorage.setItem('digestWeekMode', mode);
      renderLoading();
      await Promise.all([loadDigestData(), loadReflection(), loadReflectionHistory()]);
      render();
    });
  }

  // AI generate button
  const aiBtn = document.getElementById('digest-ai-btn');
  if (aiBtn) {
    aiBtn.addEventListener('click', async () => {
      // If Q&A form is showing, ignore — user must submit or skip it
      if (_aiQuestions && _aiQuestions.length) return;

      const noKeyMsg = document.getElementById('ai-no-key-msg');
      if (noKeyMsg) noKeyMsg.style.display = 'none';

      aiBtn.disabled = true;
      aiBtn.innerHTML = `<span class="ai-spinner"></span> Reviewing your week…`;

      const qResult = await fetchAiQuestions();

      if (qResult.error === 'no_key') {
        if (noKeyMsg) noKeyMsg.style.display = 'block';
        aiBtn.disabled = false;
        aiBtn.textContent = _aiSummary ? 'Regenerate Summary' : '✨ Generate AI Summary';
        return;
      }

      if (qResult.error) {
        aiBtn.disabled = false;
        aiBtn.textContent = _aiSummary ? 'Regenerate Summary' : '✨ Generate AI Summary';
        _showAiError(qResult);
        return;
      }

      aiBtn.disabled = false;
      aiBtn.textContent = _aiSummary ? 'Regenerate Summary' : '✨ Generate AI Summary';

      if (qResult.questions && qResult.questions.length) {
        // Show the Q&A form inside the card
        const card = document.getElementById('ai-summary-card');
        if (card) {
          card.classList.add('visible');
          card.innerHTML = _renderAiQaForm(qResult.questions);
        }
      } else {
        // No questions — go straight to generation
        aiBtn.disabled = true;
        aiBtn.innerHTML = `<span class="ai-spinner"></span> Generating…`;
        const result = await generateAiSummary([]);
        _handleAiResult(result);
      }
    });
  }

  // Save reflections button
  const saveBtn = document.getElementById('reflection-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const wins     = (document.getElementById('reflection-wins')?.value     || '').trim();
      const blockers = (document.getElementById('reflection-blockers')?.value || '').trim();
      const carry    = (document.getElementById('reflection-carry')?.value    || '').trim();

      saveBtn.disabled = true;
      const ok = await saveReflection(wins, blockers, carry);
      saveBtn.disabled = false;

      if (ok) {
        const status = document.getElementById('reflection-save-status');
        if (status) {
          status.classList.add('visible');
          setTimeout(() => status.classList.remove('visible'), 2500);
        }
      }
    });
  }
}

// ── AI Q&A form HTML ──
function _renderAiQaForm(questions) {
  return `
    <div class="ai-summary-label">✨ A couple of quick questions</div>
    <div class="ai-qa-intro">To give you a sharper analysis, I have a few questions — answer what you can, skip the rest:</div>
    <div class="ai-qa-list">
      ${questions.map((q, i) => `
        <div class="ai-qa-item">
          <div class="ai-qa-question">${esc(q)}</div>
          <textarea class="ai-qa-answer" id="ai-qa-${i}" placeholder="Your answer (or leave blank)…"></textarea>
        </div>`).join('')}
    </div>
    <div class="ai-qa-actions">
      <button class="ai-qa-submit-btn" onclick="submitAiQa()">Generate Summary →</button>
      <button class="ai-qa-skip-btn" onclick="skipAiQa()">Skip questions</button>
    </div>`;
}

// ── Submit Q&A answers then generate ──
async function submitAiQa() {
  const questions = _aiQuestions || [];
  const qaContext = questions.map((q, i) => ({
    q,
    a: (document.getElementById(`ai-qa-${i}`)?.value || '').trim(),
  }));
  _aiQuestions = null;

  const aiBtn = document.getElementById('digest-ai-btn');
  const card  = document.getElementById('ai-summary-card');
  if (aiBtn) { aiBtn.disabled = true; aiBtn.innerHTML = `<span class="ai-spinner"></span> Generating…`; }
  if (card)  { card.innerHTML = ''; card.classList.remove('visible'); }

  const result = await generateAiSummary(qaContext);
  _handleAiResult(result);
}

// ── Skip questions and generate without context ──
async function skipAiQa() {
  _aiQuestions = null;
  const aiBtn = document.getElementById('digest-ai-btn');
  const card  = document.getElementById('ai-summary-card');
  if (aiBtn) { aiBtn.disabled = true; aiBtn.innerHTML = `<span class="ai-spinner"></span> Generating…`; }
  if (card)  { card.innerHTML = ''; card.classList.remove('visible'); }

  const result = await generateAiSummary([]);
  _handleAiResult(result);
}

// ── Shared result handler ──
function _handleAiResult(result) {
  const aiBtn    = document.getElementById('digest-ai-btn');
  const noKeyMsg = document.getElementById('ai-no-key-msg');
  const card     = document.getElementById('ai-summary-card');

  if (result.error === 'no_key') {
    if (noKeyMsg) noKeyMsg.style.display = 'block';
    if (aiBtn)   { aiBtn.disabled = false; aiBtn.textContent = '✨ Generate AI Summary'; }
    return;
  }

  if (result.error) {
    if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = '✨ Generate AI Summary'; }
    _showAiError(result);
    return;
  }

  if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = 'Regenerate Summary'; }
  if (card) {
    card.classList.add('visible');
    card.innerHTML = `
      <div class="ai-summary-label">✨ AI Summary</div>
      <div class="ai-summary-text">${esc(result.text)}</div>`;
  }
}

// ── Show error in AI card ──
function _showAiError(result) {
  const card = document.getElementById('ai-summary-card');
  if (!card) return;
  const detail = result.message
    ? `${result.error}${result.status ? ` (${result.status})` : ''}: ${result.message}`
    : result.error;
  card.classList.add('visible');
  card.innerHTML = `
    <div class="ai-summary-label">Error</div>
    <div class="ai-summary-text" style="color:var(--red);font-size:13px">${esc(detail)}</div>`;
}
