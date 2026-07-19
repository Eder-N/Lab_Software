(function () {
  const PAYMENT_METHODS = ["Dinheiro", "Pix", "Cartão", "Boleto", "Cheque", "Transferência"];

  function insertPaymentMethodField(form) {
    if (!form || form.elements.paymentMethod) return;
    const amountField = form.querySelector('[name="amount"]');
    const anchor = amountField?.closest("label") || form.querySelector("label");
    if (!anchor) return;
    const label = document.createElement("label");
    label.innerHTML = `Forma de pagamento<select name="paymentMethod">
      <option value="">Não informado</option>
      ${PAYMENT_METHODS.map(method => `<option value="${method}">${method}</option>`).join("")}
    </select>`;
    anchor.insertAdjacentElement("afterend", label);
  }

  function installTransactionSchemaColumn() {
    if (typeof schemas === "undefined" || !schemas.transactions) return;
    const columns = schemas.transactions.columns || [];
    if (!columns.some(([key]) => key === "paymentMethod")) {
      const categoryIndex = columns.findIndex(([key]) => key === "category");
      columns.splice(categoryIndex >= 0 ? categoryIndex + 1 : columns.length, 0, ["paymentMethod", "Forma"]);
    }
    schemas.transactions.format = schemas.transactions.format || {};
    schemas.transactions.format.paymentMethod = value => value ? esc(value) : "-";
  }

  function patchClientPaymentSubmit() {
    const form = document.querySelector("#client-payment-form");
    if (!form || form.dataset.paymentMethodPatch) return;
    form.dataset.paymentMethodPatch = "true";
    form.addEventListener("submit", () => {
      const data = Object.fromEntries(new FormData(form).entries());
      const paymentMethod = data.paymentMethod || "";
      setTimeout(() => {
        const target = data.id
          ? (state.transactions || []).find(item => item.id === data.id)
          : [...(state.transactions || [])].reverse().find(item =>
              item.clientName === data.clientName &&
              item.date === (data.date || today) &&
              parseAmountValue(item.amount) === parseAmountValue(data.amount)
            );
        if (!target) return;
        target.paymentMethod = paymentMethod;
        saveState();
        renderClientPayments();
        renderTables();
      }, 0);
    });
  }

  function patchClientPaymentEditor() {
    if (window.editClientPayment?.paymentMethodPatch) return;
    const originalEditClientPayment = window.editClientPayment;
    if (typeof originalEditClientPayment !== "function") return;
    window.editClientPayment = function (id) {
      originalEditClientPayment(id);
      const item = (state.transactions || []).find(entry => entry.id === id);
      const field = document.querySelector("#client-payment-form [name='paymentMethod']");
      if (field) field.value = item?.paymentMethod || "";
    };
    window.editClientPayment.paymentMethodPatch = true;
  }

  function renderClientPaymentsWithMethod() {
    const table = document.querySelector("#client-payments-table");
    if (!table) return;
    const rows = clientPaymentRows();
    table.innerHTML = `<thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.length ? rows.map(item => `<tr><td>${formatDate(item.date)}</td><td>${esc(item.clientName || "")}</td><td>${esc(item.paymentMethod || "-")}</td><td>${money(parseAmountValue(item.amount))}</td><td><span class="badge">${esc(item.status || "")}${transactionIsOverduePendingOut(item) ? " - Vencida" : ""}</span></td><td><button type="button" class="text-button" onclick="editClientPayment('${item.id}')">Editar</button></td></tr>`).join("") : `<tr><td colspan="6">${emptyState()}</td></tr>`}</tbody>`;
  }

  function installClientPaymentRenderer() {
    window.renderClientPayments = renderClientPaymentsWithMethod;
  }

  function bootFinanceEnhancements() {
    insertPaymentMethodField(document.querySelector('[data-form="transactions"]'));
    insertPaymentMethodField(document.querySelector("#client-payment-form"));
    installTransactionSchemaColumn();
    patchClientPaymentSubmit();
    patchClientPaymentEditor();
    installClientPaymentRenderer();
    renderClientPayments();
    renderTables();
  }

  document.addEventListener("DOMContentLoaded", bootFinanceEnhancements);
})();
