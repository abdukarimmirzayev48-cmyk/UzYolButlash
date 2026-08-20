async function fetchContractsForSelect(selectedId = null, clientId = null) {
  const query = new URLSearchParams({ page_size: "100" });
  if (clientId) query.set("client_id", clientId);
  const data = await api(`/api/contracts?${query.toString()}`);
  return data.items.map((contract) => `
    <option value="${contract.id}" ${Number(selectedId) === contract.id ? "selected" : ""}>
      ${esc(contract.contract_number)} - ${esc(contract.client?.name || "")}
    </option>
  `).join("");
}

function orderItemRow(contractItems = [], item = {}, index = 0, balances = []) {
  const selectedId = Number(item.contract_item_id || contractItems[0]?.id || "");
  const selected = contractItems.find((row) => row.id === selectedId) || contractItems[0] || {};
  const balance = balances.find((row) => row.contract_item_id === selectedId);
  const unitPrice = item.unit_price ?? selected.unit_price ?? "";
  const vatRate = item.vat_rate ?? selected.vat_rate ?? 12;
  return `
    <div class="item-row" data-order-item-row>
      <label>Mahsulot
        <select name="contract_item_id_${index}">
          ${contractItems.map((contractItem) => `<option value="${contractItem.id}" ${contractItem.id === selectedId ? "selected" : ""}>${esc(contractItem.product_name)} (${esc(contractItem.unit)})</option>`).join("")}
        </select>
      </label>
      ${textField(`quantity_${index}`, "Miqdor", item.quantity ?? "", "number")}
      ${textField(`unit_price_${index}`, "Birlik narxi", unitPrice, "number")}
      ${textField(`vat_rate_${index}`, "QQS %", vatRate, "number")}
      <div class="total-box"><span>Shartnoma</span><strong data-row-balance>${balance ? `${fmtQty(balance.contract_quantity, balance.unit)} / ${fmtQty(balance.remaining_quantity, balance.unit)} qoldiq` : dash}</strong></div>
      <div class="total-box"><span>Qator jami</span><strong data-row-total>${dash}</strong></div>
      <button type="button" class="btn danger" data-remove-order-item>Olib tashlash</button>
    </div>
  `;
}

function selectedContractItem(row, contractItems) {
  return contractItems.find((item) => item.id === Number(row.querySelector("[name^='contract_item_id_']").value));
}

function calculateOrderForm(form, contractItems = [], balances = []) {
  let subtotal = 0;
  let vat = 0;
  let quantity = 0;
  [...form.querySelectorAll("[data-order-item-row]")].forEach((row) => {
    const contractItem = selectedContractItem(row, contractItems) || {};
    const balance = balances.find((item) => item.contract_item_id === contractItem.id);
    const rowQuantity = numberValue(row.querySelector("[name^='quantity_']").value);
    const unitPrice = numberValue(row.querySelector("[name^='unit_price_']").value || contractItem.unit_price);
    const vatRate = numberValue(row.querySelector("[name^='vat_rate_']").value || contractItem.vat_rate || 12);
    const rowSubtotal = rowQuantity * unitPrice;
    const rowVat = rowSubtotal * vatRate / 100;
    quantity += rowQuantity;
    subtotal += rowSubtotal;
    vat += rowVat;
    row.querySelector("[data-row-total]").textContent = fmtMoney(rowSubtotal + rowVat);
    row.querySelector("[data-row-balance]").textContent = balance ? `${fmtQty(balance.contract_quantity, balance.unit)} / ${fmtQty(balance.ordered_quantity, balance.unit)} buyurilgan / ${fmtQty(balance.remaining_quantity, balance.unit)} qoldiq` : dash;
  });
  const sourceType = form.elements.source_type?.value;
  const fulfillmentType = form.elements.fulfillment_type?.value;
  if (sourceType === "russia_direct" && !form.elements.markup_amount.value) {
    form.elements.markup_amount.value = formatNumberInputValue(Math.round(subtotal * 0.05));
  }
  const markup = numberValue(form.elements.markup_amount?.value);
  const logisticsInput = form.elements.logistics_price;
  if (fulfillmentType === "direct_supplier_to_customer") {
    logisticsInput.value = 0;
    logisticsInput.disabled = true;
  } else {
    logisticsInput.disabled = false;
  }
  const logistics = fulfillmentType === "direct_supplier_to_customer" ? 0 : numberValue(logisticsInput.value);
  const total = subtotal + vat + markup + logistics;
  form.querySelector("[data-order-quantity]").textContent = fmtQty(quantity);
  form.querySelector("[data-order-subtotal]").textContent = fmtMoney(subtotal);
  form.querySelector("[data-order-vat]").textContent = fmtMoney(vat);
  form.querySelector("[data-order-markup]").textContent = fmtMoney(markup);
  form.querySelector("[data-order-logistics]").textContent = fulfillmentType === "direct_supplier_to_customer" ? dash : fmtMoney(logistics);
  form.querySelector("[data-order-total]").textContent = fmtMoney(total);
}

function collectOrderItems(form) {
  return [...form.querySelectorAll("[data-order-item-row]")].map((row) => ({
    contract_item_id: Number(row.querySelector("[name^='contract_item_id_']").value),
    quantity: normalizeNumberInputValue(row.querySelector("[name^='quantity_']").value),
    unit_price: normalizeNumberInputValue(row.querySelector("[name^='unit_price_']").value),
    vat_rate: normalizeNumberInputValue(row.querySelector("[name^='vat_rate_']").value || "12"),
  })).filter((item) => item.contract_item_id && item.quantity);
}

function collectOrderPayload(form) {
  return {
    contract_id: Number(field(form, "contract_id")),
    order_number: field(form, "order_number"),
    order_date: field(form, "order_date"),
    required_date: field(form, "required_date"),
    fulfillment_type: field(form, "fulfillment_type") || "direct_supplier_to_customer",
    source_type: field(form, "source_type") || "other",
    supplier_id: field(form, "supplier_id") ? Number(field(form, "supplier_id")) : null,
    supplier_name: field(form, "supplier_name"),
    supplier_status: field(form, "supplier_status") || "not_selected",
    supplier_notes: field(form, "supplier_notes"),
    markup_amount: field(form, "markup_amount") || 0,
    logistics_price: field(form, "fulfillment_type") === "direct_supplier_to_customer" ? 0 : (field(form, "logistics_price") || 0),
    notes: field(form, "notes"),
    created_by: field(form, "created_by"),
    items: collectOrderItems(form),
  };
}

function generatedOrderNumber() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `ORD-${date}${time}`;
}

