async function fetchOrdersForSelect(selectedId = null, filters = {}) {
  const query = new URLSearchParams({ page_size: "100" });
  if (filters.clientId) query.set("client_id", filters.clientId);
  if (filters.contractId) query.set("contract_id", filters.contractId);
  const data = await api(`/api/orders?${query.toString()}`);
  return data.items.map((order) => `<option value="${order.id}" ${Number(selectedId) === order.id ? "selected" : ""}>${esc(order.order_number)} - ${esc(order.client?.name || "")}</option>`).join("");
}

async function fetchBatchesForSelect(selectedId = null, filters = {}) {
  const query = new URLSearchParams({ page_size: "100" });
  if (filters.clientId) query.set("client_id", filters.clientId);
  if (filters.contractId) query.set("contract_id", filters.contractId);
  if (filters.orderId) query.set("order_id", filters.orderId);
  const data = await api(`/api/delivery-batches?${query.toString()}`);
  return data.items.map((batch) => `<option value="${batch.id}" ${Number(selectedId) === batch.id ? "selected" : ""}>${esc(batch.batch_number)} - ${esc(batch.order?.order_number || "")}</option>`).join("");
}

async function fetchTransportsForSelect(selectedId = null) {
  const data = await api("/api/transports?status=active&page_size=200").catch(() => ({ items: [] }));
  return data.items.map((item) => `<option value="${item.id}" data-carrier="${esc(item.carrier_name)}" data-driver="${esc(item.driver_name || "")}" data-phone="${esc(item.driver_phone || "")}" data-vehicle="${esc(item.vehicle_number)}" data-trailer="${esc(item.trailer_number || "")}" ${Number(selectedId) === item.id ? "selected" : ""}>${esc(item.vehicle_number)} · ${esc(item.carrier_name)}${item.driver_name ? ` · ${esc(item.driver_name)}` : ""}</option>`).join("");
}

function applySelectedTransport(form) {
  const selected = form.elements.transport_id?.selectedOptions?.[0];
  if (!selected?.value) return;
  form.elements.carrier_id.value = selected.value;
  form.elements.carrier_name.value = selected.dataset.carrier || "";
  form.elements.driver_name.value = selected.dataset.driver || "";
  form.elements.driver_phone.value = selected.dataset.phone || "";
  form.elements.vehicle_number.value = selected.dataset.vehicle || "";
  form.elements.trailer_number.value = selected.dataset.trailer || "";
  calculateLogisticsForm(form);
}

function batchItemRow(orderItems = [], item = {}, index = 0, balances = []) {
  const selectedId = Number(item.order_item_id || orderItems[0]?.id || "");
  const balance = balances.find((row) => row.order_item_id === selectedId);
  return `
    <div class="item-row" data-batch-item-row>
      <label>Mahsulot<select name="order_item_id_${index}"><option value="">Mahsulotni tanlang</option>${orderItems.map((orderItem) => `<option value="${orderItem.id}" ${orderItem.id === selectedId ? "selected" : ""}>${esc(orderItem.product_name)} (${esc(orderItem.unit)})</option>`).join("")}</select></label>
      ${textField(`planned_quantity_${index}`, "Reja", item.planned_quantity ?? "", "number")}
      ${textField(`loaded_quantity_${index}`, "Yuklangan", item.loaded_quantity ?? "", "number")}
      ${textField(`accepted_quantity_${index}`, "Qabul qilingan", item.accepted_quantity ?? "", "number")}
      <div class="total-box"><span>Buyurtma qoldig'i</span><strong data-batch-row-balance>${balance ? `${fmtQty(balance.order_quantity, balance.unit)} / ${fmtQty(balance.remaining_quantity_for_planning, balance.unit)} qoldi` : dash}</strong></div>
      <div class="total-box"><span>Farq</span><strong data-batch-row-diff>${dash}</strong></div>
      <button type="button" class="btn danger" data-remove-batch-item>Olib tashlash</button>
    </div>
    ${textArea(`comment_${index}`, "Izoh", item.comment)}
  `;
}

function calculateBatchForm(form, orderItems = [], balances = []) {
  let planned = 0;
  let loaded = 0;
  let accepted = 0;
  [...form.querySelectorAll("[data-batch-item-row]")].forEach((row) => {
    const orderItemId = Number(row.querySelector("[name^='order_item_id_']").value);
    const balance = balances.find((item) => item.order_item_id === orderItemId);
    const rowPlanned = numberValue(row.querySelector("[name^='planned_quantity_']").value);
    const rowLoaded = numberValue(row.querySelector("[name^='loaded_quantity_']").value);
    const rowAccepted = numberValue(row.querySelector("[name^='accepted_quantity_']").value);
    planned += rowPlanned;
    loaded += rowLoaded;
    accepted += rowAccepted;
    row.querySelector("[data-batch-row-diff]").textContent = fmtQty(rowLoaded - rowAccepted);
    row.querySelector("[data-batch-row-balance]").textContent = balance ? `${fmtQty(balance.order_quantity, balance.unit)} / ${fmtQty(balance.planned_quantity_total, balance.unit)} reja / ${fmtQty(balance.accepted_quantity_total, balance.unit)} qabul / ${fmtQty(balance.remaining_quantity_for_planning, balance.unit)} qoldi` : dash;
  });
  form.querySelector("[data-batch-planned]").textContent = fmtQty(planned);
  form.querySelector("[data-batch-loaded]").textContent = fmtQty(loaded);
  form.querySelector("[data-batch-accepted]").textContent = fmtQty(accepted);
  form.querySelector("[data-batch-diff]").textContent = fmtQty(loaded - accepted);
}

function calculateLogisticsForm(form) {
  const profitTarget = form.querySelector("[data-logistics-profit]");
  if (profitTarget) profitTarget.textContent = fmtMoney(numberValue(field(form, "customer_price")) - numberValue(field(form, "cost_amount")));
  const statusInput = form.elements.logistics_status;
  if (!statusInput || ["issue", "cancelled", "in_transit", "unloading", "completed"].includes(statusInput.value)) return;
  if (field(form, "logistics_actual_delivery_date")) {
    statusInput.value = "delivered";
  } else if (field(form, "logistics_actual_pickup_date")) {
    statusInput.value = "loaded";
  } else if (field(form, "vehicle_number")) {
    statusInput.value = "vehicle_assigned";
  } else if (field(form, "carrier_name") || field(form, "driver_name")) {
    statusInput.value = "carrier_assigned";
  } else {
    statusInput.value = "not_assigned";
  }
}

async function fetchBatchWizardOrders(selectedId = null) {
  const data = await api("/api/orders?page_size=100");
  const options = await Promise.all(data.items.map(async (order) => {
    const balances = await api(`/api/delivery-batches/order/${order.id}/balances`);
    const remaining = balances.reduce((sum, item) => sum + numberValue(item.remaining_quantity_for_planning), 0);
    if (remaining <= 0 && Number(selectedId) !== order.id) return "";
    return `<option value="${order.id}" ${Number(selectedId) === order.id ? "selected" : ""}>${esc(order.order_number)} - ${esc(order.client?.name || "")} - ${fmtQty(remaining)}</option>`;
  }));
  return options.join("");
}

function wizardOrderTotals(state) {
  const balances = state.balances || [];
  return {
    order: balances.reduce((sum, item) => sum + numberValue(item.order_quantity), 0),
    planned: balances.reduce((sum, item) => sum + numberValue(item.planned_quantity_total), 0),
    remaining: balances.reduce((sum, item) => sum + numberValue(item.remaining_quantity_for_planning), 0),
    selected: balances.reduce((sum, item) => sum + numberValue(state.quantities?.[item.order_item_id] ?? item.remaining_quantity_for_planning), 0),
  };
}

function wizardProductList(items = []) {
  return items.map((item) => `${fmt(item.product_name)} (${fmtQty(item.quantity, item.unit)})`).join(", ") || dash;
}

function addressText(address = {}) {
  return [address.region, address.district, address.address].filter(Boolean).join(", ");
}

async function enrichBatchWizardState(state, orderId) {
  state.order = await api(`/api/orders/${orderId}`);
  state.balances = await api(`/api/delivery-batches/order/${orderId}/balances`);
  state.quantities = {};
  state.balances.forEach((balance) => {
    state.quantities[balance.order_item_id] = numberValue(balance.remaining_quantity_for_planning) > 0 ? balance.remaining_quantity_for_planning : "";
  });
  state.plannedLoadingDate ||= new Date().toISOString().slice(0, 10);
  state.plannedDeliveryDate ||= state.order.required_date || state.plannedLoadingDate;
  state.supplierName = state.order.supplier_name || "";
  state.supplierId = state.order.supplier_id || null;
  try {
    const client = await api(`/api/clients/${state.order.client_id}`);
    const deliveryAddress = (client.addresses || []).find((item) => item.address_type === "delivery") || (client.addresses || [])[0];
    state.deliveryAddress ||= addressText(deliveryAddress);
  } catch {
    state.deliveryAddress ||= "";
  }
  if (state.order.supplier_id) {
    try {
      const supplier = await api(`/api/suppliers/${state.order.supplier_id}`);
      const loadingAddress = (supplier.addresses || []).find((item) => item.address_type === "loading") || (supplier.addresses || []).find((item) => item.address_type === "warehouse") || (supplier.addresses || []).find((item) => item.address_type === "factory") || (supplier.addresses || [])[0];
      state.loadingAddress ||= addressText(loadingAddress);
      state.supplierName ||= supplier.name || "";
    } catch {
      state.loadingAddress ||= "";
    }
  }
}

