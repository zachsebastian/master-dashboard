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
  hideBanner();

  // Fetch profile
  const { data: profile } = await sb.from('profiles')
    .select('first_name, last_name, email')
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

// ── Profile panel ──
function toggleProfilePanel() {
  const panel = document.getElementById('profile-panel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    document.getElementById('pp-first').value = currentProfile?.first_name || '';
    document.getElementById('pp-last').value  = currentProfile?.last_name  || '';
    document.getElementById('pp-name-status').textContent  = '';
    document.getElementById('pp-reset-status').textContent = '';
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        const panel = document.getElementById('profile-panel');
        const btn   = document.getElementById('profile-btn');
        if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
          panel.style.display = 'none';
          document.removeEventListener('click', _close);
        }
      });
    }, 0);
  }
}

async function saveProfileName() {
  const first  = document.getElementById('pp-first').value.trim();
  const last   = document.getElementById('pp-last').value.trim();
  const status = document.getElementById('pp-name-status');
  const btn    = document.getElementById('pp-save-btn');
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
  btn.disabled = false; btn.textContent = 'Save Changes';
}

async function sendPasswordReset() {
  const btn    = document.getElementById('pp-reset-btn');
  const status = document.getElementById('pp-reset-status');
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

init();
