// ── Module → Supabase table mapping ──
const MODULE_TABLE = {
  projects: 'dashboards',
  metrics:  'metrics',
};

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

  function nameCell(p, isYou) {
    const full = (p.first_name && p.last_name) ? `${p.first_name} ${p.last_name}` : '';
    const youTag = isYou ? ' <span class="admin-tag" style="margin-left:6px;">You</span>' : '';
    return full
      ? `<div style="font-weight:600;display:flex;align-items:center;">${full}${youTag}</div><div style="font-size:12px;color:var(--text-3)">${p.email}</div>`
      : `<div style="display:flex;align-items:center;">${p.email}${youTag}</div>`;
  }

  function buildBadges(userId) {
    return ALL_MODULES.map(m => {
      const on = modsByUser[userId]?.has(m.id);
      return `<span class="module-badge ${on ? 'on' : ''}" onclick="toggleModule('${userId}','${m.id}',this)">${m.name}</span>`;
    }).join('');
  }

  function userBlock(p, isAdmin) {
    const displayName = (p.first_name && p.last_name) ? `${p.first_name} ${p.last_name}` : p.email;
    const isYou = p.user_id === currentUser.id;
    const uid = p.user_id.replace(/-/g, '');
    return `
      <div class="admin-row">
        <div class="admin-email">${nameCell(p, isYou)}</div>
        <div class="admin-actions">
          <button class="btn-sm" onclick="togglePermissions('${uid}',this)">Permissions</button>
          <button class="btn-sm" onclick="openDataModal('${p.user_id}','${displayName.replace(/'/g,"\\'")}')">Data</button>
          ${!isAdmin ? `<button class="btn-sm" onclick="impersonate('${p.user_id}','${p.email}')">Log in as</button>` : ''}
        </div>
      </div>
      <div class="admin-permissions-panel" id="perms-${uid}">
        <span class="permissions-label">Module access</span>
        <div class="module-toggles">${buildBadges(p.user_id)}</div>
      </div>`;
  }

  const adminRows = adminProfiles.map(p => userBlock(p, true)).join('') ||
    '<div style="padding:14px 18px;font-size:13px;color:var(--text-3)">No admin accounts found.</div>';

  const userRows = userProfiles.map(p => userBlock(p, false)).join('') ||
    '<div style="padding:14px 18px;font-size:13px;color:var(--text-3)">No users found.</div>';

  content.innerHTML = `
    <div class="section-title">Administrators</div>
    <div class="admin-table" style="margin-bottom:48px">
      <div class="admin-row admin-row-header"><div>Account</div><div>Actions</div></div>
      ${adminRows}
    </div>
    <div class="section-title">Users</div>
    <div class="admin-table">
      <div class="admin-row admin-row-header"><div>User</div><div>Actions</div></div>
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

function togglePermissions(uid, btn) {
  const panel = document.getElementById('perms-' + uid);
  if (!panel) return;
  const open = panel.classList.toggle('open');
  btn.textContent = open ? 'Permissions ▴' : 'Permissions';
}

// ── Data modal ──
function openDataModal(userId, userName) {
  const existing = document.getElementById('data-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'data-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);border:1px solid var(--border-md);width:min(560px,94vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;animation:slide-up 0.15s ease;">
      <div style="padding:18px 22px 14px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0;">
        <div>
          <div style="font-size:15px;font-weight:700;letter-spacing:-0.3px;">Data Management</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px;">${userName}</div>
        </div>
        <button onclick="document.getElementById('data-modal-overlay').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-3);padding:0 2px;line-height:1;">×</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px 22px;">
        ${ALL_MODULES.map(m => `
          <div style="margin-bottom:24px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-3);margin-bottom:10px;">${m.name}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <button class="btn-sm" onclick="exportUserData('${userId}','${m.id}','${m.name}',this)">
                ↓ Export
              </button>
              <button class="btn-sm" onclick="triggerImport('${userId}','${m.id}','${m.name}',this)">
                ↑ Import
              </button>
              <span id="data-status-${m.id}" style="font-size:12px;color:var(--text-3);"></span>
            </div>
          </div>
        `).join('')}
        <div style="margin-top:4px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--text-3);line-height:1.6;">
          <strong style="color:var(--text-2)">Export</strong> downloads the user's current module data as a JSON file.<br>
          <strong style="color:var(--text-2)">Import</strong> overwrites their data with a previously exported JSON file.
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function exportUserData(userId, moduleId, moduleName, btn) {
  const table = MODULE_TABLE[moduleId];
  if (!table) return;

  const originalText = btn.textContent;
  btn.textContent = 'Exporting…';
  btn.disabled = true;

  const statusEl = document.getElementById(`data-status-${moduleId}`);

  try {
    const { data, error } = await sb.from(table)
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      if (statusEl) statusEl.textContent = 'No data found.';
      return;
    }

    const json = JSON.stringify(data.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${moduleId}-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    if (statusEl) {
      statusEl.textContent = '✓ Downloaded';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '⚠ Export failed';
    console.error('Export error:', e);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function triggerImport(userId, moduleId, moduleName, btn) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById(`data-status-${moduleId}`);
    const reader = new FileReader();

    reader.onload = async ev => {
      let parsed;
      try {
        parsed = JSON.parse(ev.target.result);
      } catch {
        if (statusEl) statusEl.textContent = '⚠ Invalid JSON file';
        return;
      }

      const confirmed = confirm(
        `Import data for ${moduleName}?\n\nThis will overwrite ${moduleName} data for this user. This cannot be undone.`
      );
      if (!confirmed) return;

      const originalText = btn.textContent;
      btn.textContent = 'Importing…';
      btn.disabled = true;
      if (statusEl) statusEl.textContent = '';

      try {
        const table = MODULE_TABLE[moduleId];
        const { error } = await sb.from(table).upsert(
          { user_id: userId, data: parsed, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
        if (error) throw error;

        if (statusEl) {
          statusEl.textContent = '✓ Imported successfully';
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = '⚠ Import failed';
        console.error('Import error:', err);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    };

    reader.readAsText(file);
  };
  input.click();
}

// ── Impersonation ──
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
  const displayName = currentProfile?.first_name
    ? `${currentProfile.first_name}${currentProfile.last_name ? ' ' + currentProfile.last_name : ''}`
    : otpData.user.email;
  showBanner(displayName);
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
  document.body.classList.add('has-banner');
}

function hideBanner() {
  document.getElementById('impersonation-banner').classList.remove('visible');
  document.getElementById('impersonation-email').textContent = '';
  document.body.classList.remove('has-banner');
}