function batchWizardStepper(step) {
  const steps = ["Buyurtma", "Miqdor", "Manba", "Reja", "Tasdiqlash"];
  if (window.BitumFrontend?.components?.stepper) return window.BitumFrontend.components.stepper(steps, step);
  return `<div class="batch-wizard-stepper">${steps.map((label, index) => {
    const key = index + 1;
    const cls = key < step ? "completed" : key === step ? "current" : "upcoming";
    return `<div class="batch-wizard-step ${cls}"><span>${key}</span><strong>${label}</strong></div>`;
  }).join("")}</div>`;
}

function batchWizardOrderSummary(state) {
  if (!state.order) return `<div class="empty">Avval buyurtmani tanlang.</div>`;
  const totals = wizardOrderTotals(state);
  const noRemaining = totals.remaining <= 0;
  return `${noRemaining ? `<div class="workflow-warning"><strong>Qoldiq yo'q</strong><ul><li>Ushbu buyurtma bo'yicha qoldiq miqdor mavjud emas.</li></ul></div>` : ""}${summaryCards([
    ["Buyurtma raqami", fmt(state.order.order_number)],
    ["Mijoz", fmt(state.order.client?.name)],
    ["Shartnoma", fmt(state.order.contract?.contract_number)],
    ["Mahsulotlar", wizardProductList(state.order.items)],
    ["Buyurtma miqdori", fmtQty(totals.order, state.order.items?.[0]?.unit)],
    ["Oldin partiya qilingan", fmtQty(totals.planned, state.order.items?.[0]?.unit)],
    ["Qoldiq miqdor", fmtQty(totals.remaining, state.order.items?.[0]?.unit)],
    ["Manba", fmt(optionLabel(sourceTypes, state.order.source_type))],
    ["Yetkazib berish modeli", fmt(optionLabel(fulfillmentTypes, state.order.fulfillment_type))],
    ["Ta'minotchi", fmt(state.supplierName || state.order.supplier_name)],
    ["Buyurtma holati", statusBadge(state.order.status)],
  ])}`;
}

function batchWizardQuantityTable(state) {
  if (!state.order) return `<div class="empty">Miqdor kiritish uchun avval buyurtmani tanlang.</div>`;
  return `${tableOrEmpty(state.balances || [], ["Mahsulot", "Buyurtma miqdori", "Oldin partiya qilingan", "Qoldiq", "Ushbu partiya"], (balance) => {
    const value = state.quantities?.[balance.order_item_id] ?? balance.remaining_quantity_for_planning;
    return `<tr><td>${fmt(balance.product_name)}</td><td>${fmtQty(balance.order_quantity, balance.unit)}</td><td>${fmtQty(balance.planned_quantity_total, balance.unit)}</td><td>${fmtQty(balance.remaining_quantity_for_planning, balance.unit)}</td><td><input data-wizard-qty="${balance.order_item_id}" type="number" step="any" min="0" max="${esc(balance.remaining_quantity_for_planning)}" value="${esc(value)}" /></td></tr>`;
  }, "Buyurtma mahsulotlari topilmadi.")}<p class="helper-text">Qabul qilingan miqdor keyinchalik, mahsulot mijoz tomonidan qabul qilingandan so'ng kiritiladi.</p>`;
}

function batchWizardSourcePanel(state) {
  if (!state.order) return `<div class="empty">Avval buyurtmani tanlang.</div>`;
  const companyManaged = state.order.fulfillment_type === "company_managed_delivery";
  const missingSupplier = companyManaged && !state.supplierName;
  return `${missingSupplier ? `<div class="workflow-warning"><strong>Ta'minotchi kerak</strong><ul><li>Partiya yaratish uchun avval ta'minotchini tanlang.</li></ul></div>` : ""}${summaryCards([
    ["Manba", fmt(optionLabel(sourceTypes, state.order.source_type))],
    ["Yetkazib berish modeli", fmt(optionLabel(fulfillmentTypes, state.order.fulfillment_type))],
    ["Yetkazish usuli", "Avto"],
    ["Ta'minotchi", fmt(state.supplierName)],
    ["Ta'minotchi holati", fmt(optionLabel(supplierStatuses, state.order.supplier_status))],
  ])}<div class="empty compact">${companyManaged ? "Bu partiya kompaniya tomonidan boshqariladigan logistika orqali yetkaziladi. Partiya yaratilgandan so'ng logistika yozuvi avtomatik ochiladi." : "Bu partiya ta'minotchidan mijozga to'g'ridan-to'g'ri yetkaziladi. Logistika ma'lumotlari minimal ko'rinishda yuritiladi."}</div>`;
}

function batchWizardPlanPanel(state) {
  return `<div class="grid">
    ${textField("planned_loading_date", "Reja yuklash sanasi", state.plannedLoadingDate || "", "date", { required: true })}
    ${textField("planned_delivery_date", "Reja yetkazish sanasi", state.plannedDeliveryDate || "", "date", { required: true })}
    ${textArea("loading_address", "Yuklash manzili", state.loadingAddress || "", { required: true })}
    ${textArea("delivery_address", "Yetkazish manzili", state.deliveryAddress || "", { required: true })}
    ${textArea("notes", "Izoh", state.notes || "")}
  </div><p class="helper-text">Haydovchi, transport raqami va haqiqiy sanalar partiya yaratilgandan keyin logistika bosqichida kiritiladi.</p>`;
}

function batchWizardConfirmPanel(state) {
  if (!state.order) return `<div class="empty">Tasdiqlash uchun avval buyurtmani tanlang.</div>`;
  const totals = wizardOrderTotals(state);
  const afterRemaining = totals.remaining - totals.selected;
  const selectedProducts = (state.balances || [])
    .filter((balance) => numberValue(state.quantities?.[balance.order_item_id]) > 0)
    .map((balance) => `${balance.product_name} - ${fmtQty(state.quantities[balance.order_item_id], balance.unit)}`)
    .join(", ");
  return `<div class="confirm-grid">
    ${section("Buyurtma", detailList([["Buyurtma raqami", state.order.order_number], ["Mijoz", state.order.client?.name], ["Shartnoma", state.order.contract?.contract_number]]))}
    ${section("Mahsulot va miqdor", detailList([["Mahsulot", selectedProducts || dash], ["Reja miqdor", fmtQty(totals.selected, state.order.items?.[0]?.unit)], ["Buyurtma qoldig'i", fmtQty(totals.remaining, state.order.items?.[0]?.unit)], ["Saqlangandan keyingi qoldiq", fmtQty(afterRemaining, state.order.items?.[0]?.unit)]]))}
    ${section("Manba va model", detailList([["Manba", optionLabel(sourceTypes, state.order.source_type)], ["Yetkazib berish modeli", optionLabel(fulfillmentTypes, state.order.fulfillment_type)], ["Yetkazish usuli", "Avto"], ["Ta'minotchi", state.supplierName]]))}
    ${section("Reja", detailList([["Reja yuklash sanasi", state.plannedLoadingDate], ["Reja yetkazish sanasi", state.plannedDeliveryDate], ["Yuklash manzili", state.loadingAddress], ["Yetkazish manzili", state.deliveryAddress]]))}
  </div>`;
}

function batchWizardBody(state) {
  if (state.step === 1) return section("Buyurtma tanlash", `${selectField("wizard_order_id", "Buyurtma", [["", "Buyurtmani tanlang"]], "", { required: true }).replace("</select>", `${state.ordersHtml || ""}</select>`)}${batchWizardOrderSummary(state)}`);
  if (state.step === 2) return section("Mahsulot va miqdor", batchWizardQuantityTable(state));
  if (state.step === 3) return section("Manba va yetkazib berish modeli", batchWizardSourcePanel(state));
  if (state.step === 4) return section("Reja sanalar va manzillar", batchWizardPlanPanel(state));
  return section("Tekshirish va yaratish", batchWizardConfirmPanel(state));
}

function batchWizardHtml(state) {
  return `<div class="page batch-wizard-page">
    <div class="page-header">
      <div class="page-title"><h1>Yangi partiya yaratish</h1><p>Buyurtma bo'yicha rejalashtirilgan yetkazib berish partiyasini yarating.</p></div>
      <div class="actions"><button class="btn" type="button" data-wizard-cancel>Bekor qilish</button></div>
    </div>
    ${batchWizardStepper(state.step)}
    <form id="batch-wizard-form">${batchWizardBody(state)}
      <div class="form-footer">
        <button type="button" class="btn" data-wizard-back ${state.step <= 1 ? "disabled" : ""}>Ortga</button>
        ${state.step < 5 ? `<button type="button" class="btn primary" data-wizard-next>Keyingi</button>` : `<button type="submit" class="btn primary">Partiyani yaratish</button>`}
      </div>
    </form>
  </div>`;
}

function selectedWizardItems(state) {
  return (state.balances || []).map((balance) => ({
    order_item_id: balance.order_item_id,
    planned_quantity: state.quantities?.[balance.order_item_id],
    remaining: balance.remaining_quantity_for_planning,
    unit: balance.unit,
  })).filter((item) => numberValue(item.planned_quantity) > 0);
}

