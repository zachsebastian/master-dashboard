// ── State ──
let state = {
  settings: { gridCols: 4, zoom: 1.0 },
  cards: [],
  // cards[]: { id, name, mode, colSpan, rowSpan, sortOrder, groups[] }
  // groups[]: { id, cardId, name, sortOrder, items[] }
  // items[]:  { id, groupId, name, url, iconUrl, showLabel, sortOrder }
};

let _currentUser = null;
let editMode     = false;
let searchQuery  = '';
let activeGroups = {}; // cardId -> active group index
let activePages  = {}; // groupId -> page index (0-based)
let iconLibrary  = []; // { id, name, icon_data }
let _saveTimer   = null;
let _settingsTimer = null;

// ── Load ──
async function loadState() {
  const uid = _currentUser.id;

  const [sRes, cRes, gRes, iRes, libRes] = await Promise.all([
    sb.from('link_settings').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('link_cards').select('*').eq('user_id', uid).order('sort_order'),
    sb.from('link_groups').select('*').eq('user_id', uid).order('sort_order'),
    sb.from('link_items').select('*').eq('user_id', uid).order('sort_order'),
    sb.from('link_icon_library').select('id, name, icon_data').eq('user_id', uid).order('created_at', { ascending: false }),
  ]);
  iconLibrary = libRes.data || [];

  if (sRes.data) {
    state.settings.gridCols = sRes.data.grid_cols;
    state.settings.zoom     = parseFloat(sRes.data.zoom);
  }

  const rawGroups = gRes.data || [];
  const rawItems  = iRes.data || [];

  state.cards = (cRes.data || []).map(c => ({
    id:        c.id,
    name:      c.name,
    mode:      c.mode,
    colSpan:   c.col_span,
    rowSpan:   c.row_span,
    sortOrder: c.sort_order,
    groups: rawGroups
      .filter(g => g.card_id === c.id)
      .map(g => ({
        id:        g.id,
        cardId:    c.id,
        name:      g.name,
        sortOrder: g.sort_order,
        items: rawItems
          .filter(i => i.group_id === g.id)
          .map(i => ({
            id:        i.id,
            groupId:   g.id,
            name:      i.name,
            url:       i.url,
            iconUrl:   i.icon_url,
            showLabel: i.show_label,
            sortOrder: i.sort_order,
          })),
      })),
  }));

  state.cards.forEach(c => {
    if (!(c.id in activeGroups)) activeGroups[c.id] = 0;
  });
}

