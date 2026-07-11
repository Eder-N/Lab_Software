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
}

function ensurePriceLists() {
  state.priceLists = Array.isArray(state.priceLists) ? state.priceLists : [];
  if (!state.priceLists.length) state.priceLists.push({ id: uid(), name: "Tabela Padrão" });
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
}

function refreshVisiblePrices() {
  refreshPriceListControls();
  populateServiceCatalogOptions();
  renderTables();
}

function bindPriceListManager() {
  document.querySelector("#active-price-list")?.addEventListener("change", event => {
    activePriceListId = event.target.value;
    refreshVisiblePrices();
  });
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
  }, true);
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
    const categories = [...new Set(pricesForList(activePriceListId).map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
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