function validateBatchWizardStep(state, targetStep = state.step) {
  if (targetStep >= 1 && !state.order) return "Buyurtmani tanlang.";
  const totals = wizardOrderTotals(state);
  if (targetStep >= 1 && totals.remaining <= 0) return "Ushbu buyurtma bo'yicha qoldiq miqdor mavjud emas.";
  const items = selectedWizardItems(state);
  if (targetStep >= 2 && !items.length) return "Kamida bitta mahsulot uchun partiya miqdorini kiriting.";
  if (targetStep >= 2 && items.some((item) => numberValue(item.planned_quantity) > numberValue(item.remaining))) return "Partiya miqdori buyurtma qoldig'idan oshmasligi kerak.";
  if (targetStep >= 3 && state.order?.fulfillment_type === "company_managed_delivery" && !state.supplierName) return "Partiya yaratish uchun avval ta'minotchini tanlang.";
  if (targetStep >= 4 && (!state.plannedLoadingDate || !state.plannedDeliveryDate)) return "Reja yuklash va yetkazish sanalari majburiy.";
  if (targetStep >= 4 && state.plannedDeliveryDate < state.plannedLoadingDate) return "Reja yetkazish sanasi reja yuklash sanasidan oldin bo'lishi mumkin emas.";
  if (targetStep >= 4 && state.order?.fulfillment_type === "company_managed_delivery" && !state.loadingAddress) return "Yuklash manzilini kiriting.";
  if (targetStep >= 4 && !state.deliveryAddress) return "Yetkazish manzilini kiriting.";
  return null;
}

function collectBatchWizardPayload(state) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    order_id: state.order.id,
    batch_number: generatedBatchNumber(state.order.order_number),
    batch_date: today,
    planned_loading_date: state.plannedLoadingDate,
    planned_delivery_date: state.plannedDeliveryDate,
    status: "planned",
    supplier_id: state.order.supplier_id || null,
    supplier_name: state.supplierName || null,
    notes: state.notes || null,
    items: selectedWizardItems(state).map((item) => ({
      order_item_id: item.order_item_id,
      planned_quantity: normalizeNumberInputValue(item.planned_quantity),
      loaded_quantity: null,
      accepted_quantity: null,
      comment: null,
    })),
    logistics: {
      status: "not_assigned",
      loading_address: state.loadingAddress || null,
      delivery_address: state.deliveryAddress || null,
      planned_pickup_date: state.plannedLoadingDate,
      planned_delivery_date: state.plannedDeliveryDate,
      cost_amount: "0",
      customer_price: "0",
      paid_by: "company",
    },
  };
}

function syncBatchWizardInputs(state) {
  const form = document.querySelector("#batch-wizard-form");
  if (!form) return;
  form.querySelectorAll("[data-wizard-qty]").forEach((input) => {
    state.quantities[Number(input.dataset.wizardQty)] = input.value;
  });
  if (form.elements.planned_loading_date) state.plannedLoadingDate = form.elements.planned_loading_date.value;
  if (form.elements.planned_delivery_date) state.plannedDeliveryDate = form.elements.planned_delivery_date.value;
  if (form.elements.loading_address) state.loadingAddress = form.elements.loading_address.value.trim();
  if (form.elements.delivery_address) state.deliveryAddress = form.elements.delivery_address.value.trim();
  if (form.elements.notes) state.notes = form.elements.notes.value.trim();
}

function renderBatchWizard(state) {
  app.innerHTML = batchWizardHtml(state);
  bindBatchWizard(state);
}

