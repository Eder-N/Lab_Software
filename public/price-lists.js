/* Múltiplas tabelas de preços e associação automática por cliente. */
let activePriceListId = "";

function buildPriceListInterface() {
  const clientName = document.querySelector('[data-form="clients"] [name="name"]')?.closest("label");
  if (clientName && !document.querySelector(".client-price-list")) {
    clientName.insertAdjacentHTML("afterend", '<label>Tabela de preços<select name="priceListId" class="client-price-list" required></select><small>Aplicada automaticamente nas novas entradas deste cliente.</small></label>');
  }

  const priceForm = document.querySelector('[data-form="prices"]');
  if (priceForm && !priceForm.elements.priceListId) {
    priceForm.insertAdjacentHTML("afterbegin", '<input type="hidden" name="priceListId" />');
  }

  const priceView = document.querySelector("#prices-view");
  if (priceView && !document.querySelector("#active-price-list")) {
    priceView.insertAdjacentHTML("afterbegin", '<div class="price-list-manager"><div><span>Tabela selecionada</span><select id="active-price-list"></select></div><button type="button" id="new-price-list">Nova tabela</button><button type="button" class="ghost-button" id="duplicate-price-list">Duplicar</button><button type="button" class="ghost-button" id="rename-price-list">Renomear</button><button type="button" class="danger" id="delete-price-list">Excluir</button></div>');
  }
  if (priceView && !document.querySelector("#price-category-manager")) {
    priceView.insertAdjacentHTML("afterbegin", '<section class="price-category-manager" id="price-category-manager"><div class="price-category-heading"><div><strong>Setores cadastrados</strong><span>Setores da tabela de preços selecionada</span></div><button type="button" class="ghost-button" id="new-price-category">Cadastrar setor</button></div><div class="price-category-list" id="price-category-list"></div></section>');
  }
}

function ensurePriceLists() {
  state.priceLists = Array.isArray(state.priceLists) ? state.priceLists : [];
  if (!state.priceLists.length) state.priceLists.push({ id: uid(), name: "Tabela Padrão" });
  state.priceLists.forEach(list => { list.categories = Array.isArray(list.categories) ? list.categories : []; });
  const fallback = state.priceLists[0].id;
  (state.prices || []).forEach(price => { if (!price.priceListId) price.priceListId = fallback; });
  (state.clients || []).forEach(client => { if (!client.priceListId) client.priceListId = fallback; });
  if (!state.priceLists.some(list => list.id === activePriceListId)) activePriceListId = fallback;
}

function priceListName(id) {
  return state.priceLists?.find(list => list.id === id)?.name || "Tabela Padrão";
}

function selectedEntryClient() {
  const name = document.querySelector('[data-form="services"] [name="name"]')?.value || "";
  return (state.clients || []).find(client => normalizeName(client.name) === normalizeName(name));
}

function entryPriceListId() {
  return selectedEntryClient()?.priceListId || state.priceLists?.[0]?.id || "";
}

function pricesForList(id) {
  return (state.prices || []).filter(price => (price.priceListId || state.priceLists[0].id) === id);
}

function activePriceList() {
  return state.priceLists?.find(list => list.id === activePriceListId) || state.priceLists?.[0];
}

