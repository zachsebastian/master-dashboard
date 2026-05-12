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
  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name}`
    : user.email;
  document.getElementById('user-display-name').textContent = displayName;
  document.getElementById('page-title').textContent =
    profile?.first_name ? `Hey, ${profile.first_name}.` : 'Your tools';
  document.getElementById('page-subtitle').textContent = 'Select a module to open it.';
  document.getElementById('admin-btn').style.display = isAdmin ? '' : 'none';

  // Theme
  await loadAndApplyTheme(user.id);

  // Modules
  const { data: modRows } = await sb.from('user_modules')
    .select('module, sort_order').eq('user_id', user.id).order('sort_order');
  renderModules(modRows || []);

  document.getElementById('app').style.display = 'block';
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
