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
            ${e.note ? `<div class="digest-item-note">${esc(_snippet(e.note, 160))}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>`).join('');
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
      await Promise.all([loadDigestData(), loadReflection()]);
      render();
    });
  }

  // AI generate button
  const aiBtn = document.getElementById('digest-ai-btn');
  if (aiBtn) {
    aiBtn.addEventListener('click', async () => {
      const noKeyMsg = document.getElementById('ai-no-key-msg');
      if (noKeyMsg) noKeyMsg.style.display = 'none';

      aiBtn.disabled = true;
      aiBtn.innerHTML = `<span class="ai-spinner"></span> Generating…`;

      const result = await generateAiSummary();

      if (result.error === 'no_key') {
        if (noKeyMsg) noKeyMsg.style.display = 'block';
        aiBtn.disabled = false;
        aiBtn.textContent = '✨ Generate AI Summary';
        return;
      }

      if (result.error) {
        aiBtn.disabled = false;
        aiBtn.textContent = '✨ Generate AI Summary';
        const card = document.getElementById('ai-summary-card');
        if (card) {
          card.classList.add('visible');
          card.innerHTML = `
            <div class="ai-summary-label">Error</div>
            <div class="ai-summary-text" style="color:var(--red)">Failed to generate summary. Please check your API key and try again.</div>`;
        }
        return;
      }

      // Success — re-render AI card in place to avoid full page re-render
      aiBtn.disabled = false;
      aiBtn.textContent = 'Regenerate Summary';

      const card = document.getElementById('ai-summary-card');
      if (card) {
        card.classList.add('visible');
        card.innerHTML = `
          <div class="ai-summary-label">✨ AI Summary</div>
          <div class="ai-summary-text">${esc(result.text)}</div>`;
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
