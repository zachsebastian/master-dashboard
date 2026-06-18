// ── Helpers ──
function evalFormula(formula, values) {
  try {
    let expr = formula;
    Object.entries(values).forEach(([k, v]) => {
      expr = expr.replace(new RegExp('\\b' + k + '\\b', 'g'), String(parseFloat(v) || 0));
    });
    expr = expr.replace(/\bround\b/g, 'Math.round');
    const result = eval(expr);
    if (isNaN(result) || !isFinite(result)) return '—';
    return String(Math.round(result * 100) / 100);
  } catch { return '—'; }
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function periodFromDates(s, e) {
  if (s && e) return `${fmtDate(s)} – ${fmtDate(e)}`;
  if (s) return `From ${fmtDate(s)}`;
  if (e) return `Until ${fmtDate(e)}`;
  return '';
}

function rolling30() {
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: fmt(start), end: fmt(end) };
}

function fmtPeriodShort(entry) {
  const fmtMonYear = iso => {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return null;
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };
  const endLabel = fmtMonYear(entry.periodEnd);
  const startLabel = fmtMonYear(entry.periodStart);
  if (startLabel && endLabel && startLabel !== endLabel) return startLabel + ' – ' + endLabel;
  if (endLabel) return endLabel;
  if (startLabel) return startLabel;
  if (entry.period) {
    return entry.period.replace(/\b(\d{1,2})\b/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  return '—';
}

function taskStats(m) {
  const tasks = m.tasks || [];
  const total = tasks.length;
  const complete = tasks.filter(t => t.status === 'complete').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const notStarted = tasks.filter(t => t.status === 'not-started').length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  return { total, complete, inProgress, notStarted, pct };
}

function renderLoading(msg) {
  document.getElementById('app').innerHTML = `
    <div class="loading-screen">
      <div class="spinner"></div>
      <div>${msg || 'Loading…'}</div>
    </div>
  `;
}

function renderTaskNarrativeRead(m) {
  const row = (icon, label, text) => text
    ? `<div class="narrative-section"><div class="narrative-label">${icon} ${label}</div><div class="narrative-text">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div></div>`
    : `<div class="narrative-section"><div class="narrative-label">${icon} ${label}</div><div class="narrative-empty">Not yet entered — click Edit to add.</div></div>`;
  return row('📊','Why it matters', m.why||'') +
         row('🔮','Prediction', m.prediction||'') +
         row('🎯','Proposal', m.proposal||'');
}

function renderNarrativeBlock(entry) {
  if (!entry) return '';
  const has = entry.why || entry.prediction || entry.proposal;
  if (!has) return '';
  const row = (icon, label, text) => text ? `
    <div class="narrative-section">
      <div class="narrative-label">${icon} ${label}</div>
      <div class="narrative-text">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
    </div>` : '';
  return `<div class="narrative-block">
    ${row('📊','Why it matters', entry.why)}
    ${row('🔮','Prediction', entry.prediction)}
    ${row('🎯','Proposal', entry.proposal)}
  </div>`;
}

// Metrics where up is bad (reversed) or neutral
const _DELTA_REVERSED = ['required dev', 'total escalations'];
const _DELTA_NEUTRAL  = ['cx solvable'];

function _getDeltaMode(metricName) {
  const n = (metricName || '').toLowerCase();
  if (_DELTA_REVERSED.some(k => n.includes(k))) return 'reversed';
  if (_DELTA_NEUTRAL.some(k => n.includes(k)))  return 'neutral';
  return 'normal';
}

function renderStatCard(f, latest, prev, metricColor, metricName) {
  const val = f.type === 'derived'
    ? evalFormula(f.formula || '', latest.values || {})
    : (latest.values[f.id] ?? '—');
  const isPercent = f.name.includes('%');
  const numVal = parseFloat(val);
  const displayVal = val === '—' ? '—' : (val + (isPercent ? '%' : ''));
  let deltaHtml = '';
  if (prev && val !== '—') {
    const pv = f.type === 'derived'
      ? evalFormula(f.formula || '', prev.values || {})
      : (prev.values[f.id] ?? null);
    if (pv !== null && pv !== '—') {
      const prevNum = parseFloat(pv);
      const diff = Math.round((numVal - prevNum) * 100) / 100;
      const pctChange = prevNum !== 0 ? Math.round((diff / Math.abs(prevNum)) * 1000) / 10 : null;
      const mode = _getDeltaMode(f.name);
      let cls;
      if (diff === 0)          cls = 'delta-flat';
      else if (mode === 'neutral')  cls = 'delta-neutral';
      else if (mode === 'reversed') cls = diff > 0 ? 'delta-down' : 'delta-up';
      else                          cls = diff > 0 ? 'delta-up'   : 'delta-down';
      const sign = diff > 0 ? '+' : '';
      if (isPercent) {
        const pctStr = pctChange !== null ? `${sign}${pctChange}%` : `${sign}${diff}%`;
        deltaHtml = `<div class="stat-delta ${cls}">${pctStr} vs prior</div>`;
      } else {
        const pctHtml = pctChange !== null ? ` <span style="opacity:0.65">${sign}${pctChange}%</span>` : '';
        deltaHtml = `<div class="stat-delta ${cls}">${sign}${diff}${pctHtml} vs prior</div>`;
      }
    }
  }
  const color = f.type === 'derived' ? 'var(--blue)' : metricColor;
  let progressHtml = '';
  if (isPercent && !isNaN(numVal)) {
    const pct = Math.min(100, Math.max(0, numVal));
    const fillColor = pct >= 100 ? 'var(--green)' : color;
    progressHtml = `<div class="stat-progress"><div class="stat-progress-fill" style="width:${pct}%;background:${fillColor}"></div></div>`;
  }
  return `<div class="stat-card">
    <div class="stat-label">${f.name}</div>
    <div class="stat-value" style="color:${color}">${displayVal}</div>
    ${f.type === 'derived' ? '<div class="stat-meta">Calculated</div>' : ''}
    ${deltaHtml}
    ${progressHtml}
  </div>`;
}

// ── Main render ──
function render() {
  if (!_appReady) return;
  const app = document.getElementById('app');
  const { metrics, activeMetric, view, modal, presentationMode } = state;
  const selectedMetric = metrics.find(m => m.id === activeMetric);

  if (presentationMode) {
    app.style.display = 'block';
    app.style.minHeight = '';
    app.style.overflowY = 'auto';
    app.innerHTML = renderPresentation(metrics.filter(m => m.visible));
    return;
  }
  app.style.display = '';
  app.style.minHeight = '';
  app.style.overflowY = '';

  app.innerHTML = `
    <div class="main">
      ${view === 'detail' || state.summarySidebarVisible ? renderSidebar(metrics, activeMetric) : ''}
      <div class="${view === 'detail' || state.summarySidebarVisible ? 'sidebar-main' : ''}" style="${view === 'summary' && !state.summarySidebarVisible ? 'flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column;' : ''}">
        <div class="content">
          ${view === 'summary' ? renderSummary(metrics) : renderDetail(selectedMetric)}
        </div>
      </div>
      ${modal ? renderModal(modal, selectedMetric) : ''}
    </div>
  `;
  setActiveTab(state.view);
  updateSidebarBtn(state.summarySidebarVisible);
  setTimeout(initSidebarResize, 0);
  const _activeM = state.metrics.find(m => m.id === state.activeMetric);
  if (_activeM && _activeM.type === 'task') {
    setTimeout(() => initTaskDrag(_activeM.id), 0);
  } else if (_activeM && state.view === 'detail') {
    setTimeout(() => initEntryDrag(_activeM.id), 0);
  }
}

function renderSidebar(metrics, activeMetric) {
  return `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-resize-handle" id="sidebar-resize"></div>
      <div class="sidebar-inner">
        <div class="sidebar-label">Metrics</div>
        ${metrics.map((m, mIdx) => {
          const mStatus = (state.metricStatus && state.metricStatus[m.id]) || 'ongoing';
          return `
          <div class="metric-item ${m.id===activeMetric?'active':''}" style="--item-color:${m.color}" onclick="setActive('${m.id}', true)">
            <div class="m-reorder" onclick="event.stopPropagation()">
              <button class="reorder-btn" ${mIdx===0?'disabled':''} onclick="moveMetric('${m.id}',-1)" title="Move up">▲</button>
              <button class="reorder-btn" ${mIdx===metrics.length-1?'disabled':''} onclick="moveMetric('${m.id}',1)" title="Move down">▼</button>
            </div>
            <div class="m-dot" style="background:${m.color}"></div>
            <div class="m-body">
              <span class="m-name">${m.name}</span>
              <select class="metric-status-select ${mStatus}" onclick="event.stopPropagation()" onchange="event.stopPropagation();setMetricStatus('${m.id}',this.value)">
                <option value="ongoing" ${mStatus==='ongoing'?'selected':''}>Ongoing</option>
                <option value="in-progress" ${mStatus==='in-progress'?'selected':''}>In Progress</option>
                <option value="on-hold" ${mStatus==='on-hold'?'selected':''}>On Hold</option>
                <option value="complete" ${mStatus==='complete'?'selected':''}>Complete</option>
              </select>
            </div>
            <button class="toggle ${m.visible?'on':'off'}" title="${m.visible?'Shown in presentation':'Hidden'}" onclick="event.stopPropagation();toggleVisible('${m.id}')"></button>
          </div>
        `}).join('')}
      </div>
      <div class="sidebar-footer">
        <div class="sidebar-hint">Toggle = visible in presentation</div>
        <div class="sidebar-footer-btns">
          <button class="btn btn-sm" style="flex:1;justify-content:center" onclick="openModal('new-metric')">+ Add</button>
        </div>
      </div>
    </div>
  `;
}

function renderSummary(metrics) {
  const visible = metrics.filter(m => m.visible);
  const hiddenCount = metrics.filter(m => !m.visible).length;
  return `
    <div class="page-header">
      <div>
        <div class="page-title">Executive Summary</div>
        <div class="page-subtitle">${visible.length} active metric${visible.length!==1?'s':''}${hiddenCount?' · '+hiddenCount+' hidden':''}</div>
      </div>
      <div class="page-header-right">
        <button class="btn btn-sm" onclick="togglePresentation()">Present ↗</button>
      </div>
    </div>
    ${visible.map(m => renderMetricPanel(m)).join('')}
    ${visible.length===0 ? `<div class="empty-state"><div class="empty-icon">◎</div><div class="empty-text">No metrics are visible</div><div class="empty-hint">Toggle metrics on in the sidebar</div></div>` : ''}
  `;
}

function _statusSelectHtml(metricId) {
  const mSt = (state.metricStatus && state.metricStatus[metricId]) || 'ongoing';
  return `<select class="metric-status-select ${mSt}" onclick="event.stopPropagation()" onchange="event.stopPropagation();setMetricStatus('${metricId}',this.value)">
    <option value="ongoing" ${mSt==='ongoing'?'selected':''}>Ongoing</option>
    <option value="in-progress" ${mSt==='in-progress'?'selected':''}>In Progress</option>
    <option value="on-hold" ${mSt==='on-hold'?'selected':''}>On Hold</option>
    <option value="complete" ${mSt==='complete'?'selected':''}>Complete</option>
  </select>`;
}

function renderMetricPanel(m) {
  if (m.type === 'task') return renderTaskMetricPanel(m);

  const idx = (state.metricEntryIndex && state.metricEntryIndex[m.id]) || 0;
  const entry = m.entries[idx] || null;
  const prevEntry = m.entries[idx + 1] || null;
  const selectedRock = (state.metricRocks && state.metricRocks[m.id]) || '';
  const rockOptions = `<option value="">— No rock assigned —</option>` + anyRockOptionsHtml(_rocks, selectedRock);
  const periodOptions = m.entries.map((e, i) =>
    `<option value="${i}" ${i === idx ? 'selected' : ''}>${fmtPeriodShort(e)}</option>`
  ).join('');
  const dateToggle = m.entries.length > 1
    ? `<select class="period-select" onclick="event.stopPropagation()" onchange="event.stopPropagation();setEntryIndex('${m.id}',this.value)">${periodOptions}</select>`
    : (entry ? `<span class="period-tag">${fmtPeriodShort(entry)}</span>` : '');
  const isSupport = m.id === 'm1' || m.name === 'Support Tickets';
  const isOnboarding = m.id === 'm2' || m.name === 'Onboarding Videos';
  const chartHtml = (isSupport && m.entries.length > 0)
    ? renderSupportChart(m)
    : (isOnboarding && m.entries.length > 0)
      ? renderSupportChart(m, { maxPoints: 3, fieldIds: ['f1'] })
      : '';

  return `
    <div class="metric-panel" onclick="setActive('${m.id}', true)">
      <div class="metric-panel-stripe" style="background:${m.color}"></div>
      <div class="metric-panel-header">
        <div class="metric-panel-title">
          <div class="m-dot" style="background:${m.color};width:10px;height:10px"></div>
          ${m.name}
          ${_statusSelectHtml(m.id)}
        </div>
        <div class="metric-panel-meta">
          ${dateToggle}
          <span style="font-size:12px;color:var(--text-3)">${m.entries.length} entr${m.entries.length===1?'y':'ies'}</span>
        </div>
      </div>
      <div class="metric-panel-rock" onclick="event.stopPropagation()">
        <span class="rock-label">🪨 Rock</span>
        <select class="rock-select" onchange="setMetricRock('${m.id}', this.value)">${rockOptions}</select>
      </div>
      <div class="metric-panel-body">
        ${entry ? `<div class="stat-grid">${m.fields.map(f => renderStatCard(f, entry, prevEntry, m.color, m.name)).join('')}</div>` : `<div style="font-size:13px;color:var(--text-3);padding:4px 0">No entries yet — click to add one.</div>`}
      </div>
      ${chartHtml}
      ${entry ? renderNarrativeBlock(entry) : ''}
    </div>
  `;
}

function renderTaskMetricPanel(m) {
  const { total, complete, inProgress, notStarted, pct } = taskStats(m);
  const selectedRock = (state.metricRocks && state.metricRocks[m.id]) || '';
  const rockOptions = `<option value="">— No rock assigned —</option>` + anyRockOptionsHtml(_rocks, selectedRock);
  const fillColor = pct === 100 ? 'var(--green)' : m.color;
  return `
    <div class="metric-panel" onclick="setActive('${m.id}',true)">
      <div class="metric-panel-stripe" style="background:${m.color}"></div>
      <div class="metric-panel-header">
        <div class="metric-panel-title">
          <div class="m-dot" style="background:${m.color};width:10px;height:10px"></div>
          ${m.name}
          ${_statusSelectHtml(m.id)}
        </div>
        <div class="metric-panel-meta"><span style="font-size:12px;color:var(--text-3)">${total} task${total!==1?'s':''}</span></div>
      </div>
      <div class="metric-panel-rock" onclick="event.stopPropagation()">
        <span class="rock-label">🪨 Rock</span>
        <select class="rock-select" onchange="setMetricRock('${m.id}',this.value)">${rockOptions}</select>
      </div>
      <div class="metric-panel-body">
        <div class="task-stat-grid">
          <div class="stat-card"><div class="stat-label">Not Started</div><div class="stat-value" style="color:var(--text-3)">${notStarted}</div></div>
          <div class="stat-card"><div class="stat-label">In Progress</div><div class="stat-value" style="color:var(--blue)">${inProgress}</div></div>
          <div class="stat-card"><div class="stat-label">Complete</div><div class="stat-value" style="color:var(--green)">${complete}</div></div>
          <div class="stat-card"><div class="stat-label">Total Tasks</div><div class="stat-value" style="color:${m.color}">${total}</div></div>
          <div class="stat-card"><div class="stat-label">% Complete</div><div class="stat-value" style="color:${fillColor}">${pct}%</div><div class="stat-progress"><div class="stat-progress-fill" style="width:${pct}%;background:${fillColor}"></div></div></div>
        </div>
      </div>
      ${renderTaskChart(m)}
      ${(m.why || m.prediction || m.proposal) ? renderNarrativeBlock({ why: m.why, prediction: m.prediction, proposal: m.proposal }).replace(/class="narrative-block"/, 'class="narrative-block" style="margin:0 20px 16px"') : ''}
    </div>
  `;
}

function renderDetail(metric) {
  if (!metric) return `<div class="empty-state"><div class="empty-text">Select a metric from the sidebar.</div></div>`;
  if (metric.type === 'task') return renderTaskDetail(metric);
  const derivedCount = metric.fields.filter(f => f.type === 'derived').length;
  return `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:12px;height:12px;border-radius:50%;background:${metric.color};flex-shrink:0;margin-top:4px"></div>
        <div>
          <div class="page-title">${metric.name}</div>
          <div class="page-subtitle">${metric.fields.length} fields · ${metric.entries.length} entr${metric.entries.length===1?'y':'ies'}</div>
        </div>
      </div>
      <div class="page-header-right">
        <button class="btn" onclick="openModal('edit-metric')">Edit metric</button>
        <button class="btn btn-primary" onclick="openModal('add-entry')">+ Add entry</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Fields</span>
        <span style="font-size:11px;font-weight:600;color:var(--red);background:var(--red-bg);border:1px solid rgba(224,92,75,0.25);padding:2px 8px;border-radius:4px;letter-spacing:0.01em">⚠ Please adjust in Claude only</span>
      </div>
      <div class="panel-body">
        <div class="fields-grid">
          ${metric.fields.map(f => `
            <div class="field-card">
              <div class="field-card-top">
                <span class="field-card-name">${f.name}</span>
                <span class="field-type-chip ${f.type==='derived'?'chip-derived':'chip-input'}">${f.type}</span>
              </div>
              <div class="field-card-formula">${f.type==='derived' ? f.formula : 'Manual input'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Entries</span>
        <button class="btn btn-sm btn-primary" onclick="openModal('add-entry')">+ Add entry</button>
      </div>
      ${metric.entries.length===0
        ? `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No entries yet</div><div class="empty-hint">Add your first entry to start tracking</div></div>`
        : `<div class="table-wrap">
            <table class="entries-table">
              <thead><tr>
                <th></th><th>Date Range</th>
                ${metric.fields.map(f => `<th>${f.name}${f.type==='derived'?' ✦':''}</th>`).join('')}
                <th></th>
              </tr></thead>
              <tbody>
                ${metric.entries.map(entry => `
                  <tr class="entry-row" data-entry-id="${entry.id}" draggable="true">
                    <td style="width:28px;padding:6px 4px 6px 12px"><span class="entry-drag-handle" title="Drag to reorder">⠿</span></td>
                    <td class="td-period">${fmtPeriodShort(entry)}</td>
                    ${metric.fields.map(f => {
                      const val = f.type==='derived' ? evalFormula(f.formula||'', entry.values||{}) : (entry.values[f.id]??'—');
                      const isPercent = f.name.includes('%');
                      const display = val==='—' ? '—' : val+(isPercent?'%':'');
                      return `<td class="${f.type==='derived'?'td-derived':''}">${display}</td>`;
                    }).join('')}
                    <td class="td-actions">
                      <button class="btn btn-sm" onclick="openModal('edit-entry',{entryId:'${entry.id}'})">Edit</button>
                      <button class="btn btn-sm btn-danger" data-delete-entry="${entry.id}" style="margin-left:4px" onclick="deleteEntry('${metric.id}','${entry.id}')">Remove</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
      }
      ${derivedCount>0 ? `<div style="font-size:11px;color:var(--text-3);padding:10px 16px">✦ Calculated fields</div>` : ''}
    </div>
  `;
}

function renderTaskDetail(metric) {
  const { total, complete, inProgress, notStarted, pct } = taskStats(metric);
  const tasks = metric.tasks || [];
  const fillColor = pct === 100 ? 'var(--green)' : metric.color;
  return `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:12px;height:12px;border-radius:50%;background:${metric.color};flex-shrink:0;margin-top:4px"></div>
        <div><div class="page-title">${metric.name}</div><div class="page-subtitle">${total} task${total!==1?'s':''} · ${pct}% complete</div></div>
      </div>
      <div class="page-header-right"><button class="btn" onclick="openModal('edit-metric')">Edit metric</button></div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><span class="panel-title">Progress</span></div>
      <div class="metric-panel-body">
        <div class="task-stat-grid">
          <div class="stat-card"><div class="stat-label">Not Started</div><div class="stat-value" style="color:var(--text-3)">${notStarted}</div></div>
          <div class="stat-card"><div class="stat-label">In Progress</div><div class="stat-value" style="color:var(--blue)">${inProgress}</div></div>
          <div class="stat-card"><div class="stat-label">Complete</div><div class="stat-value" style="color:var(--green)">${complete}</div></div>
          <div class="stat-card"><div class="stat-label">Total Tasks</div><div class="stat-value" style="color:${metric.color}">${total}</div></div>
          <div class="stat-card"><div class="stat-label">% Complete</div><div class="stat-value" style="color:${fillColor}">${pct}%</div><div class="stat-progress"><div class="stat-progress-fill" style="width:${pct}%;background:${fillColor}"></div></div></div>
        </div>
      </div>
    </div>

    ${renderTaskChart(metric)}

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header" style="justify-content:space-between">
        <span class="panel-title">Context &amp; Outlook</span>
        <button class="btn btn-sm" onclick="document.getElementById('task-narrative-read').style.display='none';document.getElementById('task-narrative-edit').style.display='block';document.getElementById('tn-why').focus()">Edit</button>
      </div>
      <div class="metric-panel-body">
        <div id="task-narrative-read">${renderTaskNarrativeRead(metric)}</div>
        <div id="task-narrative-edit" style="display:none">
          <div class="form-group"><label class="form-label">📊 Why it matters</label><textarea class="form-input narrative-textarea" id="tn-why" placeholder="What does this metric mean?">${(metric.why||'').replace(/</g,'&lt;')}</textarea></div>
          <div class="form-group" style="margin-top:12px"><label class="form-label">🔮 Prediction</label><textarea class="form-input narrative-textarea" id="tn-prediction" placeholder="What do you expect to happen next?">${(metric.prediction||'').replace(/</g,'&lt;')}</textarea></div>
          <div class="form-group" style="margin-top:12px"><label class="form-label">🎯 Proposal</label><textarea class="form-input narrative-textarea" id="tn-proposal" placeholder="What are you going to do about it?">${(metric.proposal||'').replace(/</g,'&lt;')}</textarea></div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-primary btn-sm" onclick="saveTaskNarrative('${metric.id}')">Save</button>
            <button class="btn btn-sm" onclick="document.getElementById('task-narrative-edit').style.display='none';document.getElementById('task-narrative-read').style.display='block'">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><span class="panel-title">Tasks</span></div>
      <div class="task-list">
        ${tasks.length === 0 ? `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No tasks yet</div><div class="empty-hint">Add your first task below</div></div>` :
          tasks.map(t => {
            const isEditing = _editingTaskId === t.id;
            return `
            <div class="task-row" data-task-id="${t.id}" draggable="true">
              <span class="task-drag-handle" title="Drag to reorder">⠿</span>
              ${isEditing ? `
                <input class="task-edit-input" id="task-edit-${t.id}" value="${t.name.replace(/"/g,'&quot;')}"
                       onkeydown="if(event.key==='Enter')saveTaskEdit('${metric.id}','${t.id}');if(event.key==='Escape')cancelTaskEdit()">
                <button class="task-edit-btn save" onclick="saveTaskEdit('${metric.id}','${t.id}')">Save</button>
                <button class="task-edit-btn cancel" onclick="cancelTaskEdit()">Cancel</button>
              ` : `
                <span class="task-name ${t.status==='complete'?'done':''}">${t.name}</span>
                <button class="task-edit-btn" onclick="event.stopPropagation();editTask('${t.id}')" title="Edit task">✎</button>
                ${t.status === 'complete' ? `
                  <div class="date-input-wrap" style="flex-shrink:0;width:130px" onclick="event.stopPropagation()">
                    <input type="date" class="form-input" style="font-size:11px;padding:3px 28px 3px 7px;height:auto"
                      value="${t.completedDate||''}" title="Date completed"
                      onchange="event.stopPropagation();setTaskCompletedDate('${metric.id}','${t.id}',this.value)">
                    <span class="date-cal-btn" style="font-size:12px">📅</span>
                  </div>
                ` : ''}
                <select class="task-status-select ${t.status}" onclick="event.stopPropagation()" onchange="event.stopPropagation();setTaskStatus('${metric.id}','${t.id}',this.value)">
                  <option value="not-started" ${t.status==='not-started'?'selected':''}>Not Started</option>
                  <option value="in-progress" ${t.status==='in-progress'?'selected':''}>In Progress</option>
                  <option value="complete" ${t.status==='complete'?'selected':''}>Complete</option>
                </select>
                <button class="task-del-btn" data-delete-task="${t.id}" onclick="event.stopPropagation();deleteTask('${metric.id}','${t.id}')">×</button>
              `}
            </div>
          `}).join('')}
      </div>
      <div class="task-add-row" onclick="event.stopPropagation()">
        <input class="task-add-input" id="task-add-input-${metric.id}" placeholder="Add a task…" onkeydown="if(event.key==='Enter')addTask('${metric.id}')">
        <button class="btn btn-sm btn-primary" onclick="addTask('${metric.id}')">+ Add</button>
      </div>
    </div>
  `;
}

function renderPresentation(metrics) {
  return `
    <div class="present-wrap">
      <div class="present-header">
        <div>
          <div class="present-title">Executive Metrics Report</div>
          <div class="present-date">${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
        </div>
        <button class="btn" onclick="togglePresentation()">← Exit</button>
      </div>
      ${metrics.map(m => {
        const idx = (state.metricEntryIndex && state.metricEntryIndex[m.id]) || 0;
        const entry = m.entries[idx] || null;
        const prev = m.entries[idx + 1] || null;
        const periodOptions = m.entries.map((e, i) => `<option value="${i}" ${i===idx?'selected':''}>${fmtPeriodShort(e)}</option>`).join('');
        const periodDropdown = m.entries.length > 1
          ? `<select class="period-select" style="margin-left:10px" onchange="setEntryIndex('${m.id}',this.value)">${periodOptions}</select>`
          : (entry ? `<span class="period-tag" style="margin-left:10px">${fmtPeriodShort(entry)}</span>` : '');
        const isSupport = m.id === 'm1' || m.name === 'Support Tickets';
        const isOnboarding = m.id === 'm2' || m.name === 'Onboarding Videos';
        const chartHtml = (isSupport && m.entries.length > 1) ? renderSupportChart(m)
          : (isOnboarding && m.entries.length > 0) ? renderSupportChart(m, { maxPoints: 3, fieldIds: ['f1'] }) : '';
        return `
          <div class="present-metric">
            <div class="present-metric-name">
              <div class="pm-bar" style="background:${m.color}"></div>
              ${m.name}
              ${_statusSelectHtml(m.id)}
              ${periodDropdown}
            </div>
            ${m.type === 'task' ? (() => {
              const ts = taskStats(m); const fc = ts.pct===100?'var(--green)':m.color;
              return `<div class="task-stat-grid" style="margin-bottom:16px">
                <div class="stat-card"><div class="stat-label">Not Started</div><div class="stat-value" style="color:var(--text-3)">${ts.notStarted}</div></div>
                <div class="stat-card"><div class="stat-label">In Progress</div><div class="stat-value" style="color:var(--blue)">${ts.inProgress}</div></div>
                <div class="stat-card"><div class="stat-label">Complete</div><div class="stat-value" style="color:var(--green)">${ts.complete}</div></div>
                <div class="stat-card"><div class="stat-label">Total Tasks</div><div class="stat-value" style="color:${m.color}">${ts.total}</div></div>
                <div class="stat-card"><div class="stat-label">% Complete</div><div class="stat-value" style="color:${fc}">${ts.pct}%</div><div class="stat-progress"><div class="stat-progress-fill" style="width:${ts.pct}%;background:${fc}"></div></div></div>
              </div>
              ${renderTaskChart(m)}
              ${(m.why || m.prediction || m.proposal) ? renderNarrativeBlock({ why: m.why, prediction: m.prediction, proposal: m.proposal }) : ''}`;
            })() : entry ? `
              <div class="stat-grid" style="margin-bottom:12px">${m.fields.map(f => renderStatCard(f, entry, prev, m.color, m.name)).join('')}</div>
              ${chartHtml ? `<div style="margin-top:12px">${chartHtml}</div>` : ''}
              ${renderNarrativeBlock(entry)}
            ` : `<div style="color:var(--text-3);font-size:13px">No entries recorded yet.</div>`}
          </div>
        `;
      }).join('')}
      ${metrics.length===0 ? `<div class="empty-state"><div class="empty-text">No metrics enabled. Exit and toggle metrics on.</div></div>` : ''}
    </div>
  `;
}

function renderModal(type, metric) {
  if (type === 'new-metric' || type === 'edit-metric') {
    const isEdit = type === 'edit-metric';
    const md = modalData;
    if (!md.fields) md.fields = [];
    if (!md.color) md.color = COLORS[0];
    const swatches = COLORS.map((c, i) =>
      `<div class="color-swatch ${md.color===c?'selected':''}" style="background:${c}" title="${COLOR_LABELS[i]}" onclick="modalData.color='${c}';render()"></div>`
    ).join('');
    return `<div class="modal-backdrop" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header"><div class="modal-title">${isEdit?'Edit metric':'New metric'}</div><button class="modal-close" onclick="closeModal()">×</button></div>
        <div class="modal-body">
          <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="md-name" value="${md.name||''}" placeholder="e.g. Support Tickets" oninput="modalData.name=this.value" autofocus></div>
          <div class="form-group"><label class="form-label">Color</label><div class="color-picker">${swatches}</div></div>
          <div class="form-group">
            <label class="form-label">Fields</label>
            <div class="form-hint" style="margin-bottom:10px">Input = entered manually. Derived = formula using field IDs (<code style="background:var(--surface-2);padding:1px 5px;border-radius:3px;font-size:11.5px">f1 - f2</code> or <code style="background:var(--surface-2);padding:1px 5px;border-radius:3px;font-size:11.5px">round(f2/f1*100)</code>).</div>
            <div class="fields-builder">
              ${md.fields.map((f,i) => `
                <div class="fb-row">
                  <input class="form-input" style="font-size:13px;padding:5px 9px" value="${f.name}" placeholder="Field name (ID: f${i+1})" oninput="modalData.fields[${i}].name=this.value">
                  <div class="fb-type ${f.type==='input'?'chip-input':'chip-derived'}">${f.type}</div>
                  <button class="fb-delete" onclick="modalData.fields.splice(${i},1);render()">×</button>
                </div>
                ${f.type==='derived' ? `<div class="fb-row-extra"><input class="form-input" style="font-size:12px;padding:5px 9px;font-family:'SF Mono','Fira Code',monospace" value="${f.formula||''}" placeholder="e.g.  f1 - f2   or   round(f2/f1*100)" oninput="modalData.fields[${i}].formula=this.value"></div>` : ''}
              `).join('')}
              <div class="fb-row-add">
                <button class="btn btn-sm" onclick="addField('input')">+ Input field</button>
                <button class="btn btn-sm" onclick="addField('derived')">+ Derived field</button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <div class="modal-footer-left">${isEdit ? `<button class="btn btn-sm btn-danger" onclick="deleteMetric('${metric?.id}')">Delete metric</button>` : ''}</div>
          <div class="modal-footer-right">
            <button class="btn" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="${isEdit?'saveEditMetric()':'saveNewMetric()'}">${isEdit?'Save changes':'Create metric'}</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  if (type === 'add-entry' || type === 'edit-entry') {
    if (!metric) return '';
    const isEdit = type === 'edit-entry';
    const md = modalData;
    const inputFields = metric.fields.filter(f => f.type === 'input');
    const derivedFields = metric.fields.filter(f => f.type === 'derived');
    const previewVals = {};
    inputFields.forEach(f => { previewVals[f.id] = parseFloat(md.values?.[f.id]) || 0; });
    const derivedPreview = derivedFields.map(f => {
      const val = evalFormula(f.formula||'', previewVals);
      const isPercent = f.name.includes('%');
      const display = val==='—' ? '—' : val+(isPercent?'%':'');
      return `<div class="derived-preview-row"><span style="color:var(--text-2)">${f.name}</span><span style="font-weight:600;color:var(--blue)">${display}</span></div>`;
    }).join('');
    return `<div class="modal-backdrop" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header"><div class="modal-title">${isEdit?'Edit entry':'New entry'} — ${metric.name}</div><button class="modal-close" onclick="closeModal()">×</button></div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Period</label>
            <div class="form-row" style="margin-bottom:8px">
              <div><label class="form-sublabel">Start date</label><div class="date-input-wrap"><input class="form-input" type="date" id="e-start" value="${md.periodStart||''}" onchange="updatePeriodLabel()"><span class="date-cal-btn">📅</span></div></div>
              <div><label class="form-sublabel">End date</label><div class="date-input-wrap"><input class="form-input" type="date" id="e-end" value="${md.periodEnd||''}" onchange="updatePeriodLabel()"><span class="date-cal-btn">📅</span></div></div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <input class="form-input" id="e-period" value="${md.period||''}" placeholder="Period label (e.g. Q1 2024)">
              <button class="btn btn-sm" onclick="setRolling30()" style="white-space:nowrap;flex-shrink:0">Last 30 days</button>
              <button class="btn btn-sm" onclick="clearEntryDates()" style="white-space:nowrap;flex-shrink:0">Clear dates</button>
            </div>
          </div>
          <hr class="form-divider">
          ${inputFields.map(f => `
            <div class="form-group">
              <label class="form-label">${f.name}</label>
              <input class="form-input" type="number" id="ev-${f.id}" placeholder="0" value="${md.values?.[f.id]??''}"
                     oninput="modalData.values = modalData.values||{}; modalData.values['${f.id}']=parseFloat(this.value)||0; rerenderDerived()">
            </div>
          `).join('')}
          ${derivedFields.length>0 ? `<div class="derived-preview"><div class="derived-preview-label">Calculated fields</div>${derivedPreview}</div>` : ''}
          <hr class="form-divider">
          <div class="form-group"><label class="form-label">📊 Why it matters</label><textarea class="form-input narrative-textarea" id="e-why" placeholder="What does this data mean?">${md.why||''}</textarea></div>
          <div class="form-group"><label class="form-label">🔮 Prediction</label><textarea class="form-input narrative-textarea" id="e-prediction" placeholder="What do you expect next?">${md.prediction||''}</textarea></div>
          <div class="form-group"><label class="form-label">🎯 Proposal</label><textarea class="form-input narrative-textarea" id="e-proposal" placeholder="What are you going to do about it?">${md.proposal||''}</textarea></div>
        </div>
        <div class="modal-footer">
          <div class="modal-footer-left">${isEdit ? `<button class="btn btn-sm btn-danger" onclick="deleteEntryModal('${metric.id}','${md.entryId}')">Delete entry</button>` : ''}</div>
          <div class="modal-footer-right">
            <button class="btn" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="${isEdit?`saveEditEntry('${metric.id}','${md.entryId}')`:`saveEntry('${metric.id}')`}">${isEdit?'Save changes':'Add entry'}</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  return '';
}

function rerenderDerived() {
  const metric = state.metrics.find(m => m.id === state.activeMetric);
  if (!metric) return;
  const derivedFields = metric.fields.filter(f => f.type === 'derived');
  if (!derivedFields.length) return;
  const inputFields = metric.fields.filter(f => f.type === 'input');
  const previewVals = {};
  inputFields.forEach(f => {
    const el = document.getElementById('ev-' + f.id);
    previewVals[f.id] = el ? parseFloat(el.value) || 0 : 0;
  });
  const preview = document.querySelector('.derived-preview');
  if (!preview) return;
  const rows = derivedFields.map(f => {
    const val = evalFormula(f.formula || '', previewVals);
    const isPercent = f.name.includes('%');
    const display = val === '—' ? '—' : val + (isPercent ? '%' : '');
    return `<div class="derived-preview-row"><span style="color:var(--text-2)">${f.name}</span><span style="font-weight:600;color:var(--blue)">${display}</span></div>`;
  }).join('');
  preview.innerHTML = `<div class="derived-preview-label">Calculated fields</div>${rows}`;
}

function renderSupportChart(m, opts) {
  opts = opts || {};
  let sorted = [...m.entries].reverse();
  if (opts.maxPoints) sorted = sorted.slice(-opts.maxPoints);
  const inputFields = opts.fieldIds
    ? m.fields.filter(f => opts.fieldIds.includes(f.id))
    : m.fields.filter(f => f.type === 'input').slice(0, 3);
  if (!inputFields.length || !sorted.length) return '';
  const CHART_COLORS = [m.color, '#4caf73', '#d4893a', '#d46a8a'];
  const W = 560, H = 160;
  const PAD = { t: 10, r: 12, b: 28, l: 34 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const n = sorted.length;
  const xOf = i => n === 1 ? PAD.l + innerW / 2 : PAD.l + (i / (n - 1)) * innerW;
  let allVals = [];
  sorted.forEach(e => inputFields.forEach(f => { const v = parseFloat(e.values[f.id]); if (!isNaN(v)) allVals.push(v); }));
  const maxVal = Math.max(...allVals, 1);
  const yOf = val => PAD.t + innerH - (val / maxVal) * innerH;
  const niceMax = (() => { if (maxVal <= 0) return 1; const mag = Math.pow(10, Math.floor(Math.log10(maxVal))); return Math.ceil(maxVal / mag) * mag; })();
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({ v: Math.round(pct * niceMax), y: PAD.t + innerH - pct * innerH }));
  const gridLines = yTicks.map(t =>
    `<line x1="${PAD.l}" y1="${t.y.toFixed(1)}" x2="${W - PAD.r}" y2="${t.y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
     <text x="${PAD.l - 5}" y="${(t.y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-3)">${t.v}</text>`
  ).join('');
  const fmtLabel = e => { if (!e.period) return ''; const seg = e.period.split(/\s*[–\-]\s*/)[0].trim(); return seg.length <= 10 ? seg : seg.slice(0, 9) + '…'; };
  let xLabelIdxs = n <= 4 ? sorted.map((_, i) => i) : [0, Math.round((n-1)/3), Math.round(2*(n-1)/3), n-1];
  xLabelIdxs = [...new Set(xLabelIdxs)];
  const xLabels = xLabelIdxs.map(i => {
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    return `<text x="${xOf(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" font-size="9" fill="var(--text-3)">${fmtLabel(sorted[i])}</text>`;
  }).join('');
  const seriesHtml = inputFields.map((f, fi) => {
    const color = CHART_COLORS[fi % CHART_COLORS.length];
    const pts = sorted.map((e, i) => { const v = parseFloat(e.values[f.id]); if (isNaN(v)) return null; return { x: xOf(i), y: yOf(v) }; }).filter(Boolean);
    if (!pts.length) return '';
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    let areaHtml = '';
    if (fi === 0 && pts.length > 1) {
      const baseline = PAD.t + innerH;
      const areaPath = `M${pts[0].x.toFixed(1)},${baseline} ` + pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L${pts[pts.length-1].x.toFixed(1)},${baseline} Z`;
      areaHtml = `<defs><linearGradient id="cg${fi}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.15"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${areaPath}" fill="url(#cg${fi})"/>`;
    }
    const dots = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${color}" stroke="var(--surface)" stroke-width="1.5"/>`).join('');
    return `${areaHtml}<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join('');
  const legend = inputFields.map((f, fi) => `<div class="chart-legend-item"><div class="legend-dot" style="background:${CHART_COLORS[fi % CHART_COLORS.length]}"></div>${f.name}</div>`).join('');
  return `
    <div class="metric-chart-wrap" onclick="event.stopPropagation()">
      <div class="chart-header">
        <span class="chart-title">${opts.maxPoints ? "Last " + sorted.length + " Entries" : "Trend"} — oldest → newest</span>
        <div class="chart-legend">${legend}</div>
      </div>
      <div class="chart-svg-wrap">
        <svg class="metric-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet">${gridLines}${seriesHtml}${xLabels}</svg>
      </div>
    </div>
  `;
}

function renderTaskChart(m) {
  const allTasks = m.tasks || [];
  const total = allTasks.length;
  const completedWithDate = allTasks.filter(t => t.status === 'complete' && t.completedDate);
  if (!completedWithDate.length) return '';
  const today = new Date(); today.setHours(23, 59, 59, 0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 90);
  const priorCount = completedWithDate.filter(t => new Date(t.completedDate + 'T12:00:00') < cutoff).length;
  const monday = d => { const dt = new Date(d + 'T12:00:00'); const mn = new Date(dt); mn.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); mn.setHours(0,0,0,0); return mn; };
  const buckets = {};
  completedWithDate.forEach(t => {
    const dt = new Date(t.completedDate + 'T12:00:00');
    if (dt < cutoff || dt > today) return;
    const k = monday(t.completedDate).toISOString().slice(0, 10);
    buckets[k] = (buckets[k] || 0) + 1;
  });
  const weeks = [];
  const cur = monday(cutoff.toISOString().slice(0, 10));
  while (cur <= today) {
    const k = cur.toISOString().slice(0, 10);
    weeks.push({ key: k, date: new Date(cur), newThisWeek: buckets[k] || 0 });
    cur.setDate(cur.getDate() + 7);
  }
  if (!weeks.length) return '';
  let running = priorCount;
  weeks.forEach(w => { running += w.newThisWeek; w.cumulative = running; });
  const W = 560, H = 160, PAD = { t: 10, r: 12, b: 28, l: 34 };
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b, n = weeks.length;
  const yMax = Math.max(total, running, 1);
  const xOf = i => n === 1 ? PAD.l + innerW / 2 : PAD.l + (i / (n - 1)) * innerW;
  const yOf = v => PAD.t + innerH - (v / yMax) * innerH;
  const tickVals = [...new Set([0, Math.round(yMax / 2), yMax])];
  const gridLines = tickVals.map(v => {
    const y = yOf(v);
    return `<line x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${W - PAD.r}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="${v === yMax ? '1.5' : '1'}" stroke-dasharray="${v === yMax ? '3,3' : ''}"/><text x="${PAD.l - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-3)">${v}</text>`;
  }).join('');
  const fmtMon = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const labelIdxs = [...new Set(n <= 4 ? weeks.map((_, i) => i) : [0, Math.round(n/3), Math.round(2*n/3), n-1])];
  const xLabels = labelIdxs.map(i => { const anchor = i===0?'start':i===n-1?'end':'middle'; return `<text x="${xOf(i).toFixed(1)}" y="${H-6}" text-anchor="${anchor}" font-size="9" fill="var(--text-3)">${fmtMon(weeks[i].date)}</text>`; }).join('');
  const plotPts = weeks.map((w, i) => ({ x: xOf(i), y: yOf(w.cumulative), v: w.cumulative }));
  const linePath = plotPts.map((p, i) => `${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const baseline = PAD.t + innerH;
  const areaPath = `M${plotPts[0].x.toFixed(1)},${baseline} ` + plotPts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L${plotPts[plotPts.length-1].x.toFixed(1)},${baseline} Z`;
  const dots = weeks.map((w, i) => { if (!w.newThisWeek) return ''; const p = plotPts[i]; return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${m.color}" stroke="var(--surface)" stroke-width="1.5"/>`; }).join('');
  return `
    <div class="metric-chart-wrap" onclick="event.stopPropagation()">
      <div class="chart-header">
        <span class="chart-title">Cumulative Tasks Completed — Last 90 Days</span>
        <span style="font-size:11px;color:var(--text-3)">${running} of ${total} total</span>
      </div>
      <div class="chart-svg-wrap">
        <svg class="metric-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet">
          <defs><linearGradient id="tcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${m.color}" stop-opacity="0.2"/><stop offset="100%" stop-color="${m.color}" stop-opacity="0"/></linearGradient></defs>
          ${gridLines}
          <path d="${areaPath}" fill="url(#tcg)"/>
          <path d="${linePath}" fill="none" stroke="${m.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${dots}${xLabels}
        </svg>
      </div>
    </div>
  `;
}
