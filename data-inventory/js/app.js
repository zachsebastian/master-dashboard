// ── Data Inventory ──

const MASTER_KEY   = '__master_summary__';

let _currentUser   = null;
let _anthropicKey  = null;
let _inventoryMap  = {};   // table_name → { contents, why_stored, updated_at }
let _schemaData    = [];   // [{ table_name, columns }]
let _invGenerating = false;
let _masterRegen   = false;
let _claudeModel   = null;

// ── Helpers ──
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function _safeId(tableName) {
  return tableName.replace(/[^a-z0-9]/gi, '_');
}

// ── Theme / Auth ──
async function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  applyTheme();
  if (_currentUser) {
    await sb.from('user_preferences').upsert(
      { user_id: _currentUser.id, theme: next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = '/';
}

// ── Boot ──
async function initAuth() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = '<div class="di-loading">Loading…</div>';

  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { window.location.href = '/'; return; }

  _currentUser = session.user;

  const [prefsRes, profileRes] = await Promise.all([
    sb.from('user_preferences').select('theme').eq('user_id', session.user.id).maybeSingle(),
    sb.from('profiles').select('is_admin, anthropic_api_key').eq('user_id', session.user.id).maybeSingle(),
  ]);

  if (!profileRes.data?.is_admin) { window.location.href = '/'; return; }

  const theme = prefsRes.data?.theme || localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  _anthropicKey = profileRes.data?.anthropic_api_key?.trim() || null;

  initModuleHeader({
    name: 'Data',
    subtitle: 'Inventory',
    leftActions: `<button class="btn" onclick="window.history.back()">← Admin</button>`,
  });

  await _loadData();
  _render();

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

// ── Data loading ──
async function _loadData() {
  const [schemaRes, inventoryRes] = await Promise.all([
    sb.rpc('get_public_schema'),
    sb.from('data_inventory').select('*'),
  ]);

  if (schemaRes.error) {
    _schemaData = null; // signals error
  } else {
    _schemaData = schemaRes.data || [];
  }

  _inventoryMap = {};
  for (const row of (inventoryRes.data || [])) {
    _inventoryMap[row.table_name] = row;
  }
}

// ── Render ──
function _render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (_schemaData === null) {
    app.innerHTML = `
      <div class="di-layout">
        <div class="di-notice">
          Schema introspection not available. Make sure you've run
          <code>sql/create_data_inventory.sql</code> in your Supabase SQL editor.
        </div>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="di-layout">
      <div class="di-page-header">
        <div>
          <div class="di-page-title">Data Inventory</div>
          <div class="di-page-sub">
            AI-generated descriptions of every table in your database.
            Read-only — never modifies your data.
          </div>
        </div>
        <div class="di-header-actions">
          <button class="btn-sm di-gen-btn" id="di-gen-all-btn" onclick="generateAll()">
            ✦ Generate All
          </button>
        </div>
      </div>
      <div class="di-progress-wrap" id="di-progress-wrap">
        <div class="di-progress-label" id="di-progress-label">Generating…</div>
        <div class="di-progress-bar-bg">
          <div class="di-progress-bar-fill" id="di-progress-fill" style="width:0%"></div>
        </div>
      </div>
      ${_renderMasterSummary()}
      ${!_schemaData.length
        ? `<div class="di-notice">No tables found in the public schema.</div>`
        : _schemaData.map(_renderCard).join('')
      }
    </div>`;
}

function _renderMasterSummary() {
  const entry   = _inventoryMap[MASTER_KEY] || {};
  const summary = entry.contents || '';
  const updatedAt = entry.updated_at
    ? new Date(entry.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  // Count how many tables have descriptions (for the empty-state hint)
  const documented = Object.keys(_inventoryMap).filter(k => k !== MASTER_KEY && _inventoryMap[k].contents).length;

  return `
    <div class="di-master-card" id="di-master-card">
      <div class="di-master-header">
        <div class="di-master-title">
          <span class="di-master-label">Master Summary</span>
          <span class="di-master-sub">All tables · unified overview</span>
        </div>
        <div class="di-card-btns">
          <button class="btn-sm" id="di-master-edit-btn" onclick="startMasterEdit()">Edit</button>
          <button class="btn-sm" id="di-master-regen-btn" onclick="regenMasterSummary()">↺ Regen</button>
        </div>
      </div>
      <div class="di-master-body" id="di-master-body">
        ${_renderMasterBody(summary, updatedAt, documented, false)}
      </div>
    </div>
    <div class="di-divider"></div>`;
}

function _renderMasterBody(summary, updatedAt, documented, editMode) {
  if (editMode) {
    return `
      <textarea class="di-field-textarea di-master-textarea" id="di-master-textarea"
        rows="8">${_esc(summary)}</textarea>
      <div class="di-edit-footer" style="margin-top:10px">
        <span id="di-master-save-status" style="font-size:12px;flex:1;color:var(--text-3)"></span>
        <button class="btn-sm" onclick="cancelMasterEdit()">Cancel</button>
        <button class="btn-sm di-save-btn" onclick="saveMasterEdit()">Save</button>
      </div>`;
  }

  if (!summary) {
    return `<div class="di-master-empty">
      ${documented > 0
        ? `${documented} table${documented === 1 ? '' : 's'} documented — click <strong>↺ Regen</strong> to generate the master summary.`
        : 'Generate individual table descriptions first, then click <strong>↺ Regen</strong> to build the master summary.'
      }
    </div>`;
  }

  return `
    <div class="di-master-text">${_esc(summary)}</div>
    ${updatedAt ? `<div class="di-field-updated" style="margin-top:10px">Last updated ${updatedAt}</div>` : ''}`;
}

async function regenMasterSummary() {
  if (_masterRegen || _invGenerating) return;
  if (!_anthropicKey) { alert('No Anthropic API key found. Add your key in profile settings.'); return; }

  // Collect all existing table descriptions
  const documented = Object.entries(_inventoryMap)
    .filter(([k, v]) => k !== MASTER_KEY && (v.contents || v.why_stored))
    .map(([k, v]) => ({ table_name: k, contents: v.contents, why_stored: v.why_stored }));

  if (!documented.length) {
    alert('No table descriptions found. Run "Generate All" first to document the individual tables, then regenerate the summary.');
    return;
  }

  _masterRegen = true;
  const btn = document.getElementById('di-master-regen-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    await _resolveModel();

    const tableLines = documented.map(t =>
      `• ${t.table_name}: ${t.contents}${t.why_stored ? ' ' + t.why_stored : ''}`
    ).join('\n');

    const prompt = `You are writing a master summary for a personal productivity dashboard's database documentation.

Below are descriptions for each table:

${tableLines}

Write a single cohesive summary (3–5 paragraphs) that answers:
1. What tables exist in this database
2. What data each one contains
3. Why each type of data is stored — what role it plays in the dashboard

Write in plain, readable prose. You can group related tables together. Don't use bullet points or headers — this should read as a unified narrative someone could skim to understand the full data model at a glance. Be specific and reference actual table names.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': _anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: _claudeModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const json    = await res.json();
    const summary = (json.content?.[0]?.text || '').trim();
    if (!summary) throw new Error('Empty response from Claude.');

    const entry = {
      table_name: MASTER_KEY,
      contents:   summary,
      why_stored: '',
      updated_at: new Date().toISOString(),
    };
    await sb.from('data_inventory').upsert(entry, { onConflict: 'table_name' });
    _inventoryMap[MASTER_KEY] = entry;

    // Re-render just the master body
    const bodyEl = document.getElementById('di-master-body');
    if (bodyEl) {
      const updatedAt = new Date(entry.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const doc = Object.keys(_inventoryMap).filter(k => k !== MASTER_KEY && _inventoryMap[k].contents).length;
      bodyEl.innerHTML = _renderMasterBody(summary, updatedAt, doc, false);
    }
  } catch (err) {
    console.error('regenMasterSummary:', err);
    alert('Failed to generate summary: ' + (err.message || 'Unknown error'));
  } finally {
    _masterRegen = false;
    if (btn) { btn.disabled = false; btn.textContent = '↺ Regen'; }
  }
}

function startMasterEdit() {
  const bodyEl  = document.getElementById('di-master-body');
  const editBtn = document.getElementById('di-master-edit-btn');
  if (!bodyEl) return;
  const entry   = _inventoryMap[MASTER_KEY] || {};
  const doc     = Object.keys(_inventoryMap).filter(k => k !== MASTER_KEY && _inventoryMap[k].contents).length;
  bodyEl.innerHTML = _renderMasterBody(entry.contents || '', '', doc, true);
  if (editBtn) editBtn.style.display = 'none';
  document.getElementById('di-master-textarea')?.focus();
}

function cancelMasterEdit() {
  const bodyEl  = document.getElementById('di-master-body');
  const editBtn = document.getElementById('di-master-edit-btn');
  if (!bodyEl) return;
  const entry     = _inventoryMap[MASTER_KEY] || {};
  const updatedAt = entry.updated_at
    ? new Date(entry.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const doc = Object.keys(_inventoryMap).filter(k => k !== MASTER_KEY && _inventoryMap[k].contents).length;
  bodyEl.innerHTML = _renderMasterBody(entry.contents || '', updatedAt, doc, false);
  if (editBtn) editBtn.style.display = '';
}

async function saveMasterEdit() {
  const statusEl = document.getElementById('di-master-save-status');
  const summary  = (document.getElementById('di-master-textarea')?.value || '').trim();
  if (statusEl) statusEl.textContent = 'Saving…';

  const entry = {
    table_name: MASTER_KEY,
    contents:   summary,
    why_stored: '',
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('data_inventory').upsert(entry, { onConflict: 'table_name' });

  if (error) {
    if (statusEl) { statusEl.textContent = '⚠ ' + error.message; statusEl.style.color = 'var(--red)'; }
    return;
  }

  _inventoryMap[MASTER_KEY] = entry;
  cancelMasterEdit();
}

function _renderCard(table) {
  const entry  = _inventoryMap[table.table_name] || {};
  const sid    = _safeId(table.table_name);
  const colList = (table.columns || [])
    .map(c => `${_esc(c.name)} <span class="di-col-type">${_esc(c.type)}</span>`)
    .join(' &nbsp;·&nbsp; ');

  return `
    <div class="di-card" id="di-card-${sid}">
      <div class="di-card-header">
        <div class="di-card-title">${_esc(table.table_name)}</div>
        <div class="di-card-btns">
          <button class="btn-sm" id="di-edit-${sid}"
            onclick="startEdit('${_esc(table.table_name)}')">Edit</button>
          <button class="btn-sm" id="di-regen-${sid}"
            onclick="regenOne('${_esc(table.table_name)}')">↺ Regen</button>
        </div>
      </div>
      <div class="di-cols">${colList}</div>
      <div class="di-fields" id="di-fields-${sid}">
        ${_renderFields(table.table_name, entry, false)}
      </div>
    </div>`;
}

function _renderFields(tableName, entry, editMode) {
  const sid       = _safeId(tableName);
  const contents  = entry.contents   || '';
  const why       = entry.why_stored || '';
  const updatedAt = entry.updated_at
    ? new Date(entry.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  if (editMode) {
    return `
      <div class="di-field">
        <div class="di-field-label">Table Contents</div>
        <textarea class="di-field-textarea" id="di-contents-${sid}" rows="3">${_esc(contents)}</textarea>
      </div>
      <div class="di-field">
        <div class="di-field-label">Why It's Stored</div>
        <textarea class="di-field-textarea" id="di-why-${sid}" rows="3">${_esc(why)}</textarea>
      </div>
      <div class="di-edit-footer">
        <span id="di-save-status-${sid}" style="font-size:12px;flex:1;color:var(--text-3)"></span>
        <button class="btn-sm" onclick="cancelEdit('${_esc(tableName)}')">Cancel</button>
        <button class="btn-sm di-save-btn" onclick="saveEdit('${_esc(tableName)}')">Save</button>
      </div>`;
  }

  return `
    <div class="di-field">
      <div class="di-field-label">Table Contents</div>
      <div class="di-field-value${!contents ? ' di-field-empty' : ''}">
        ${contents ? _esc(contents) : 'Not yet generated — click ↺ Regen or use Generate All.'}
      </div>
    </div>
    <div class="di-field">
      <div class="di-field-label">Why It's Stored</div>
      <div class="di-field-value${!why ? ' di-field-empty' : ''}">
        ${why ? _esc(why) : ''}
      </div>
    </div>
    ${updatedAt ? `<div class="di-field-updated">Last updated ${updatedAt}</div>` : ''}`;
}

// ── Edit / Save / Cancel ──
function startEdit(tableName) {
  const sid      = _safeId(tableName);
  const fieldsEl = document.getElementById(`di-fields-${sid}`);
  const editBtn  = document.getElementById(`di-edit-${sid}`);
  if (!fieldsEl) return;
  fieldsEl.innerHTML = _renderFields(tableName, _inventoryMap[tableName] || {}, true);
  if (editBtn) editBtn.style.display = 'none';
  document.getElementById(`di-contents-${sid}`)?.focus();
}

function cancelEdit(tableName) {
  const sid      = _safeId(tableName);
  const fieldsEl = document.getElementById(`di-fields-${sid}`);
  const editBtn  = document.getElementById(`di-edit-${sid}`);
  if (!fieldsEl) return;
  fieldsEl.innerHTML = _renderFields(tableName, _inventoryMap[tableName] || {}, false);
  if (editBtn) editBtn.style.display = '';
}

async function saveEdit(tableName) {
  const sid      = _safeId(tableName);
  const statusEl = document.getElementById(`di-save-status-${sid}`);
  const contents = (document.getElementById(`di-contents-${sid}`)?.value || '').trim();
  const why      = (document.getElementById(`di-why-${sid}`)?.value      || '').trim();

  if (statusEl) statusEl.textContent = 'Saving…';

  const { error } = await sb.from('data_inventory').upsert(
    { table_name: tableName, contents, why_stored: why, updated_at: new Date().toISOString() },
    { onConflict: 'table_name' }
  );

  if (error) {
    if (statusEl) { statusEl.textContent = '⚠ ' + error.message; statusEl.style.color = 'var(--red)'; }
    return;
  }

  _inventoryMap[tableName] = { table_name: tableName, contents, why_stored: why, updated_at: new Date().toISOString() };
  cancelEdit(tableName);
}

// ── Generate all (batched to avoid token limit) ──
async function generateAll() {
  if (_invGenerating) return;
  if (!_anthropicKey) { alert('No Anthropic API key found. Add your key in profile settings.'); return; }
  if (!_schemaData?.length) { alert('Schema not loaded.'); return; }

  _invGenerating = true;
  const btn = document.getElementById('di-gen-all-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  const progressWrap  = document.getElementById('di-progress-wrap');
  const progressFill  = document.getElementById('di-progress-fill');
  const progressLabel = document.getElementById('di-progress-label');
  if (progressWrap) progressWrap.classList.add('visible');

  // Pick model once up front
  await _resolveModel();

  // Batch into groups of 6 to avoid token truncation
  const BATCH = 6;
  const total  = _schemaData.length;
  let done     = 0;

  try {
    for (let i = 0; i < total; i += BATCH) {
      const batch = _schemaData.slice(i, i + BATCH);

      if (progressLabel) progressLabel.textContent =
        `Generating ${i + 1}–${Math.min(i + BATCH, total)} of ${total}…`;

      const results = await _callClaude(batch);

      for (const r of results) {
        if (!r.table_name) continue;
        const entry = {
          table_name: r.table_name,
          contents:   (r.contents   || '').trim(),
          why_stored: (r.why_stored || '').trim(),
          updated_at: new Date().toISOString(),
        };
        await sb.from('data_inventory').upsert(entry, { onConflict: 'table_name' });
        _inventoryMap[r.table_name] = entry;

        // Update this card in the DOM immediately without full re-render
        const sid      = _safeId(r.table_name);
        const fieldsEl = document.getElementById(`di-fields-${sid}`);
        if (fieldsEl) fieldsEl.innerHTML = _renderFields(r.table_name, entry, false);
      }

      done += batch.length;
      if (progressFill) progressFill.style.width = `${Math.round(done / total * 100)}%`;
    }
  } catch (err) {
    console.error('generateAll:', err);
    alert('Generation failed: ' + (err.message || 'Unknown error'));
  } finally {
    _invGenerating = false;
    if (btn) { btn.disabled = false; btn.textContent = '✦ Generate All'; }
    if (progressWrap) {
      progressWrap.classList.remove('visible');
      if (progressFill) progressFill.style.width = '0%';
    }
  }
}

// ── Regenerate single table ──
async function regenOne(tableName) {
  if (_invGenerating) return;
  if (!_anthropicKey) { alert('No Anthropic API key found. Add your key in profile settings.'); return; }

  const sid      = _safeId(tableName);
  const regenBtn = document.getElementById(`di-regen-${sid}`);
  if (regenBtn) { regenBtn.disabled = true; regenBtn.textContent = '⏳'; }
  _invGenerating = true;

  try {
    await _resolveModel();
    const table = _schemaData.find(t => t.table_name === tableName);
    if (!table) throw new Error('Table not found in schema.');

    const results = await _callClaude([table]);
    const r = results[0];
    if (!r) throw new Error('No result returned by Claude.');

    const entry = {
      table_name: tableName,
      contents:   (r.contents   || '').trim(),
      why_stored: (r.why_stored || '').trim(),
      updated_at: new Date().toISOString(),
    };
    await sb.from('data_inventory').upsert(entry, { onConflict: 'table_name' });
    _inventoryMap[tableName] = entry;

    const fieldsEl = document.getElementById(`di-fields-${sid}`);
    if (fieldsEl) fieldsEl.innerHTML = _renderFields(tableName, entry, false);
  } catch (err) {
    console.error('regenOne:', err);
    alert('Generation failed: ' + (err.message || 'Unknown error'));
  } finally {
    _invGenerating = false;
    if (regenBtn) { regenBtn.disabled = false; regenBtn.textContent = '↺ Regen'; }
  }
}

// ── Claude helpers ──
async function _resolveModel() {
  if (_claudeModel) return;
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': _anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (res.ok) {
      const ids = ((await res.json()).data || []).map(m => m.id);
      for (const p of ['haiku', 'sonnet', 'opus']) {
        const match = ids.find(id => id.toLowerCase().includes(p));
        if (match) { _claudeModel = match; return; }
      }
    }
  } catch { /* fall through */ }
  _claudeModel = 'claude-haiku-4-5';
}

async function _callClaude(tables) {
  const tableList = tables.map(t => ({
    table_name: t.table_name,
    columns: (t.columns || []).map(c => `${c.name} (${c.type}${c.nullable ? ', nullable' : ''})`),
  }));

  const prompt = `You are writing internal documentation for a personal productivity dashboard's database. The app has modules for: project tracking, metrics/KPIs, daily priority list, weekly digest, case writer (ticket templates), wins log, scratchpad, and bookmark management.

For each table, write:
- "contents": 1-2 sentences on exactly what data is stored. Use column names as evidence. Be specific.
- "why_stored": 1-2 sentences on the product reason this table exists.

Tables to document:
${JSON.stringify(tableList, null, 2)}

Respond with ONLY valid JSON — no markdown, no explanation, nothing else:
{"tables":[{"table_name":"...","contents":"...","why_stored":"..."}]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': _anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: _claudeModel,
      max_tokens: 1200,   // 6 tables × ~150 tokens each = well within limit
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const json    = await res.json();
  let rawText   = json.content?.[0]?.text || '';
  console.log('[Data Inventory] raw:', rawText);

  // Strip fences
  rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!rawText.startsWith('{')) {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (m) rawText = m[0];
  }

  const parsed = JSON.parse(rawText);
  return parsed.tables || [];
}

initAuth();