// ── Settings ──
async function saveSettings() {
  await sb.from('link_settings').upsert({
    user_id:    _currentUser.id,
    grid_cols:  state.settings.gridCols,
    zoom:       state.settings.zoom,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// ── Cards ──
async function addCard() {
  const uid = _currentUser.id;
  const { data: card, error } = await sb.from('link_cards').insert({
    user_id:    uid,
    name:       'New Card',
    mode:       'list',
    col_span:   1,
    row_span:   1,
    sort_order: state.cards.length,
  }).select().single();
  if (error || !card) return;

  const { data: group } = await sb.from('link_groups').insert({
    user_id:    uid,
    card_id:    card.id,
    name:       'Links',
    sort_order: 0,
  }).select().single();

  const newCard = {
    id: card.id, name: card.name, mode: card.mode,
    colSpan: card.col_span, rowSpan: card.row_span, sortOrder: card.sort_order,
    groups: group
      ? [{ id: group.id, cardId: card.id, name: group.name, sortOrder: 0, items: [] }]
      : [],
  };
  state.cards.push(newCard);
  activeGroups[card.id] = 0;
  render();
  showSaved();
}

async function updateCard(cardId, fields) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  Object.assign(card, fields);
  const db = {};
  if (fields.name      !== undefined) db.name       = fields.name;
  if (fields.mode      !== undefined) db.mode       = fields.mode;
  if (fields.colSpan   !== undefined) db.col_span   = fields.colSpan;
  if (fields.rowSpan   !== undefined) db.row_span   = fields.rowSpan;
  if (fields.sortOrder !== undefined) db.sort_order = fields.sortOrder;
  await sb.from('link_cards').update(db).eq('id', cardId);
  showSaved();
}

async function deleteCard(cardId) {
  state.cards = state.cards.filter(c => c.id !== cardId);
  delete activeGroups[cardId];
  await sb.from('link_cards').delete().eq('id', cardId);
  render();
  showSaved();
}

async function reorderCards(orderedIds) {
  orderedIds.forEach((id, i) => {
    const c = state.cards.find(c => c.id === id);
    if (c) c.sortOrder = i;
  });
  state.cards.sort((a, b) => a.sortOrder - b.sortOrder);
  await Promise.all(orderedIds.map((id, i) =>
    sb.from('link_cards').update({ sort_order: i }).eq('id', id)
  ));
  render();
}

// ── Groups ──
async function addGroup(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  const { data: group, error } = await sb.from('link_groups').insert({
    user_id:    _currentUser.id,
    card_id:    cardId,
    name:       'New Tab',
    sort_order: card.groups.length,
  }).select().single();
  if (error || !group) return;
  card.groups.push({ id: group.id, cardId, name: group.name, sortOrder: group.sort_order, items: [] });
  activeGroups[cardId] = card.groups.length - 1;
  render();
  showSaved();
}

async function updateGroup(groupId, fields) {
  let group = findGroup(groupId);
  if (!group) return;
  Object.assign(group, fields);
  const db = {};
  if (fields.name      !== undefined) db.name       = fields.name;
  if (fields.sortOrder !== undefined) db.sort_order = fields.sortOrder;
  if (fields.cardId    !== undefined) db.card_id    = fields.cardId;
  await sb.from('link_groups').update(db).eq('id', groupId);
  showSaved();
}

async function deleteGroup(groupId) {
  for (const card of state.cards) {
    const idx = card.groups.findIndex(g => g.id === groupId);
    if (idx === -1) continue;
    card.groups.splice(idx, 1);
    activeGroups[card.id] = Math.max(0, Math.min(activeGroups[card.id] || 0, card.groups.length - 1));
    await sb.from('link_groups').delete().eq('id', groupId);
    render();
    showSaved();
    return;
  }
}

async function moveGroup(groupId, targetCardId) {
  let group = null, sourceCard = null;
  for (const c of state.cards) {
    const g = c.groups.find(g => g.id === groupId);
    if (g) { group = g; sourceCard = c; break; }
  }
  if (!group || sourceCard.id === targetCardId) return;
  const targetCard = state.cards.find(c => c.id === targetCardId);
  if (!targetCard) return;

  sourceCard.groups = sourceCard.groups.filter(g => g.id !== groupId);
  activeGroups[sourceCard.id] = Math.max(0, Math.min(activeGroups[sourceCard.id] || 0, sourceCard.groups.length - 1));

  group.cardId    = targetCardId;
  group.sortOrder = targetCard.groups.length;
  targetCard.groups.push(group);
  activeGroups[targetCardId] = targetCard.groups.length - 1;

  await sb.from('link_groups').update({ card_id: targetCardId, sort_order: group.sortOrder }).eq('id', groupId);
  render();
  showSaved();
}

// ── Items ──
async function addItem(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  const { data: item, error } = await sb.from('link_items').insert({
    user_id:    _currentUser.id,
    group_id:   groupId,
    name:       'New Link',
    url:        'https://',
    icon_url:   null,
    show_label: true,
    sort_order: group.items.length,
  }).select().single();
  if (error || !item) return;
  group.items.push({
    id: item.id, groupId, name: item.name, url: item.url,
    iconUrl: item.icon_url, showLabel: item.show_label, sortOrder: item.sort_order,
  });
  render();
  showSaved();
  setTimeout(() => openItemEdit(item.id), 40);
}

async function updateItem(itemId, fields) {
  const item = findItem(itemId);
  if (!item) return;
  Object.assign(item, fields);
  const db = {};
  if (fields.name      !== undefined) db.name       = fields.name;
  if (fields.url       !== undefined) db.url        = fields.url;
  if (fields.iconUrl   !== undefined) db.icon_url   = fields.iconUrl;
  if (fields.showLabel !== undefined) db.show_label = fields.showLabel;
  if (fields.sortOrder !== undefined) db.sort_order = fields.sortOrder;
  await sb.from('link_items').update(db).eq('id', itemId);
  showSaved();
}

async function deleteItem(itemId) {
  for (const card of state.cards) {
    for (const group of card.groups) {
      const idx = group.items.findIndex(i => i.id === itemId);
      if (idx === -1) continue;
      group.items.splice(idx, 1);
      await sb.from('link_items').delete().eq('id', itemId);
      render();
      showSaved();
      return;
    }
  }
}

// ── Helpers ──
function findGroup(groupId) {
  for (const c of state.cards) {
    const g = c.groups.find(g => g.id === groupId);
    if (g) return g;
  }
  return null;
}

function findItem(itemId) {
  for (const c of state.cards) {
    for (const g of c.groups) {
      const i = g.items.find(i => i.id === itemId);
      if (i) return i;
    }
  }
  return null;
}

function findCardForGroup(groupId) {
  for (const c of state.cards) {
    if (c.groups.find(g => g.id === groupId)) return c;
  }
  return null;
}

function findCardForItem(itemId) {
  for (const c of state.cards) {
    for (const g of c.groups) {
      if (g.items.find(i => i.id === itemId)) return c;
    }
  }
  return null;
}

function faviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    if (!domain) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  } catch { return null; }
}

function safeUrl(url) {
  if (!url) return '#';
  const u = (url || '').trim().toLowerCase();
  if (u.startsWith('javascript:') || u.startsWith('vbscript:')) return '#';
  return url;
}

// ── Click tracking ──
async function trackLinkClick(itemId) {
  const { error } = await sb.rpc('increment_link_click', { item_id: itemId });
  if (error) console.error('trackLinkClick failed:', error);
}

// ── Save indicator ──
function showSaved() {
  const wrap = document.getElementById('save-wrap');
  if (!wrap) return;
  wrap.classList.add('visible');
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => wrap.classList.remove('visible'), 2000);
}
