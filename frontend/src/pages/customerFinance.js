async function fetchClientsOptions(selectedId = null) {
  const clients = await fetchAllClients();
  return clients.map((client) => `<option value="${client.id}" ${Number(selectedId) === client.id ? "selected" : ""}>${esc(client.name)}${client.inn ? ` - ${esc(client.inn)}` : ""}</option>`).join("");
}

function financeItemRow(item = {}, index = 0) {
  return `<div class="item-row" data-finance-item-row>${textField(`description_${index}`, "Description", item.description)}${textField(`product_name_${index}`, "Product", item.product_name)}${textField(`unit_${index}`, "Unit", item.unit || "dona")}${textField(`quantity_${index}`, "Quantity", item.quantity ?? 1, "number")}${textField(`unit_price_${index}`, "Unit price", item.unit_price ?? "", "number")}${textField(`vat_rate_${index}`, "VAT %", item.vat_rate ?? 12, "number")}<button type="button" class="btn danger" data-remove-finance-item>Remove</button></div>`;
}

function generatedInvoiceNumber(contractNumber = "", batchNumber = "") {
  const now = new Date();
  const today = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = now.toTimeString().slice(0, 8).replaceAll(":", "");
  const source = batchNumber || contractNumber || "Qo'lda";
  return `CINV-${source}-${today}${time}`;
}

async function invoiceRowsFromBatch(batchId) {
  if (!batchId) return null;
  const batch = await api(`/api/delivery-batches/${batchId}`);
  const order = await api(`/api/orders/${batch.order_id}`);
  const orderItems = new Map(order.items.map((item) => [item.id, item]));
  const rows = batch.items.map((item) => {
    const orderItem = orderItems.get(item.order_item_id) || {};
    const quantity = numberValue(item.accepted_quantity || item.loaded_quantity || item.planned_quantity);
    return {
      description: `${batch.batch_number} partiyasi bo'yicha ${item.product_name}`,
      product_name: item.product_name,
      unit: item.unit,
      quantity: quantity || 1,
      unit_price: orderItem.unit_price || "",
      vat_rate: orderItem.vat_rate || 12,
    };
  }).filter((item) => item.product_name);
  return { batch, rows: rows.length ? rows : [{}] };
}

function replaceFinanceItems(rows) {
  document.querySelector("#finance-items").innerHTML = rows.map(financeItemRow).join("");
}

function calculateFinanceForm(form) {
  let subtotal = 0, vat = 0;
  [...form.querySelectorAll("[data-finance-item-row]")].forEach((row) => {
    const q = numberValue(row.querySelector("[name^='quantity_']").value);
    const p = numberValue(row.querySelector("[name^='unit_price_']").value);
    const r = numberValue(row.querySelector("[name^='vat_rate_']").value || 12);
    subtotal += q * p;
    vat += q * p * r / 100;
  });
  form.querySelectorAll("[data-finance-subtotal]").forEach((el) => el.textContent = fmtMoney(subtotal));
  form.querySelectorAll("[data-finance-vat]").forEach((el) => el.textContent = fmtMoney(vat));
  form.querySelectorAll("[data-finance-total]").forEach((el) => el.textContent = fmtMoney(subtotal + vat));
}

function collectFinanceItems(form) {
  return [...form.querySelectorAll("[data-finance-item-row]")].map((row, index) => ({
    description: field(form, `description_${index}`),
    product_name: field(form, `product_name_${index}`),
    unit: field(form, `unit_${index}`),
    quantity: field(form, `quantity_${index}`),
    unit_price: field(form, `unit_price_${index}`),
    vat_rate: field(form, `vat_rate_${index}`) || "12",
  })).filter((item) => item.description && item.quantity);
}

