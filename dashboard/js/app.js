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
    .select('module').eq('user_id', user.id);
  renderModules(new Set((modRows || []).map(r => r.module)));

  document.getElementById('app').style.display = 'block';
}

init();