function bindBatchWizard(state) {
  const form = document.querySelector("#batch-wizard-form");
  document.querySelector("[data-wizard-cancel]")?.addEventListener("click", () => navigate("/delivery-batches"));
  form?.elements.wizard_order_id?.addEventListener("change", async (event) => {
    const orderId = Number(event.target.value);
    state.order = null;
    state.balances = [];
    state.quantities = {};
    if (orderId) await enrichBatchWizardState(state, orderId);
    renderBatchWizard(state);
  });
  form?.addEventListener("input", () => syncBatchWizardInputs(state));
  document.querySelector("[data-wizard-back]")?.addEventListener("click", () => {
    syncBatchWizardInputs(state);
    state.step = Math.max(1, state.step - 1);
    renderBatchWizard(state);
  });
  document.querySelector("[data-wizard-next]")?.addEventListener("click", () => {
    syncBatchWizardInputs(state);
    const error = validateBatchWizardStep(state, state.step);
    if (error) return showToast(error, true);
    state.step = Math.min(5, state.step + 1);
    renderBatchWizard(state);
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncBatchWizardInputs(state);
    const error = validateBatchWizardStep(state, 5);
    if (error) return showToast(error, true);
    try {
      const saved = await api("/api/delivery-batches", { method: "POST", body: JSON.stringify(collectBatchWizardPayload(state)) });
      showToast("Partiya yaratildi.");
      navigate(`/delivery-batches/${saved.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function batchWizardForm() {
  const params = new URLSearchParams(location.search);
  const prefillOrderId = Number(params.get("order_id") || 0) || null;
  const state = {
    step: 1,
    ordersHtml: await fetchBatchWizardOrders(prefillOrderId),
    order: null,
    balances: [],
    quantities: {},
    plannedLoadingDate: "",
    plannedDeliveryDate: "",
    loadingAddress: "",
    deliveryAddress: "",
    notes: "",
    supplierName: "",
    supplierId: null,
  };
  if (prefillOrderId) await enrichBatchWizardState(state, prefillOrderId);
  return state;
}

function collectBatchItems(form) {
  const rows = [...form.querySelectorAll("[data-batch-item-row]")];
  return rows.map((row, index) => {
    const orderItemId = row.querySelector("[name^='order_item_id_']").value;
    return {
      order_item_id: orderItemId ? Number(orderItemId) : null,
      planned_quantity: normalizeNumberInputValue(row.querySelector("[name^='planned_quantity_']").value),
      loaded_quantity: normalizeNumberInputValue(row.querySelector("[name^='loaded_quantity_']").value) || null,
      accepted_quantity: normalizeNumberInputValue(row.querySelector("[name^='accepted_quantity_']").value) || null,
      comment: form.elements[`comment_${index}`]?.value.trim() || null,
    };
  }).filter((item) => item.order_item_id && item.planned_quantity);
}

function collectBatchPayload(form) {
  return {
    order_id: Number(field(form, "order_id")),
    batch_number: field(form, "batch_number"),
    batch_date: field(form, "batch_date"),
    planned_loading_date: field(form, "planned_loading_date"),
    planned_delivery_date: field(form, "planned_delivery_date"),
    actual_loading_date: field(form, "actual_loading_date"),
    actual_delivery_date: field(form, "actual_delivery_date"),
    accepted_date: field(form, "accepted_date"),
    status: field(form, "status") || "planned",
    supplier_id: field(form, "supplier_id") ? Number(field(form, "supplier_id")) : null,
    supplier_name: field(form, "supplier_name"),
    notes: field(form, "notes"),
    created_by: field(form, "created_by"),
    items: collectBatchItems(form),
    logistics: {
      status: field(form, "logistics_status") || "not_assigned",
      carrier_id: field(form, "carrier_id") ? Number(field(form, "carrier_id")) : null,
      carrier_name: field(form, "carrier_name"),
      driver_name: field(form, "driver_name"),
      driver_phone: field(form, "driver_phone"),
      vehicle_number: field(form, "vehicle_number"),
      trailer_number: field(form, "trailer_number"),
      loading_address: field(form, "loading_address"),
      delivery_address: field(form, "delivery_address"),
      planned_pickup_date: field(form, "logistics_planned_pickup_date"),
      planned_delivery_date: field(form, "logistics_planned_delivery_date"),
      actual_pickup_date: field(form, "logistics_actual_pickup_date"),
      actual_delivery_date: field(form, "logistics_actual_delivery_date"),
      cost_amount: field(form, "cost_amount"),
      customer_price: field(form, "customer_price"),
      paid_by: field(form, "paid_by"),
      notes: field(form, "logistics_notes"),
    },
  };
}

function generatedBatchNumber(orderNumber = "") {
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
  return `BAT-${orderNumber || date}-${time}`;
}

function batchRowsFromBalances(balances = []) {
  const rows = balances
    .filter((balance) => numberValue(balance.remaining_quantity_for_planning) > 0)
    .map((balance) => ({
      order_item_id: balance.order_item_id,
      planned_quantity: balance.remaining_quantity_for_planning,
    }));
  return rows.length ? rows : [{}];
}

async function batchForm(batch = null) {
  const params = new URLSearchParams(location.search);
  const prefillOrderId = batch?.order_id || Number(params.get("order_id") || 0) || null;
  const orders = await fetchOrdersForSelect(prefillOrderId);
  const order = prefillOrderId ? await api(`/api/orders/${prefillOrderId}`) : null;
  const balances = batch ? batch.order_item_balances : prefillOrderId ? await api(`/api/delivery-batches/order/${prefillOrderId}/balances`) : [];
  const today = new Date().toISOString().slice(0, 10);
  const rows = batch?.items?.length ? batch.items : batchRowsFromBalances(balances);
  const logistics = batch?.logistics || {};
  const transportOptions = await fetchTransportsForSelect(logistics.carrier_id);
  const batchNumber = batch?.batch_number || generatedBatchNumber(order?.order_number);
  const summaryProduct = rows.map((item) => item.product_name || order?.items?.find((orderItem) => orderItem.id === Number(item.order_item_id))?.product_name).filter(Boolean).join(", ");
  const summaryQuantity = rows.reduce((sum, item) => sum + numberValue(item.planned_quantity), 0);
  const logisticsSummary = summaryCards([
    ["Logistika", fmt(logisticsNumber(logistics, { batch_number: batchNumber }))],
    ["Partiya", fmt(batchNumber)],
    ["Buyurtma", fmt(order?.order_number || batch?.order?.order_number)],
    ["Mijoz", fmt(order?.client?.name || batch?.client?.name)],
    ["Mahsulot", fmt(summaryProduct)],
    ["Miqdor", fmtQty(summaryQuantity)],
    ["Manba", fmt(optionLabel(sourceTypes, batch?.source_type || order?.source_type))],
    ["Model", fmt(optionLabel(fulfillmentTypes, batch?.fulfillment_type || order?.fulfillment_type))],
    ["Holat", statusBadge(logistics.status || "not_assigned")],
  ]);
  return `
    <div class="page">
      <div class="page-header"><div class="page-title"><h1>${batch ? "Partiyani tahrirlash" : "Yangi partiya"}</h1><p>Mavjud buyurtma bo'yicha qisman yetkazib berish.</p></div><div class="actions"><button class="btn" data-nav="${batch ? `/delivery-batches/${batch.id}` : "/delivery-batches"}">Orqaga</button></div></div>
      <form id="batch-form">
        ${section("Asosiy ma'lumotlar", `<div class="grid">
          <label>Buyurtma<select name="order_id"><option value="">Buyurtmani tanlang</option>${orders}</select></label>
          <label>Mijoz<input name="client_name" value="${esc(batch?.client?.name || order?.client?.name || "")}" disabled /></label>
          <label>Shartnoma<input name="contract_number" value="${esc(batch?.contract?.contract_number || order?.contract?.contract_number || "")}" disabled /></label>
          ${readonlyField("batch_number", "Partiya raqami", batchNumber)}
          ${textField("batch_date", "Partiya sanasi", batch?.batch_date || today, "date")}
          ${textField("planned_loading_date", "Reja yuklash sanasi", batch?.planned_loading_date || "", "date")}
          ${textField("planned_delivery_date", "Reja yetkazish sanasi", batch?.planned_delivery_date || "", "date")}
          ${textField("actual_loading_date", "Haqiqiy yuklash sanasi", batch?.actual_loading_date || "", "date")}
          ${textField("actual_delivery_date", "Haqiqiy yetkazish sanasi", batch?.actual_delivery_date || "", "date")}
          ${textField("accepted_date", "Qabul sanasi", batch?.accepted_date || "", "date")}
          ${selectField("status", "Status", batchStatuses, batch?.status || "planned")}
          ${textField("created_by", "Yaratgan", batch?.created_by)}
          ${textArea("notes", "Izohlar", batch?.notes)}
        </div>`)}
        ${section("Mahsulotlar", `<div id="batch-items">${order ? rows.map((item, index) => batchItemRow(order.items, item, index, balances)).join("") : `<div class="empty">Avval buyurtmani tanlang.</div>`}</div><button type="button" class="btn" id="add-batch-item" ${order ? "" : "disabled"}>Mahsulot qo'shish</button><div class="totals-bar"><div class="total-box"><span>Reja</span><strong data-batch-planned>${dash}</strong></div><div class="total-box"><span>Yuklangan</span><strong data-batch-loaded>${dash}</strong></div><div class="total-box"><span>Qabul qilingan</span><strong data-batch-accepted>${dash}</strong></div><div class="total-box"><span>Farq</span><strong data-batch-diff>${dash}</strong></div></div>`)}
        ${section("Manba va yetkazib berish modeli", `<div class="grid">
          <label>Yetkazib berish modeli<input value="${esc(optionLabel(fulfillmentTypes, batch?.fulfillment_type || order?.fulfillment_type))}" disabled /></label>
          <label>Manba<input value="${esc(optionLabel(sourceTypes, batch?.source_type || order?.source_type))}" disabled /></label>
          <label>Yetkazish usuli<input value="auto" disabled /></label>
          <input type="hidden" name="supplier_id" value="${esc(batch?.supplier_id || order?.supplier_id || "")}" />
          <input type="hidden" name="supplier_name" value="${esc(batch?.supplier_name || order?.supplier_name || "")}" />
          ${readonlyField("supplier_name_display", "Ta'minotchi", batch?.supplier_name || order?.supplier_name || "")}
        </div>`)}
        ${section("Logistika ma'lumotlari", `
          <h3>Logistika xulosasi</h3>
          ${logisticsSummary}
          <h3>Transport biriktirish</h3>
          <div class="grid">
          <label>Transport<select name="transport_id"><option value="">Transportni tanlang</option>${transportOptions}</select></label>
          <input type="hidden" name="carrier_id" value="${esc(logistics.carrier_id || "")}" />
          ${textField("carrier_name", "Tashuvchi", logistics.carrier_name)}
          ${textField("driver_name", "Haydovchi", logistics.driver_name)}
          ${textField("driver_phone", "Haydovchi telefoni", logistics.driver_phone)}
          ${textField("vehicle_number", "Transport raqami", logistics.vehicle_number)}
          ${textField("trailer_number", "Tirkama raqami", logistics.trailer_number)}
          ${selectField("logistics_status", "Logistika statusi", logisticsStatuses, logistics.status || "not_assigned")}
          </div>
          <h3>Sanalar</h3>
          <div class="grid">
          ${textField("logistics_planned_pickup_date", "Reja yuklash sanasi", logistics.planned_pickup_date || batch?.planned_loading_date || "", "date")}
          ${textField("logistics_planned_delivery_date", "Reja yetkazish sanasi", logistics.planned_delivery_date || batch?.planned_delivery_date || "", "date")}
          ${textField("logistics_actual_pickup_date", "Haqiqiy yuklash sanasi", logistics.actual_pickup_date || batch?.actual_loading_date || "", "date")}
          ${textField("logistics_actual_delivery_date", "Haqiqiy yetkazish sanasi", logistics.actual_delivery_date || batch?.actual_delivery_date || "", "date")}
          </div>
          <h3>Manzillar</h3>
          <div class="grid">
          ${textArea("loading_address", "Yuklash manzili", logistics.loading_address)}
          ${textArea("delivery_address", "Yetkazish manzili", logistics.delivery_address)}
          </div>
          <h3>Xarajatlar</h3>
          <div class="grid">
          ${textField("cost_amount", "Xarajat summasi", logistics.cost_amount || "", "number")}
          ${textField("customer_price", "Mijozga transport narxi", logistics.customer_price || "", "number")}
          ${selectField("paid_by", "Kim to'laydi", paidByTypes, logistics.paid_by || "company")}
          <div class="total-box"><span>Transport foydasi</span><strong data-logistics-profit>${transportProfit(logistics)}</strong></div>
          </div>
          <h3>Izohlar</h3>
          <div class="grid">
          ${textArea("logistics_notes", "Logistika izohlari", logistics.notes)}
          </div>
          <h3>Jarayon tarixi</h3>
          ${logisticsTimeline(logistics, batch || {})}
          ${logisticsWarnings(logistics, batch || {})}
          <div class="empty">Hujjatlarni logistika detail sahifasidan qo'shish mumkin.</div>
        `)}
        ${section("Hujjatlar", `<div class="empty">Partiya hujjatlarini saqlagandan keyin Hujjatlar tabidan qo'shish mumkin.</div>`)}
        <div class="form-footer"><button type="button" class="btn" data-nav="${batch ? `/delivery-batches/${batch.id}` : "/delivery-batches"}">Bekor qilish</button><button type="submit" class="btn primary">Saqlash</button></div>
      </form>
    </div>
  `;
}

async function bindBatchForm(batch = null) {
  const form = document.querySelector("#batch-form");
  let order = batch ? await api(`/api/orders/${batch.order_id}`) : null;
  let balances = batch ? batch.order_item_balances : [];
  async function reloadOrder() {
    const orderId = Number(form.elements.order_id.value);
    if (!orderId) return;
    order = await api(`/api/orders/${orderId}`);
    balances = await api(`/api/delivery-batches/order/${orderId}/balances`);
    form.elements.client_name.value = order.client?.name || "";
    form.elements.contract_number.value = order.contract?.contract_number || "";
    form.elements.supplier_id.value = order.supplier_id || "";
    form.elements.supplier_name.value = order.supplier_name || "";
    form.elements.supplier_name_display.value = order.supplier_name || "";
    if (!batch) form.elements.batch_number.value = generatedBatchNumber(order.order_number);
    document.querySelector("#batch-items").innerHTML = batchRowsFromBalances(balances).map((item, index) => batchItemRow(order.items, item, index, balances)).join("");
    document.querySelector("#add-batch-item").disabled = false;
    calculateBatchForm(form, order.items, balances);
    calculateLogisticsForm(form);
  }
  form.elements.order_id.addEventListener("change", reloadOrder);
  form.elements.transport_id?.addEventListener("change", () => applySelectedTransport(form));
  form.addEventListener("input", () => {
    calculateBatchForm(form, order?.items || [], balances);
    calculateLogisticsForm(form);
  });
  document.querySelector("#add-batch-item").addEventListener("click", () => {
    if (!order) return;
    const index = form.querySelectorAll("[data-batch-item-row]").length;
    document.querySelector("#batch-items").insertAdjacentHTML("beforeend", batchItemRow(order.items, {}, index, balances));
    calculateBatchForm(form, order.items, balances);
    calculateLogisticsForm(form);
  });
  form.addEventListener("click", (event) => {
    if (!event.target.matches("[data-remove-batch-item]")) return;
    if (form.querySelectorAll("[data-batch-item-row]").length <= 1) return showToast("Partiyada kamida bitta mahsulot bo'lishi kerak.", true);
    event.target.closest("[data-batch-item-row]").nextElementSibling?.remove();
    event.target.closest("[data-batch-item-row]").remove();
    calculateBatchForm(form, order?.items || [], balances);
    calculateLogisticsForm(form);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectBatchPayload(form);
    if (!payload.order_id || !payload.batch_number || !payload.batch_date) return showToast("Buyurtma, partiya raqami va partiya sanasi majburiy.", true);
    if (!payload.items.length) return showToast("Kamida bitta buyurtma mahsulotini qo'shing.", true);
    try {
      const saved = await api(batch ? `/api/delivery-batches/${batch.id}` : "/api/delivery-batches", { method: batch ? "PATCH" : "POST", body: JSON.stringify(payload) });
      showToast("Partiya saqlandi.");
      navigate(`/delivery-batches/${saved.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  if (order) {
    calculateBatchForm(form, order.items, balances);
    calculateLogisticsForm(form);
  }
}

async function renderDeliveryBatchesList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Partiyalar yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/delivery-batches?${params.toString()}`);
  app.innerHTML = opsListPage({
    className: "batches-ops-page",
    title: "Partiyalar",
    tabs: [{ label: "Buyurtmalar", path: "/orders" }, { label: "Partiyalar", active: true }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", path: "/transports" }],
    createPath: "/delivery-batches/new",
    clearPath: "/delivery-batches",
    counter: `${fmt(data.total)} ta partiya`,
    formId: "batch-search-form",
    filters: `<input name="search" placeholder="Partiya, buyurtma, mijoz, mahsulot" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${batchStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`,
    headers: ["Partiya raqami", "Sana", "Buyurtma", "Shartnoma", "Mijoz", "Mahsulot", "Reja", "Yuklangan", "Qabul qilingan", "Farq", "Ta'minotchi", "Status", "Logistika", ""],
    rows: data.items.map((batch) => `<tr><td><button class="ops-primary-link" data-nav="/delivery-batches/${batch.id}">${fmt(batch.batch_number)}</button></td><td>${fmt(batch.batch_date)}</td><td>${fmt(batch.order?.order_number)}</td><td>${fmt(batch.contract?.contract_number)}</td><td>${fmt(batch.client?.name)}</td><td>${fmt(batch.product)}</td><td>${fmtQty(batch.total_planned_quantity)}</td><td>${fmtQty(batch.total_loaded_quantity)}</td><td>${fmtQty(batch.total_accepted_quantity)}</td><td class="${numberValue(batch.total_difference_quantity) !== 0 ? "ops-warning" : ""}">${fmtQty(batch.total_difference_quantity)}</td><td>${fmt(batch.supplier_name)}</td><td>${statusBadge(batch.status)}</td><td>${fmt(optionLabel(logisticsStatuses, batch.logistics_status))}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/delivery-batches/${batch.id}">Ochish</button><button class="link-btn" data-nav="/delivery-batches/${batch.id}/edit">Tahrirlash</button><button class="link-btn" data-nav="/delivery-batches/${batch.id}?tab=logistics">Logistika</button><button class="link-btn" data-nav="/delivery-batches/${batch.id}?tab=documents">Hujjatlar</button></div></td></tr>`).join(""),
    emptyText: "Partiyalar topilmadi.",
    colspan: 14,
    footer: opsFooter(data, "batch"),
  });
  bindOpsSearch("batch-search-form", "/delivery-batches", ["search", "status"]);
  bindOpsPagination("batch", "/delivery-batches");
}

async function renderNewBatch() {
  const state = await batchWizardForm();
  renderBatchWizard(state);
}

async function renderEditBatch(id) {
  const batch = await api(`/api/delivery-batches/${id}`);
  app.innerHTML = await batchForm(batch);
  await bindBatchForm(batch);
}

function batchHeader(batch) {
  const logistics = batch.logistics || {};
  const quantity = batch.summary?.total_planned_quantity || batch.items?.[0]?.planned_quantity;
  return `<div class="workflow-header">
    <div class="page-title">
      <h1>Partiya: ${fmt(batch.batch_number)}</h1>
      <p>Buyurtma: ${fmt(batch.order?.order_number)} · Mijoz: ${fmt(batch.client?.name)} · Mahsulot: ${fmt(batchPrimaryProduct(batch))} · Miqdor: ${fmtQty(quantity, batch.items?.[0]?.unit)}</p>
    </div>
    <div class="actions workflow-actions">
      <button class="btn" data-nav="/delivery-batches">Orqaga</button>
      <details class="action-menu">
        <summary>Amallar</summary>
        <div>
          <button type="button" data-nav="/delivery-batches/${batch.id}?tab=quantity">Qabul miqdorini kiritish</button>
          <button type="button" data-transport-assignment>Transport biriktirish</button>
          <button type="button" data-nav="/delivery-batches/${batch.id}?tab=logistics">Logistika</button>
          <button type="button" data-nav="/delivery-batches/${batch.id}/edit">To'liq tahrirlash</button>
          <button type="button" data-nav="/customer-invoices/new?client_id=${batch.client_id}&contract_id=${batch.contract_id}&order_id=${batch.order_id}&delivery_batch_id=${batch.id}">Mijoz hisobi yaratish</button>
          <button type="button" data-nav="/supplier-invoices/new?delivery_batch_id=${batch.id}">Ta'minotchi hisobi yaratish</button>
        </div>
      </details>
      <button class="btn" data-nav="/delivery-batches/${batch.id}?tab=documents">Hujjat yuklash</button>
    </div>
  </div>${batchStatusCards(batch)}${batchWarningsPanel(batch)}${batchNextActionPanel(batch)}${batchWorkflowStepper(batch)}`;
}

function batchTabs(active) {
  return `<div class="tabs workflow-tabs">${[["general", "Umumiy"], ["quantity", "Miqdor"], ["logistics", "Logistika"], ["finance", "Moliya"], ["documents", "Hujjatlar"], ["history", "Tarix"]].map(([key, label]) => `<button class="tab ${active === key ? "active" : ""}" data-batch-tab="${key}">${label}</button>`).join("")}</div>`;
}

function batchActiveTab(batch, active) {
  if (active === "quantity") return section("Miqdor", `<div class="actions"><button class="btn primary" data-focus-acceptance>Qabul miqdorini kiritish</button></div><p class="helper-text">Farq faqat qabul miqdori kiritilgandan keyin hisoblanadi.</p><form id="batch-quantity-form">${tableOrEmpty(batch.items, ["Mahsulot", "Birlik", "Reja", "Yuklangan", "Qabul qilingan", "Farq", "Miqdor holati", "Izoh"], (item) => {
    const status = item.accepted_quantity === null || item.accepted_quantity === undefined ? { label: "Qabul kutilmoqda", tone: "warning" } : numberValue(item.difference_quantity) === 0 ? { label: "Mos", tone: "success" } : { label: "Miqdor farqi bor", tone: "warning" };
    return `<tr data-batch-item-row="${item.id}"><td>${fmt(item.product_name)}</td><td>${fmt(item.unit)}</td><td>${fmtQty(item.planned_quantity, item.unit)}</td><td><input name="loaded_quantity_${item.id}" type="number" step="any" value="${esc(item.loaded_quantity ?? "")}" /></td><td><input name="accepted_quantity_${item.id}" type="number" step="any" value="${esc(item.accepted_quantity ?? "")}" placeholder="Qabul kutilmoqda" /></td><td>${quantityDisplay(item.difference_quantity, item.unit)}</td><td>${statusChip(status)}</td><td><input name="comment_${item.id}" value="${esc(item.comment ?? "")}" /></td></tr>`;
  }, "Mahsulotlar hali yo'q.")}<div class="form-footer"><button class="btn primary" type="submit">Miqdorlarni saqlash</button></div></form>`);
  if (active === "logistics") {
    const logistics = batch.logistics || {};
    return `${section("Logistika xulosasi", `<div class="actions"><button class="btn primary" type="button" data-transport-assignment>Transportni biriktirish</button>${logistics.id ? `<button class="btn" data-nav="/logistics/${logistics.id}">Logistika sahifasi</button>` : ""}</div>${summaryCards([["Logistika raqami", fmt(logisticsNumber(logistics, batch))], ["Partiya", fmt(batch.batch_number)], ["Buyurtma", fmt(batch.order?.order_number)], ["Mijoz", fmt(batch.client?.name)], ["Mahsulot", fmt(batchPrimaryProduct(batch))], ["Miqdor", fmtQty(batch.summary?.total_planned_quantity, batch.items?.[0]?.unit)], ["Manba", fmt(optionLabel(sourceTypes, batch.source_type))], ["Model", fmt(optionLabel(fulfillmentTypes, batch.fulfillment_type))], ["Logistika holati", statusBadge(logistics.status || "not_assigned")]])}${logisticsWarnings(logistics, batch)}`)}${section("Transport biriktirish", detailList([["Tashuvchi", logistics.carrier_name], ["Haydovchi", logistics.driver_name], ["Haydovchi telefoni", logistics.driver_phone], ["Transport raqami", logistics.vehicle_number], ["Tirkama raqami", logistics.trailer_number]]))}${section("Sanalar", detailList([["Reja yuklash sanasi", logistics.planned_pickup_date], ["Reja yetkazish sanasi", logistics.planned_delivery_date], ["Haqiqiy yuklash sanasi", logistics.actual_pickup_date], ["Haqiqiy yetkazish sanasi", logistics.actual_delivery_date]]))}${section("Manzillar", detailList([["Yuklash manzili", logistics.loading_address], ["Yetkazish manzili", logistics.delivery_address]]))}${section("Xarajatlar", detailList([["Transport xarajati", fmtMoney(logistics.cost_amount)], ["Mijozga transport narxi", fmtMoney(logistics.customer_price)], ["Kim to'laydi", optionLabel(paidByTypes, logistics.paid_by)], ["Transport foydasi", transportProfit(logistics)]]))}${section("Logistika izohlari", detailList([["Izoh", logistics.notes]]))}`;
  }
  if (active === "finance") {
    const logistics = batch.logistics || {};
    return `${section("Moliya xulosasi", `${summaryCards([["Mijoz hisobi", "Hisoblar modulida"], ["Mijozdan to'lov", "To'lovlar modulida"], ["Ta'minotchi hisobi", "Ta'minotchi hisoblari modulida"], ["Ta'minotchi to'lovi", "Ta'minotchi to'lovlari modulida"], ["Transport xarajati", fmtMoney(logistics.cost_amount)], ["Mijozga transport narxi", fmtMoney(logistics.customer_price)], ["Transport foydasi", transportProfit(logistics)]])}<div class="actions"><button class="btn primary" data-nav="/customer-invoices/new?client_id=${batch.client_id}&contract_id=${batch.contract_id}&order_id=${batch.order_id}&delivery_batch_id=${batch.id}">Mijoz hisob-fakturasi yaratish</button><button class="btn" data-nav="/supplier-invoices/new?delivery_batch_id=${batch.id}">Ta'minotchi hisobi yaratish</button><button class="btn" data-nav="/customer-payments?client_id=${batch.client_id}">To'lovlarni ko'rish</button></div>`)}`;
  }
  if (active === "documents") {
    const docStatus = batchDocumentStatus(batch);
    return section("Hujjatlar", `<div class="workflow-doc-head"><div>${statusChip(docStatus)}${docStatus.key !== "complete" ? `<p class="helper-text">TTN va qabul dalolatnomasi majburiy hujjatlar.</p>` : ""}</div></div><form id="batch-document-form" class="toolbar"><select name="document_type">${batchDocumentTypes.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select><input name="title" placeholder="Hujjat nomi" required /><input name="uploaded_by" placeholder="Yuklagan" /><input name="file" type="file" required /><button class="btn primary" type="submit">Hujjat yuklash</button></form>${tableOrEmpty(batch.documents, ["Hujjat nomi", "Turi", "Yuklangan sana", "Yuklagan", "Amal"], (item) => `<tr><td>${fmt(item.title)}</td><td>${fmt(optionLabel(batchDocumentTypes, item.document_type))}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td><td>${item.file_url ? `<a class="link-btn" target="_blank" href="${esc(item.file_url)}">Ko'rish</a>` : dash}</td></tr>`, "Hujjatlar hali yo'q.")}`);
  }
  if (active === "history") return `${section("Jarayon tarixi", `<div class="workflow-timeline">${[
    ["Partiya yaratildi", fmtDate(batch.created_at)],
    ["Reja yuklash", batch.planned_loading_date],
    ["Haqiqiy yuklash", batch.logistics?.actual_pickup_date || batch.actual_loading_date],
    ["Yo'lga chiqdi", ["in_transit", "arrived", "unloading", "delivered", "accepted", "completed"].includes(batch.logistics?.status) ? optionLabel(logisticsStatuses, batch.logistics?.status) : ""],
    ["Haqiqiy yetkazish", batch.logistics?.actual_delivery_date || batch.actual_delivery_date],
    ["Qabul", batch.accepted_date || (batchHasAcceptedInput(batch) ? "Qabul miqdori kiritilgan" : "")],
    ["Hujjatlar", batch.documents?.length ? `${batch.documents.length} ta hujjat` : ""],
    ["Yakunlandi", batch.status === "completed" ? fmtDate(batch.updated_at) : ""],
  ].map(([label, value]) => `<div class="timeline-row"><span></span><strong>${label}</strong><em>${fmt(value)}</em></div>`).join("")}</div>`)}${section("Izohlar", `${tableOrEmpty(batch.notes_history, ["Sana", "Foydalanuvchi", "Izoh"], (item) => `<tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td></tr>`, "Izohlar hali yo'q.")}`)}`;
  const logistics = batch.logistics || {};
  return `${section("Asosiy ma'lumotlar", detailList([["Partiya sanasi", batch.batch_date], ["Reja yuklash sanasi", batch.planned_loading_date], ["Reja yetkazish sanasi", batch.planned_delivery_date], ["Manba", optionLabel(sourceTypes, batch.source_type)], ["Yetkazib berish modeli", optionLabel(fulfillmentTypes, batch.fulfillment_type)], ["Buyurtma", batch.order?.order_number], ["Shartnoma", batch.contract?.contract_number], ["Mijoz", batch.client?.name]]))}${section("Miqdor xulosasi", `${summaryCards([["Reja", fmtQty(batch.summary?.total_planned_quantity, batch.items?.[0]?.unit)], ["Yuklangan", fmtQty(batch.summary?.total_loaded_quantity, batch.items?.[0]?.unit)], ["Qabul qilingan", quantityDisplay(batch.summary?.total_accepted_quantity, batch.items?.[0]?.unit)], ["Farq", quantityDisplay(batch.summary?.total_difference_quantity, batch.items?.[0]?.unit)]])}<p class="helper-text">Farq faqat qabul miqdori kiritilgandan keyin hisoblanadi.</p>`)}${section("Logistika xulosasi", detailList([["Tashuvchi", logistics.carrier_name], ["Haydovchi", logistics.driver_name], ["Haydovchi telefoni", logistics.driver_phone], ["Transport raqami", logistics.vehicle_number], ["Tirkama raqami", logistics.trailer_number], ["Yuklash manzili", logistics.loading_address], ["Yetkazish manzili", logistics.delivery_address], ["Logistika holati", optionLabel(logisticsStatuses, logistics.status)]]))}${section("Moliya va hujjatlar", summaryCards([["Mijoz hisobi", "Hisoblar modulida"], ["Ta'minotchi hisobi", "Ta'minotchi hisoblari modulida"], ["Transport xarajati", fmtMoney(logistics.cost_amount)], ["Mijozga transport narxi", fmtMoney(logistics.customer_price)], ["TTN", batch.documents?.some((doc) => doc.document_type === "ttn") ? "Yuklangan" : "Yuklanmagan"], ["Qabul dalolatnomasi", batch.documents?.some((doc) => doc.document_type === "acceptance_act") ? "Yuklangan" : "Yuklanmagan"], ["Sifat sertifikati", batch.documents?.some((doc) => doc.document_type === "quality_certificate") ? "Yuklangan" : "Yuklanmagan"]]))}`;
}

async function transportAssignmentModal(batch) {
  const logistics = batch.logistics || {};
  const transportOptions = await fetchTransportsForSelect(logistics.carrier_id);
  const quantity = batch.summary?.total_planned_quantity || batch.items?.[0]?.planned_quantity;
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="transport-modal-title">
      <div class="modal-header">
        <h2 id="transport-modal-title">Transportni biriktirish</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="transport-assignment-form">
        <div class="modal-body">
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Mahsulot", batchPrimaryProduct(batch)],
            ["Miqdor", fmtQty(quantity, batch.items?.[0]?.unit)],
            ["Yuklash manzili", logistics.loading_address],
            ["Yetkazish manzili", logistics.delivery_address],
            ["Reja yuklash sanasi", logistics.planned_pickup_date || batch.planned_loading_date],
            ["Reja yetkazish sanasi", logistics.planned_delivery_date || batch.planned_delivery_date],
          ])}</div>
          <div class="grid">
            <label>Transport<select name="transport_id"><option value="">Transportni tanlang</option>${transportOptions}</select></label>
            <input type="hidden" name="carrier_id" value="${esc(logistics.carrier_id || "")}" />
            ${textField("carrier_name", "Tashuvchi", logistics.carrier_name, "text", { required: true })}
            ${textField("driver_name", "Haydovchi", logistics.driver_name, "text", { required: true })}
            ${textField("driver_phone", "Haydovchi telefoni", logistics.driver_phone)}
            ${textField("vehicle_number", "Transport raqami", logistics.vehicle_number, "text", { required: true })}
            ${textField("trailer_number", "Tirkama raqami", logistics.trailer_number)}
            ${textField("cost_amount", "Transport xarajati", logistics.cost_amount || "", "number")}
            ${textField("customer_price", "Mijozga transport narxi", logistics.customer_price || "", "number")}
            ${selectField("paid_by", "Kim to'laydi", paidByTypes, logistics.paid_by || "company")}
            ${textArea("notes", "Izoh", logistics.notes)}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit">Saqlash</button>
        </div>
      </form>
    </section>
  </div>`;
}

async function openTransportAssignmentModal(batch) {
  const logistics = batch.logistics || {};
  if (!logistics.id) return showToast("Logistika yozuvi topilmadi.", true);
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", await transportAssignmentModal(batch));
  const backdrop = document.querySelector(".modal-backdrop");
  const form = document.querySelector("#transport-assignment-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.elements.transport_id?.addEventListener("change", () => applySelectedTransport(form));
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const carrier = field(form, "carrier_name");
    const driver = field(form, "driver_name");
    const vehicle = field(form, "vehicle_number");
    const status = vehicle ? "vehicle_assigned" : carrier || driver ? "carrier_assigned" : "not_assigned";
    try {
      await api(`/api/logistics/${logistics.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          carrier_id: field(form, "carrier_id") ? Number(field(form, "carrier_id")) : null,
          carrier_name: carrier,
          driver_name: driver,
          driver_phone: field(form, "driver_phone"),
          vehicle_number: vehicle,
          trailer_number: field(form, "trailer_number"),
          cost_amount: field(form, "cost_amount") || "0",
          customer_price: field(form, "customer_price") || "0",
          paid_by: field(form, "paid_by") || "company",
          notes: field(form, "notes"),
        }),
      });
      showToast("Transport ma'lumotlari saqlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.carrier_name?.focus();
}