async function invoiceForm(invoice = null) {
  const params = invoice ? new URLSearchParams() : new URLSearchParams(location.search);
  const today = todayIso();
  let prefillContract = null;
  if (params.get("contract_id")) {
    try {
      prefillContract = await api(`/api/contracts/${params.get("contract_id")}`);
    } catch (error) {
      showToast(error.message, true);
    }
  }
  const selectedClientId = invoice?.client_id || prefillContract?.client_id || prefillContract?.client?.id || params.get("client_id");
  const selectedContractId = invoice?.contract_id || prefillContract?.id || params.get("contract_id");
  const selectedOrderId = invoice?.order_id || params.get("order_id");
  const selectedBatchId = invoice?.delivery_batch_id || params.get("delivery_batch_id");
  const invoiceDate = invoice?.invoice_date || today;
  const dueDate = invoice?.due_date || addBusinessDays(invoiceDate, prefillContract?.payment_terms?.advance_due_days || 0);
  const invoiceType = invoice?.invoice_type || (selectedBatchId || selectedOrderId ? "batch_payment" : selectedContractId ? "advance" : "other");
  let batchPrefill = null;
  if (!invoice && selectedBatchId) {
    try {
      batchPrefill = await invoiceRowsFromBatch(selectedBatchId);
    } catch (error) {
      showToast(error.message, true);
    }
  }
  const advanceAmount = numberValue(prefillContract?.payment_terms?.advance_amount || prefillContract?.summary?.advance_amount);
  const defaultRows = prefillContract && invoiceType === "advance" && advanceAmount > 0 ? [{
    description: `${prefillContract.contract_number} bo'yicha avans hisobi`,
    product_name: "Avans",
    unit: "dona",
    quantity: 1,
    unit_price: (advanceAmount / 1.12).toFixed(2),
    vat_rate: 12,
  }] : [{}];
  const rows = invoice?.items?.length ? invoice.items : batchPrefill?.rows || defaultRows;
  const invoiceNumber = invoice?.invoice_number || generatedInvoiceNumber(prefillContract?.contract_number, batchPrefill?.batch?.batch_number);
  const clients = await fetchClientsOptions(selectedClientId);
  const contracts = await fetchContractsForSelect(selectedContractId, selectedClientId);
  const orders = await fetchOrdersForSelect(selectedOrderId, { clientId: selectedClientId, contractId: selectedContractId });
  const batches = await fetchBatchesForSelect(selectedBatchId, { clientId: selectedClientId, contractId: selectedContractId, orderId: selectedOrderId });
  return `<div class="page"><div class="page-header"><div class="page-title"><h1>${invoice ? "Edit invoice" : "New invoice"}</h1><p>Customer invoice and manual items.</p></div><div class="actions"><button class="btn" data-nav="${invoice ? `/customer-invoices/${invoice.id}` : "/customer-invoices"}">Back</button></div></div><form id="invoice-form"><input type="hidden" name="logistics_id" value="${esc(invoice?.logistics_id || batchPrefill?.batch?.logistics?.id || "")}" />${section("Basic information", `<div class="grid"><label>Client${selectSearch("client_id", "Mijoz nomi yoki STIR bo'yicha qidiring")}<select name="client_id"><option value="">Select client</option>${clients}</select></label><label>Contract<select name="contract_id"><option value="">—</option>${contracts}</select></label><label>Order<select name="order_id"><option value="">—</option>${orders}</select></label><label>Batch<select name="delivery_batch_id"><option value="">—</option>${batches}</select></label>${readonlyField("invoice_number", "Invoice number", invoiceNumber)}${textField("invoice_date", "Invoice date", invoiceDate, "date")}${textField("due_date", "Due date", dueDate, "date")}${selectField("invoice_type", "Type", invoiceTypes, invoiceType)}${selectField("status", "Status", invoiceStatuses, invoice?.status || "issued")}${textArea("notes", "Notes", invoice?.notes)}</div>`)}${section("Invoice items", `<div id="finance-items">${rows.map(financeItemRow).join("")}</div><button type="button" class="btn" id="add-finance-item">Add item</button><div class="totals-bar"><div class="total-box"><span>Subtotal</span><strong data-finance-subtotal>${dash}</strong></div><div class="total-box"><span>VAT</span><strong data-finance-vat>${dash}</strong></div><div class="total-box"><span>Total</span><strong data-finance-total>${dash}</strong></div></div>`)}${section("Documents", `<div class="empty">Hujjatlarni hisob saqlangandan keyin Hujjatlar bo'limidan yuklash mumkin.</div>`)}<div class="form-footer"><button type="button" class="btn" data-nav="${invoice ? `/customer-invoices/${invoice.id}` : "/customer-invoices"}">Cancel</button><button class="btn primary" type="submit">Save</button></div></form></div>`;
}