async function orderForm(order = null) {
  const contracts = await fetchContractsForSelect(order?.contract_id);
  const contract = order ? await api(`/api/contracts/${order.contract_id}`) : null;
  const stockLots = await api("/api/stock-lots?available_only=true&page_size=100").catch(() => ({ items: [] }));
  const balances = order ? order.contract_item_balances : [];
  const items = order?.items?.length ? order.items : [{}];
  const today = new Date().toISOString().slice(0, 10);
  const supplierStatus = order?.supplier_status || "not_selected";
  const supplierDisplay = order?.supplier_name || (order?.supplier_id ? `ID ${order.supplier_id}` : "Xarid jarayonida avtomatik tanlanadi");
  const sourceDefault = order?.source_type || new URLSearchParams(location.search).get("source_type") || "other";
  return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>${order ? "Buyurtmani tahrirlash" : "Yangi buyurtma"}</h1>
          <p>Mijoz shartnomasi bo'yicha operatsion talab.</p>
        </div>
        <div class="actions"><button class="btn" data-nav="${order ? `/orders/${order.id}` : "/orders"}">Orqaga</button></div>
      </div>
      <form id="order-form">
        ${section("Asosiy ma'lumotlar", `
          <div class="grid">
            <label>Shartnoma<select name="contract_id"><option value="">Shartnomani tanlang</option>${contracts}</select></label>
            <label>Mijoz<input name="client_name" value="${esc(order?.client?.name || contract?.client?.name || "")}" disabled /></label>
            ${readonlyField("order_number", "Buyurtma raqami", order?.order_number || generatedOrderNumber())}
            ${textField("order_date", "Buyurtma sanasi", order?.order_date || today, "date")}
            ${textField("required_date", "Talab qilingan sana", order?.required_date || "", "date")}
            ${readonlyField("status_label", "Status", optionLabel(orderStatuses, order?.status || "created"))}
            ${textField("created_by", "Yaratgan", order?.created_by)}
            ${textArea("notes", "Izoh", order?.notes)}
          </div>
        `)}
        ${section("Mahsulotlar", `
          <div id="order-items">${contract ? items.map((item, index) => orderItemRow(contract.items, item, index, balances)).join("") : `<div class="empty">Avval shartnomani tanlang.</div>`}</div>
          <button type="button" class="btn" id="add-order-item" ${contract ? "" : "disabled"}>Mahsulot qo'shish</button>
          <div class="totals-bar">
            <div class="total-box"><span>Jami miqdor</span><strong data-order-quantity>${dash}</strong></div>
            <div class="total-box"><span>Mahsulot summasi</span><strong data-order-subtotal>${dash}</strong></div>
            <div class="total-box"><span>QQS</span><strong data-order-vat>${dash}</strong></div>
            <div class="total-box"><span>Jami summa</span><strong data-order-total>${dash}</strong></div>
          </div>
        `)}
        ${section("Manba va yetkazib berish", `
          <div class="grid">
            ${selectField("source_type", "Manba", sourceTypes, sourceDefault)}
            ${selectField("fulfillment_type", "Yetkazib berish modeli", fulfillmentTypes, order?.fulfillment_type || "direct_supplier_to_customer")}
            ${moneyInputField("markup_amount", "Ustama summasi", order?.markup_amount ?? "")}
            <div class="total-box"><span>Ustama summasi</span><strong data-order-markup>${dash}</strong></div>
          </div>
        `)}
        ${section("Mavjud zaxiradan ajratish", `
          <div class="grid">
            <label>Zaxira partiyasi<select name="stock_lot_id"><option value="">Zaxira tanlang</option>${stockLots.items.map((lot) => `<option value="${lot.id}">${esc(lot.product_name)} · ${esc(lot.supplier_name || "")} · ${esc(lot.ticket_number || "")} · ${fmtQty(lot.quantity_available, lot.unit)} mavjud · ${fmtMoney(lot.unit_cost)}</option>`).join("")}</select></label>
            ${textField("stock_allocated_quantity", "Ajratiladigan miqdor", "", "number")}
          </div>
          <p class="helper-text">Bu blok faqat “Ta'minotchi omboridagi zaxira” manbasi uchun ishlatiladi.</p>
        `)}
        ${section("Ta'minotchi", `
          <input type="hidden" name="supplier_id" value="${esc(order?.supplier_id || "")}" />
          <input type="hidden" name="supplier_name" value="${esc(order?.supplier_name || "")}" />
          <input type="hidden" name="supplier_status" value="${esc(supplierStatus)}" />
          <div class="grid">
            ${readonlyField("supplier_display", "Ta'minotchi", supplierDisplay)}
            ${readonlyField("supplier_status_label", "Ta'minotchi statusi", optionLabel(supplierStatuses, supplierStatus))}
            ${textArea("supplier_notes", "Ta'minotchi izohi", order?.supplier_notes)}
          </div>
        `)}
        ${section("Narx va logistika", `
          <div class="grid">
            ${textField("logistics_price", "Logistika narxi", order?.logistics_price || 0, "number")}
            <div class="total-box"><span>Logistika</span><strong data-order-logistics>${dash}</strong></div>
            <div class="total-box"><span>Mahsulot summasi</span><strong data-order-subtotal>${dash}</strong></div>
            <div class="total-box"><span>Jami summa</span><strong data-order-total>${dash}</strong></div>
          </div>
        `)}
        ${section("Hujjatlar", `<div class="empty">Buyurtma hujjatlari saqlangandan keyin hujjatlar bo'limida qo'shiladi.</div>`)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="${order ? `/orders/${order.id}` : "/orders"}">Bekor qilish</button>
          <button type="submit" class="btn primary">Saqlash</button>
        </div>
      </form>
    </div>
  `;
}

async function bindOrderForm(order = null) {
  const form = document.querySelector("#order-form");
  let contract = order ? await api(`/api/contracts/${order.contract_id}`) : null;
  let balances = order ? order.contract_item_balances : [];
  async function reloadContract() {
    const contractId = Number(form.elements.contract_id.value);
    if (!contractId) return;
    contract = await api(`/api/contracts/${contractId}`);
    balances = await api(`/api/orders/contract/${contractId}/balances`);
    form.elements.client_name.value = contract.client?.name || "";
    document.querySelector("#order-items").innerHTML = orderItemRow(contract.items, {}, 0, balances);
    document.querySelector("#add-order-item").disabled = false;
    calculateOrderForm(form, contract.items, balances);
  }
  form.elements.contract_id.addEventListener("change", reloadContract);
  form.addEventListener("input", () => calculateOrderForm(form, contract?.items || [], balances));
  form.addEventListener("change", () => calculateOrderForm(form, contract?.items || [], balances));
  document.querySelector("#add-order-item").addEventListener("click", () => {
    if (!contract) return;
    const index = form.querySelectorAll("[data-order-item-row]").length;
    document.querySelector("#order-items").insertAdjacentHTML("beforeend", orderItemRow(contract.items, {}, index, balances));
    calculateOrderForm(form, contract.items, balances);
  });
  form.addEventListener("click", (event) => {
    if (!event.target.matches("[data-remove-order-item]")) return;
    if (form.querySelectorAll("[data-order-item-row]").length <= 1) {
      showToast("Order must have at least one item.", true);
      return;
    }
    event.target.closest("[data-order-item-row]").remove();
    calculateOrderForm(form, contract?.items || [], balances);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectOrderPayload(form);
    const stockLotId = Number(field(form, "stock_lot_id"));
    const allocatedQuantity = field(form, "stock_allocated_quantity");
    if (!payload.contract_id || !payload.order_number || !payload.order_date) {
      showToast("Shartnoma, buyurtma raqami va buyurtma sanasi majburiy.", true);
      return;
    }
    if (!payload.items.length) {
      showToast("Shartnomadan kamida bitta mahsulot qo'shing.", true);
      return;
    }
    if (payload.source_type === "supplier_held_stock" && (!stockLotId || !allocatedQuantity || numberValue(allocatedQuantity) <= 0)) {
      showToast("Ta'minotchi omboridagi zaxira uchun zaxira partiyasi va ajratiladigan miqdorni kiriting.", true);
      return;
    }
    const balanceMap = new Map(balances.map((balance) => [balance.contract_item_id, balance]));
    for (const item of payload.items) {
      const balance = balanceMap.get(item.contract_item_id);
      if (balance && numberValue(item.quantity) > numberValue(balance.remaining_quantity) && !order) {
        showToast(`${balance.product_name} bo'yicha shartnoma qoldig'i ${balance.remaining_quantity} ${balance.unit}.`, true);
        return;
      }
    }
    try {
      const saved = await api(order ? `/api/orders/${order.id}` : "/api/orders", {
        method: order ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      if (!order && payload.source_type === "supplier_held_stock" && stockLotId && allocatedQuantity) {
        const firstItem = saved.items?.[0];
        await api("/api/stock-allocations", {
          method: "POST",
          body: JSON.stringify({
            stock_lot_id: stockLotId,
            order_id: saved.id,
            order_item_id: firstItem?.id || null,
            allocated_quantity: allocatedQuantity,
          }),
        });
      }
      showToast(payload.source_type === "supplier_held_stock" ? "Buyurtma saqlandi va zaxira ajratildi." : "Buyurtma saqlandi.");
      navigate(`/orders/${saved.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  if (contract) calculateOrderForm(form, contract.items, balances);
}

async function renderOrdersList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Buyurtmalar yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/orders?${params.toString()}`);
  const activeCount = data.items.filter((order) => !["closed", "cancelled"].includes(order.status)).length;
  const editable = canEdit("sotuv");
  app.innerHTML = opsListPage({
    className: "orders-ops-page",
    title: "Buyurtmalar",
    tabs: [{ label: "Buyurtmalar", active: true }, { label: "Partiyalar", path: "/delivery-batches" }, { label: "Xaridlar", path: "/procurements" }, { label: "Hisoblar", path: "/customer-invoices" }],
    createPath: editable ? "/orders/new" : null,
    clearPath: "/orders",
    counter: `${fmt(data.total)} ta buyurtma · sahifada ${fmt(activeCount)} ta faol`,
    formId: "order-search-form",
    filters: `<input name="search" placeholder="Qidirish..." value="${esc(params.get("search") || "")}" /><input name="order_number" placeholder="Buyurtma raqami" value="${esc(params.get("order_number") || "")}" /><input name="client_name" placeholder="Mijoz" value="${esc(params.get("client_name") || "")}" /><select name="status"><option value="">Status</option>${orderStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`,
    headers: ["Buyurtma raqami", "Sana", "Mijoz", "Shartnoma", "Mahsulot", "Miqdor", "Yetkazilgan", "Qoldiq", "Manba", "Model", "Ta'minotchi", "Jami summa", "Status", ""],
    rows: data.items.map((order) => `<tr><td><button class="ops-primary-link" data-nav="/orders/${order.id}">${fmt(order.order_number)}</button></td><td>${fmt(order.order_date)}</td><td>${fmt(order.client?.name)}</td><td>${fmt(order.contract?.contract_number)}</td><td>${fmt(order.product)}</td><td>${fmtQty(order.total_quantity)}</td><td>${fmtQty(order.delivered_quantity)}</td><td class="${numberValue(order.remaining_quantity) > 0 ? "ops-warning" : ""}">${fmtQty(order.remaining_quantity)}</td><td>${fmt(optionLabel(sourceTypes, order.source_type))}</td><td>${fmt(optionLabel(fulfillmentTypes, order.fulfillment_type))}</td><td>${fmt(order.supplier_name)}</td><td class="ops-money">${fmtMoney(order.total_amount)}</td><td>${statusBadge(order.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/orders/${order.id}">Ochish</button><button class="link-btn" data-nav="/orders/${order.id}?tab=supplier">Ta'minotchi</button>${canEdit("yetkazib_berish") ? `<button class="link-btn" data-nav="/delivery-batches/new?order_id=${order.id}">Partiya</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Buyurtmalar topilmadi.",
    colspan: 14,
    footer: opsFooter(data, "order"),
  });
  bindOpsSearch("order-search-form", "/orders", ["search", "order_number", "client_name", "status"]);
  bindOpsPagination("order", "/orders");
}

async function renderNewOrder() {
  await renderOrderWizard();
}

function orderWizardStepper(step) {
  const steps = ["Shartnoma", "Mahsulot", "Manba", "Zaxira / Xarid", "Narx", "Tasdiqlash"];
  if (window.BitumFrontend?.components?.stepper) return window.BitumFrontend.components.stepper(steps, step);
  return `<div class="batch-wizard-stepper">${steps.map((label, index) => {
    const key = index + 1;
    const cls = key < step ? "completed" : key === step ? "current" : "upcoming";
    return `<div class="batch-wizard-step ${cls}"><span>${key}</span><strong>${label}</strong></div>`;
  }).join("")}</div>`;
}

async function orderWizardContractOptions(selectedId = null) {
  const data = await api("/api/contracts?page_size=100");
  return data.items
    .filter((contract) => ["active", "signed"].includes(contract.status) || Number(selectedId) === contract.id)
    .map((contract) => `<option value="${contract.id}" ${Number(selectedId) === contract.id ? "selected" : ""}>${esc(contract.contract_number)} - ${esc(contract.client?.name || "")}</option>`)
    .join("");
}

async function enrichOrderWizardContract(state, contractId) {
  state.contract = await api(`/api/contracts/${contractId}`);
  state.balances = await api(`/api/orders/contract/${contractId}/balances`);
  state.items = {};
  state.balances.forEach((balance) => {
    if (numberValue(balance.remaining_quantity) > 0) {
      state.items[balance.contract_item_id] = "";
    }
  });
  // Left blank on purpose: defaulting to the contract's last day made every
  // order look like it was due at the end of the contract.
  state.requiredDate = "";
  state.stockLotId = "";
  state.stockAllocatedQuantity = "";
}

function orderWizardTotals(state) {
  let quantity = 0;
  let subtotal = 0;
  let vat = 0;
  const selected = [];
  (state.balances || []).forEach((balance) => {
    const amount = numberValue(state.items?.[balance.contract_item_id]);
    if (amount <= 0) return;
    const rowSubtotal = amount * numberValue(balance.unit_price);
    const rowVat = rowSubtotal * numberValue(balance.vat_rate);
    const vatAmount = rowVat / 100;
    quantity += amount;
    subtotal += rowSubtotal;
    vat += vatAmount;
    selected.push({ ...balance, quantity: amount, subtotal: rowSubtotal, vat_amount: vatAmount, total_with_vat: rowSubtotal + vatAmount });
  });
  const markupAmount = numberValue(state.markupAmount);
  const markupPercent = subtotal ? (markupAmount / subtotal) * 100 : 0;
  const logistics = state.fulfillmentType === "company_managed_delivery" ? numberValue(state.logisticsPrice) : 0;
  return { quantity, subtotal, vat, markupPercent, markupAmount, logistics, total: subtotal + vat + markupAmount + logistics, selected };
}

function orderWizardContractSummary(state) {
  if (!state.contract) return `<div class="empty">Avval shartnomani tanlang.</div>`;
  const total = (state.balances || []).reduce((sum, item) => sum + numberValue(item.contract_quantity), 0);
  const ordered = (state.balances || []).reduce((sum, item) => sum + numberValue(item.ordered_quantity), 0);
  const remaining = (state.balances || []).reduce((sum, item) => sum + numberValue(item.remaining_quantity), 0);
  return `${remaining <= 0 ? workflowWarningsPanel(["Ushbu shartnoma bo'yicha buyurtma yaratish uchun qoldiq miqdor mavjud emas."]) : ""}${summaryCards([
    ["Shartnoma raqami", fmt(state.contract.contract_number)],
    ["Mijoz", fmt(state.contract.client?.name)],
    ["Shartnoma sanasi", fmt(state.contract.contract_date)],
    ["Amal qilish muddati", fmt(state.contract.valid_until)],
    ["Status", statusBadge(state.contract.status)],
    ["Shartnoma umumiy summasi", fmtMoney(state.contract.total_amount)],
    ["Shartnoma mahsulotlari", fmt((state.contract.items || []).map((item) => item.product_name).join(", "))],
    ["Jami miqdor", fmtQty(total, state.balances?.[0]?.unit)],
    ["Oldin buyurtma qilingan", fmtQty(ordered, state.balances?.[0]?.unit)],
    ["Qoldiq miqdor", fmtQty(remaining, state.balances?.[0]?.unit)],
  ])}${section("To'lov shartlari", state.contract.payment_terms ? detailList([["Avans foizi", `${fmt(state.contract.payment_terms.advance_percent)}%`], ["Avans muddati", `${fmt(state.contract.payment_terms.advance_due_days)} kun`], ["Qoldiq foizi", `${fmt(state.contract.payment_terms.remaining_percent)}%`], ["Qoldiq to'lov qoidasi", state.contract.payment_terms.remaining_payment_rule], ["Izoh", state.contract.payment_terms.notes]]) : `<div class="empty">To'lov shartlari kiritilmagan.</div>`)}`;
}

function orderWizardProductsTable(state) {
  if (!state.contract) return `<div class="empty">Mahsulot tanlash uchun avval shartnomani tanlang.</div>`;
  const rows = state.balances || [];
  return `${tableOrEmpty(rows, ["Mahsulot", "Shartnoma miqdori", "Oldin buyurtma qilingan", "Qoldiq", "Ushbu buyurtma", "Birlik narxi", "QQS %", "Qator jami"], (balance) => {
    const value = state.items?.[balance.contract_item_id] ?? "";
    const quantity = numberValue(value);
    const rowSubtotal = quantity * numberValue(balance.unit_price);
    const rowVat = rowSubtotal * numberValue(balance.vat_rate) / 100;
    const after = numberValue(balance.remaining_quantity) - quantity;
    return `<tr data-order-wizard-row="${balance.contract_item_id}"><td>${fmt(balance.product_name)}</td><td>${fmtQty(balance.contract_quantity, balance.unit)}</td><td>${fmtQty(balance.ordered_quantity, balance.unit)}</td><td>${fmtQty(balance.remaining_quantity, balance.unit)}</td><td><input data-order-wizard-qty="${balance.contract_item_id}" type="number" step="any" min="0" max="${esc(balance.remaining_quantity)}" value="${esc(value)}" /></td><td class="number-cell">${fmtMoney(balance.unit_price)}</td><td>${fmt(balance.vat_rate)}%</td><td class="number-cell"><span data-order-wizard-row-total="${balance.contract_item_id}">${fmtMoney(rowSubtotal + rowVat)}</span><br><small data-order-wizard-row-after="${balance.contract_item_id}">Keyingi qoldiq: ${fmtQty(after, balance.unit)}</small></td></tr>`;
  }, "Shartnoma mahsulotlari topilmadi.")}<p class="helper-text">Buyurtma miqdori shartnomadagi qoldiqdan oshmasligi kerak.</p>`;
}

function updateOrderWizardProductTotals(state, input) {
  state.items[input.dataset.orderWizardQty] = input.value;
  const balance = (state.balances || []).find((item) => String(item.contract_item_id) === String(input.dataset.orderWizardQty));
  if (!balance) return;
  const quantity = numberValue(input.value);
  const rowSubtotal = quantity * numberValue(balance.unit_price);
  const rowVat = rowSubtotal * numberValue(balance.vat_rate) / 100;
  const after = numberValue(balance.remaining_quantity) - quantity;
  const total = document.querySelector(`[data-order-wizard-row-total="${input.dataset.orderWizardQty}"]`);
  const afterNode = document.querySelector(`[data-order-wizard-row-after="${input.dataset.orderWizardQty}"]`);
  if (total) total.textContent = fmtMoney(rowSubtotal + rowVat);
  if (afterNode) afterNode.textContent = `Keyingi qoldiq: ${fmtQty(after, balance.unit)}`;
}

// The sum is what gets charged; the percent is shown only so the user can
// sanity-check it against the goods total.
function orderMarkupNote(totals) {
  if (!totals.subtotal) return "";
  if (!totals.markupAmount) {
    return `<p class="helper-text">Ustama qo'shilmasa bo'sh qoldiring.</p>`;
  }
  return `<p class="helper-text"><span>Mahsulot summasi:</span> <b data-noloc>${fmtMoney(totals.subtotal)}</b> · <span>ustama ulushi:</span> <b data-noloc>${totals.markupPercent.toFixed(2)}%</b></p>`;
}

function refreshOrderMarkupNote(state) {
  const note = orderMarkupNote(orderWizardTotals(state));
  document.querySelectorAll("[data-markup-note]").forEach((holder) => {
    holder.innerHTML = note;
    localizeDom(holder);
  });
}

function orderWizardSourcePanel(state) {
  const sourceHelp = state.sourceType === "supplier_held_stock"
    ? "Mahsulot bizga tegishli, lekin ta'minotchi omborida turadi. Keyingi bosqichda mavjud zaxiradan ajratiladi."
    : state.fulfillmentType === "company_managed_delivery"
      ? "Yetkazib berish kompaniya tomonidan boshqariladi. Partiya yaratilganda logistika yozuvi avtomatik ochiladi."
      : "Mahsulot ta'minotchidan mijozga to'g'ridan-to'g'ri yetkaziladi.";
  const totals = orderWizardTotals(state);
  return `<div class="grid">${selectField("source_type", "Manba turi", sourceTypes, state.sourceType, { required: true })}${selectField("fulfillment_type", "Yetkazib berish modeli", fulfillmentTypes, state.fulfillmentType, { required: true })}${moneyInputField("markup_amount", "Ustama summasi", state.markupAmount)}</div><div data-markup-note>${orderMarkupNote(totals)}</div><div class="empty compact">${sourceHelp}</div>`;
}

function orderWizardStockPanel(state) {
  if (state.sourceType !== "supplier_held_stock") {
    return `<div class="empty compact"><strong>Xarid jarayoni avtomatik ochiladi.</strong><br>Buyurtma saqlangandan keyin xarid jarayoni avtomatik ochiladi. Ta'minotchi Xaridlar bo'limida tanlanadi.</div>`;
  }
  const lots = state.stockLots || [];
  const totals = orderWizardTotals(state);
  return `${state.stockLotWarning ? workflowWarningsPanel([state.stockLotWarning]) : ""}${tableOrEmpty(lots, ["Mahsulot", "Ta'minotchi", "Joylashuv", "Ticket", "Mavjud miqdor", "Band qilingan", "Birlik xarid narxi", "Ajratiladigan miqdor"], (lot) => `<tr><td>${fmt(lot.product_name)}</td><td>${fmt(lot.supplier_name)}</td><td>${fmt(lot.location_name)}</td><td>${fmt(lot.ticket_number)}</td><td>${fmtQty(lot.quantity_available, lot.unit)}</td><td>${fmtQty(lot.quantity_reserved, lot.unit)}</td><td>${fmtMoney(lot.unit_cost)}</td><td><label class="inline-check"><input type="radio" name="stock_lot_id" value="${lot.id}" ${Number(state.stockLotId) === lot.id ? "checked" : ""} /> Tanlash</label></td></tr>`, "Mavjud zaxira topilmadi.")}<div class="grid">${textField("stock_allocated_quantity", "Ajratiladigan miqdor", state.stockAllocatedQuantity || totals.quantity || "", "number", { required: true })}</div><p class="helper-text">Ajratilgan miqdor buyurtma miqdoriga teng bo'lishi kerak. Mavjud zaxira yetarli bo'lmasa, qo'shimcha xarid talab qilinadi.</p>`;
}

function orderWizardPricePanel(state) {
  const totals = orderWizardTotals(state);
  const logisticsInput = state.fulfillmentType === "direct_supplier_to_customer"
    ? `<label>Logistika narxi<input name="logistics_price" value="0" disabled /></label>`
    : textField("logistics_price", "Logistika narxi", state.logisticsPrice, "number");
  return `<div class="grid">${moneyInputField("markup_amount", "Ustama summasi", state.markupAmount)}${logisticsInput}${textArea("notes", "Izoh", state.notes || "")}</div><div data-markup-note>${orderMarkupNote(totals)}</div>${summaryCards([["Mahsulot oraliq summasi", fmtMoney(totals.subtotal)], ["QQS", fmtMoney(totals.vat)], ["Ustama summasi", fmtMoney(totals.markupAmount)], ["Logistika narxi", state.fulfillmentType === "direct_supplier_to_customer" ? dash : fmtMoney(totals.logistics)], ["Jami summa", fmtMoney(totals.total)]])}<p class="helper-text">Logistika yozuvi partiya yaratilgandan keyin ochiladi.</p>`;
}

function orderWizardConfirmPanel(state) {
  const totals = orderWizardTotals(state);
  const lot = (state.stockLots || []).find((item) => Number(item.id) === Number(state.stockLotId));
  const productText = totals.selected.map((item) => `${item.product_name} - ${fmtQty(item.quantity, item.unit)}`).join(", ");
  const remainingText = totals.selected.map((item) => `${item.product_name}: ${fmtQty(numberValue(item.remaining_quantity) - numberValue(item.quantity), item.unit)}`).join(", ");
  return `<div class="confirm-grid">
    ${section("Shartnoma", detailList([["Shartnoma raqami", state.contract?.contract_number], ["Mijoz", state.contract?.client?.name], ["Amal qilish muddati", state.contract?.valid_until]]))}
    ${section("Mahsulot", detailList([["Mahsulot", productText], ["Miqdor", fmtQty(totals.quantity, totals.selected?.[0]?.unit)], ["Jami summa", fmtMoney(totals.subtotal + totals.vat)], ["Saqlangandan keyingi qoldiq", remainingText]]))}
    ${section("Manba va model", detailList([["Manba", optionLabel(sourceTypes, state.sourceType)], ["Yetkazib berish modeli", optionLabel(fulfillmentTypes, state.fulfillmentType)], ["Ustama summasi", fmtMoney(totals.markupAmount)]]))}
    ${section("Zaxira / Xarid", state.sourceType === "supplier_held_stock" ? detailList([["Zaxira partiyasi", lot?.ticket_number], ["Ta'minotchi", lot?.supplier_name], ["Ticket", lot?.ticket_number], ["Ajratilgan miqdor", fmtQty(state.stockAllocatedQuantity, lot?.unit)], ["Birlik xarid narxi", fmtMoney(lot?.unit_cost)]]) : `<div class="empty">Xarid jarayoni avtomatik ochiladi. Ta'minotchi holati: Tanlanmagan.</div>`)}
    ${section("Narx", detailList([["Mahsulot summasi", fmtMoney(totals.subtotal)], ["QQS", fmtMoney(totals.vat)], ["Logistika narxi", state.fulfillmentType === "direct_supplier_to_customer" ? dash : fmtMoney(totals.logistics)], ["Jami summa", fmtMoney(totals.total)]]))}
  </div>`;
}

// ---- "Mahsulot qachon kerak?" ----

function orderDateValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function orderDaysBetween(from, to) {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

// What the chosen date actually means, in words: how far away it is and
// whether it still falls inside the contract. A bare date box told the user
// none of that, so the field was easy to fill in wrongly.
function orderDateHuman(value) {
  // dd.mm.yyyy for this helper: the app-wide "2026 M08 25" is fine in a table
  // but unhelpful in a sentence explaining a deadline.
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

// What the chosen date actually means, in words: how far away it is and
// whether it still falls inside the contract. A bare date box told the user
// none of that, so the field was easy to fill in wrongly.
// Every translatable phrase sits in its own element -- glued to a date it
// would form a string the dictionary has no key for and would stay Latin.
function orderRequiredDateNote(state) {
  const value = state.requiredDate || "";
  const today = orderDateValue(new Date());
  const limit = state.contract?.valid_until || "";
  const limitPart = limit
    ? ` · <span>Shartnoma muddati:</span> <b data-noloc>${esc(orderDateHuman(limit))}</b>`
    : "";
  if (!value) {
    return `<span class="date-note">Mahsulot kerak bo'ladigan sanani tanlang.</span>`;
  }
  // Notices, not blocks: both cases happen in real deals, so they inform
  // rather than stop the order.
  if (value < today) {
    return `<span class="date-note warn"><span>Diqqat: bu sana bugundan oldin.</span>${limitPart}</span>`;
  }
  if (limit && value > limit) {
    return `<span class="date-note warn"><span>Diqqat: bu sana shartnoma muddatidan keyin.</span>${limitPart}</span>`;
  }
  const days = orderDaysBetween(today, value);
  const when = days === 0
    ? `<span>Bugun kerak</span>`
    : days === 1
      ? `<span>Ertaga kerak</span>`
      : `<span>Qolgan kun:</span> <b data-noloc>${days}</b>`;
  return `<span class="date-note ok"><b data-noloc>${esc(orderDateHuman(value))}</b> · ${when}${limitPart}</span>`;
}

function refreshOrderRequiredDateNote(state) {
  const holder = document.querySelector("[data-required-date-note]");
  if (!holder) return;
  holder.innerHTML = orderRequiredDateNote(state);
  localizeDom(holder);
}

function orderRequiredDateField(state) {
  return `<div class="order-date-field">
    <div class="order-date-head">
      <span class="field-label-text">Mahsulot qachon kerak? <span class="required-mark" aria-hidden="true">*</span></span>
      <span class="helper-text">Mijoz mahsulotni qaysi sanagacha kutmoqda</span>
    </div>
    <div class="order-date-controls">
      ${ruDateField("required_date", state.requiredDate || "", { required: true })}
    </div>
    <div data-required-date-note>${orderRequiredDateNote(state)}</div>
  </div>`;
}

function orderWizardBody(state) {
  if (state.step === 1) return section("Shartnoma tanlash", `${selectField("contract_id", "Shartnoma", [["", "Shartnomani tanlang"]], "", { required: true }).replace("</select>", `${state.contractOptions || ""}</select>`)}${orderWizardContractSummary(state)}`);
  if (state.step === 2) return section("Mahsulot va miqdor", `${orderRequiredDateField(state)}${orderWizardProductsTable(state)}`);
  if (state.step === 3) return section("Manba va yetkazib berish modeli", orderWizardSourcePanel(state));
  if (state.step === 4) return section("Zaxira / Xarid", orderWizardStockPanel(state));
  if (state.step === 5) return section("Narx va logistika", orderWizardPricePanel(state));
  return section("Tekshirish va yaratish", orderWizardConfirmPanel(state));
}

function orderWizardHtml(state) {
  return `<div class="page batch-wizard-page">
    <div class="page-header"><div class="page-title"><h1>Yangi buyurtma</h1><p>Shartnoma bo'yicha buyurtmani bosqichma-bosqich yarating.</p></div><div class="actions"><button class="btn" type="button" data-order-wizard-cancel>Bekor qilish</button></div></div>
    ${orderWizardStepper(state.step)}
    <form id="order-wizard-form">${orderWizardBody(state)}<div class="form-footer"><button type="button" class="btn" data-order-wizard-back ${state.step <= 1 ? "disabled" : ""}>Ortga</button>${state.step < 6 ? `<button type="button" class="btn primary" data-order-wizard-next>Keyingi</button>` : `<button type="submit" class="btn primary">Buyurtmani yaratish</button>`}</div></form>
  </div>`;
}

function validateOrderWizardStep(state, targetStep = state.step) {
  if (targetStep >= 1 && !state.contract) return "Shartnomani tanlang.";
  const remaining = (state.balances || []).reduce((sum, item) => sum + numberValue(item.remaining_quantity), 0);
  if (targetStep >= 1 && remaining <= 0) return "Ushbu shartnoma bo'yicha buyurtma yaratish uchun qoldiq miqdor mavjud emas.";
  const totals = orderWizardTotals(state);
  if (targetStep >= 2 && !totals.selected.length) return "Kamida bitta mahsulot uchun buyurtma miqdorini kiriting.";
  if (targetStep >= 2 && totals.selected.some((item) => numberValue(item.quantity) > numberValue(item.remaining_quantity))) return "Buyurtma miqdori shartnoma qoldig'idan oshmasligi kerak.";
  // The date only has to be present. Whether it sits before the contract date
  // or past its expiry is shown as a notice under the field, not enforced --
  // real orders do get agreed outside those bounds.
  if (targetStep >= 2 && !state.requiredDate) return "Mahsulot qachon kerakligini belgilang.";
  if (targetStep >= 3 && (!state.sourceType || !state.fulfillmentType)) return "Manba va yetkazib berish modelini tanlang.";
  if (targetStep >= 4 && state.sourceType === "supplier_held_stock") {
    const lot = (state.stockLots || []).find((item) => Number(item.id) === Number(state.stockLotId));
    if (totals.selected.length !== 1) return "Ta'minotchi omboridagi zaxira uchun bitta mahsulot tanlang.";
    if (!lot) return "Zaxira partiyasini tanlang.";
    if (numberValue(state.stockAllocatedQuantity) <= 0) return "Ajratiladigan miqdorni kiriting.";
    if (numberValue(state.stockAllocatedQuantity) > numberValue(lot.quantity_available)) return "Mavjud zaxira yetarli emas. Qo'shimcha xarid talab qilinadi.";
    if (numberValue(state.stockAllocatedQuantity) !== numberValue(totals.quantity)) return "Ajratilgan miqdor buyurtma miqdoriga teng bo'lishi kerak.";
  }
  if (targetStep >= 5 && numberValue(state.logisticsPrice) < 0) return "Logistika narxi manfiy bo'lishi mumkin emas.";
  return null;
}

function collectOrderWizardPayload(state) {
  const totals = orderWizardTotals(state);
  return {
    contract_id: state.contract.id,
    order_number: generatedOrderNumber(),
    order_date: state.orderDate,
    required_date: state.requiredDate,
    fulfillment_type: state.fulfillmentType,
    source_type: state.sourceType,
    markup_amount: normalizeNumberInputValue(state.markupAmount || "0"),
    logistics_price: state.fulfillmentType === "direct_supplier_to_customer" ? 0 : normalizeNumberInputValue(state.logisticsPrice || 0),
    notes: state.notes || null,
    items: totals.selected.map((item) => ({
      contract_item_id: item.contract_item_id,
      quantity: normalizeNumberInputValue(item.quantity),
      unit_price: normalizeNumberInputValue(item.unit_price),
      vat_rate: normalizeNumberInputValue(item.vat_rate),
    })),
  };
}

async function renderOrderWizard() {
  const params = new URLSearchParams(location.search);
  const preselectedContractId = params.get("contract_id") ? Number(params.get("contract_id")) : null;
  const state = {
    step: 1,
    orderDate: new Date().toISOString().slice(0, 10),
    sourceType: params.get("source_type") || "other",
    fulfillmentType: "direct_supplier_to_customer",
    markupAmount: "",
    logisticsPrice: "0",
    stockLots: [],
    preselectedStockLotId: params.get("stock_lot_id") || "",
    stockLotWarning: "",
  };
  state.contractOptions = await orderWizardContractOptions(preselectedContractId);
  if (preselectedContractId) {
    await enrichOrderWizardContract(state, preselectedContractId);
  }

  async function loadStockLots() {
    const products = orderWizardTotals(state).selected.map((item) => item.product_name);
    const selectedItem = orderWizardTotals(state).selected[0];
    const query = new URLSearchParams({ available_only: "true", page_size: "100" });
    if (products.length === 1) query.set("product_name", products[0]);
    state.stockLots = (await api(`/api/stock-lots?${query.toString()}`)).items;
    state.stockLotWarning = "";
    if (!state.preselectedStockLotId) return;
    const selectedLot = await api(`/api/stock-lots/${state.preselectedStockLotId}`).catch(() => null);
    if (!selectedLot || products.length !== 1) return;
    const sameProduct = selectedLot.product_name?.trim().toLowerCase() === selectedItem?.product_name?.trim().toLowerCase();
    const sameUnit = selectedLot.unit?.trim().toLowerCase() === selectedItem?.unit?.trim().toLowerCase();
    if (!sameProduct || !sameUnit) {
      state.stockLotWarning = `Tanlangan zaxira (${selectedLot.product_name}, ${selectedLot.unit}) buyurtma mahsulotiga mos emas (${selectedItem?.product_name}, ${selectedItem?.unit}).`;
      return;
    }
    if (!state.stockLots.some((lot) => Number(lot.id) === Number(selectedLot.id))) state.stockLots.unshift(selectedLot);
    state.stockLotId = String(selectedLot.id);
    if (!numberValue(state.stockAllocatedQuantity)) state.stockAllocatedQuantity = String(Math.min(numberValue(selectedItem.quantity), numberValue(selectedLot.quantity_available)));
  }

  async function draw() {
    app.innerHTML = orderWizardHtml(state);
    const form = document.querySelector("#order-wizard-form");
    form.elements.contract_id?.addEventListener("change", async () => {
      const contractId = Number(form.elements.contract_id.value);
      if (!contractId) return;
      await enrichOrderWizardContract(state, contractId);
      state.contractOptions = await orderWizardContractOptions(contractId);
      await draw();
    });
    form.querySelectorAll("[data-order-wizard-qty]").forEach((input) => input.addEventListener("input", () => {
      updateOrderWizardProductTotals(state, input);
    }));
    bindRuDateFields(document);
    form.elements.required_date?.addEventListener("input", () => {
      state.requiredDate = form.elements.required_date.value;
      refreshOrderRequiredDateNote(state);
    });

    form.elements.source_type?.addEventListener("change", async () => {
      state.sourceType = form.elements.source_type.value;
      // Russian direct supply carries a 5% markup by default; offered as a
      // ready-made sum so the user can still overwrite it.
      if (state.sourceType === "russia_direct" && !numberValue(state.markupAmount)) {
        state.markupAmount = String(Math.round(orderWizardTotals(state).subtotal * 0.05));
      }
      if (state.sourceType === "supplier_held_stock") await loadStockLots();
      await draw();
    });
    form.elements.fulfillment_type?.addEventListener("change", async () => {
      state.fulfillmentType = form.elements.fulfillment_type.value;
      if (state.fulfillmentType === "direct_supplier_to_customer") state.logisticsPrice = "0";
      await draw();
    });
    form.elements.markup_amount?.addEventListener("input", () => {
      state.markupAmount = form.elements.markup_amount.value;
      refreshOrderMarkupNote(state);
    });
    form.querySelectorAll("[name='stock_lot_id']").forEach((input) => input.addEventListener("change", () => { state.stockLotId = input.value; }));
    form.elements.stock_allocated_quantity?.addEventListener("input", () => { state.stockAllocatedQuantity = form.elements.stock_allocated_quantity.value; });
    form.elements.logistics_price?.addEventListener("input", () => { state.logisticsPrice = form.elements.logistics_price.value; });
    form.elements.notes?.addEventListener("input", () => { state.notes = form.elements.notes.value; });
    document.querySelector("[data-order-wizard-cancel]")?.addEventListener("click", () => navigate("/orders"));
    document.querySelector("[data-order-wizard-back]")?.addEventListener("click", async () => {
      if (state.step > 1) {
        state.step -= 1;
        await draw();
      }
    });
    document.querySelector("[data-order-wizard-next]")?.addEventListener("click", async () => {
      const error = validateOrderWizardStep(state, state.step);
      if (error) {
        showToast(error, true);
        return;
      }
      if (state.step === 3 && state.sourceType === "supplier_held_stock") await loadStockLots();
      state.step += 1;
      await draw();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = validateOrderWizardStep(state, 6);
      if (error) {
        showToast(error, true);
        return;
      }
      try {
        const saved = await api("/api/orders", { method: "POST", body: JSON.stringify(collectOrderWizardPayload(state)) });
        if (state.sourceType === "supplier_held_stock") {
          const firstItem = saved.items?.[0];
          await api("/api/stock-allocations", {
            method: "POST",
            body: JSON.stringify({
              stock_lot_id: Number(state.stockLotId),
              order_id: saved.id,
              order_item_id: firstItem?.id || null,
              allocated_quantity: normalizeNumberInputValue(state.stockAllocatedQuantity),
            }),
          });
        }
        showToast(state.sourceType === "supplier_held_stock" ? "Buyurtma yaratildi va zaxira ajratildi." : "Buyurtma yaratildi. Xarid jarayoni avtomatik ochildi.");
        navigate(`/orders/${saved.id}`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }
  await draw();
}

async function renderEditOrder(id) {
  app.innerHTML = `<div class="page"><div class="empty">Loading order...</div></div>`;
  const order = await api(`/api/orders/${id}`);
  app.innerHTML = await orderForm(order);
  await bindOrderForm(order);
}

function orderHeader(order, related = {}) {
  const isStockOrder = order.source_type === "supplier_held_stock";
  const hasStockAllocation = Boolean(related.allocations?.length);
  const supplierReady = isStockOrder ? hasStockAllocation : (Boolean(order.supplier_name) || ["selected", "confirmed"].includes(order.supplier_status));
  const delivered = numberValue(order.summary?.delivered_quantity);
  const remaining = numberValue(order.summary?.remaining_quantity);
  const finance = orderFinanceSummary(related.invoices || []);
  const nextAction = orderNextAction(order, related);
  const supplyLabel = isStockOrder
    ? (hasStockAllocation ? { label: "Zaxiradan ajratilgan", tone: "success" } : { label: "Zaxira kutilmoqda", tone: "warning" })
    : order.supplier_name ? { label: "Ta'minotchi tanlangan", tone: "success" } : { label: "Ta'minotchi tanlanmagan", tone: "warning" };
  const editable = canEdit("sotuv");
  return `
    ${workflowHeader({
      title: order.order_number,
      subtitle: subtitleLine([{value:order.client?.name,raw:true},{value:order.contract?.contract_number,raw:true},{value:optionLabel(sourceTypes, order.source_type)},{value:optionLabel(fulfillmentTypes, order.fulfillment_type)}]),
      backPath: "/orders",
      fullEditPath: editable ? `/orders/${order.id}/edit` : "",
      actions: [
        editable ? { label: "Istisno status", modal: "order-status" } : null,
        isStockOrder ? (canEdit("taminot") ? { label: "Zaxiradan ajratish", modal: "order-stock" } : null) : (editable ? { label: "Ta'minotchini tanlash", modal: "order-supplier-select" } : null),
        canEdit("yetkazib_berish") ? { label: "Partiya yaratish", modal: "order-batch", primary: supplierReady } : null,
        canEdit("moliya") ? { label: "Hisob yaratish", modal: "order-invoice" } : null,
        editable ? { label: "Hujjat yuklash", modal: "order-document" } : null,
      ].filter(Boolean),
    })}
    ${workflowStatusGrid([
      ["Buyurtma holati", statusBadge(order.status)],
      ["Xarid / Zaxira holati", statusChip(supplyLabel)],
      ["Partiyalar holati", statusChip(remaining <= 0 && delivered > 0 ? { label: "To'liq yetkazilgan", tone: "success" } : delivered > 0 ? { label: "Qisman yetkazilgan", tone: "warning" } : { label: "Partiya kutilmoqda", tone: "muted" })],
      ["Moliya holati", statusChip(orderFinanceStatusChip(finance))],
    ])}
    ${summaryCards([
      ["Jami miqdor", fmtQty(order.summary?.total_quantity)],
      ["Jami summa", fmtMoney(order.summary?.total_amount)],
      ["Yetkazilgan", fmtQty(order.summary?.delivered_quantity)],
      ["Qoldiq", fmtQty(order.summary?.remaining_quantity)],
      ["Ta'minotchi", fmt(order.supplier_name)],
      ["Model", fmt(optionLabel(fulfillmentTypes, order.fulfillment_type))],
      ["Logistika narxi", order.fulfillment_type === "direct_supplier_to_customer" ? dash : fmtMoney(order.logistics_price)],
      ["Oxirgi faollik", dash],
    ])}
    ${workflowWarningsPanel(orderWarningMessages(order, related))}
    ${contractPriceCheckHtml(order)}
    ${nextAction.done || !nextAction.modal || canEdit(orderActionModule(nextAction.modal)) ? workflowNextActionPanel(nextAction) : workflowNextActionPanel({ title: nextAction.title })}
  `;
}

function orderActionModule(modal) {
  const map = {
    "order-batch": "yetkazib_berish",
    "order-stock": "taminot",
    "order-supplier-offer": "sotuv",
    "order-supplier-select": "sotuv",
    "order-invoice": "moliya",
    "order-payment": "moliya",
    "order-document": "sotuv",
    "order-status": "sotuv",
  };
  return map[modal] || "sotuv";
}

// Says where the difference comes from, because the three causes need
// different answers: a line price that disagrees with the contract is a
// mistake, a markup is a decision, and a logistics charge is fair only when the
// contract says transport is invoiced separately.
function contractPriceCheckHtml(order) {
  const check = order.contract_check;
  if (!check) return "";
  const excess = numberValue(check.excess_amount);
  const rows = [
    ["Shartnoma bo'yicha mahsulot summasi", fmtMoney(check.contract_goods_amount)],
    ["Buyurtmadagi mahsulot summasi", fmtMoney(check.order_goods_amount)],
    ["Ustama", fmtMoney(check.markup_amount)],
    [check.transport_separate ? "Logistika (shartnomada alohida)" : "Logistika (shartnoma narxiga kiritilgan)", fmtMoney(check.logistics_price)],
    ["Mijozdan undiriladigan jami", fmtMoney(check.charged_total)],
    ["Shartnoma asoslaydigan summa", fmtMoney(check.contract_supported_total)],
  ];
  const verdict = Math.abs(excess) < 1
    ? statusChip({ label: "Shartnoma narxiga mos", tone: "success" })
    : statusChip({ label: `${check.excess_percent}% farq`, tone: "danger" });
  return section("Shartnoma narxi bilan solishtirish", `
    <div class="detail-list">
      ${rows.map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${value}</strong></div>`).join("")}
      <div class="detail-item"><span>Farq</span><strong>${fmtMoney(check.excess_amount)} ${verdict}</strong></div>
    </div>
    ${check.lines.some((line) => !line.linked) ? `<p class="form-hint">Ba'zi qatorlar shartnoma qatoriga bog'lanmagan — ular shartnomada ko'zda tutilmagan.</p>` : ""}
  `);
}

function orderWarningMessages(order = {}, related = {}) {
  const warnings = [];
  // The contract fixes the price; the order adds a markup and a logistics
  // charge on top and the invoice is raised from the order total. Nothing used
  // to compare the two, so the difference reached the customer unremarked.
  (order.contract_check?.warnings || []).forEach((message) => warnings.push(message));
  if (order.source_type === "supplier_held_stock") {
    if (!related.allocations?.length) warnings.push("Mavjud zaxiradan ajratma hali kiritilmagan.");
  } else {
    if (!order.supplier_name) warnings.push("Ta'minotchi hali tanlanmagan.");
    if (!order.supplier_options?.length) warnings.push("Ta'minotchi takliflari hali kiritilmagan.");
  }
  if (numberValue(order.summary?.remaining_quantity) > 0) warnings.push("Buyurtma to'liq yetkazilmagan.");
  if (!(related.invoices || []).length) warnings.push("Mijoz hisob-fakturasi yaratilmagan.");
  if (!hasDocs(order)) warnings.push("Buyurtma hujjatlari yuklanmagan.");
  return warnings;
}

function orderFinanceSummary(invoices = []) {
  const active = invoices.filter((invoice) => invoice.status !== "cancelled");
  const total = active.reduce((sum, invoice) => sum + numberValue(invoice.total_amount), 0);
  const paid = active.reduce((sum, invoice) => sum + numberValue(invoice.paid_amount), 0);
  const remaining = active.reduce((sum, invoice) => sum + numberValue(invoice.remaining_amount), 0);
  const overdue = active.some((invoice) => numberValue(invoice.remaining_amount) > 0 && invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10));
  return { invoices: active, total, paid, remaining, overdue };
}

function orderFinanceStatusChip(finance = {}) {
  if (!finance.invoices?.length) return { label: "Hisob yaratilmagan", tone: "warning" };
  if (finance.overdue) return { label: "Kechikkan", tone: "warning" };
  if (finance.remaining <= 0) return { label: "To'langan", tone: "success" };
  if (finance.paid > 0) return { label: "Qisman to'langan", tone: "warning" };
  return { label: "To'lov kutilmoqda", tone: "warning" };
}

function orderNextAction(order = {}, related = {}) {
  if (order.source_type === "supplier_held_stock") {
    if (related.allocations?.length && numberValue(order.summary?.remaining_quantity) > 0) return { title: "Partiya yarating", button: "Partiya yaratish", modal: "order-batch" };
    if (!related.allocations?.length) return { title: "Mavjud zaxiradan ajrating", button: "Zaxiradan ajratish", modal: "order-stock" };
  }
  if (order.source_type !== "supplier_held_stock" && !order.supplier_options?.length) return { title: "Ta'minotchi taklifini qo'shing", button: "Taklif qo'shish", modal: "order-supplier-offer" };
  if (order.source_type !== "supplier_held_stock" && !order.supplier_name) return { title: "Ta'minotchini tanlang", button: "Ta'minotchini tanlash", modal: "order-supplier-select" };
  if (numberValue(order.summary?.remaining_quantity) > 0) return { title: "Qoldiq miqdor uchun partiya yarating", button: "Partiya yaratish", modal: "order-batch" };
  if (!(related.invoices || []).length) return { title: "Mijoz hisob-fakturasini yarating", button: "Hisob yaratish", modal: "order-invoice" };
  const finance = orderFinanceSummary(related.invoices || []);
  if (finance.remaining > 0) return { title: "To'lovni kiriting", button: "To'lov qo'shish", modal: "order-payment" };
  if (!hasDocs(order)) return { title: "Buyurtma hujjatini yuklang", button: "Hujjat yuklash", modal: "order-document" };
  return { title: "Buyurtma yopishga tayyor", button: "Tarixni ko'rish", path: `/orders/${order.id}?tab=notes`, done: true };
}

function openOrderStatusForm(order) {
  const exceptionStatuses = [["created", "Avtomatik statusga qaytarish"], ["on_hold", "To'xtatib turish"], ["cancelled", "Bekor qilish"]];
  app.innerHTML = `<div class="page">${orderHeader(order)}${section("Statusni o'zgartirish", `<form id="order-status-form"><div class="grid">${readonlyField("current_status", "Joriy status", optionLabel(orderStatuses, order.status))}${selectField("status", "Yangi status", exceptionStatuses, order.status === "on_hold" || order.status === "cancelled" ? order.status : "created")}</div><div class="form-footer"><button type="button" class="btn" data-nav="/orders/${order.id}">Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div></form>`)}</div>`;
  document.querySelector("#order-status-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: field(event.currentTarget, "status") }),
      });
      showToast("Status yangilandi.");
      navigate(`/orders/${order.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function orderTabs(active) {
  const items = [["general", "Umumiy"], ["products", "Mahsulotlar"], ["supplier", "Zaxira / Xarid"], ["batches", "Partiyalar"], ["price", "Moliya"], ["documents", "Hujjatlar"], ["notes", "Tarix"]];
  return workflowTabs(active, items, "order-tab");
}

function orderGeneralTab(order) {
  return section("Umumiy ma'lumotlar", `${detailList([
    ["Buyurtma raqami", order.order_number], ["Shartnoma", order.contract?.contract_number], ["Mijoz", order.client?.name], ["Buyurtma sanasi", order.order_date], ["Talab qilingan sana", order.required_date], ["Holat", optionLabel(orderStatuses, order.status)], ["Manba", optionLabel(sourceTypes, order.source_type)], ["Yetkazib berish modeli", optionLabel(fulfillmentTypes, order.fulfillment_type)], ["Izoh", order.notes], ["Yaratilgan", fmtDate(order.created_at)], ["Yangilangan", fmtDate(order.updated_at)]
  ])}${section("Jarayon tarixi", workflowTimeline([["Yaratildi", fmtDate(order.created_at)], ["Ta'minotchi holati", optionLabel(supplierStatuses, order.supplier_status)], ["Yetkazilgan", fmtQty(order.summary?.delivered_quantity)], ["Qoldiq", fmtQty(order.summary?.remaining_quantity)], ["Yangilangan", fmtDate(order.updated_at)]]))}`);
}

function orderProductsTab(order) {
  const editable = canEdit("sotuv");
  return section("Mahsulotlar", `
    ${editable ? `<div class="actions"><button class="btn" data-nav="/orders/${order.id}/edit">Amallar → To'liq tahrirlash</button></div>` : ""}
    ${tableOrEmpty(order.items, ["Mahsulot", "Birlik", "Buyurtma miqdori", "Shartnoma qoldig'i", "Birlik narxi", "QQS", "Jami"], (item) => `
      <tr><td>${fmt(item.product_name)}</td><td>${fmt(item.unit)}</td><td>${fmtQty(item.quantity, item.unit)}</td><td>${item.balance ? fmtQty(item.balance.remaining_quantity, item.unit) : dash}</td><td>${fmtMoney(item.unit_price)}</td><td>${fmtMoney(item.vat_amount)} (${fmt(item.vat_rate)}%)</td><td>${fmtMoney(item.total_with_vat)}</td></tr>
    `, "Mahsulotlar hali kiritilmagan.")}
  `);
}

function orderSupplierTab(order, related = {}) {
  const editable = canEdit("sotuv");
  if (order.source_type === "supplier_held_stock") {
    const allocations = related.allocations || [];
    const lotsById = new Map((related.stockLots || []).map((lot) => [lot.id, lot]));
    return section("Zaxira / Xarid", `
      ${detailList([["Manba", optionLabel(sourceTypes, order.source_type)], ["Zaxira holati", allocations.length ? "Zaxiradan ajratilgan" : "Zaxira ajratilmagan"], ["Ta'minotchi", order.supplier_name]])}
      ${canEdit("taminot") ? `<div class="actions"><button class="btn primary" type="button" data-order-stock>Zaxiradan ajratish</button></div>` : ""}
      ${tableOrEmpty(allocations, ["Mahsulot", "Ta'minotchi", "Ticket", "Joylashuv", "Ajratilgan miqdor", "Birlik xarid narxi", "Status"], (allocation) => {
        const lot = lotsById.get(allocation.stock_lot_id) || {};
        return `<tr><td>${fmt(lot.product_name)}</td><td>${fmt(lot.supplier_name)}</td><td>${fmt(lot.ticket_number)}</td><td>${fmt(lot.location_name)}</td><td>${fmtQty(allocation.allocated_quantity, lot.unit)}</td><td>${fmtMoney(lot.unit_cost)}</td><td>${fmt(optionLabel(stockAllocationStatuses, allocation.status))}</td></tr>`;
      }, "Bu buyurtma uchun zaxira ajratilmagan.")}
      <p class="helper-text">Ta'minotchi omboridagi zaxira uchun ta'minotchi taklifi talab qilinmaydi.</p>
    `);
  }
  return section("Xarid jarayoni", `
    ${detailList([["Ta'minotchi holati", optionLabel(supplierStatuses, order.supplier_status)], ["Tanlangan ta'minotchi", order.supplier_name], ["Izoh", order.supplier_notes]])}
    ${editable ? `<div class="actions"><button class="btn primary" type="button" data-order-supplier-offer>Ta'minotchi taklifini qo'shish</button><button class="btn" type="button" data-order-supplier-select>Ta'minotchini tanlash</button></div>` : ""}
    ${tableOrEmpty(order.supplier_options, ["Ta'minotchi", "Birlik xarid narxi", "Mavjud miqdor", "Tayyor sana", "Yetkazib berish shartlari", "Izoh", "Tanlov", "Amallar"], (item) => `
      <tr><td>${fmt(item.supplier_name)}</td><td>${fmtMoney(item.offered_price)}</td><td>${fmtQty(item.available_quantity)}</td><td>${fmt(item.ready_date)}</td><td>${fmt(item.delivery_terms)}</td><td>${fmt(item.comment)}</td><td>${item.is_selected ? '<span class="pill">Tanlangan</span>' : dash}</td><td><div class="table-actions">${editable ? `<button class="link-btn" data-order-select="${item.id}">Tanlash</button><button class="link-btn" data-order-confirm="${item.id}">Tasdiqlash</button><button class="link-btn" data-order-edit="supplier-options" data-id="${item.id}">Tahrirlash</button><button class="link-btn" data-order-delete="supplier-options" data-id="${item.id}">O'chirish</button>` : ""}</div></td></tr>
    `, "Ta'minotchi takliflari hali kiritilmagan.")}
  `);
}

function orderPriceTab(order) {
  return orderFinanceTab(order, {});
}

function orderDocumentsTab(order) {
  const editable = canEdit("sotuv");
  return section("Hujjatlar", `
    ${editable ? `<div class="actions"><button class="btn primary" type="button" data-order-document>Hujjat yuklash</button><button class="btn" data-order-child="documents">Hujjat ma'lumotini qo'shish</button></div>` : ""}
    ${tableOrEmpty(order.documents, ["Hujjat nomi", "Turi", "Yuklangan sana", "Yuklagan", "Amallar"], (item) => `
      <tr><td>${fmt(item.title)}</td><td>${fmt(optionLabel(orderDocumentTypes, item.document_type))}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td><td><div class="table-actions">${item.file_url ? `<a class="link-btn" target="_blank" href="${esc(item.file_url)}">Ko'rish</a><a class="link-btn" href="${esc(item.file_url)}" download>Yuklab olish</a>` : `<button class="link-btn" disabled>Ko'rish</button><button class="link-btn" disabled>Yuklab olish</button>`}${editable ? `<button class="link-btn" data-order-edit="documents" data-id="${item.id}">Tahrirlash</button><button class="link-btn" data-order-delete="documents" data-id="${item.id}">O'chirish</button>` : ""}</div></td></tr>
    `, "Buyurtma hujjatlari hali yuklanmagan.")}
  `);
}

function orderNotesTab(order) {
  const editable = canEdit("sotuv");
  return section("Tarix", `
    ${editable ? `<div class="actions"><button class="btn primary" data-order-child="notes">Izoh qo'shish</button></div>` : ""}
    ${tableOrEmpty(order.notes_history, ["Sana", "Foydalanuvchi", "Izoh", "Amal"], (item) => `<tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td><td>${editable ? `<button class="link-btn" data-order-delete="notes" data-id="${item.id}">O'chirish</button>` : ""}</td></tr>`, "Tarix yozuvlari hali yo'q.")}
  `);
}

function orderBatchesTab(order, batches = []) {
  return section("Partiyalar", `
    ${canEdit("yetkazib_berish") ? `<div class="actions"><button class="btn primary" type="button" data-order-batch>Partiya yaratish</button></div>` : ""}
    ${tableOrEmpty(batches, ["Partiya raqami", "Sana", "Mahsulot", "Reja", "Yuklangan", "Qabul qilingan", "Farq", "Ta'minotchi", "Status", "Amallar"], (batch) => `
      <tr>
        <td><strong>${fmt(batch.batch_number)}</strong></td>
        <td>${fmt(batch.batch_date)}</td>
        <td>${fmt(batch.product)}</td>
        <td>${fmtQty(batch.total_planned_quantity)}</td>
        <td>${fmtQty(batch.total_loaded_quantity)}</td>
        <td>${fmtQty(batch.total_accepted_quantity)}</td>
        <td>${fmtQty(batch.total_difference_quantity)}</td>
        <td>${fmt(batch.supplier_name)}</td>
        <td>${fmt(optionLabel(batchStatuses, batch.status))}</td>
        <td><div class="table-actions"><button class="link-btn" data-nav="/delivery-batches/${batch.id}">Ochish</button><button class="link-btn" data-nav="/delivery-batches/${batch.id}/edit">To'liq tahrirlash</button></div></td>
      </tr>
    `, "Partiyalar hali yaratilmagan.")}
  `);
}

function orderFinanceTab(order, related = {}) {
  const invoices = related.invoices || [];
  const payments = related.payments || [];
  const finance = orderFinanceSummary(invoices);
  return section("Moliya", `
    ${summaryCards([
      ["Buyurtma jami", fmtMoney(order.total_amount)],
      ["Hisob-fakturalar", fmtMoney(finance.total)],
      ["To'langan", fmtMoney(finance.paid)],
      ["Qoldiq", fmtMoney(finance.remaining)],
      ["Moliya holati", statusChip(orderFinanceStatusChip(finance))],
    ])}
    ${canEdit("moliya") ? `<div class="actions"><button class="btn primary" type="button" data-order-invoice>Hisob yaratish</button><button class="btn" type="button" data-order-payment>To'lov qo'shish</button></div>` : ""}
    ${tableOrEmpty(invoices, ["Hisob raqami", "Turi", "Hisob sanasi", "To'lov muddati", "Jami", "To'langan", "Qoldiq", "Status", "Amallar"], (invoice) => `
      <tr><td>${fmt(invoice.invoice_number)}</td><td>${fmt(optionLabel(invoiceTypes, invoice.invoice_type))}</td><td>${fmt(invoice.invoice_date)}</td><td>${fmt(invoice.due_date)}</td><td>${fmtMoney(invoice.total_amount)}</td><td>${fmtMoney(invoice.paid_amount)}</td><td>${fmtMoney(invoice.remaining_amount)}</td><td>${statusBadge(invoice.status)}</td><td><button class="link-btn" data-nav="/customer-invoices/${invoice.id}">Ochish</button></td></tr>
    `, "Ushbu buyurtma bo'yicha hisob-fakturalar topilmadi.")}
    <h3 class="section-subtitle">To'lovlar</h3>
    ${tableOrEmpty(payments, ["Hisob", "To'lov", "Taqsimlangan summa", "Yaratilgan"], (payment) => `
      <tr><td>${fmt(payment.invoice_number)}</td><td>${fmt(payment.payment_number)}</td><td>${fmtMoney(payment.allocated_amount)}</td><td>${fmtDate(payment.created_at)}</td></tr>
    `, "Ushbu buyurtma bo'yicha to'lovlar topilmadi.")}
  `);
}

function renderOrderActiveTab(order, active, related = {}) {
  if (active === "products") return orderProductsTab(order);
  if (active === "supplier") return orderSupplierTab(order, related);
  if (active === "batches") return orderBatchesTab(order, related.batches || []);
  if (active === "price") return orderFinanceTab(order, related);
  if (active === "documents") return orderDocumentsTab(order);
  if (active === "notes") return orderNotesTab(order);
  return orderGeneralTab(order);
}

async function orderChildForm(order, kind, item = {}) {
  if (kind === "supplier-options") {
    const data = await api("/api/suppliers?page_size=100");
    const supplierOptions = data.items.map((supplier) => {
      const label = `${supplier.name}${supplier.inn ? ` - ${supplier.inn}` : ""}`;
      return `<option value="${supplier.id}" data-name="${esc(supplier.name)}" ${Number(item.supplier_id) === supplier.id ? "selected" : ""}>${esc(label)}</option>`;
    }).join("");
    const defaultQuantity = item.available_quantity ?? order.summary?.remaining_quantity ?? order.summary?.total_quantity ?? "";
    const defaultReadyDate = item.ready_date || order.required_date || "";
    return {
      title: item.id ? "Edit supplier option" : "Add supplier option",
      tab: "supplier",
      path: "supplier-options",
      body: `
        <div class="grid">
          <label>Supplier
            <select name="supplier_select">
              <option value="">Select supplier</option>
              ${supplierOptions}
            </select>
          </label>
          <input type="hidden" name="supplier_id" value="${esc(item.supplier_id || "")}" />
          <input type="hidden" name="supplier_name" value="${esc(item.supplier_name || "")}" />
          <input type="hidden" name="supplier_id_display" value="${esc(item.supplier_id || "")}" />
          ${textField("offered_price", "Offered price", item.offered_price || "", "number")}
          ${textField("available_quantity", "Available quantity", defaultQuantity, "number")}
          ${textField("ready_date", "Ready date", defaultReadyDate, "date")}
          ${textArea("delivery_terms", "Delivery terms", item.delivery_terms)}
          ${textArea("comment", "Comment", item.comment)}
          ${checkField("is_selected", "Selected", item.is_selected)}
        </div>
      `,
      bind: (form) => {
        const syncSupplier = () => {
          const selected = form.elements.supplier_select.selectedOptions[0];
          form.elements.supplier_id.value = selected?.value || "";
          form.elements.supplier_name.value = selected?.dataset.name || "";
          form.elements.supplier_id_display.value = selected?.value || "";
        };
        form.elements.supplier_select.addEventListener("change", syncSupplier);
        syncSupplier();
      },
      payload: (form) => ({
        supplier_id: field(form, "supplier_id") ? Number(field(form, "supplier_id")) : null,
        supplier_name: field(form, "supplier_name"),
        offered_price: field(form, "offered_price"),
        available_quantity: field(form, "available_quantity"),
        ready_date: field(form, "ready_date"),
        delivery_terms: field(form, "delivery_terms"),
        comment: field(form, "comment"),
        is_selected: field(form, "is_selected"),
      }),
    };
  }
  if (kind === "documents") {
    return { title: item.id ? "Hujjatni tahrirlash" : "Hujjat qo'shish", tab: "documents", path: "documents", body: `<div class="grid">${selectField("document_type", "Hujjat turi", orderDocumentTypes, item.document_type || "other")}${textField("title", "Hujjat nomi", item.title)}${textField("file_url", "Fayl havolasi", item.file_url)}${textField("uploaded_by", "Yuklagan", item.uploaded_by)}</div>`, payload: (form) => ({ document_type: field(form, "document_type"), title: field(form, "title"), file_url: field(form, "file_url"), uploaded_by: field(form, "uploaded_by") }) };
  }
  return { title: "Izoh qo'shish", tab: "notes", path: "notes", body: `<div class="grid">${textArea("note", "Izoh", item.note)}${textField("created_by", "Foydalanuvchi", item.created_by)}</div>`, payload: (form) => ({ note: field(form, "note"), created_by: field(form, "created_by") }) };
}

async function openOrderChildForm(order, kind, item = {}) {
  const cfg = await orderChildForm(order, kind, item);
  app.innerHTML = `<div class="page">${orderHeader(order)}${section(cfg.title, `<form id="order-child-form">${cfg.body}<div class="form-footer"><button type="button" class="btn" data-nav="/orders/${order.id}?tab=${cfg.tab}">Bekor qilish</button><button type="submit" class="btn primary">Saqlash</button></div></form>`)}</div>`;
  const form = document.querySelector("#order-child-form");
  if (cfg.bind) cfg.bind(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (kind === "supplier-options" && !field(event.currentTarget, "supplier_id")) {
      showToast("Select supplier", true);
      return;
    }
    const path = item.id ? `/api/orders/${order.id}/${cfg.path}/${item.id}` : `/api/orders/${order.id}/${cfg.path}`;
    try {
      await api(path, { method: item.id ? "PATCH" : "POST", body: JSON.stringify(cfg.payload(event.currentTarget)) });
      showToast("Saqlandi.");
      navigate(`/orders/${order.id}?tab=${cfg.tab}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function generatedPaymentNumber(clientId = "") {
  const now = new Date();
  return `CPAY-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${now.toTimeString().slice(0, 8).replaceAll(":", "")}${clientId ? `-${clientId}` : ""}`;
}

function orderSummaryForModal(order) {
  return detailList([
    ["Buyurtma raqami", order.order_number],
    ["Shartnoma", order.contract?.contract_number],
    ["Mijoz", order.client?.name],
    ["Mahsulot", wizardProductList(order.items || [])],
    ["Buyurtma miqdori", fmtQty(order.summary?.total_quantity, order.items?.[0]?.unit)],
    ["Qoldiq", fmtQty(order.summary?.remaining_quantity, order.items?.[0]?.unit)],
  ]);
}

function showOrderModal(html, bind) {
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", html);
  const backdrop = document.querySelector(".modal-backdrop");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  bind?.(close);
}

async function openOrderSupplierOfferModal(order) {
  const suppliers = (await api("/api/suppliers?page_size=100")).items || [];
  const defaultItem = order.items?.[0] || {};
  const defaultQuantity = order.summary?.remaining_quantity || order.summary?.total_quantity || defaultItem.quantity || "";
  showOrderModal(`<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true">
      <div class="modal-header"><h2>Ta'minotchi taklifini qo'shish</h2><button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button></div>
      <form id="order-supplier-offer-form">
        <div class="modal-body"><div class="modal-summary">${orderSummaryForModal(order)}</div>
          <div class="grid">
            <label class="form-field">Ta'minotchi <span class="required-mark">*</span><select name="supplier_select" required><option value="">Ta'minotchini tanlang</option>${suppliers.map((supplier) => `<option value="${supplier.id}" data-name="${esc(supplier.name)}">${esc(supplier.name)}${supplier.inn ? ` - ${esc(supplier.inn)}` : ""}</option>`).join("")}</select></label>
            ${textField("available_quantity", "Taklif qilingan miqdor", defaultQuantity, "number", { required: true })}
            ${textField("offered_price", "Birlik xarid narxi", "", "number", { required: true })}
            ${textField("vat_rate_display", "QQS %", defaultItem.vat_rate || 12, "number")}
            ${textField("ready_date", "Tayyor sana", order.required_date || "", "date")}
            ${textArea("delivery_terms", "Yetkazib berish shartlari")}
            ${textArea("comment", "Izoh")}
          </div>
        </div>
        <div class="modal-footer"><button class="btn" type="button" data-modal-close>Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div>
      </form>
    </section>
  </div>`, (close) => {
    const form = document.querySelector("#order-supplier-offer-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selected = form.elements.supplier_select.selectedOptions[0];
      if (!selected?.value) return showToast("Ta'minotchini tanlang.", true);
      if (numberValue(field(form, "available_quantity")) <= 0) return showToast("Taklif qilingan miqdor 0 dan katta bo'lishi kerak.", true);
      if (numberValue(field(form, "offered_price")) < 0) return showToast("Birlik xarid narxi manfiy bo'lishi mumkin emas.", true);
      try {
        await api(`/api/orders/${order.id}/supplier-options`, {
          method: "POST",
          body: JSON.stringify({
            supplier_id: Number(selected.value),
            supplier_name: selected.dataset.name,
            offered_price: field(form, "offered_price"),
            available_quantity: field(form, "available_quantity"),
            ready_date: field(form, "ready_date"),
            delivery_terms: field(form, "delivery_terms"),
            comment: field(form, "comment"),
            is_selected: false,
          }),
        });
        showToast("Ta'minotchi taklifi qo'shildi.");
        close();
        renderOrderDetail(order.id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function openOrderSupplierSelectModal(order) {
  showOrderModal(`<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel wide" role="dialog" aria-modal="true">
      <div class="modal-header"><h2>Ta'minotchini tanlash</h2><button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button></div>
      <div class="modal-body"><div class="modal-summary">${orderSummaryForModal(order)}</div>
        ${tableOrEmpty(order.supplier_options || [], ["Ta'minotchi", "Taklif miqdori", "Birlik xarid narxi", "Tayyor sana", "Shartlar", "Tanlov"], (item) => `
          <tr><td>${fmt(item.supplier_name)}</td><td>${fmtQty(item.available_quantity, order.items?.[0]?.unit)}</td><td>${fmtMoney(item.offered_price)}</td><td>${fmt(item.ready_date)}</td><td>${fmt(item.delivery_terms)}</td><td><div class="table-actions"><button class="link-btn" type="button" data-modal-supplier-select="${item.id}">Tanlash</button><button class="link-btn" type="button" data-modal-supplier-confirm="${item.id}">Tasdiqlash</button><button class="link-btn" type="button" data-modal-supplier-reject="${item.id}">Rad etish</button></div></td></tr>
        `, "Ta'minotchi takliflari hali kiritilmagan.")}
      </div>
      <div class="modal-footer"><button class="btn" type="button" data-modal-close>Bekor qilish</button></div>
    </section>
  </div>`, (close) => {
    document.querySelectorAll("[data-modal-supplier-select]").forEach((button) => button.addEventListener("click", async () => {
      await api(`/api/orders/${order.id}/supplier-options/${button.dataset.modalSupplierSelect}/select`, { method: "POST" });
      showToast("Ta'minotchi tanlandi.");
      close();
      renderOrderDetail(order.id);
    }));
    document.querySelectorAll("[data-modal-supplier-confirm]").forEach((button) => button.addEventListener("click", async () => {
      await api(`/api/orders/${order.id}/supplier-options/${button.dataset.modalSupplierConfirm}/confirm`, { method: "POST" });
      showToast("Ta'minotchi tasdiqlandi.");
      close();
      renderOrderDetail(order.id);
    }));
    document.querySelectorAll("[data-modal-supplier-reject]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirmMsg("Taklif rad etilsinmi?")) return;
      await api(`/api/orders/${order.id}/supplier-options/${button.dataset.modalSupplierReject}`, { method: "DELETE" });
      showToast("Taklif rad etildi.");
      close();
      renderOrderDetail(order.id);
    }));
  });
}

async function openOrderStockAllocationModal(order) {
  const products = (order.items || []).map((item) => item.product_name);
  const query = new URLSearchParams({ available_only: "true", page_size: "100" });
  if (products.length === 1) query.set("product_name", products[0]);
  const lots = (await api(`/api/stock-lots?${query.toString()}`)).items || [];
  showOrderModal(`<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel wide" role="dialog" aria-modal="true">
      <div class="modal-header"><h2>Zaxiradan ajratish</h2><button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button></div>
      <form id="order-stock-allocation-form">
        <div class="modal-body"><div class="modal-summary">${orderSummaryForModal(order)}</div>
          ${tableOrEmpty(lots, ["Mahsulot", "Ta'minotchi", "Ticket", "Joylashuv", "Mavjud miqdor", "Birlik xarid narxi", "Ajratish"], (lot) => `
            <tr><td>${fmt(lot.product_name)}</td><td>${fmt(lot.supplier_name)}</td><td>${fmt(lot.ticket_number)}</td><td>${fmt(lot.location_name)}</td><td>${fmtQty(lot.quantity_available, lot.unit)}</td><td>${fmtMoney(lot.unit_cost)}</td><td><label class="inline-check"><input type="radio" name="stock_lot" value="${lot.id}" data-available="${esc(lot.quantity_available)}" /> Tanlash</label></td></tr>
          `, "Mavjud zaxira topilmadi.")}
          <div class="grid">${textField("allocated_quantity", "Ajratiladigan miqdor", order.summary?.remaining_quantity || order.summary?.total_quantity || "", "number", { required: true })}</div>
        </div>
        <div class="modal-footer"><button class="btn" type="button" data-modal-close>Bekor qilish</button><button class="btn primary" type="submit">Ajratish</button></div>
      </form>
    </section>
  </div>`, (close) => {
    const form = document.querySelector("#order-stock-allocation-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const lotInput = form.querySelector("[name='stock_lot']:checked");
      const amount = numberValue(field(form, "allocated_quantity"));
      if (!lotInput) return showToast("Zaxira partiyasini tanlang.", true);
      if (amount <= 0) return showToast("Ajratiladigan miqdor 0 dan katta bo'lishi kerak.", true);
      if (amount > numberValue(lotInput.dataset.available)) return showToast("Ajratiladigan miqdor mavjud zaxiradan oshmasligi kerak.", true);
      if (amount < numberValue(order.summary?.total_quantity)) showToast("Ajratilgan miqdor buyurtma miqdorini to'liq qoplamaydi.", true);
      try {
        await api("/api/stock-allocations", {
          method: "POST",
          body: JSON.stringify({ stock_lot_id: Number(lotInput.value), order_id: order.id, order_item_id: order.items?.[0]?.id || null, allocated_quantity: String(amount) }),
        });
        showToast("Zaxiradan ajratildi.");
        close();
        renderOrderDetail(order.id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

async function orderInvoiceRowsTotalForBatch(batchId) {
  if (!batchId) return 0;
  const rows = await invoiceRowsFromBatch(batchId);
  return (rows?.rows || []).reduce((sum, item) => {
    const subtotal = numberValue(item.quantity) * numberValue(item.unit_price);
    return sum + subtotal + subtotal * numberValue(item.vat_rate || 12) / 100;
  }, 0);
}

async function openOrderInvoiceModal(order, related = {}) {
  const contractDetail = await api(`/api/contracts/${order.contract_id}`).catch(() => order.contract || {});
  const batches = (await api(`/api/delivery-batches?order_id=${order.id}&page_size=100`).catch(() => ({ items: [] }))).items || [];
  const invoices = related.invoices || (await api(`/api/customer-invoices?order_id=${order.id}&page_size=100`)).items || [];
  const finance = orderFinanceSummary(invoices);
  const today = new Date().toISOString().slice(0, 10);
  const state = { invoiceType: "batch_payment", invoiceDate: today, dueDate: addDays(today, contractDetail.payment_terms?.batch_payment_due_days || 0), amount: Math.max(0, numberValue(order.total_amount) - finance.total).toFixed(2), batchId: "", notes: "" };
  async function draw() {
    const selectedBatch = batches.find((batch) => Number(batch.id) === Number(state.batchId));
    showOrderModal(`<div class="modal-backdrop" data-modal-close>
      <section class="modal-panel" role="dialog" aria-modal="true">
        <div class="modal-header"><h2>Mijoz hisob-fakturasini yaratish</h2><button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button></div>
        <form id="order-invoice-modal-form">
          <div class="modal-body"><div class="modal-summary">${detailList([["Buyurtma raqami", order.order_number], ["Shartnoma", order.contract?.contract_number], ["Mijoz", order.client?.name], ["Buyurtma jami", fmtMoney(order.total_amount)], ["Hisob qilingan", fmtMoney(finance.total)], ["To'langan", fmtMoney(finance.paid)], ["Qoldiq", fmtMoney(Math.max(0, numberValue(order.total_amount) - finance.total))]])}</div>
            ${numberValue(state.amount) > Math.max(0, numberValue(order.total_amount) - finance.total) ? workflowWarningsPanel(["Summa buyurtmaning hisob qilinmagan qoldig'idan oshmoqda."]) : ""}
            <div class="grid">
              ${selectField("invoice_type", "Hisob turi", invoiceTypes.filter(([key]) => key !== "advance"), state.invoiceType, { required: true })}
              ${textField("invoice_date", "Hisob sanasi", state.invoiceDate, "date", { required: true })}
              ${textField("due_date", "To'lov muddati", state.dueDate, "date", { required: true })}
              ${textField("amount", "Summa", state.amount, "number", { required: true })}
              ${["batch_payment", "transport"].includes(state.invoiceType) ? `<label class="form-field">Bog'liq partiya <span class="required-mark">*</span><select name="delivery_batch_id" required><option value="">Partiyani tanlang</option>${batches.map((batch) => `<option value="${batch.id}" ${Number(state.batchId) === Number(batch.id) ? "selected" : ""}>${esc(batch.batch_number)}</option>`).join("")}</select></label>` : ""}
              ${selectedBatch ? readonlyField("selected_batch", "Tanlangan partiya", selectedBatch.batch_number) : ""}
              ${textArea("notes", "Izoh", state.notes)}
            </div>
          </div>
          <div class="modal-footer"><button class="btn" type="button" data-modal-close>Bekor qilish</button><button class="btn primary" type="submit">Hisob yaratish</button></div>
        </form>
      </section>
    </div>`, (close) => {
      const form = document.querySelector("#order-invoice-modal-form");
      form?.elements.invoice_type?.addEventListener("change", async () => {
        state.invoiceType = form.elements.invoice_type.value;
        state.invoiceDate = form.elements.invoice_date.value;
        state.dueDate = addDays(state.invoiceDate, contractDetail.payment_terms?.batch_payment_due_days || 0);
        state.amount = "";
        state.batchId = "";
        await draw();
      });
      form?.elements.delivery_batch_id?.addEventListener("change", async () => {
        state.batchId = form.elements.delivery_batch_id.value;
        state.invoiceType = form.elements.invoice_type.value;
        state.invoiceDate = form.elements.invoice_date.value;
        state.dueDate = form.elements.due_date.value;
        state.notes = form.elements.notes.value.trim();
        const detail = state.batchId ? await api(`/api/delivery-batches/${state.batchId}`) : null;
        if (state.invoiceType === "transport") state.amount = detail?.logistics?.customer_price || "";
        if (state.invoiceType === "batch_payment") state.amount = String((await orderInvoiceRowsTotalForBatch(state.batchId)).toFixed(2));
        await draw();
      });
      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const invoiceType = field(form, "invoice_type");
        const batchId = field(form, "delivery_batch_id");
        const amount = field(form, "amount");
        if (!invoiceType || !field(form, "invoice_date") || !field(form, "due_date")) return showToast("Majburiy maydonlarni to'ldiring.", true);
        if (numberValue(amount) <= 0) return showToast("Summa 0 dan katta bo'lishi kerak.", true);
        if (["batch_payment", "transport"].includes(invoiceType) && !batchId) return showToast("Bog'liq partiyani tanlang.", true);
        const batch = batchId ? await api(`/api/delivery-batches/${batchId}`) : null;
        try {
          await api("/api/customer-invoices", { method: "POST", body: JSON.stringify({
            client_id: order.client_id,
            contract_id: order.contract_id,
            order_id: order.id,
            delivery_batch_id: batch?.id || null,
            logistics_id: batch?.logistics?.id || null,
            invoice_number: generatedInvoiceNumber(order.contract?.contract_number, batch?.batch_number || ""),
            invoice_date: field(form, "invoice_date"),
            due_date: field(form, "due_date"),
            invoice_type: invoiceType,
            status: "issued",
            currency: order.currency || "UZS",
            notes: field(form, "notes"),
            items: [invoiceItemFromModalAmount(order.contract || order, invoiceType, amount)],
          }) });
          showToast("Hisob-faktura yaratildi.");
          close();
          navigate(`/orders/${order.id}?tab=price`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }
  await draw();
}

async function openOrderPaymentModal(order, related = {}) {
  const invoices = (related.invoices || (await api(`/api/customer-invoices?order_id=${order.id}&page_size=100`)).items || []).filter((invoice) => invoice.status !== "cancelled" && numberValue(invoice.remaining_amount) > 0);
  const selected = invoices.length === 1 ? invoices[0] : invoices[0] || null;
  const finance = orderFinanceSummary(related.invoices || invoices);
  const today = new Date().toISOString().slice(0, 10);
  showOrderModal(`<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true">
      <div class="modal-header"><h2>Mijoz to'lovini kiritish</h2><button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button></div>
      <form id="order-payment-modal-form">
        <div class="modal-body"><div class="modal-summary">${detailList([["Mijoz", order.client?.name], ["Shartnoma", order.contract?.contract_number], ["Buyurtma", order.order_number], ["Hisoblar jami", fmtMoney(finance.total)], ["To'langan", fmtMoney(finance.paid)], ["Qoldiq", fmtMoney(finance.remaining)]])}</div>
          <div class="grid">
            ${textField("payment_date", "To'lov sanasi", today, "date", { required: true })}
            ${textField("amount", "Summa", selected?.remaining_amount || "", "number", { required: true })}
            ${selectField("payment_method", "To'lov usuli", paymentMethods, "bank_transfer")}
            ${textField("bank_account", "Hisob / kassa")}
            <label class="form-field">Bog'liq hisob <span class="required-mark">*</span><select name="invoice_id" required><option value="">Hisobni tanlang</option>${invoices.map((invoice) => `<option value="${invoice.id}" data-remaining="${esc(invoice.remaining_amount)}" ${selected?.id === invoice.id ? "selected" : ""}>${esc(invoice.invoice_number)} - ${fmtMoney(invoice.remaining_amount)}</option>`).join("")}</select></label>
            ${textField("allocated_amount", "Taqsimlash summasi", selected?.remaining_amount || "", "number", { required: true })}
            ${textArea("notes", "Izoh")}
          </div>
        </div>
        <div class="modal-footer"><button class="btn" type="button" data-modal-close>Bekor qilish</button><button class="btn primary" type="submit">To'lovni saqlash</button></div>
      </form>
    </section>
  </div>`, (close) => {
    const form = document.querySelector("#order-payment-modal-form");
    form?.elements.invoice_id?.addEventListener("change", () => {
      const remaining = form.elements.invoice_id.selectedOptions[0]?.dataset.remaining || "";
      form.elements.amount.value = remaining;
      form.elements.allocated_amount.value = remaining;
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selectedInvoice = form.elements.invoice_id.selectedOptions[0];
      if (!field(form, "invoice_id")) return showToast("Bog'liq hisobni tanlang.", true);
      if (numberValue(field(form, "amount")) <= 0) return showToast("To'lov summasi 0 dan katta bo'lishi kerak.", true);
      if (numberValue(field(form, "allocated_amount")) > numberValue(selectedInvoice.dataset.remaining)) return showToast("Taqsimlash summasi hisob qoldig'idan oshmasligi kerak.", true);
      try {
        await api("/api/customer-payments", { method: "POST", body: JSON.stringify({
          client_id: order.client_id,
          payment_number: generatedPaymentNumber(order.client_id),
          payment_date: field(form, "payment_date"),
          amount: field(form, "amount"),
          currency: "UZS",
          payment_method: field(form, "payment_method"),
          bank_account: field(form, "bank_account"),
          notes: field(form, "notes"),
          allocations: [{ invoice_id: Number(field(form, "invoice_id")), allocated_amount: field(form, "allocated_amount") }],
        }) });
        showToast("To'lov saqlandi.");
        close();
        navigate(`/orders/${order.id}?tab=price`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function openOrderDocumentModal(order) {
  showOrderModal(`<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true">
      <div class="modal-header"><h2>Hujjat yuklash</h2><button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button></div>
      <form id="order-document-modal-form">
        <div class="modal-body"><div class="modal-summary">${orderSummaryForModal(order)}</div>
          <div class="grid">${selectField("document_type", "Hujjat turi", orderDocumentTypes, "other", { required: true })}${textField("title", "Hujjat nomi", `${order.order_number} hujjati`, "text", { required: true })}${textField("uploaded_by", "Yuklagan")}<label class="form-field">Fayl <span class="required-mark">*</span><input name="file" type="file" required /></label></div>
        </div>
        <div class="modal-footer"><button class="btn" type="button" data-modal-close>Bekor qilish</button><button class="btn primary" type="submit">Yuklash</button></div>
      </form>
    </section>
  </div>`, (close) => {
    const form = document.querySelector("#order-document-modal-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await apiForm(`/api/orders/${order.id}/documents/upload`, new FormData(form));
        showToast("Hujjat yuklandi.");
        close();
        renderOrderDetail(order.id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function openOrderStatusModal(order) {
  const exceptionStatuses = [["created", "Avtomatik statusga qaytarish"], ["on_hold", "To'xtatib turish"], ["cancelled", "Bekor qilish"]];
  showOrderModal(`<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true">
      <div class="modal-header"><h2>Statusni o'zgartirish</h2><button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button></div>
      <form id="order-status-modal-form"><div class="modal-body"><div class="modal-summary">${orderSummaryForModal(order)}</div><div class="grid">${readonlyField("current_status", "Joriy status", optionLabel(orderStatuses, order.status))}${selectField("status", "Yangi status", exceptionStatuses, order.status === "on_hold" || order.status === "cancelled" ? order.status : "created", { required: true })}${textArea("reason", "Izoh")}</div></div><div class="modal-footer"><button class="btn" type="button" data-modal-close>Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div></form>
    </section>
  </div>`, (close) => {
    document.querySelector("#order-status-modal-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: field(event.currentTarget, "status") }) });
        showToast("Status yangilandi.");
        close();
        renderOrderDetail(order.id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

async function renderOrderDetail(id) {
  app.innerHTML = `<div class="page"><div class="empty">Loading order...</div></div>`;
  const order = await api(`/api/orders/${id}`);
  const active = new URLSearchParams(location.search).get("tab") || "general";
  const related = {};
  related.allocations = await api(`/api/stock-allocations?order_id=${id}`).catch(() => []);
  related.stockLots = await Promise.all((related.allocations || []).map((allocation) => api(`/api/stock-lots/${allocation.stock_lot_id}`).catch(() => null)));
  related.stockLots = related.stockLots.filter(Boolean);
  related.invoices = (await api(`/api/customer-invoices?order_id=${id}&page_size=100`).catch(() => ({ items: [] }))).items || [];
  if (active === "batches") {
    related.batches = (await api(`/api/delivery-batches?order_id=${id}&page_size=100`)).items;
  }
  if (active === "price") {
    related.batches = related.batches || (await api(`/api/delivery-batches?order_id=${id}&page_size=100`).catch(() => ({ items: [] }))).items || [];
    const invoiceDetails = await Promise.all((related.invoices || []).map((invoice) => api(`/api/customer-invoices/${invoice.id}`).catch(() => null)));
    related.payments = invoiceDetails.filter(Boolean).flatMap((invoice) => (invoice.allocations || []).map((allocation) => ({
      invoice_number: invoice.invoice_number,
      payment_number: allocation.payment?.payment_number || allocation.payment_number || "Mijoz to'lovi",
      allocated_amount: allocation.allocated_amount,
      created_at: allocation.created_at,
    })));
  }
  app.innerHTML = `<div class="page">${orderHeader(order, related)}${orderTabs(active)}${renderOrderActiveTab(order, active, related)}</div>`;
  document.querySelectorAll("[data-order-tab]").forEach((button) => button.addEventListener("click", () => navigate(`/orders/${id}?tab=${button.dataset.orderTab}`)));
  document.querySelectorAll("[data-order-status]").forEach((button) => button.addEventListener("click", () => openOrderStatusModal(order)));
  document.querySelectorAll("[data-order-supplier-offer]").forEach((button) => button.addEventListener("click", () => openOrderSupplierOfferModal(order).catch((error) => showToast(error.message, true))));
  document.querySelectorAll("[data-order-supplier-select]").forEach((button) => button.addEventListener("click", () => openOrderSupplierSelectModal(order)));
  document.querySelectorAll("[data-order-stock]").forEach((button) => button.addEventListener("click", () => openOrderStockAllocationModal(order).catch((error) => showToast(error.message, true))));
  document.querySelectorAll("[data-order-batch]").forEach((button) => button.addEventListener("click", () => navigate(`/delivery-batches/new?order_id=${order.id}`)));
  document.querySelectorAll("[data-order-invoice]").forEach((button) => button.addEventListener("click", () => openOrderInvoiceModal(order, related).catch((error) => showToast(error.message, true))));
  document.querySelectorAll("[data-order-payment]").forEach((button) => button.addEventListener("click", () => openOrderPaymentModal(order, related).catch((error) => showToast(error.message, true))));
  document.querySelectorAll("[data-order-document]").forEach((button) => button.addEventListener("click", () => openOrderDocumentModal(order)));
  document.querySelectorAll("[data-order-child]").forEach((button) => button.addEventListener("click", () => openOrderChildForm(order, button.dataset.orderChild)));
  document.querySelectorAll("[data-order-edit]").forEach((button) => button.addEventListener("click", () => {
    const kind = button.dataset.orderEdit;
    const collection = kind === "supplier-options" ? order.supplier_options : order[kind];
    openOrderChildForm(order, kind, collection.find((row) => row.id === Number(button.dataset.id)));
  }));
  document.querySelectorAll("[data-order-delete]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirmMsg(localizeText("Delete this item?"))) return;
    try {
      await api(`/api/orders/${id}/${button.dataset.orderDelete}/${button.dataset.id}`, { method: "DELETE" });
      showToast("Deleted.");
      renderOrderDetail(id);
    } catch (error) {
      showToast(error.message, true);
    }
  }));
  document.querySelectorAll("[data-order-select]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/orders/${id}/supplier-options/${button.dataset.orderSelect}/select`, { method: "POST" });
    showToast("Supplier selected.");
    renderOrderDetail(id);
  }));
  document.querySelectorAll("[data-order-confirm]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/orders/${id}/supplier-options/${button.dataset.orderConfirm}/confirm`, { method: "POST" });
    showToast("Supplier confirmed.");
    renderOrderDetail(id);
  }));
}