function loadingConfirmationModal(batch) {
  const logistics = batch.logistics || {};
  const quantity = batch.summary?.total_planned_quantity || batch.items?.[0]?.planned_quantity;
  const unit = batch.items?.[0]?.unit || "";
  const today = new Date().toISOString().slice(0, 10);
  const canLoad = ["carrier_assigned", "vehicle_assigned", "loading"].includes(logistics.status) || batch.status === "ready_for_loading";
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="loading-modal-title">
      <div class="modal-header">
        <h2 id="loading-modal-title">Yuklashni tasdiqlash</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="loading-confirmation-form">
        <div class="modal-body">
          ${!canLoad ? `<div class="workflow-warning"><strong>E'tibor kerak</strong><ul><li>Yuklandi deb belgilash uchun avval transportni biriktiring.</li></ul></div>` : ""}
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Mahsulot", batchPrimaryProduct(batch)],
            ["Reja miqdor", fmtQty(quantity, unit)],
            ["Tashuvchi", logistics.carrier_name],
            ["Haydovchi", logistics.driver_name],
            ["Transport raqami", logistics.vehicle_number],
            ["Yuklash manzili", logistics.loading_address],
            ["Reja yuklash sanasi", logistics.planned_pickup_date || batch.planned_loading_date],
          ])}</div>
          <div class="grid">
            ${textField("actual_loading_date", "Haqiqiy yuklash sanasi", today, "date", { required: true })}
            ${textField("loaded_quantity", "Yuklangan miqdor", quantity || "", "number", { required: true })}
            ${textArea("notes", "Izoh", "")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit" ${!canLoad ? "disabled" : ""}>Yuklandi</button>
        </div>
      </form>
    </section>
  </div>`;
}

function openLoadingConfirmationModal(batch) {
  const logistics = batch.logistics || {};
  if (!logistics.id) return showToast("Yuklandi deb belgilash uchun avval transportni biriktiring.", true);
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", loadingConfirmationModal(batch));
  const backdrop = document.querySelector(".modal-backdrop");
  const form = document.querySelector("#loading-confirmation-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const planned = numberValue(batch.summary?.total_planned_quantity || batch.items?.[0]?.planned_quantity);
    const loaded = numberValue(field(form, "loaded_quantity"));
    if (!field(form, "actual_loading_date")) return showToast("Haqiqiy yuklash sanasi majburiy.", true);
    if (!field(form, "loaded_quantity") || loaded <= 0) return showToast("Yuklangan miqdor 0 dan katta bo'lishi kerak.", true);
    let allowOverPlanned = false;
    if (planned && loaded > planned) {
      allowOverPlanned = confirm("Yuklangan miqdor reja miqdoridan oshgan. Davom etasizmi?");
      if (!allowOverPlanned) return;
    }
    try {
      await api(`/api/delivery-batches/${batch.id}/confirm-loading`, {
        method: "POST",
        body: JSON.stringify({
          actual_loading_date: field(form, "actual_loading_date"),
          loaded_quantity: field(form, "loaded_quantity"),
          notes: field(form, "notes"),
          allow_over_planned: allowOverPlanned,
        }),
      });
      showToast("Yuklash tasdiqlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.actual_loading_date?.focus();
}

function deliveryConfirmationModal(batch) {
  const logistics = batch.logistics || {};
  const loadedQuantity = batch.summary?.total_loaded_quantity || batch.items?.[0]?.loaded_quantity;
  const unit = batch.items?.[0]?.unit || "";
  const today = new Date().toISOString().slice(0, 10);
  const actualLoadingDate = logistics.actual_pickup_date || batch.actual_loading_date;
  const canDeliver = Boolean(logistics.id) && Boolean(actualLoadingDate) && ["loaded", "in_transit", "arrived", "unloading"].includes(logistics.status);
  const warning = !logistics.id || (!logistics.vehicle_number && !logistics.carrier_name && !logistics.driver_name)
    ? "Yetkazildi deb belgilash uchun avval transportni biriktiring."
    : !actualLoadingDate
      ? "Yetkazildi deb belgilash uchun avval yuklashni tasdiqlang."
      : !canDeliver
        ? "Yetkazildi deb belgilash uchun partiya avval yuklangan yoki yo'lda bo'lishi kerak."
        : "";
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="delivery-modal-title">
      <div class="modal-header">
        <h2 id="delivery-modal-title">Yetkazishni tasdiqlash</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="delivery-confirmation-form">
        <div class="modal-body">
          ${warning ? `<div class="workflow-warning"><strong>E'tibor kerak</strong><ul><li>${esc(warning)}</li></ul></div>` : ""}
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Mahsulot", batchPrimaryProduct(batch)],
            ["Yuklangan miqdor", fmtQty(loadedQuantity, unit)],
            ["Tashuvchi", logistics.carrier_name],
            ["Haydovchi", logistics.driver_name],
            ["Transport raqami", logistics.vehicle_number],
            ["Yuklash manzili", logistics.loading_address],
            ["Yetkazish manzili", logistics.delivery_address],
            ["Reja yetkazish sanasi", logistics.planned_delivery_date || batch.planned_delivery_date],
          ])}</div>
          <div class="grid">
            ${textField("actual_delivery_date", "Haqiqiy yetkazish sanasi", today, "date", { required: true })}
            ${textArea("notes", "Izoh", "")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit" ${warning ? "disabled" : ""}>Yetkazildi</button>
        </div>
      </form>
    </section>
  </div>`;
}

function openDeliveryConfirmationModal(batch) {
  const logistics = batch.logistics || {};
  if (!logistics.id) return showToast("Yetkazildi deb belgilash uchun avval transportni biriktiring.", true);
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", deliveryConfirmationModal(batch));
  const backdrop = document.querySelector(".modal-backdrop");
  const form = document.querySelector("#delivery-confirmation-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const actualLoadingDate = logistics.actual_pickup_date || batch.actual_loading_date;
    const actualDeliveryDate = field(form, "actual_delivery_date");
    if (!actualLoadingDate) return showToast("Yetkazildi deb belgilash uchun avval yuklashni tasdiqlang.", true);
    if (!actualDeliveryDate) return showToast("Haqiqiy yetkazish sanasi majburiy.", true);
    if (actualDeliveryDate < actualLoadingDate) return showToast("Haqiqiy yetkazish sanasi haqiqiy yuklash sanasidan oldin bo'lishi mumkin emas.", true);
    try {
      await api(`/api/delivery-batches/${batch.id}/confirm-delivery`, {
        method: "POST",
        body: JSON.stringify({
          actual_delivery_date: actualDeliveryDate,
          notes: field(form, "notes"),
        }),
      });
      showToast("Yetkazish tasdiqlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.actual_delivery_date?.focus();
}

async function batchFinancePresence(batch) {
  const result = { customerInvoices: [], supplierInvoices: [], checked: false };
  try {
    const [customer, supplier] = await Promise.all([
      api(`/api/customer-invoices?delivery_batch_id=${batch.id}&page_size=100`),
      api(`/api/supplier-invoices?delivery_batch_id=${batch.id}&page_size=100`),
    ]);
    result.customerInvoices = customer.items || [];
    result.supplierInvoices = supplier.items || [];
    result.checked = true;
  } catch (error) {
    showToast(error.message, true);
  }
  return result;
}

function completionValidation(batch, finance = {}) {
  const logistics = batch.logistics || {};
  const docStatus = batchDocumentStatus(batch);
  const blockers = [];
  const warnings = [];
  if (!batchHasAcceptedInput(batch)) blockers.push("Partiyani yakunlash uchun avval qabul qilingan miqdorni kiriting.");
  if (!["delivered", "accepted", "completed"].includes(logistics.status)) blockers.push("Partiyani yakunlash uchun logistika jarayoni yakunlangan bo'lishi kerak.");
  if (docStatus.key !== "complete") warnings.push("Majburiy hujjatlar hali to'liq yuklanmagan.");
  if ((batch.items || []).some((item) => item.difference_quantity !== null && numberValue(item.difference_quantity) !== 0)) warnings.push("Yuklangan va qabul qilingan miqdor farq qiladi.");
  if (finance.checked && !(finance.customerInvoices || []).length) warnings.push("Mijoz hisob-fakturasi hali yaratilmagan.");
  if (finance.checked && !(finance.supplierInvoices || []).length) warnings.push("Ta'minotchi hisobi hali yaratilmagan.");
  return { blockers, warnings, docStatus };
}

function completionConfirmationModal(batch, finance = {}) {
  const logistics = batch.logistics || {};
  const unit = batch.items?.[0]?.unit || "";
  const today = new Date().toISOString().slice(0, 10);
  const validation = completionValidation(batch, finance);
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="completion-modal-title">
      <div class="modal-header">
        <h2 id="completion-modal-title">Partiyani yakunlash</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="completion-confirmation-form">
        <div class="modal-body">
          ${validation.blockers.length ? workflowWarningsPanel(validation.blockers, "Yakunlab bo'lmaydi") : ""}
          ${validation.warnings.length ? workflowWarningsPanel(validation.warnings, "Tasdiqlashdan oldin tekshiring") : ""}
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Mahsulot", batchPrimaryProduct(batch)],
            ["Reja miqdor", fmtQty(batch.summary?.total_planned_quantity, unit)],
            ["Yuklangan miqdor", fmtQty(batch.summary?.total_loaded_quantity, unit)],
            ["Qabul qilingan miqdor", quantityDisplay(batch.summary?.total_accepted_quantity, unit)],
            ["Farq", quantityDisplay(batch.summary?.total_difference_quantity, unit)],
            ["Logistika holati", statusLabel(logistics.status)],
            ["Hujjatlar holati", validation.docStatus.label],
            ["Moliya holati", `${(finance.customerInvoices || []).length ? "Mijoz hisobi bor" : "Mijoz hisobi yo'q"} · ${(finance.supplierInvoices || []).length ? "Ta'minotchi hisobi bor" : "Ta'minotchi hisobi yo'q"}`],
          ])}</div>
          <div class="grid">
            ${textField("completed_date", "Yakunlash sanasi", today, "date", { required: true })}
            ${textArea("notes", "Yakunlash izohi", "")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit" ${validation.blockers.length ? "disabled" : ""}>Yakunlash</button>
        </div>
      </form>
    </section>
  </div>`;
}