function bindInvoiceForm(invoice = null) {
  const form = document.querySelector("#invoice-form");
  function selectedPrefix(selectName) {
    const selected = form.elements[selectName]?.selectedOptions?.[0]?.textContent || "";
    return selected.split(" - ")[0].trim();
  }
  function refreshInvoiceNumber(batchNumber = "") {
    if (invoice) return;
    form.elements.invoice_number.value = generatedInvoiceNumber(selectedPrefix("contract_id"), batchNumber || selectedPrefix("delivery_batch_id"));
  }
  async function applySelectedBatch() {
    const batchId = form.elements.delivery_batch_id.value;
    refreshInvoiceNumber();
    if (!batchId) return;
    const result = await invoiceRowsFromBatch(batchId);
    form.elements.logistics_id.value = result.batch?.logistics?.id || "";
    form.elements.invoice_type.value = "batch_payment";
    replaceFinanceItems(result.rows);
    calculateFinanceForm(form);
  }
  async function reloadInvoiceSelects(changed) {
    const clientId = form.elements.client_id.value;
    const contractId = changed === "client" ? "" : form.elements.contract_id.value;
    const orderId = changed === "client" || changed === "contract" ? "" : form.elements.order_id.value;
    if (changed === "client") {
      form.elements.contract_id.innerHTML = `<option value="">—</option>${await fetchContractsForSelect(null, clientId)}`;
    }
    if (changed === "client" || changed === "contract") {
      form.elements.order_id.innerHTML = `<option value="">—</option>${await fetchOrdersForSelect(null, { clientId, contractId })}`;
    }
    form.elements.delivery_batch_id.innerHTML = `<option value="">—</option>${await fetchBatchesForSelect(null, { clientId, contractId, orderId })}`;
    form.elements.logistics_id.value = "";
    refreshInvoiceNumber("");
    replaceFinanceItems([{}]);
    calculateFinanceForm(form);
  }
  form.elements.client_id.addEventListener("change", () => reloadInvoiceSelects("client"));
  form.elements.contract_id.addEventListener("change", () => reloadInvoiceSelects("contract"));
  form.elements.order_id.addEventListener("change", () => reloadInvoiceSelects("order"));
  form.elements.delivery_batch_id.addEventListener("change", () => applySelectedBatch().catch((error) => showToast(error.message, true)));
  form.addEventListener("input", () => calculateFinanceForm(form));
  document.querySelector("#add-finance-item").addEventListener("click", () => {
    const index = form.querySelectorAll("[data-finance-item-row]").length;
    document.querySelector("#finance-items").insertAdjacentHTML("beforeend", financeItemRow({}, index));
    calculateFinanceForm(form);
  });
  form.addEventListener("click", (event) => {
    if (!event.target.matches("[data-remove-finance-item]")) return;
    if (form.querySelectorAll("[data-finance-item-row]").length <= 1) return showToast("Invoice must have at least one item.", true);
    event.target.closest("[data-finance-item-row]").remove();
    calculateFinanceForm(form);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      client_id: Number(field(form, "client_id")),
      contract_id: field(form, "contract_id") ? Number(field(form, "contract_id")) : null,
      order_id: field(form, "order_id") ? Number(field(form, "order_id")) : null,
      delivery_batch_id: field(form, "delivery_batch_id") ? Number(field(form, "delivery_batch_id")) : null,
      logistics_id: field(form, "logistics_id") ? Number(field(form, "logistics_id")) : null,
      invoice_number: field(form, "invoice_number"),
      invoice_date: field(form, "invoice_date"),
      due_date: field(form, "due_date"),
      invoice_type: field(form, "invoice_type"),
      status: field(form, "status"),
      currency: "UZS",
      notes: field(form, "notes"),
      items: collectFinanceItems(form),
    };
    try {
      const saved = await api(invoice ? `/api/customer-invoices/${invoice.id}` : "/api/customer-invoices", { method: invoice ? "PATCH" : "POST", body: JSON.stringify(payload) });
      showToast("Invoice saved.");
      navigate(`/customer-invoices/${saved.id}`);
    } catch (error) { showToast(error.message, true); }
  });
  calculateFinanceForm(form);
}

async function renderInvoicesList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/customer-invoices?${params.toString()}`);
  const openCount = data.items.filter((item) => numberValue(item.remaining_amount) > 0).length;
  const editable = canEdit("moliya");
  app.innerHTML = opsListPage({
    className: "invoice-ops-page",
    title: "Mijoz hisoblari",
    tabs: [{ label: "Hisoblar", active: true }, { label: "Debitorlik", path: "/receivables" }, { label: "To'lovlar", path: "/customer-payments" }],
    createPath: editable ? "/customer-invoices/new" : null,
    createLabel: "Yangi hisob",
    clearPath: "/customer-invoices",
    counter: `${fmt(data.total)} ta hisob · ${fmt(openCount)} ta ochiq`,
    formId: "invoice-search-form",
    filters: `${opsFilterField("Qidirish", `<input name="search" placeholder="Hisob, mijoz, shartnoma" value="${esc(params.get("search") || "")}" />`)}${opsFilterField("Turi", `<select name="invoice_type"><option value="">Barcha turlar</option>${invoiceTypes.map(([k,l])=>`<option value="${k}" ${params.get("invoice_type")===k?"selected":""}>${l}</option>`).join("")}</select>`)}${opsFilterField("Status", `<select name="status"><option value="">Barcha statuslar</option>${invoiceStatuses.map(([k,l])=>`<option value="${k}" ${params.get("status")===k?"selected":""}>${l}</option>`).join("")}</select>`)}`,
    headers: ["Hisob raqami", "Mijoz", "Shartnoma", "Buyurtma", "Partiya", "Turi", "Hisob sanasi", "Jami", "To'langan", "Qoldiq", "Status", ""],
    rows: data.items.map((i)=>`<tr><td><button class="ops-primary-link" data-nav="/customer-invoices/${i.id}">${fmt(i.invoice_number)}</button></td><td>${fmt(i.client?.name)}</td><td>${fmt(i.contract?.contract_number)}</td><td>${fmt(i.order?.order_number)}</td><td>${fmt(i.delivery_batch?.batch_number)}</td><td>${fmt(optionLabel(invoiceTypes,i.invoice_type))}</td><td>${fmt(i.invoice_date)}</td><td class="ops-money">${fmtMoney(i.total_amount)}</td><td class="ops-money">${fmtMoney(i.paid_amount)}</td><td class="ops-money ${numberValue(i.remaining_amount) > 0 ? "ops-warning" : ""}">${fmtMoney(i.remaining_amount)}</td><td>${statusBadge(i.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/customer-invoices/${i.id}">Ochish</button>${editable ? `<button class="link-btn" data-nav="/customer-invoices/${i.id}/edit">Tahrirlash</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Hisoblar topilmadi.",
    colspan: 12,
    footer: opsFooter(data, "invoice"),
  });
  bindOpsSearch("invoice-search-form", "/customer-invoices", ["search", "invoice_type", "status"]);
  bindOpsPagination("invoice", "/customer-invoices");
}

