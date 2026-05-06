// Impersonation banner for module pages (projects, metrics).
// On the main dashboard the banner is managed by dashboard/js/admin.js instead.

async function initImpersonationBanner() {
  if (!sessionStorage.getItem('adminSession')) return;
  let displayName = _currentUser.email;
  const { data: profile } = await sb.from('profiles')
    .select('first_name, last_name')
    .eq('user_id', _currentUser.id)
    .maybeSingle();
  if (profile?.first_name) {
    displayName = `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`;
  }
  document.getElementById('impersonation-email').textContent = displayName;
  document.getElementById('impersonation-banner').classList.add('visible');
  document.body.classList.add('has-banner');
}

async function returnToAdmin() {
  const stored = sessionStorage.getItem('adminSession');
  if (!stored) return;
  const { access_token, refresh_token } = JSON.parse(stored);
  sessionStorage.removeItem('adminSession');
  await sb.auth.setSession({ access_token, refresh_token });
  window.location.href = '/';
}
