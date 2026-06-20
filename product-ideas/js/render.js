// ── Render-layer state ──
let _openProductIds = new Set();
let _showArchived   = false;

// ── Helpers ──
function _esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _sourceLabel(s) {
  return { self: 'Self', user_feedback: 'User feedback', teammate: 'Teammate', other: 'Other' }[s] || _esc(s);
}

function _priorityPill(p) {
  const cls   = { low: 'pi-pill-low', medium: 'pi-pill-medium', high: 'pi-pill-high' }[p] || '';
  const label = { low: 'Low', medium: 'Medium', high: 'High' }[p] || _esc(p);
  return `<span class="pi-pill ${cls}">${label}</span>`;
}

function _statusPill(s) {
  const cls   = { ideation: 'pi-pill-ideation', scoping: 'pi-pill-scoping', submitted: 'pi-pill-submitted' }[s] || '';
  const label = { ideation: 'Ideation', scoping: 'Scoping', submitted: 'Submitted' }[s] || _esc(s);
  return `<span class="pi-pill ${cls}">${label}</span>`;
}

function _devBadge(idea) {
  if (!idea.dev_submitted) return '';
  const label = idea.jira_ticket ? _esc(idea.jira_ticket) : 'Dev';
  return `<span class="pi-pill pi-pill-dev">${label}</span>`;
}

// ── Main render ──
function render() {
  const app = document.getElementById('app');
  if (getView() === 'manage') {
    app.innerHTML = _renderManageView();
    _bindManageEvents();
  } else {
    app.innerHTML = _renderListView();
    _bindListEvents();
  }
}

// ── List view ──
function _renderListView() {
  const products = getProducts();
  const ideas    = getIdeas();

  let bodyHtml;
  if (products.length === 0) {
    bodyHtml = `
      <div class="pi-empty-state">
        <div class="pi-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18h6"/><path d="M10 22h4"/>
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.18 4.48-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.18 13.48 5 11.38 5 9a7 7 0 0 1 7-7z"/>
          </svg>
        </div>
        <div class="pi-empty-title">No products yet</div>
        <div class="pi-empty-msg">Add your first product to start capturing improvement ideas.</div>
        <button class="btn pi-btn-secondary" onclick="window.__piGoManage()">Add a product</button>
      </div>`;
  } else {
    const activeIdeas   = ideas.filter(i => !i.archived);
    const archivedIdeas = ideas.filter(i =>  i.archived);
    bodyHtml = `
      <div class="pi-accordion">
        ${products.map(p => _renderAccordionItem(p, activeIdeas.filter(i => i.product_id === p.id))).join('')}
      </div>
      ${archivedIdeas.length ? _renderArchivedSection(archivedIdeas, products) : ''}`;
  }

  return `
    <div class="pi-wrap">
      <div class="pi-page-header">
        <div>
          <div class="pi-page-title">Improvement Ideas</div>
          <div class="pi-page-subtitle">Track how your products could be better</div>
        </div>
        <div class="pi-header-actions">
          ${products.length > 0 ? `
            <button class="btn pi-btn-ghost" onclick="window.__piGoManage()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
              Manage products
            </button>
            <button class="btn pi-btn-primary" onclick="window.__piOpenModal(null, null)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add idea
            </button>` : ''}
        </div>
      </div>
      ${bodyHtml}
    </div>
    <div class="pi-modal-overlay" id="pi-modal-overlay" style="display:none">
      <div class="pi-modal" id="pi-modal"></div>
    </div>`;
}

