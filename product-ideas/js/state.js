// ── State ──
let _products    = [];
let _ideas       = [];
let _currentUser = null;
let _view        = 'list'; // 'list' | 'manage'

function setCurrentUser(user) { _currentUser = user; }
function getView()             { return _view; }
function setView(v)            { _view = v; }
function getProducts()         { return _products; }
function getIdeas()            { return _ideas; }

// ── Load ──
async function loadProducts() {
  const { data, error } = await sb.from('pi_products')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('sort_order')
    .order('created_at');
  if (error) { console.error('loadProducts:', error); return; }
  _products = data || [];
}

async function loadIdeas() {
  const { data, error } = await sb.from('pi_ideas')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('sort_order')
    .order('created_at');
  if (error) { console.error('loadIdeas:', error); return; }
  _ideas = data || [];
}

// ── Products ──
async function addProduct(name) {
  const maxOrder = _products.reduce((m, p) => Math.max(m, p.sort_order || 0), 0);
  const { data, error } = await sb.from('pi_products').insert({
    user_id:    _currentUser.id,
    name:       name.trim(),
    sort_order: maxOrder + 1,
  }).select().single();
  if (error) throw error;
  _products.push(data);
  return data;
}

async function updateProduct(id, changes) {
  const { error } = await sb.from('pi_products')
    .update(changes)
    .eq('id', id)
    .eq('user_id', _currentUser.id);
  if (error) throw error;
  const idx = _products.findIndex(p => p.id === id);
  if (idx !== -1) _products[idx] = { ..._products[idx], ...changes };
}

async function removeProduct(id) {
  const { error } = await sb.from('pi_products')
    .delete()
    .eq('id', id)
    .eq('user_id', _currentUser.id);
  if (error) throw error;
  _products = _products.filter(p => p.id !== id);
}

// ── Ideas ──
async function addIdea(data) {
  const productIdeas = _ideas.filter(i => i.product_id === data.product_id);
  const maxOrder     = productIdeas.reduce((m, i) => Math.max(m, i.sort_order || 0), 0);
  const { data: row, error } = await sb.from('pi_ideas').insert({
    user_id:    _currentUser.id,
    sort_order: maxOrder + 1,
    ...data,
  }).select().single();
  if (error) throw error;
  _ideas.push(row);
  return row;
}

async function updateIdea(id, changes) {
  const { error } = await sb.from('pi_ideas')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', _currentUser.id);
  if (error) throw error;
  const idx = _ideas.findIndex(i => i.id === id);
  if (idx !== -1) _ideas[idx] = { ..._ideas[idx], ...changes };
}

async function deleteIdea(id) {
  const { error } = await sb.from('pi_ideas')
    .delete()
    .eq('id', id)
    .eq('user_id', _currentUser.id);
  if (error) throw error;
  _ideas = _ideas.filter(i => i.id !== id);
}
