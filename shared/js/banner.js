// Impersonation banner for module pages (projects, metrics).
// On the main dashboard the banner is managed by dashboard/js/admin.js instead.

function initImpersonationBanner() {
  if (!sessionStorage.getItem('adminSession')) return;
  document.getElementById('impersonation-email').textContent = _currentUser.email;
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