function _renderAccordionItem(product, ideas) {
  const isOpen = _openProductIds.has(product.id);
  const count  = ideas.length;

  const rowsHtml = ideas.length === 0
    ? `<div class="pi-ideas-empty">No ideas yet — <button class="pi-link-btn" data-add-product="${product.id}">add one</button></div>`
    : ideas.map(i => `
        <div class="pi-idea-row" data-edit-id="${i.id}">
          <span class="pi-idea-title">${_esc(i.title)}</span>
          <span class="pi-idea-source">${_sourceLabel(i.source)}</span>
          ${_priorityPill(i.priority)}
          ${_statusPill(i.status)}
          ${_devBadge(i)}
        </div>`).join('');

  return `
    <div class="pi-accordion-item${isOpen ? ' open' : ''}" data-product-id="${product.id}">
      <div class="pi-accordion-header" data-toggle="${product.id}">
        <div class="pi-accordion-left">
          <svg class="pi-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span class="pi-product-name">${_esc(product.name)}</span>
          <span class="pi-idea-count">${count} idea${count === 1 ? '' : 's'}</span>
        </div>
        <button class="pi-add-btn" data-add-product="${product.id}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add
        </button>
      </div>
      <div class="pi-accordion-body">
        ${rowsHtml}
      </div>
    </div>`;
}

