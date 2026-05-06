// Apply theme to document and persist to Supabase (if user is known)
async function applyTheme(theme, userId) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const dark = theme === 'dark';
  const track = document.getElementById('theme-track');
  const label = document.getElementById('theme-label');
  if (track) track.classList.toggle('on', dark);
  if (label) label.textContent = dark ? 'Dark' : 'Light';
  if (userId) {
    await sb.from('user_preferences')
      .upsert({ user_id: userId, theme, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }
}

async function loadAndApplyTheme(userId) {
  const { data: prefs } = await sb.from('user_preferences')
    .select('theme').eq('user_id', userId).maybeSingle();
  const theme = prefs?.theme || localStorage.getItem('theme') || 'light';
  await applyTheme(theme);
  if (!prefs) {
    await sb.from('user_preferences')
      .upsert({ user_id: userId, theme }, { onConflict: 'user_id' });
  }
  return theme;
}

async function toggleTheme(userId) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  await applyTheme(dark ? 'light' : 'dark', userId);
}
