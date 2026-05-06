function showAdminPage() {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('admin-page').style.display = 'block';
  renderAdminPage();
}

function showMainPage() {
  document.getElementById('admin-page').style.display = 'none';
  document.getElementById('main-view').style.display = 'block';
}

async function renderAdminPage() {
  const content = document.getElementById('admin-page-content');
  content.innerHTML = '<div style="color:var(--text-3);font-size:13px">Loading…</div>';

  const { data: profiles } = await sb.from('profiles')
    .select('user_id, email, first_name, last_name, is_admin')
    .order('email');
  const { data: allMods } = await sb.from('user_modules').select('user_id, module');

  const modsByUser = {};
  (allMods || []).forEach(r => {
    if (!modsByUser[r.user_id]) modsByUser[r.user_id] = new Set();
    modsByUser[r.user_id].add(r.module);
  });

  const adminProfiles = (profiles || []).filter(p => p.is_admin);
  const userProfiles  = (profiles || []).filter(p => !p.is_admin);

  function nameCell(p) {
    const full = (p.first_name && p.last_name) ? `${p.first_name} ${p.last_name}` : '';
    return full
      ? `<div style="font-weight:600">${full}</div><div style="font-size:12px;color:var(--text-3)">${p.email}</div>`
      : p.email;
  }

  const adminRows = adminProfiles.map(p => `
    <div class="admin-row">
      <div class="admin-email">${nameCell(p)}</div>
      <div></div>
      <div><span class="admin-tag">${p.user_id === currentUser.id ? 'You' : 'Admin'}</span></div>
    </div>`).join('') ||
    '<div style="padding:14px 18px;font-size:13px;color:var(--text-3)">No admin accounts found.</div>';

  const userRows = userProfiles.map(p => {
    const badges = ALL_MODULES.map(m => {
      const on = modsByUser[p.user_id]?.has(m.id);
      return `<span class="module-badge ${on ? 'on' : ''}" onclick="toggleModule('${p.user_id}','${m.id}',this)">${m.name}</span>`;
    }).join('');
    return `
    <div class="admin-row">
      <div class="admin-email">${nameCell(p)}</div>
      <div class="module-toggles">${badges}</div>
      <div><button class="btn-sm" onclick="impersonate('${p.user_id}','${p.email}')">Log in as</button></div>
    </div>`;
  }).join('') ||
    '<div style="padding:14px 18px;font-size:13px;color:var(--text-3)">No users found.</div>';

  content.innerHTML = `
    <div class="section-title">Administrators</div>
    <div class="admin-table" style="margin-bottom:48px">
      <div class="admin-row admin-row-header"><div>Account</div><div></div><div></div></div>
      ${adminRows}
    </div>
    <div class="section-title">Users</div>
    <div class="admin-table">
      <div class="admin-row admin-row-header"><div>User</div><div>Modules</div><div></div></div>
      ${userRows}
    </div>`;
}

async function toggleModule(userId, moduleId, el) {
  if (el.classList.contains('on')) {
    await sb.from('user_modules').delete().eq('user_id', userId).eq('module', moduleId);
    el.classList.remove('on');
  } else {
    await sb.from('user_modules').insert({ user_id: userId, module: moduleId });
    el.classList.add('on');
  }
}

async function impersonate(userId, email) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  sessionStorage.setItem('adminSession', JSON.stringify({
    access_token:  session.access_token,
    refresh_token: session.refresh_token,
  }));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/impersonate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ userId }),
  });
  const data = await res.json();
  if (data.error) {
    alert('Impersonation failed: ' + data.error);
    sessionStorage.removeItem('adminSession');
    return;
  }

  _impersonating = true;
  const { data: otpData, error } = await sb.auth.verifyOtp({ token_hash: data.token, type: 'magiclink' });
  _impersonating = false;

  if (error || !otpData?.user) {
    alert('Sign-in failed: ' + (error?.message || 'No user returned from verifyOtp'));
    sessionStorage.removeItem('adminSession');
    return;
  }

  await onSignedIn(otpData.user);
  showMainPage();
  showBanner(otpData.user.email);
}

async function returnToAdmin() {
  const stored = sessionStorage.getItem('adminSession');
  if (!stored) return;
  const { access_token, refresh_token } = JSON.parse(stored);
  sessionStorage.removeItem('adminSession');

  _impersonating = true;
  const { data, error } = await sb.auth.setSession({ access_token, refresh_token });

  if (error || !data?.user) {
    _impersonating = false;
    alert('Failed to restore admin session: ' + (error?.message || 'Unknown error'));
    window.location.reload();
    return;
  }

  hideBanner();
  await onSignedIn(data.user);
  _impersonating = false;
}

function showBanner(email) {
  document.getElementById('impersonation-email').textContent = email;
  document.getElementById('impersonation-banner').classList.add('visible');
}

function hideBanner() {
  document.getElementById('impersonation-banner').classList.remove('visible');
  document.getElementById('impersonation-email').textContent = '';
}