// ── Archived section ──
function _renderArchivedSection(archivedIdeas, products) {
  const rowsHtml = archivedIdeas.map(i => {
    const product = products.find(p => p.id === i.product_id);
    return `
      <div class="pi-archived-row" data-edit-id="${i.id}">
        <span class="pi-archived-product">${_esc(product?.name || '')}</span>
        <span class="pi-idea-title">${_esc(i.title)}</span>
        ${i.jira_ticket ? `<span class="pi-pill pi-pill-dev">${_esc(i.jira_ticket)}</span>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="pi-archived-section">
      <div class="pi-archived-header" onclick="window.__piToggleArchived()">
        <svg class="pi-chevron${_showArchived ? ' pi-chevron-open' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        Archived
        <span class="pi-idea-count">${archivedIdeas.length}</span>
      </div>
      ${_showArchived ? `<div class="pi-archived-body">${rowsHtml}</div>` : ''}
    </div>`;
}

// ── Manage view ──
function _renderManageView() {
  const products = getProducts();
  const ideas    = getIdeas();

  const rowsHtml = products.map(p => {
    const count = ideas.filter(i => i.product_id === p.id).length;
    const canRemove = count === 0;
    return `
      <div class="pi-manage-row" data-product-id="${p.id}">
        <span class="pi-manage-name" id="pi-manage-name-${p.id}">${_esc(p.name)}</span>
        <div class="pi-manage-actions">
          <button class="pi-manage-btn" data-rename="${p.id}">Rename</button>
          <button class="pi-manage-btn pi-manage-btn-remove" data-remove="${p.id}"
            ${!canRemove ? `disabled title="Remove all ${count} idea${count === 1 ? '' : 's'} first"` : ''}>Remove</button>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="pi-wrap">
      <div class="pi-manage-header">
        <button class="btn" onclick="window.__piGoList()">← Back</button>
        <div class="pi-page-title">Manage products</div>
        <div></div>
      </div>
      <div class="pi-manage-panel">
        ${products.length === 0
          ? `<div class="pi-manage-empty">No products yet. Add one below.</div>`
          : `<div class="pi-manage-list">${rowsHtml}</div>`
        }
        <div class="pi-manage-add-row">
          <input class="pi-manage-input" id="pi-new-product-input" type="text" placeholder="New product name…" maxlength="80">
          <button class="btn pi-btn-secondary" id="pi-add-product-btn">Add product</button>
        </div>
      </div>
    </div>`;
}

// ── Modal ──
function _openModal(productId, ideaId) {
  const products = getProducts();
  if (products.length === 0) return;

  const idea   = ideaId ? getIdeas().find(i => i.id === ideaId) : null;
  const isEdit = !!idea;
  const selPid = idea?.product_id || productId || products[0].id;

  const productOptions = products.map(p =>
    `<option value="${p.id}" ${selPid === p.id ? 'selected' : ''}>${_esc(p.name)}</option>`
  ).join('');

  const modal = document.getElementById('pi-modal');
  modal.innerHTML = `
    <div class="pi-modal-header">
      <div>
        <div class="pi-modal-title">${isEdit ? 'Edit idea' : 'New improvement idea'}</div>
        <div class="pi-modal-tag">${_esc(products.find(p => p.id === selPid)?.name || '')}</div>
      </div>
      <button class="pi-modal-close" id="pi-modal-close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="pi-modal-body">
      <div class="pi-form-field">
        <label class="pi-form-label" for="pi-f-product">Product</label>
        <select class="pi-form-select" id="pi-f-product">${productOptions}</select>
      </div>
      <div class="pi-form-field">
        <label class="pi-form-label" for="pi-f-title">Title</label>
        <input class="pi-form-input" id="pi-f-title" type="text" placeholder="Short description of the idea…" maxlength="200" value="${_esc(idea?.title || '')}">
      </div>
      <div class="pi-form-field">
        <label class="pi-form-label" for="pi-f-desc">Description</label>
        <textarea class="pi-form-textarea" id="pi-f-desc" placeholder="Context, rationale, what problem it solves…">${_esc(idea?.description || '')}</textarea>
      </div>
      <div class="pi-form-row">
        <div class="pi-form-field">
          <label class="pi-form-label" for="pi-f-source">Source</label>
          <select class="pi-form-select" id="pi-f-source">
            ${['self','user_feedback','teammate','other'].map(s =>
              `<option value="${s}" ${(idea?.source || 'self') === s ? 'selected' : ''}>${_sourceLabel(s)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="pi-form-field">
          <label class="pi-form-label" for="pi-f-priority">Priority</label>
          <select class="pi-form-select" id="pi-f-priority">
            ${['low','medium','high'].map(v =>
              `<option value="${v}" ${(idea?.priority || 'medium') === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="pi-form-field">
          <label class="pi-form-label" for="pi-f-status">Status</label>
          <select class="pi-form-select" id="pi-f-status">
            ${['ideation','scoping','submitted'].map(v =>
              `<option value="${v}" ${(idea?.status || 'ideation') === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="pi-form-dev-section">
        <label class="pi-form-dev-label">
          <input type="checkbox" id="pi-f-dev-submitted" ${idea?.dev_submitted ? 'checked' : ''}>
          <span>Submitted to dev</span>
        </label>
        <div id="pi-f-jira-wrap" class="pi-form-jira-wrap"${!idea?.dev_submitted ? ' style="display:none"' : ''}>
          <input class="pi-form-input pi-form-input--jira" id="pi-f-jira" type="text"
            placeholder="Jira ticket (e.g. PROJ-1234)" maxlength="50"
            value="${_esc(idea?.jira_ticket || '')}">
        </div>
      </div>
    </div>
    <div class="pi-modal-footer">
      <div class="pi-modal-footer-left">
        ${isEdit ? `<button class="pi-btn-delete" id="pi-delete-btn">Delete</button>` : ''}
        ${isEdit ? `<button class="pi-btn-archive" id="pi-archive-btn">${idea?.archived ? 'Unarchive' : 'Archive'}</button>` : ''}
      </div>
      <div class="pi-modal-footer-right">
        <button class="btn" id="pi-cancel-btn">Cancel</button>
        <button class="btn pi-btn-primary" id="pi-save-btn">${isEdit ? 'Save changes' : 'Save idea'}</button>
      </div>
    </div>`;

  document.getElementById('pi-modal-overlay').style.display = 'flex';
  document.getElementById('pi-f-title').focus();
  _bindModalEvents(isEdit, idea);

  // update product tag when product select changes
  document.getElementById('pi-f-product').addEventListener('change', e => {
    const p = getProducts().find(p => p.id === e.target.value);
    const tag = document.querySelector('.pi-modal-tag');
    if (tag && p) tag.textContent = p.name;
  });
}

function _closeModal() {
  document.getElementById('pi-modal-overlay').style.display = 'none';
}

function _bindModalEvents(isEdit, idea) {
  document.getElementById('pi-modal-close').addEventListener('click', _closeModal);
  document.getElementById('pi-cancel-btn').addEventListener('click', _closeModal);
  document.getElementById('pi-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'pi-modal-overlay') _closeModal();
  });

  // Toggle Jira input visibility when "Submitted to dev" checkbox changes
  document.getElementById('pi-f-dev-submitted').addEventListener('change', e => {
    const wrap = document.getElementById('pi-f-jira-wrap');
    if (wrap) wrap.style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('pi-save-btn').addEventListener('click', async () => {
    const title = document.getElementById('pi-f-title').value.trim();
    if (!title) { document.getElementById('pi-f-title').focus(); return; }

    const devSubmitted = document.getElementById('pi-f-dev-submitted').checked;
    const payload = {
      product_id:    document.getElementById('pi-f-product').value,
      title,
      description:   document.getElementById('pi-f-desc').value.trim(),
      source:        document.getElementById('pi-f-source').value,
      priority:      document.getElementById('pi-f-priority').value,
      status:        document.getElementById('pi-f-status').value,
      dev_submitted: devSubmitted,
      jira_ticket:   devSubmitted ? (document.getElementById('pi-f-jira').value.trim() || null) : null,
    };

    const btn = document.getElementById('pi-save-btn');
    btn.disabled = true;
    try {
      if (isEdit) {
        await updateIdea(idea.id, payload);
      } else {
        await addIdea(payload);
        _openProductIds.add(payload.product_id);
      }
      _closeModal();
      render();
    } catch (e) {
      console.error(e);
      btn.disabled = false;
    }
  });

  if (isEdit) {
    document.getElementById('pi-delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this idea? This cannot be undone.')) return;
      await deleteIdea(idea.id);
      _closeModal();
      render();
    });

    document.getElementById('pi-archive-btn').addEventListener('click', async () => {
      await updateIdea(idea.id, { archived: !idea.archived });
      _closeModal();
      render();
    });
  }
}

// ── List event binding ──
function _bindListEvents() {
  document.getElementById('app').addEventListener('click', e => {
    const addBtn  = e.target.closest('[data-add-product]');
    const editRow = e.target.closest('[data-edit-id]');
    const toggle  = e.target.closest('[data-toggle]');

    if (addBtn) {
      e.stopPropagation();
      const pid = addBtn.dataset.addProduct;
      _openProductIds.add(pid);
      window.__piOpenModal(pid, null);
      return;
    }
    if (editRow) {
      window.__piOpenModal(null, editRow.dataset.editId);
      return;
    }
    if (toggle) {
      const pid  = toggle.dataset.toggle;
      const item = document.querySelector(`.pi-accordion-item[data-product-id="${pid}"]`);
      if (item) {
        const opening = !item.classList.contains('open');
        item.classList.toggle('open', opening);
        if (opening) _openProductIds.add(pid);
        else _openProductIds.delete(pid);
      }
    }
  });
}

// ── Manage event binding ──
function _bindManageEvents() {
  const addInput = document.getElementById('pi-new-product-input');
  const addBtn   = document.getElementById('pi-add-product-btn');

  async function doAdd() {
    const name = addInput.value.trim();
    if (!name) { addInput.focus(); return; }
    addBtn.disabled = true;
    try {
      await addProduct(name);
      addInput.value = '';
      render();
    } catch (e) {
      console.error(e);
      addBtn.disabled = false;
    }
  }

  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

  document.querySelectorAll('[data-rename]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.rename;
      const nameEl  = document.getElementById(`pi-manage-name-${id}`);
      const current = getProducts().find(p => p.id === id)?.name || '';
      nameEl.innerHTML = `<input class="pi-manage-rename-input" value="${_esc(current)}" maxlength="80">`;
      const input = nameEl.querySelector('input');
      input.focus(); input.select();

      let saved = false;
      async function save() {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (!val || val === current) { render(); return; }
        await updateProduct(id, { name: val });
        render();
      }
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  save();
        if (e.key === 'Escape') render();
      });
    });
  });

  document.querySelectorAll('[data-remove]:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      await removeProduct(btn.dataset.remove);
      render();
    });
  });
}

// ── Global hooks (called from inline onclick) ──
window.__piOpenModal      = (productId, ideaId) => _openModal(productId, ideaId);
window.__piGoManage       = () => { setView('manage'); render(); };
window.__piGoList         = () => { setView('list');   render(); };
window.__piToggleArchived = () => { _showArchived = !_showArchived; render(); };
