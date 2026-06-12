// Shared auth utilities used by the main dashboard.
// Module pages (projects, metrics) have simpler boot() functions that call
// initImpersonationBanner() from banner.js directly.

// Check if the signed-in user has first + last name in their profile.
// Returns true if complete, false if the profile screen was shown.
async function checkProfile(user) {
  const { data: profile, error } = await sb.from('profiles')
    .select('first_name, last_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Profile fetch failed:', error.message);
    return true;
  }

  if (profile?.first_name?.trim() && profile?.last_name?.trim()) return true;

  // Show blocking profile-completion screen
  window._pendingProfileUser = user;
  document.getElementById('loading-screen').style.display  = 'none';
  document.getElementById('auth-screen').style.display     = 'none';
  document.getElementById('app').style.display             = 'none';
  document.getElementById('profile-screen').style.display  = 'flex';
  setTimeout(() => document.getElementById('profile-first-name').focus(), 50);
  return false;
}

async function saveProfile() {
  const firstName = document.getElementById('profile-first-name').value.trim();
  const lastName  = document.getElementById('profile-last-name').value.trim();
  const errEl     = document.getElementById('profile-error');
  const btn       = document.getElementById('profile-save-btn');

  errEl.classList.remove('visible');
  if (!firstName || !lastName) {
    errEl.textContent = 'Both fields are required.';
    errEl.classList.add('visible');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const user = window._pendingProfileUser;
  const { error } = await sb.from('profiles').upsert({
    user_id:    user.id,
    email:      user.email,
    first_name: firstName,
    last_name:  lastName,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) {
    errEl.textContent = 'Could not save profile: ' + error.message;
    errEl.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'Save & Continue';
    return;
  }

  document.getElementById('profile-first-name').value = '';
  document.getElementById('profile-last-name').value  = '';
  btn.disabled = false;
  btn.textContent = 'Save & Continue';
  document.getElementById('profile-screen').style.display = 'none';
  window._pendingProfileUser = null;

  await onSignedIn(user);
}

async function signIn() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('signin-btn');
  const err = document.getElementById('auth-error');
  err.classList.remove('visible');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    err.textContent = error.message;
    err.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function signOut() {
  await sb.auth.signOut();
}