function priceCategoriesForList(id = activePriceListId) {
  const list = state.priceLists?.find(item => item.id === id) || state.priceLists?.[0];
  const saved = Array.isArray(list?.categories) ? list.categories : [];
  const used = pricesForList(id).map(item => item.category).filter(Boolean);
  return [...new Set([...saved, ...used].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function refreshPriceListControls() {
  ensurePriceLists();
  const options = state.priceLists.map(list => `<option value="${esc(list.id)}">${esc(list.name)}</option>`).join("");
  const active = document.querySelector("#active-price-list");
  if (active) {
    active.innerHTML = options;
    active.value = activePriceListId;
  }
  document.querySelectorAll(".client-price-list").forEach(select => {
    const current = select.value || state.priceLists[0].id;
    select.innerHTML = options;
    select.value = state.priceLists.some(list => list.id === current) ? current : state.priceLists[0].id;
  });
  const priceForm = document.querySelector('[data-form="prices"]');
  if (priceForm?.elements.priceListId) priceForm.elements.priceListId.value = activePriceListId;
  const heading = document.querySelector("#prices-view .panel-heading h2");
  if (heading) heading.textContent = `Tabela de preços - ${priceListName(activePriceListId)}`;
  renderPriceCategoryList();
}

function refreshVisiblePrices() {
  refreshPriceListControls();
  populateServiceCatalogOptions();
  renderTables();
}

function bindPriceListManager() {
  document.addEventListener("click", event => {
    const button = event.target.closest('[data-add-category="prices"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    addPriceCategory();
  }, true);
  document.addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-price-category]");
    const remove = event.target.closest("[data-delete-price-category]");
    if (edit) editPriceCategory(edit.dataset.editPriceCategory);
    if (remove) deletePriceCategory(remove.dataset.deletePriceCategory);
  });
  document.querySelector("#active-price-list")?.addEventListener("change", event => {
    activePriceListId = event.target.value;
    refreshVisiblePrices();
  });
  document.querySelector("#new-price-category")?.addEventListener("click", addPriceCategory);
  document.querySelector("#new-price-list")?.addEventListener("click", () => {
    const name = prompt("Nome da nova tabela de preços");
    if (!name?.trim()) return;
    const list = { id: uid(), name: name.trim() };
    state.priceLists.push(list);
    activePriceListId = list.id;
    saveState();
    refreshVisiblePrices();
  });
  document.querySelector("#duplicate-price-list")?.addEventListener("click", () => {
    const source = state.priceLists.find(list => list.id === activePriceListId);
    const name = prompt("Nome da cópia", `${source?.name || "Tabela"} - Cópia`);
    if (!name?.trim()) return;
    const list = { id: uid(), name: name.trim() };
    state.priceLists.push(list);
    pricesForList(activePriceListId).forEach(price => state.prices.push({ ...price, id: uid(), priceListId: list.id }));
    activePriceListId = list.id;
    saveState();
    refreshVisiblePrices();
  });
  document.querySelector("#rename-price-list")?.addEventListener("click", () => {
    const list = state.priceLists.find(item => item.id === activePriceListId);
    if (!list) return;
    const name = prompt("Novo nome da tabela", list.name);
    if (!name?.trim()) return;
    list.name = name.trim();
    saveState();
    refreshVisiblePrices();
  });
  document.querySelector("#delete-price-list")?.addEventListener("click", () => {
    if (state.priceLists.length === 1) return alert("É necessário manter pelo menos uma tabela.");
    const list = state.priceLists.find(item => item.id === activePriceListId);
    const linked = (state.clients || []).filter(client => client.priceListId === activePriceListId);
    if (linked.length) return alert(`Tabela vinculada a ${linked.length} cliente(s). Altere esses clientes antes de excluir.`);
    if (!confirm(`Excluir "${list?.name}" e todos os seus preços?`)) return;
    state.prices = state.prices.filter(price => price.priceListId !== activePriceListId);
    state.priceLists = state.priceLists.filter(item => item.id !== activePriceListId);
    activePriceListId = state.priceLists[0].id;
    saveState();
    refreshVisiblePrices();
  });
  document.querySelector('[data-form="services"] [name="name"]')?.addEventListener("change", event => {
    populateServiceCatalogOptions();
    renderEntryItemRows(event.target.form, [{}]);
    updateEntryTotal(event.target.form);
  });
  document.querySelector('[data-form="prices"]')?.addEventListener("submit", event => {
    if (event.currentTarget.elements.priceListId) event.currentTarget.elements.priceListId.value = activePriceListId;
    const category = event.currentTarget.elements.category?.value?.trim();
    if (category) savePriceCategory(category);
  }, true);
}

function savePriceCategory(name) {
  const list = activePriceList();
  if (!list) return;
  list.categories = Array.isArray(list.categories) ? list.categories : [];
  if (!list.categories.some(category => normalizeName(category) === normalizeName(name))) {
    list.categories.push(name);
    list.categories.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }
}

function addPriceCategory() {
  ensurePriceLists();
  const name = prompt("Nome do setor");
  const category = String(name || "").trim();
  if (!category) return;
  savePriceCategory(category);
  const field = document.querySelector('[data-form="prices"] [name="category"]');
  if (field) field.value = category;
  saveState();
  refreshVisiblePrices();
}

function editPriceCategory(oldName) {
  const list = activePriceList();
  if (!list) return;
  const name = prompt("Novo nome do setor", oldName);
  const category = String(name || "").trim();
  if (!category || normalizeName(category) === normalizeName(oldName)) return;
  if (priceCategoriesForList().some(item => normalizeName(item) === normalizeName(category))) return alert("Já existe um setor com esse nome.");
  list.categories = priceCategoriesForList().map(item => normalizeName(item) === normalizeName(oldName) ? category : item);
  pricesForList(activePriceListId).forEach(price => {
    if (normalizeName(price.category) === normalizeName(oldName)) price.category = category;
  });
  const field = document.querySelector('[data-form="prices"] [name="category"]');
  if (field && normalizeName(field.value) === normalizeName(oldName)) field.value = category;
  saveState();
  refreshVisiblePrices();
}

function deletePriceCategory(name) {
  const list = activePriceList();
  if (!list) return;
  const used = pricesForList(activePriceListId).filter(price => normalizeName(price.category) === normalizeName(name)).length;
  const message = used ? `Este setor está em ${used} serviço(s). Deseja remover o setor desses serviços?` : `Excluir o setor "${name}"?`;
  if (!confirm(message)) return;
  list.categories = priceCategoriesForList().filter(item => normalizeName(item) !== normalizeName(name));
  pricesForList(activePriceListId).forEach(price => {
    if (normalizeName(price.category) === normalizeName(name)) price.category = "";
  });
  const field = document.querySelector('[data-form="prices"] [name="category"]');
  if (field && normalizeName(field.value) === normalizeName(name)) field.value = "";
  saveState();
  refreshVisiblePrices();
}

function renderPriceCategoryList() {
  const box = document.querySelector("#price-category-list");
  if (!box) return;
  const categories = priceCategoriesForList();
  box.innerHTML = categories.length ? categories.map(category => `<article class="price-category-item"><strong>${esc(category)}</strong><div><button type="button" class="ghost-button" data-edit-price-category="${esc(category)}">Editar</button><button type="button" class="danger" data-delete-price-category="${esc(category)}">Excluir</button></div></article>`).join("") : '<div class="price-category-empty">Nenhum setor cadastrado nesta tabela.</div>';
}

const baseFilteredRows = filteredRows;
filteredRows = function(collection) {
  if (collection !== "prices") return baseFilteredRows(collection);
  const term = searchTerms.prices;
  const rows = pricesForList(activePriceListId);
  return term ? rows.filter(item => Object.values(item).some(value => String(value).toLowerCase().includes(term))) : rows;
};

const baseRender = render;
render = function() {
  ensurePriceLists();
  baseRender();
  refreshPriceListControls();
};

populateServiceCatalogOptions = function() {
  ensurePriceLists();
  const serviceList = document.querySelector("#service-options");
  const priceCategoryList = document.querySelector("#price-category-options");
  const listId = document.querySelector("#services-view.active") ? entryPriceListId() : activePriceListId;
  const services = [...new Set(pricesForList(listId).map(item => item.name || serviceName(item.serviceId)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (serviceList) serviceList.innerHTML = services.map(name => `<option value="${esc(name)}"></option>`).join("");
  if (priceCategoryList) {
    const categories = priceCategoriesForList(activePriceListId);
    priceCategoryList.innerHTML = categories.map(name => `<option value="${esc(name)}"></option>`).join("");
  }
};

serviceCatalogItem = function(name) {
  const selected = normalizeName(name);
  return pricesForList(entryPriceListId()).find(price => normalizeName(price.name || serviceName(price.serviceId)) === selected);
};

document.addEventListener("DOMContentLoaded", () => {
  buildPriceListInterface();
  ensurePriceLists();
  if (!schemas.clients.columns.some(([key]) => key === "priceListId")) {
    schemas.clients.columns.splice(1, 0, ["priceListId", "Tabela de preços"]);
  }
  schemas.clients.format = { ...(schemas.clients.format || {}), priceListId: value => esc(priceListName(value)) };
  bindPriceListManager();
  refreshVisiblePrices();
  saveState();
});
