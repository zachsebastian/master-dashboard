let currentUser    = null;
let currentProfile = null;
let _pendingProfileUser = null;
let _returningToAdmin   = false;
let _impersonating      = false;

async function handleNewSession(user) {
  const complete = await checkProfile(user);
  if (!complete) return;
  await onSignedIn(user);
  if (sessionStorage.getItem('adminSession') && !user.app_metadata?.is_admin) {
    showBanner(user.email);
  } else {
    sessionStorage.removeItem('adminSession');
  }
}

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  document.getElementById('loading-screen').style.display = 'none';

  if (session) {
    await handleNewSession(session.user);
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (_impersonating) return;
    if (session) {
      document.getElementById('auth-screen').style.display  = 'none';
      document.getElementById('profile-screen').style.display = 'none';
      await handleNewSession(session.user);
    } else if (!_returningToAdmin) {
      document.getElementById('app').style.display          = 'none';
      document.getElementById('profile-screen').style.display = 'none';
      hideBanner();
      document.getElementById('auth-screen').style.display  = 'flex';
    }
  });
}

async function onSignedIn(user) {
  currentUser = user;
  document.getElementById('admin-page').style.display = 'none';
  document.getElementById('profile-page').style.display = 'none';
  hideBanner();

  // Fetch profile
  const { data: profile } = await sb.from('profiles')
    .select('first_name, last_name, email, anthropic_api_key')
    .eq('user_id', user.id)
    .maybeSingle();
  currentProfile = profile;

  // Keep email in sync
  if (profile && profile.email !== user.email) {
    await sb.from('profiles')
      .update({ email: user.email, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  } else if (!profile) {
    await sb.from('profiles')
      .upsert({ user_id: user.id, email: user.email }, { onConflict: 'user_id' });
  }

  // Sync is_admin
  const isAdmin = !!user.app_metadata?.is_admin;
  if (isAdmin) {
    await sb.from('profiles')
      .update({ is_admin: true, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  }

  // Update UI
  const firstName   = profile?.first_name || '';
  const displayName = firstName ? `${firstName} ${profile.last_name || ''}`.trim() : user.email;
  document.getElementById('user-display-name').textContent = displayName;
  document.getElementById('page-title').textContent = firstName ? `Hey, ${firstName}.` : 'Your tools';
  document.getElementById('admin-btn').style.display = isAdmin ? '' : 'none';

  const eyebrow = document.getElementById('hero-eyebrow');
  if (eyebrow) eyebrow.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  // Theme, background, and card style
  const prefs = await loadAndApplyTheme(user.id);
  setBackgrounds(prefs?.bg_image_light_url || null, prefs?.bg_image_dark_url || null);
  applyCardStyle(prefs?.card_opacity ?? 0.38, prefs?.card_blur ?? 6, prefs?.bg_blur ?? 0);

  // Modules + stats
  const { data: modRows } = await sb.from('user_modules')
    .select('module, sort_order').eq('user_id', user.id).order('sort_order');
  const rows    = modRows || [];
  const allowed = new Set(rows.map(r => r.module));

  // Initial render (no stats yet)
  renderModules(rows, {});
  document.getElementById('app').style.display = 'block';

  // Fetch stats for each enabled module in parallel, then re-render with data
  const statsByModule    = {};
  const summaryFragments = [];
  const allActivity      = [];

  await Promise.all([
    loadLikedQuotes(user.id),
    ...ALL_MODULES.filter(m => allowed.has(m.id)).map(async m => {
    try {
      let stats;
      if (m.fetchStats) {
        stats = await m.fetchStats(sb, user.id);
      } else if (m.computeStats && m.table) {
        const { data: blob } = await sb.from(m.table).select('data').eq('user_id', user.id).maybeSingle();
        stats = m.computeStats(blob?.data || null);
      }
      if (stats) {
        statsByModule[m.id] = stats;
        if (stats.summaryFragment) summaryFragments.push(stats.summaryFragment);
        (stats.latestEntries || []).forEach(e => {
          if (!e.when) return;
          allActivity.push({ mod: m.id, target: e.target, note: e.note, when: relativeTime(e.when), _ts: new Date(e.when).getTime() || 0 });
        });
      }
    } catch (_) { /* stats are non-critical */ }
  }),
  ]);

  renderModules(rows, statsByModule);
  renderHeroSummary(firstName, summaryFragments);
  allActivity.sort((a, b) => b._ts - a._ts);
  renderActivityTicker(allActivity);
}

// ── Background image ──
let _bgLight = null;
let _bgDark  = null;

function _applyCurrentBackground() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const url = isDark ? _bgDark : _bgLight;
  if (url) {
    document.documentElement.style.setProperty('--bg-image-url', `url('${url.replace(/'/g, "\\'")}')`);
    document.body.classList.add('has-bg-image');
  } else {
    document.documentElement.style.removeProperty('--bg-image-url');
    document.body.classList.remove('has-bg-image');
  }
}

function setBackgrounds(lightUrl, darkUrl) {
  _bgLight = lightUrl || null;
  _bgDark  = darkUrl  || null;
  _applyCurrentBackground();
}

// Swap background when theme toggles
new MutationObserver(_applyCurrentBackground)
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// Re-sync background when page is restored from bfcache
window.addEventListener('pageshow', e => { if (e.persisted) _applyCurrentBackground(); });

// ── Card glass style + background blur ──
function applyCardStyle(opacity, blur, bgBlur) {
  document.documentElement.style.setProperty('--card-bg-alpha', opacity ?? 0.38);
  document.documentElement.style.setProperty('--card-blur-px', (blur ?? 6) + 'px');
  document.documentElement.style.setProperty('--bg-blur-px', (bgBlur ?? 0) + 'px');
}

// ── Profile page ──
function showProfilePage() {
  document.getElementById('main-view').style.display   = 'none';
  document.getElementById('admin-page').style.display  = 'none';
  document.getElementById('profile-page').style.display = 'block';
  // Populate fields
  document.getElementById('profpage-first').value = currentProfile?.first_name || '';
  document.getElementById('profpage-last').value  = currentProfile?.last_name  || '';
  document.getElementById('profpage-apikey').value = currentProfile?.anthropic_api_key || '';
  document.getElementById('profpage-name-status').textContent   = '';
  document.getElementById('profpage-apikey-status').textContent = '';
  document.getElementById('profpage-reset-status').textContent  = '';
  renderAppearanceSection();
}

async function renderAppearanceSection() {
  const container = document.getElementById('profpage-appearance-content');
  if (!container) return;

  const [{ data: bgList }, { data: myPrefs }] = await Promise.all([
    sb.from('dashboard_backgrounds').select('id, mode, name, url').eq('user_id', currentUser.id).order('created_at'),
    sb.from('user_preferences').select('bg_image_light_url, bg_image_dark_url, card_opacity, card_blur, bg_blur').eq('user_id', currentUser.id).maybeSingle(),
  ]);

  const lightBgs       = (bgList || []).filter(b => b.mode === 'light');
  const darkBgs        = (bgList || []).filter(b => b.mode === 'dark');
  const activeLightUrl = myPrefs?.bg_image_light_url || null;
  const activeDarkUrl  = myPrefs?.bg_image_dark_url  || null;

  function bgRow(mode, bgs, activeUrl) {
    const label       = mode === 'light' ? 'Light Mode' : 'Dark Mode';
    const activeEntry = bgs.find(b => b.url?.split('?')[0] === activeUrl?.split('?')[0]);
    const divider     = mode === 'dark' ? 'border-top:1px solid var(--border);padding-top:14px;margin-top:6px;' : '';
    return `
      <div style="${divider}">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${label}</div>
        <div style="display:flex;gap:14px;align-items:flex-start;">
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start;">
            <div style="display:flex;gap:8px;align-items:center;">
              <select id="bg-select-${mode}" class="form-input" style="margin:0;font-size:13px;padding:5px 10px;width:auto;height:auto;"
                onchange="activateBackground('${mode}', this)">
                <option value="">No background</option>
                ${bgs.map(b => `<option value="${b.id}" data-url="${escHtml(b.url)}" ${activeEntry?.id === b.id ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('')}
              </select>
              ${activeEntry ? `<button class="btn-sm" style="color:var(--red)" onclick="deleteBackground('${mode}','${activeEntry.id}')">Remove</button>` : ''}
            </div>
            <label class="btn-sm" style="cursor:pointer;">
              Upload new…
              <input type="file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="uploadBackground(this,'${mode}')">
            </label>
            <span id="bg-status-${mode}" style="font-size:12px;"></span>
          </div>
          ${activeEntry ? `<img src="${escHtml(activeUrl)}" style="width:100px;height:60px;object-fit:cover;border-radius:var(--r-md);border:1px solid var(--border-md);flex-shrink:0;">` : ''}
        </div>
      </div>`;
  }

  const opacity    = myPrefs?.card_opacity ?? 0.38;
  const blur       = myPrefs?.card_blur    ?? 6;
  const bgBlur     = myPrefs?.bg_blur      ?? 0;
  const opacityPct = Math.round(opacity * 100);

  const cardStyleHtml = `
    <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:6px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Card Style</div>
      <div style="display:grid;grid-template-columns:130px 1fr 44px;gap:10px 12px;align-items:center;">
        <label style="font-size:13px;color:var(--text-2);">Card Opacity</label>
        <input type="range" id="card-opacity-slider" min="0" max="100" value="${opacityPct}"
          style="accent-color:var(--accent)"
          oninput="previewCardStyle()" onchange="saveCardStyle()">
        <span id="card-opacity-label" style="font-size:12px;color:var(--text-3);text-align:right;">${opacityPct}%</span>

        <label style="font-size:13px;color:var(--text-2);">Card Blur</label>
        <input type="range" id="card-blur-slider" min="0" max="20" value="${blur}"
          style="accent-color:var(--accent)"
          oninput="previewCardStyle()" onchange="saveCardStyle()">
        <span id="card-blur-label" style="font-size:12px;color:var(--text-3);text-align:right;">${blur}px</span>

        <label style="font-size:13px;color:var(--text-2);">Background Blur</label>
        <input type="range" id="bg-blur-slider" min="0" max="20" value="${bgBlur}"
          style="accent-color:var(--accent)"
          oninput="previewCardStyle()" onchange="saveCardStyle()">
        <span id="bg-blur-label" style="font-size:12px;color:var(--text-3);text-align:right;">${bgBlur}px</span>
      </div>
      <span id="card-style-status" style="font-size:12px;display:block;margin-top:8px;min-height:16px;"></span>
    </div>`;

  container.innerHTML = bgRow('light', lightBgs, activeLightUrl) + bgRow('dark', darkBgs, activeDarkUrl) + cardStyleHtml;
}

function previewCardStyle() {
  const opacity = document.getElementById('card-opacity-slider').value / 100;
  const blur    = document.getElementById('card-blur-slider').value;
  const bgBlur  = document.getElementById('bg-blur-slider').value;
  document.getElementById('card-opacity-label').textContent = Math.round(opacity * 100) + '%';
  document.getElementById('card-blur-label').textContent    = blur + 'px';
  document.getElementById('bg-blur-label').textContent      = bgBlur + 'px';
  applyCardStyle(opacity, blur, bgBlur);
}

async function saveCardStyle() {
  const opacity = document.getElementById('card-opacity-slider').value / 100;
  const blur    = parseInt(document.getElementById('card-blur-slider').value, 10);
  const bgBlur  = parseInt(document.getElementById('bg-blur-slider').value, 10);
  const status  = document.getElementById('card-style-status');
  applyCardStyle(opacity, blur, bgBlur);
  await sb.from('user_preferences').upsert(
    { user_id: currentUser.id, card_opacity: opacity, card_blur: blur, bg_blur: bgBlur, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  status.textContent = '✓ Saved';
  status.style.color = 'var(--green)';
  setTimeout(() => { status.textContent = ''; }, 2000);
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function uploadBackground(input, mode) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById(`bg-status-${mode}`);
  statusEl.textContent = 'Uploading…';
  statusEl.style.color = 'var(--text-3)';

  const ext         = file.name.split('.').pop().toLowerCase() || 'jpg';
  const name        = file.name.replace(/\.[^.]+$/, '') || 'Background';
  const uid         = crypto.randomUUID();
  const storagePath = `${currentUser.id}/${mode}/${uid}.${ext}`;

  const { error: upErr } = await sb.storage.from('backgrounds').upload(storagePath, file, { upsert: false });
  if (upErr) {
    statusEl.textContent = '⚠ ' + upErr.message;
    statusEl.style.color = 'var(--red)';
    return;
  }

  const { data: { publicUrl } } = sb.storage.from('backgrounds').getPublicUrl(storagePath);
  const url = `${publicUrl}?t=${Date.now()}`;

  const { error: dbErr } = await sb.from('dashboard_backgrounds').insert({
    user_id: currentUser.id, mode, name, storage_path: storagePath, url,
  });
  if (dbErr) {
    statusEl.textContent = '⚠ Uploaded but failed to record: ' + dbErr.message;
    statusEl.style.color = 'var(--red)';
    return;
  }

  const col = mode === 'light' ? 'bg_image_light_url' : 'bg_image_dark_url';
  await sb.from('user_preferences').upsert(
    { user_id: currentUser.id, [col]: url, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (mode === 'light') setBackgrounds(url, _bgDark);
  else                  setBackgrounds(_bgLight, url);

  statusEl.textContent = '✓ Uploaded';
  statusEl.style.color = 'var(--green)';
  setTimeout(() => renderAppearanceSection(), 900);
}

async function activateBackground(mode, selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  const url = opt.dataset.url || null;
  const col = mode === 'light' ? 'bg_image_light_url' : 'bg_image_dark_url';
  await sb.from('user_preferences').upsert(
    { user_id: currentUser.id, [col]: url || null, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (mode === 'light') setBackgrounds(url, _bgDark);
  else                  setBackgrounds(_bgLight, url);
  renderAppearanceSection();
}

async function deleteBackground(mode, id) {
  const { data: bg } = await sb.from('dashboard_backgrounds')
    .select('url, storage_path').eq('id', id).maybeSingle();

  await sb.from('dashboard_backgrounds').delete().eq('id', id).eq('user_id', currentUser.id);

  if (bg?.storage_path) {
    await sb.storage.from('backgrounds').remove([bg.storage_path]);
  }

  const col       = mode === 'light' ? 'bg_image_light_url' : 'bg_image_dark_url';
  const activeUrl = mode === 'light' ? _bgLight : _bgDark;
  if (bg?.url?.split('?')[0] === activeUrl?.split('?')[0]) {
    await sb.from('user_preferences').upsert(
      { user_id: currentUser.id, [col]: null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (mode === 'light') setBackgrounds(null, _bgDark);
    else                  setBackgrounds(_bgLight, null);
  }

  renderAppearanceSection();
}

async function saveProfileName() {
  const first  = document.getElementById('profpage-first').value.trim();
  const last   = document.getElementById('profpage-last').value.trim();
  const status = document.getElementById('profpage-name-status');
  const btn    = document.getElementById('profpage-name-btn');
  if (!first || !last) { status.textContent = 'Both fields are required.'; status.style.color = 'var(--red)'; return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  const { error } = await sb.from('profiles').update({
    first_name: first, last_name: last, updated_at: new Date().toISOString()
  }).eq('user_id', currentUser.id);
  if (error) {
    status.textContent = error.message; status.style.color = 'var(--red)';
  } else {
    currentProfile = { ...currentProfile, first_name: first, last_name: last };
    document.getElementById('user-display-name').textContent = `${first} ${last}`;
    document.getElementById('page-title').textContent = `Hey, ${first}.`;
    status.textContent = '✓ Saved'; status.style.color = 'var(--green)';
    setTimeout(() => { status.textContent = ''; }, 2500);
  }
  btn.disabled = false; btn.textContent = 'Save Name';
}

async function saveAnthropicKey() {
  const keyField = document.getElementById('profpage-apikey');
  const status   = document.getElementById('profpage-apikey-status');
  const btn      = document.getElementById('profpage-apikey-btn');
  const key      = (keyField?.value || '').trim();

  if (!key) {
    // Clearing the key — just save null without validating
    btn.disabled = true; btn.textContent = 'Saving…';
    await sb.from('profiles').update({ anthropic_api_key: null, updated_at: new Date().toISOString() }).eq('user_id', currentUser.id);
    currentProfile = { ...currentProfile, anthropic_api_key: null };
    status.textContent = 'Key cleared.'; status.style.color = 'var(--text-3)';
    btn.disabled = false; btn.textContent = 'Save Key';
    setTimeout(() => { status.textContent = ''; }, 2500);
    return;
  }

  if (!key.startsWith('sk-ant-')) {
    status.textContent = '✗ Keys must start with sk-ant-'; status.style.color = 'var(--red)';
    return;
  }

  // Validate against Anthropic before saving — use GET /v1/models (free, no model needed)
  btn.disabled = true; btn.textContent = 'Validating…';
  status.textContent = '';

  let valid = false;
  let errMsg = '';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key':                                 key,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (resp.status === 401) {
      errMsg = '✗ Invalid API key — Anthropic rejected it';
    } else if (resp.status === 403) {
      errMsg = '✗ API key lacks permissions';
    } else {
      valid = true;
    }
  } catch (e) {
    errMsg = '✗ Could not reach Anthropic — check your connection';
  }

  if (!valid) {
    status.textContent = errMsg; status.style.color = 'var(--red)';
    btn.disabled = false; btn.textContent = 'Save Key';
    return;
  }

  // Key is valid — save to Supabase
  btn.textContent = 'Saving…';
  const { error } = await sb.from('profiles').update({
    anthropic_api_key: key, updated_at: new Date().toISOString()
  }).eq('user_id', currentUser.id);

  if (error) {
    status.textContent = error.message; status.style.color = 'var(--red)';
  } else {
    currentProfile = { ...currentProfile, anthropic_api_key: key };
    status.textContent = '✓ Valid key saved'; status.style.color = 'var(--green)';
    setTimeout(() => { status.textContent = ''; }, 3000);
  }
  btn.disabled = false; btn.textContent = 'Save Key';
}

async function sendPasswordReset() {
  const btn    = document.getElementById('profpage-reset-btn');
  const status = document.getElementById('profpage-reset-status');
  btn.disabled = true; btn.textContent = 'Sending…';
  const { error } = await sb.auth.resetPasswordForEmail(currentUser.email, {
    redirectTo: window.location.origin + '/',
  });
  if (error) {
    status.textContent = error.message; status.style.color = 'var(--red)';
  } else {
    status.textContent = `Reset email sent to ${currentUser.email}`; status.style.color = 'var(--green)';
    setTimeout(() => { status.textContent = ''; }, 6000);
  }
  btn.disabled = false; btn.textContent = 'Send Password Reset Email';
}

// ── Scratchpad quick-capture modal ──
function openScratchpadCapture() {
  if (document.getElementById('scratch-capture-overlay')) return; // already open

  const overlay = document.createElement('div');
  overlay.id = 'scratch-capture-overlay';
  overlay.className = 'sc-overlay';
  overlay.innerHTML = `
    <div class="sc-modal" role="dialog" aria-modal="true" aria-label="New note">
      <div class="sc-header">
        <span class="sc-title">New Note</span>
        <button class="sc-close" onclick="closeScratchpadCapture()" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <textarea id="sc-textarea" class="sc-textarea" placeholder="What's on your mind?" rows="5"></textarea>
      <div class="sc-footer">
        <span id="sc-status" class="sc-status"></span>
        <div class="sc-actions">
          <button class="btn" onclick="closeScratchpadCapture()">Cancel</button>
          <button class="btn btn-primary" id="sc-save-btn" onclick="saveScratchpadCapture()">Save Note</button>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeScratchpadCapture(); });
  document.body.appendChild(overlay);

  const ta = document.getElementById('sc-textarea');
  ta.focus();
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeScratchpadCapture(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { saveScratchpadCapture(); }
  });
}

function closeScratchpadCapture() {
  const overlay = document.getElementById('scratch-capture-overlay');
  if (overlay) overlay.remove();
}

async function saveScratchpadCapture() {
  const ta  = document.getElementById('sc-textarea');
  const btn = document.getElementById('sc-save-btn');
  const status = document.getElementById('sc-status');
  if (!ta) return;

  const text = ta.value.trim();
  if (!text) { ta.focus(); return; }
  if (!currentUser) return;

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const { error } = await sb.from('scratch_notes').insert({
    user_id:  currentUser.id,
    text:     text,
    pinned:   false,
    reviewed: false,
  });

  if (error) {
    status.textContent = 'Failed to save. Try again.';
    status.style.color = 'var(--red)';
    btn.disabled = false;
    btn.textContent = 'Save Note';
    return;
  }

  // Increment the unreviewed count on the dashboard card immediately
  const scratchRow = document.querySelector('[data-module-id="scratchpad"]');
  if (scratchRow) {
    const valEl = scratchRow.querySelector('.launchpad-row-stat-value, .module-stat-value');
    if (valEl) valEl.textContent = String((parseInt(valEl.textContent, 10) || 0) + 1);
  }

  // Brief success flash, then close
  status.textContent = '✓ Note saved';
  status.style.color = 'var(--green)';
  setTimeout(closeScratchpadCapture, 600);
}

init();