async function renderNewInvoice(){ app.innerHTML = await invoiceForm(); bindInvoiceForm(); }
async function renderEditInvoice(id){ const invoice=await api(`/api/customer-invoices/${id}`); app.innerHTML=await invoiceForm(invoice); bindInvoiceForm(invoice); }

async function renderInvoiceDetail(id) {
  const i = await api(`/api/customer-invoices/${id}`);
  const payState = financePaymentState(i);
  const editable = canEdit("moliya");
  const warnings = [];
  if (numberValue(i.remaining_amount) > 0) warnings.push("Hisob bo'yicha to'lanmagan qoldiq mavjud.");
  if (!i.items?.length) warnings.push("Hisob elementlari bo'sh.");
  if (!hasDocs(i)) warnings.push("Hisob hujjati yuklanmagan.");
  const headerActions = [];
  if (editable) headerActions.push({label:"To'lov kiritish",path:`/customer-payments/new?client_id=${i.client_id}`,primary:true});
  headerActions.push({label:"Hujjat yuklash",path:`/customer-invoices/${i.id}#invoice-document-upload-form`});
  const nextAction = numberValue(i.remaining_amount)>0
    ? { title: "To'lovni kiriting yoki mavjud to'lovni taqsimlang", ...(editable ? { button: "To'lov kiritish", path: `/customer-payments/new?client_id=${i.client_id}` } : {}) }
    : { title: "Hisob to'liq yopilgan", button: "Tarix", path: `/customer-invoices/${i.id}#history`, done: true };
  app.innerHTML = `<div class="page">${workflowHeader({title:i.invoice_number,subtitle:subtitleLine([{value:i.client?.name,raw:true},{value:i.contract?.contract_number,raw:true},{value:optionLabel(invoiceTypes,i.invoice_type)}]),backPath:"/customer-invoices",fullEditPath:editable ? `/customer-invoices/${i.id}/edit` : "",actions:headerActions})}${workflowStatusGrid([["Hisob holati",statusBadge(i.status)],["To'lov holati",statusChip(payState)],["Muddati",fmt(i.due_date)],["Hujjat holati",statusChip(hasDocs(i)?{label:"Yuklangan",tone:"success"}:{label:"Kutilmoqda",tone:"warning"})]])}${summaryCards([["Sof summa",fmtMoney(i.subtotal_amount)],["QQS",fmtMoney(i.vat_amount)],["Jami",fmtMoney(i.total_amount)],["To'langan",fmtMoney(i.paid_amount)],["Qoldiq",fmtMoney(i.remaining_amount)],["To'lov muddati",fmt(i.due_date)]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${section("Umumiy ma'lumotlar", detailList([["Hisob raqami",i.invoice_number],["Hisob sanasi",i.invoice_date],["To'lov muddati",i.due_date],["Turi",optionLabel(invoiceTypes,i.invoice_type)],["Status",optionLabel(invoiceStatuses,i.status)],["Mijoz",i.client?.name],["Shartnoma",i.contract?.contract_number],["Buyurtma",i.order?.order_number],["Partiya",i.delivery_batch?.batch_number],["Valyuta",i.currency],["Izoh",i.notes],["Yaratilgan",fmtDate(i.created_at)],["Yangilangan",fmtDate(i.updated_at)]]))}${section("Hisob elementlari", tableOrEmpty(i.items,["Tavsif","Mahsulot","Birlik","Miqdor","Birlik narxi","QQS","Jami"],(it)=>`<tr><td>${fmt(it.description)}</td><td>${fmt(it.product_name)}</td><td>${fmt(it.unit)}</td><td>${fmtQty(it.quantity)}</td><td>${fmtMoney(it.unit_price)}</td><td>${fmtMoney(it.vat_amount)}</td><td>${fmtMoney(it.total_with_vat)}</td></tr>`,"Hisob elementlari yo'q."))}${section("To'lovlar / Taqsimlash", tableOrEmpty(i.allocations,["To'lov","Taqsimlangan summa","Yaratgan","Yaratilgan"],(a)=>`<tr><td>${fmt(a.payment?.payment_number || a.payment_number || "Mijoz to'lovi")}</td><td>${fmtMoney(a.allocated_amount)}</td><td>${fmt(a.created_by)}</td><td>${fmtDate(a.created_at)}</td></tr>`,"Taqsimlangan to'lovlar yo'q."))}${section("Hujjatlar", `${editable ? `<form id="invoice-document-upload-form" class="toolbar"><select name="document_type">${financeDocumentTypes.map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select><input name="title" placeholder="Hujjat nomi" value="${esc(i.invoice_number)} hujjati" /><input name="file" type="file" required /><button class="btn primary" type="submit">Yuklash</button></form>` : ""}${tableOrEmpty(i.documents,["Hujjat nomi","Turi","Yuklangan","Amal"],(d)=>`<tr><td>${fmt(d.title)}</td><td>${fmt(optionLabel(financeDocumentTypes,d.document_type))}</td><td>${fmtDate(d.uploaded_at)}</td><td>${d.file_url ? `<a class="link-btn" target="_blank" href="${esc(d.file_url)}">Ko'rish</a><a class="link-btn" href="${esc(d.file_url)}" download>Yuklab olish</a>` : dash}</td></tr>`,"Hujjatlar yo'q.")}`)}${section("Tarix", tableOrEmpty(i.notes_history,["Sana","Foydalanuvchi","Izoh"],(n)=>`<tr><td>${fmtDate(n.created_at)}</td><td>${fmt(n.created_by)}</td><td>${fmt(n.note)}</td></tr>`,"Tarix yozuvlari yo'q."))}</div>`;
  bindInvoiceDocumentUpload(i);
}

function bindInvoiceDocumentUpload(invoice) {
  const form = document.querySelector("#invoice-document-upload-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData();
    data.append("document_type", field(form, "document_type"));
    data.append("title", field(form, "title") || `${invoice.invoice_number} hujjati`);
    data.append("client_id", invoice.client_id);
    if (invoice.contract_id) data.append("contract_id", invoice.contract_id);
    data.append("invoice_id", invoice.id);
    data.append("file", form.elements.file.files[0]);
    try {
      await apiForm("/api/finance/documents/upload", data);
      showToast("Hujjat yuklandi.");
      renderInvoiceDetail(invoice.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function paymentAllocationSummary(invoices = []) {
  const allocated = invoices.reduce((sum, invoice) => sum + numberValue(invoice.allocation_amount), 0);
  return { allocated };
}

function paymentAllocationTable(invoices = [], paymentAmount = 0) {
  const summary = paymentAllocationSummary(invoices);
  const unallocated = Math.max(0, numberValue(paymentAmount) - summary.allocated);
  return `
    ${summaryCards([
      ["To'lov summasi", fmtMoney(paymentAmount)],
      ["Taqsimlangan summa", fmtMoney(summary.allocated)],
      ["Taqsimlanmagan summa", fmtMoney(unallocated)],
    ])}
    ${invoices.length ? tableOrEmpty(invoices, ["Tanlash", "Hisob raqami", "Turi", "Hisob sanasi", "To'lov muddati", "Qoldiq", "Taqsimlanadigan summa"], (invoice, index) => `
      <tr data-payment-allocation-row="${index}">
        <td><input type="checkbox" name="allocation_selected_${index}" ${numberValue(invoice.allocation_amount) > 0 ? "checked" : ""} /></td>
        <td>${fmt(invoice.invoice_number)}</td>
        <td>${fmt(optionLabel(invoiceTypes, invoice.invoice_type))}</td>
        <td>${fmt(invoice.invoice_date)}</td>
        <td>${fmt(invoice.due_date)}</td>
        <td>${fmtMoney(invoice.allocatable_remaining)}</td>
        <td><input type="number" step="any" min="0" max="${esc(invoice.allocatable_remaining)}" name="allocation_amount_${index}" value="${esc(invoice.allocation_amount || "")}" /></td>
      </tr>
    `, "Ushbu mijoz bo'yicha ochiq hisob-fakturalar mavjud emas.") : `<div class="empty">Ushbu mijoz bo'yicha ochiq hisob-fakturalar mavjud emas.</div>`}`;
}

async function fetchAllocatableInvoices(clientId, payment = null) {
  if (!clientId) return [];
  const openInvoices = (await api(`/api/customer-invoices?client_id=${clientId}&page_size=100`)).items
    .filter((invoice) => invoice.status !== "cancelled" && numberValue(invoice.remaining_amount) > 0);
  const existingByInvoice = new Map((payment?.allocations || []).map((allocation) => [Number(allocation.invoice_id), allocation]));
  const existingIds = [...existingByInvoice.keys()];
  const existingInvoices = await Promise.all(existingIds.map((id) => api(`/api/customer-invoices/${id}`).catch(() => null)));
  const byId = new Map();
  [...openInvoices, ...existingInvoices.filter(Boolean)].forEach((invoice) => byId.set(Number(invoice.id), invoice));
  return [...byId.values()]
    .filter((invoice) => invoice.status !== "cancelled")
    .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")))
    .map((invoice) => {
      const existing = existingByInvoice.get(Number(invoice.id));
      const existingAmount = numberValue(existing?.allocated_amount);
      return {
        ...invoice,
        allocatable_remaining: numberValue(invoice.remaining_amount) + existingAmount,
        allocation_amount: existingAmount ? String(existingAmount) : "",
      };
    })
    .filter((invoice) => numberValue(invoice.allocatable_remaining) > 0);
}

function autoDistributePaymentAmount(invoices = [], amount = 0) {
  let remaining = numberValue(amount);
  return invoices.map((invoice) => {
    const allocation = Math.min(remaining, numberValue(invoice.allocatable_remaining));
    remaining -= allocation;
    return { ...invoice, allocation_amount: allocation > 0 ? allocation.toFixed(2) : "" };
  });
}

async function paymentForm(payment = null) {
  const today = todayIso();
  const params = payment ? new URLSearchParams() : new URLSearchParams(location.search);
  let selectedClientId = payment?.client_id || params.get("client_id");
  if (!selectedClientId && params.get("contract_id")) {
    try {
      const contract = await api(`/api/contracts/${params.get("contract_id")}`);
      selectedClientId = contract.client_id || contract.client?.id;
    } catch (error) {
      showToast(error.message, true);
    }
  }
  const clients = await fetchClientsOptions(selectedClientId);
  const invoices = await fetchAllocatableInvoices(selectedClientId, payment);
  const paymentNumber = payment?.payment_number || (selectedClientId ? `CPAY-${today.replaceAll("-", "")}-${selectedClientId}` : "");
  const allocationInvoices = payment ? invoices : autoDistributePaymentAmount(invoices, payment?.amount || "");
  return `<div class="page"><div class="page-header"><div class="page-title"><h1>${payment ? "Mijoz to'lovini tahrirlash" : "Yangi mijoz to'lovi"}</h1><p>Mijoz to'lovi va hisob-fakturalarga taqsimlash.</p></div><div class="actions"><button class="btn" data-nav="${payment?`/customer-payments/${payment.id}`:"/customer-payments"}">Orqaga</button></div></div><form id="payment-form">${section("Asosiy ma'lumotlar", `<div class="grid"><label class="form-field">Mijoz <span class="required-mark">*</span>${selectSearch("client_id", "Mijoz nomi yoki STIR bo'yicha qidiring")}<select name="client_id" required><option value="">Mijozni tanlang</option>${clients}</select></label>${readonlyField("payment_number","To'lov raqami",paymentNumber)}${textField("payment_date","To'lov sanasi",payment?.payment_date||today,"date",{ required: true })}${textField("amount","To'lov summasi",payment?.amount||"","number",{ required: true })}${selectField("payment_method","To'lov usuli",paymentMethods,payment?.payment_method||"bank_transfer")}${textField("bank_account","Hisob / kassa",payment?.bank_account)}${textField("reference_number","Havola raqami",payment?.reference_number)}${textArea("notes","Izoh",payment?.notes)}</div>`)}${section("Qo'lda taqsimlash", `<div id="payment-allocation-section">${paymentAllocationTable(allocationInvoices, payment?.amount || "")}</div>`)}${section("Hujjatlar", `<div class="empty">Moliya hujjatlarini to'lov saqlangandan keyin Hujjatlar bo'limidan yuklash mumkin.</div>`)}<div class="form-footer"><button class="btn" type="button" data-nav="${payment?`/customer-payments/${payment.id}`:"/customer-payments"}">Bekor qilish</button><button class="btn primary">Saqlash</button></div></form></div>`;
}

function bindPaymentForm(payment = null) {
  const form = document.querySelector("#payment-form");
  let allocationInvoices = [];

  function syncAllocationState() {
    allocationInvoices = allocationInvoices.map((invoice, index) => {
      const selected = form.elements[`allocation_selected_${index}`]?.checked;
      const amount = normalizeNumberInputValue(form.elements[`allocation_amount_${index}`]?.value || "");
      return { ...invoice, allocation_amount: selected ? amount : "" };
    });
  }

  function renderAllocations(auto = false) {
    if (auto) allocationInvoices = autoDistributePaymentAmount(allocationInvoices, form.elements.amount.value);
    document.querySelector("#payment-allocation-section").innerHTML = paymentAllocationTable(allocationInvoices, form.elements.amount.value);
    bindAllocationInputs();
  }

  function refreshAllocationSummary() {
    const values = document.querySelectorAll("#payment-allocation-section .summary-card strong");
    const allocated = allocationInvoices.reduce((sum, invoice) => sum + numberValue(invoice.allocation_amount), 0);
    const unallocated = Math.max(0, numberValue(form.elements.amount.value) - allocated);
    if (values[0]) values[0].textContent = fmtMoney(form.elements.amount.value);
    if (values[1]) values[1].textContent = fmtMoney(allocated);
    if (values[2]) values[2].textContent = fmtMoney(unallocated);
  }

  function bindAllocationInputs() {
    form.querySelectorAll("[data-payment-allocation-row] input").forEach((input) => {
      input.addEventListener("input", () => {
        syncAllocationState();
        refreshAllocationSummary();
      });
      input.addEventListener("change", () => {
        syncAllocationState();
        refreshAllocationSummary();
      });
    });
  }

  async function loadInvoicesForClient(auto = true) {
    allocationInvoices = await fetchAllocatableInvoices(form.elements.client_id.value, payment);
    renderAllocations(auto);
  }

  form.elements.client_id.addEventListener("change", () => loadInvoicesForClient(true).catch((error) => showToast(error.message, true)));
  form.elements.amount.addEventListener("input", () => renderAllocations(true));

  loadInvoicesForClient(!payment).catch((error) => showToast(error.message, true));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    syncAllocationState();
    const clientId = Number(field(form, "client_id"));
    const amount = numberValue(field(form, "amount"));
    if (!clientId) return showToast("Mijoz majburiy.", true);
    if (amount <= 0) return showToast("To'lov summasi 0 dan katta bo'lishi kerak.", true);
    const allocations = allocationInvoices
      .map((invoice) => ({ invoice_id: invoice.id, allocated_amount: normalizeNumberInputValue(invoice.allocation_amount), max: invoice.allocatable_remaining }))
      .filter((allocation) => numberValue(allocation.allocated_amount) > 0);
    if (allocationInvoices.some((invoice) => numberValue(invoice.allocation_amount) < 0)) return showToast("Taqsimlash summasi manfiy bo'lishi mumkin emas.", true);
    if (allocations.some((allocation) => numberValue(allocation.allocated_amount) > numberValue(allocation.max))) return showToast("Taqsimlash summasi hisob qoldig'idan oshmasligi kerak.", true);
    const totalAllocated = allocations.reduce((sum, allocation) => sum + numberValue(allocation.allocated_amount), 0);
    if (totalAllocated > amount) return showToast("Jami taqsimlash summasi to'lov summasidan oshmasligi kerak.", true);
    const payload = {
      client_id: clientId,
      payment_number: field(form, "payment_number"),
      payment_date: field(form, "payment_date"),
      amount: field(form, "amount"),
      currency: "UZS",
      payment_method: field(form, "payment_method"),
      bank_account: field(form, "bank_account"),
      reference_number: field(form, "reference_number"),
      notes: field(form, "notes"),
      allocations: allocations.map(({ invoice_id, allocated_amount }) => ({ invoice_id: Number(invoice_id), allocated_amount })),
    };
    try {
      const saved = await api(payment ? `/api/customer-payments/${payment.id}` : "/api/customer-payments", { method: payment ? "PATCH" : "POST", body: JSON.stringify(payload) });
      showToast("To'lov saqlandi.");
      navigate(`/customer-payments/${saved.id}`);
    } catch(error) {
      showToast(error.message, true);
    }
  });
}
async function renderNewPayment(){app.innerHTML=await paymentForm();bindPaymentForm();}
async function renderEditPayment(id){const p=await api(`/api/customer-payments/${id}`);app.innerHTML=await paymentForm(p);bindPaymentForm(p);}
async function renderPaymentsList(){const params=new URLSearchParams(location.search);const data=await api(`/api/customer-payments?${params.toString()}`);app.innerHTML=opsListPage({className:"payments-ops-page",title:"Mijoz to'lovlari",tabs:[{label:"Hisoblar",path:"/customer-invoices"},{label:"To'lovlar",active:true},{label:"Debitorlik",path:"/receivables"}],createPath:canEdit("moliya") ? "/customer-payments/new" : undefined,createLabel:"Yangi to'lov",clearPath:"/customer-payments",counter:`${fmt(data.total)} ta to'lov`,formId:"payment-search-form",filters:opsFilterField("Qidirish",`<input name="search" placeholder="To'lov, mijoz, havola, bank" value="${esc(params.get("search")||"")}" />`),headers:["To'lov raqami","Sana","Mijoz","Summa","Taqsimlangan","Taqsimlanmagan","Usul","Havola","Status",""],rows:data.items.map((p)=>`<tr><td><button class="ops-primary-link" data-nav="/customer-payments/${p.id}">${fmt(p.payment_number)}</button></td><td>${fmt(p.payment_date)}</td><td>${fmt(p.client?.name)}</td><td class="ops-money">${fmtMoney(p.amount)}</td><td class="ops-money">${fmtMoney(p.allocated_amount)}</td><td class="ops-money ${numberValue(p.unallocated_amount)>0?"ops-warning":""}">${fmtMoney(p.unallocated_amount)}</td><td>${fmt(optionLabel(paymentMethods,p.payment_method))}</td><td>${fmt(p.reference_number)}</td><td>${statusBadge(p.status)}</td><td><button class="link-btn" data-nav="/customer-payments/${p.id}">Ochish</button></td></tr>`).join(""),emptyText:"To'lovlar topilmadi.",colspan:10,footer:opsFooter(data,"payment")});bindOpsSearch("payment-search-form","/customer-payments",["search"]);bindOpsPagination("payment","/customer-payments");}
async function renderPaymentDetail(id){
  const p=await api(`/api/customer-payments/${id}`);
  const unallocated = numberValue(p.summary?.unallocated_amount);
  const editable = canEdit("moliya");
  const warnings = [];
  if (unallocated > 0) warnings.push("To'lovning taqsimlanmagan qismi mavjud.");
  if (!hasDocs(p)) warnings.push("To'lov hujjati yuklanmagan.");
  const headerActions = [];
  if (editable) headerActions.push({label:"Taqsimlash",path:`/customer-payments/${p.id}/edit`,primary:unallocated>0});
  headerActions.push({label:"Hujjat yuklash",path:`/customer-payments/${p.id}#documents`});
  const nextAction = unallocated>0
    ? { title: "To'lovni mijoz hisoblariga taqsimlang", ...(editable ? { button: "Taqsimlash", path: `/customer-payments/${p.id}/edit` } : {}) }
    : { title: "To'lov to'liq taqsimlangan", button: "Tarix", path: `/customer-payments/${p.id}#history`, done: true };
  app.innerHTML=`<div class="page">${workflowHeader({title:p.payment_number,subtitle:subtitleLine([{value:p.client?.name,raw:true},{value:fmtMoney(p.amount),raw:true},{value:optionLabel(paymentStatuses,p.status)}]),backPath:"/customer-payments",fullEditPath:editable ? `/customer-payments/${p.id}/edit` : "",actions:headerActions})}${workflowStatusGrid([["To'lov holati",statusBadge(p.status)],["Taqsimlangan summa",fmtMoney(p.summary?.allocated_amount)],["Taqsimlanmagan summa",fmtMoney(p.summary?.unallocated_amount)],["Hujjat holati",statusChip(hasDocs(p)?{label:"Yuklangan",tone:"success"}:{label:"Kutilmoqda",tone:"warning"})]])}${summaryCards([["To'lov summasi",fmtMoney(p.summary?.amount)],["Taqsimlangan",fmtMoney(p.summary?.allocated_amount)],["Taqsimlanmagan",fmtMoney(p.summary?.unallocated_amount)],["To'lov sanasi",fmt(p.payment_date)],["Usul",fmt(optionLabel(paymentMethods,p.payment_method))],["Status",fmt(optionLabel(paymentStatuses,p.status))]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${section("Umumiy ma'lumotlar", detailList([["To'lov raqami",p.payment_number],["To'lov sanasi",p.payment_date],["Mijoz",p.client?.name],["Summa",fmtMoney(p.amount)],["Valyuta",p.currency],["Usul",optionLabel(paymentMethods,p.payment_method)],["Bank hisob raqami",p.bank_account],["Havola",p.reference_number],["Status",optionLabel(paymentStatuses,p.status)],["Izoh",p.notes],["Yaratilgan",fmtDate(p.created_at)],["Yangilangan",fmtDate(p.updated_at)]]))}${section("Taqsimlash", tableOrEmpty(p.allocations,["Hisob","Taqsimlangan","Yaratilgan"],(a)=>`<tr><td>${fmt(a.invoice?.invoice_number || a.invoice_number || "Mijoz hisobi")}</td><td>${fmtMoney(a.allocated_amount)}</td><td>${fmtDate(a.created_at)}</td></tr>`,"Taqsimlash yozuvlari yo'q."))}<div id="documents">${section("Hujjatlar", tableOrEmpty(p.documents,["Hujjat nomi","Turi","Yuklangan"],(d)=>`<tr><td>${fmt(d.title)}</td><td>${fmt(optionLabel(financeDocumentTypes,d.document_type) || d.document_type)}</td><td>${fmtDate(d.uploaded_at)}</td></tr>`,"Hujjatlar yo'q."))}</div><div id="history">${section("Tarix", tableOrEmpty(p.notes_history,["Sana","Foydalanuvchi","Izoh"],(n)=>`<tr><td>${fmtDate(n.created_at)}</td><td>${fmt(n.created_by)}</td><td>${fmt(n.note)}</td></tr>`,"Tarix yozuvlari yo'q."))}</div></div>`;
}