async function openCompletionConfirmationModal(batch) {
  const finance = await batchFinancePresence(batch);
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", completionConfirmationModal(batch, finance));
  const backdrop = document.querySelector(".modal-backdrop");
  const form = document.querySelector("#completion-confirmation-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const validation = completionValidation(batch, finance);
    const missingDocs = validation.warnings.some((warning) => warning.includes("hujjat"));
    const quantityDiff = validation.warnings.some((warning) => warning.includes("farq"));
    if (!field(form, "completed_date")) return showToast("Yakunlash sanasi majburiy.", true);
    if (missingDocs && !confirm("Hujjatlar to'liq emas. Baribir yakunlashni xohlaysizmi?")) return;
    if (quantityDiff && !confirm("Yuklangan va qabul qilingan miqdor farq qiladi. Baribir yakunlashni xohlaysizmi?")) return;
    try {
      await api(`/api/delivery-batches/${batch.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          completed_date: field(form, "completed_date"),
          notes: field(form, "notes"),
          allow_missing_documents: missingDocs,
          allow_quantity_difference: quantityDiff,
        }),
      });
      showToast("Partiya yakunlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.completed_date?.focus();
}

async function markBatchInTransit(batch) {
  const logistics = batch.logistics || {};
  if (!logistics.id) return showToast("Logistika yozuvi topilmadi.", true);
  try {
    await api(`/api/logistics/${logistics.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_transit" }),
    });
    showToast("Partiya yo'lga chiqdi deb belgilandi.");
    renderBatchDetail(batch.id);
  } catch (error) {
    showToast(error.message, true);
  }
}

function bindBatchDetailActions(batch) {
  document.querySelectorAll("[data-transport-assignment]").forEach((button) => {
    button.addEventListener("click", () => openTransportAssignmentModal(batch).catch((error) => showToast(error.message, true)));
  });

  document.querySelectorAll("[data-loading-confirmation]").forEach((button) => {
    button.addEventListener("click", () => openLoadingConfirmationModal(batch));
  });

  document.querySelectorAll("[data-delivery-confirmation]").forEach((button) => {
    button.addEventListener("click", () => openDeliveryConfirmationModal(batch));
  });

  document.querySelectorAll("[data-completion-confirmation]").forEach((button) => {
    button.addEventListener("click", () => openCompletionConfirmationModal(batch));
  });

  document.querySelectorAll("[data-mark-in-transit]").forEach((button) => {
    button.addEventListener("click", () => markBatchInTransit(batch));
  });

  document.querySelector("[data-focus-acceptance]")?.addEventListener("click", () => {
    document.querySelector("[name^='accepted_quantity_']")?.focus();
  });

  document.querySelector("#batch-quantity-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const updates = (batch.items || []).map((item) => {
        const row = document.querySelector(`[data-batch-item-row="${item.id}"]`);
        return api(`/api/delivery-batches/${batch.id}/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            loaded_quantity: normalizeNumberInputValue(row.querySelector(`[name="loaded_quantity_${item.id}"]`)?.value) || null,
            accepted_quantity: normalizeNumberInputValue(row.querySelector(`[name="accepted_quantity_${item.id}"]`)?.value) || null,
            comment: row.querySelector(`[name="comment_${item.id}"]`)?.value || null,
          }),
        });
      });
      await Promise.all(updates);
      showToast("Miqdorlar saqlandi.");
      render();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.querySelector("#batch-document-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await apiForm(`/api/delivery-batches/${batch.id}/documents/upload`, new FormData(form));
      showToast("Hujjat yuklandi.");
      render();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderBatchDetail(id) {
  const batch = await api(`/api/delivery-batches/${id}`);
  const tab = new URLSearchParams(location.search).get("tab") || "general";
  const active = tab === "products" ? "quantity" : tab === "notes" ? "history" : tab;
  app.innerHTML = `<div class="page">${batchHeader(batch)}${batchTabs(active)}${batchActiveTab(batch, active)}</div>`;
  document.querySelectorAll("[data-batch-tab]").forEach((button) => button.addEventListener("click", () => navigate(`/delivery-batches/${id}?tab=${button.dataset.batchTab}`)));
  bindBatchDetailActions(batch);
}

async function renderLogisticsList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/logistics?${params.toString()}`);
  app.innerHTML = opsListPage({
    className: "logistics-ops-page",
    title: "Logistika",
    tabs: [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", active: true }, { label: "Transportlar", path: "/transports" }],
    clearPath: "/logistics",
    counter: `${fmt(data.total)} ta logistika yozuvi`,
    formId: "logistics-search-form",
    filters: `<input name="search" placeholder="Partiya, tashuvchi, haydovchi, mashina, mijoz" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${logisticsStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`,
    headers: ["Logistika", "Partiya", "Buyurtma", "Mijoz", "Model", "Tashuvchi", "Haydovchi", "Transport", "Status", "Reja yetkazish", "Haqiqiy yetkazish", "Xarajat", "Mijoz narxi", ""],
    rows: data.items.map((row) => `<tr><td><button class="ops-primary-link" data-nav="/logistics/${row.id}">${fmt(logisticsNumber(row, row.batch))}</button></td><td>${fmt(row.batch?.batch_number)}</td><td>${fmt(row.order?.order_number)}</td><td>${fmt(row.client?.name)}</td><td>${fmt(optionLabel(fulfillmentTypes, row.fulfillment_type))}</td><td>${fmt(row.carrier_name)}</td><td>${fmt(row.driver_name)}</td><td>${fmt(row.vehicle_number)}</td><td>${statusBadge(row.status)}</td><td>${fmt(row.planned_delivery_date)}</td><td>${fmt(row.actual_delivery_date)}</td><td class="ops-money">${fmtMoney(row.cost_amount)}</td><td class="ops-money">${fmtMoney(row.customer_price)}</td><td><button class="link-btn" data-nav="/logistics/${row.id}">Ochish</button></td></tr>`).join(""),
    emptyText: "Logistika yozuvlari topilmadi.",
    colspan: 14,
    footer: opsFooter(data, "logistics"),
  });
  bindOpsSearch("logistics-search-form", "/logistics", ["search", "status"]);
  bindOpsPagination("logistics", "/logistics");
}

async function renderLogisticsDetail(id) {
  const row = await api(`/api/logistics/${id}`);
  app.innerHTML = `<div class="page"><div class="page-header"><div class="page-title"><h1>${fmt(logisticsNumber(row, row.batch))}</h1><p>${fmt(row.client?.name)} · ${fmt(row.order?.order_number)} · ${fmt(optionLabel(logisticsStatuses, row.status))}</p></div><div class="actions"><button class="btn" data-nav="/logistics">Orqaga</button><button class="btn" data-nav="/delivery-batches/${row.batch?.id}?tab=logistics">Partiyani ochish</button><button class="btn" data-nav="/delivery-batches/${row.batch?.id}/edit">Tahrirlash</button></div></div>${summaryCards([["Partiya", fmt(row.batch?.batch_number)], ["Buyurtma", fmt(row.order?.order_number)], ["Mijoz", fmt(row.client?.name)], ["Status", statusBadge(row.status)], ["Tashuvchi", fmt(row.carrier_name)], ["Transport", fmt(row.vehicle_number)], ["Transport xarajati", fmtMoney(row.cost_amount)], ["Mijoz transport narxi", fmtMoney(row.customer_price)], ["Transport foydasi", transportProfit(row)]])}${logisticsWarnings(row, row.batch || {})}${section("Logistika xulosasi", detailList([["Logistika raqami", logisticsNumber(row, row.batch)], ["Partiya raqami", row.batch?.batch_number], ["Buyurtma raqami", row.order?.order_number], ["Mijoz", row.client?.name], ["Yetkazib berish modeli", optionLabel(fulfillmentTypes, row.batch?.fulfillment_type)], ["Yetkazish usuli", row.delivery_method], ["Holat", optionLabel(logisticsStatuses, row.status)]]))}${section("Transport biriktirish", detailList([["Tashuvchi", row.carrier_name], ["Haydovchi", row.driver_name], ["Haydovchi telefoni", row.driver_phone], ["Transport raqami", row.vehicle_number], ["Tirkama raqami", row.trailer_number]]))}${section("Sanalar", detailList([["Reja yuklash sanasi", row.planned_pickup_date], ["Reja yetkazish sanasi", row.planned_delivery_date], ["Haqiqiy yuklash sanasi", row.actual_pickup_date], ["Haqiqiy yetkazish sanasi", row.actual_delivery_date]]))}${section("Manzillar", detailList([["Yuklash manzili", row.loading_address], ["Yetkazish manzili", row.delivery_address]]))}${section("Xarajatlar", detailList([["Transport xarajati", fmtMoney(row.cost_amount)], ["Mijozga transport narxi", fmtMoney(row.customer_price)], ["Transport foydasi", transportProfit(row)], ["Kim to'laydi", optionLabel(paidByTypes, row.paid_by)]]))}${section("Hujjatlar", `${tableOrEmpty(row.documents, ["Nomi", "Turi", "Yuklangan sana", "Yuklagan"], (item) => `<tr><td>${fmt(item.title)}</td><td>${fmt(item.document_type)}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td></tr>`, "Logistika hujjatlari hali yo'q.")}`)}${section("Izohlar / Tarix", `${tableOrEmpty(row.notes_history, ["Sana", "Foydalanuvchi", "Izoh"], (item) => `<tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td></tr>`, "Logistika izohlari hali yo'q.")}`)}${section("Jarayon tarixi", logisticsTimeline(row, row.batch || {}))}</div>`;
}
