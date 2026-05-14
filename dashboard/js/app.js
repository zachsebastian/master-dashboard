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

  // Theme
  await loadAndApplyTheme(user.id);

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

  await Promise.all(ALL_MODULES.filter(m => allowed.has(m.id)).map(async m => {
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
  }));

  renderModules(rows, statsByModule);
  renderHeroSummary(firstName, summaryFragments);
  allActivity.sort((a, b) => b._ts - a._ts);
  renderActivityTicker(allActivity);
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
