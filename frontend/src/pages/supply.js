function supplierPayload(form, includeChildren = false) {
  const payload = {
    name: field(form, "name"),
    inn: field(form, "inn"),
    oked: field(form, "oked"),
    phone: field(form, "phone"),
    email: field(form, "email"),
    notes: field(form, "notes"),
  };
  if (includeChildren && field(form, "contact_full_name")) {
    payload.first_contact = { full_name: field(form, "contact_full_name"), position: field(form, "contact_position"), phone: field(form, "contact_phone"), email: field(form, "contact_email"), is_primary: true, comment: field(form, "contact_comment") };
  }
  if (includeChildren && (field(form, "address") || field(form, "region"))) {
    payload.address = { address_type: field(form, "address_type"), region: field(form, "region"), district: field(form, "district"), address: field(form, "address"), comment: field(form, "address_comment") };
  }
  if (includeChildren && field(form, "bank_name")) {
    payload.bank_account = { bank_name: field(form, "bank_name"), mfo: field(form, "mfo"), account_number: field(form, "account_number"), is_primary: true, comment: field(form, "bank_comment") };
  }
  return payload;
}

function supplierForm(supplier = null) {
  const contact = supplier?.contacts?.[0] || {};
  const address = supplier?.addresses?.[0] || {};
  const account = supplier?.bank_accounts?.[0] || {};
  return `<div class="page"><div class="page-header"><div class="page-title"><h1>${supplier ? "Edit supplier" : "New supplier"}</h1><p>Supplier master data without balances, ratings, or approvals.</p></div><div class="actions"><button class="btn" data-nav="${supplier ? `/suppliers/${supplier.id}` : "/suppliers"}">Back</button></div></div><form id="supplier-form">${section("Basic information", `<div class="grid">${textField("name","Supplier name",supplier?.name)}${textField("inn","INN",supplier?.inn)}${textField("oked","OKED",supplier?.oked)}${textField("phone","Phone",supplier?.phone)}${textField("email","Email",supplier?.email,"email")}${textArea("notes","Notes",supplier?.notes)}</div>`)}${!supplier ? section("First contact", `<div class="grid">${textField("contact_full_name","Full name",contact.full_name)}${textField("contact_position","Position",contact.position)}${textField("contact_phone","Phone",contact.phone)}${textField("contact_email","Email",contact.email,"email")}${textArea("contact_comment","Comment",contact.comment)}</div>`) : ""}${!supplier ? section("Address", `<div class="grid">${selectField("address_type","Address type",supplierAddressTypes,address.address_type || "loading")}${textField("region","Region",address.region)}${textField("district","District",address.district)}${textField("address","Address",address.address)}${textArea("address_comment","Comment",address.comment)}</div>`) : ""}${!supplier ? section("Bank account", `<div class="grid">${textField("bank_name","Bank name",account.bank_name)}${textField("mfo","MFO",account.mfo)}${textField("account_number","Account number",account.account_number)}${textArea("bank_comment","Comment",account.comment)}</div>`) : ""}<div class="form-footer"><button type="button" class="btn" data-nav="${supplier ? `/suppliers/${supplier.id}` : "/suppliers"}">Cancel</button><button class="btn primary">Save</button></div></form></div>`;
}

async function renderSuppliersList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/suppliers?${params.toString()}`);
  const editable = canEdit("taminot");
  app.innerHTML = opsListPage({className:"suppliers-ops-page",title:"Ta'minotchilar",tabs:[{label:"Ta'minotchilar",active:true},{label:"Xaridlar",path:"/procurements"},{label:"Ta'minotchi hisoblari",path:"/supplier-invoices"}],createPath:editable ? "/suppliers/new" : undefined,clearPath:"/suppliers",counter:`${fmt(data.total)} ta ta'minotchi`,formId:"supplier-search-form",filters:`<input name="search" placeholder="Ta'minotchi, STIR, telefon, email" value="${esc(params.get("search") || "")}" />`,headers:["Nomi","STIR","Telefon","Mas'ul shaxs","Hudud","Yuklash manzili","Oxirgi faollik",""],rows:data.items.map((s)=>`<tr><td><button class="ops-primary-link" data-nav="/suppliers/${s.id}">${fmt(s.name)}</button></td><td>${fmt(s.inn)}</td><td>${fmt(s.phone)}</td><td>${fmt(s.primary_contact?.full_name)}</td><td>${fmt(s.primary_region)}</td><td>${fmt(s.primary_loading_address)}</td><td>${fmtDate(s.last_activity)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/suppliers/${s.id}">Ochish</button>${editable ? `<button class="link-btn" data-nav="/suppliers/${s.id}/edit">Tahrirlash</button>` : ""}</div></td></tr>`).join(""),emptyText:"Ta'minotchilar topilmadi.",colspan:8,footer:opsFooter(data,"supplier")});
  bindOpsSearch("supplier-search-form","/suppliers",["search"]);
  bindOpsPagination("supplier","/suppliers");
}

async function renderNewSupplier() {
  app.innerHTML = supplierForm();
  document.querySelector("#supplier-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const saved = await api("/api/suppliers", { method: "POST", body: JSON.stringify(supplierPayload(form, true)) });
      showToast("Supplier saved.");
      navigate(`/suppliers/${saved.id}`);
    } catch (error) { showToast(error.message, true); }
  });
}

async function renderEditSupplier(id) {
  const supplier = await api(`/api/suppliers/${id}`);
  app.innerHTML = supplierForm(supplier);
  document.querySelector("#supplier-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/api/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(supplierPayload(event.currentTarget)) });
      showToast("Supplier updated.");
      navigate(`/suppliers/${id}`);
    } catch (error) { showToast(error.message, true); }
  });
}

function daysUntil(value) {
  if (!value) return dash;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function stockValue(lot) {
  return numberValue(lot.quantity_available) * numberValue(lot.unit_cost);
}

async function renderExchangeTicketsList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/exchange-tickets?${params.toString()}`);
  app.innerHTML = opsListPage({
    className: "exchange-ticket-ops-page",
    title: "Birja ticketlari",
    tabs: [
      { label: "Ta'minotchilar", path: "/suppliers" },
      { label: "Xaridlar", path: "/procurements" },
      { label: "Birja ticketlari", active: true },
      { label: "Zaxira", path: "/stock" },
    ],
    createPath: canEdit("taminot") ? "/exchange-tickets/new" : undefined,
    createLabel: "Ticket yaratish",
    clearPath: "/exchange-tickets",
    counter: `${fmt(data.total)} ta ticket`,
    formId: "exchange-ticket-search-form",
    filters: `<input name="search" placeholder="Ticket, ta'minotchi, mahsulot" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${exchangeTicketStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select><label class="inline-check"><input type="checkbox" name="overdue_only" value="true" ${params.get("overdue_only") === "true" ? "checked" : ""} /> Muddati o'tgan</label>`,
    headers: ["Ticket №", "Sana", "Ta'minotchi", "Mahsulot", "Miqdor", "Birlik narxi", "Jami summa", "To'lov muddati", "Qoldiq kun", "Status", ""],
    rows: data.items.map((ticket) => `<tr><td><button class="ops-primary-link" data-nav="/exchange-tickets/${ticket.id}">${fmt(ticket.ticket_number)}</button></td><td>${fmt(ticket.ticket_date)}</td><td>${fmt(ticket.supplier_name)}</td><td>${fmt(ticket.product_name)}</td><td>${fmtQty(ticket.quantity, ticket.unit)}</td><td class="ops-money">${fmtMoney(ticket.unit_price)}</td><td class="ops-money">${fmtMoney(ticket.total_amount)}</td><td>${fmt(ticket.due_date)}</td><td>${fmt(daysUntil(ticket.due_date))}</td><td>${statusBadge(ticket.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/exchange-tickets/${ticket.id}">Ochish</button>${ticket.stock_lot ? `<button class="link-btn" data-nav="/stock/${ticket.stock_lot.id}">Zaxira</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Birja ticketlari topilmadi.",
    colspan: 11,
    footer: opsFooter(data, "exchange-ticket"),
  });
  bindOpsSearch("exchange-ticket-search-form", "/exchange-tickets", ["search", "status", "overdue_only"]);
  bindOpsPagination("exchange-ticket", "/exchange-tickets");
}

function exchangeTicketPayload(form) {
  const supplierId = field(form, "supplier_id");
  return {
    ticket_number: field(form, "ticket_number"),
    ticket_date: field(form, "ticket_date"),
    supplier_id: supplierId ? Number(supplierId) : null,
    product_name: field(form, "product_name"),
    unit: field(form, "unit") || "tonna",
    quantity: field(form, "quantity"),
    unit_price: field(form, "unit_price") || "0",
    vat_rate: field(form, "vat_rate") || "12",
    payment_term_days: Number(field(form, "payment_term_days") || 90),
    notes: field(form, "notes"),
    created_by: field(form, "created_by"),
    open_immediately: true,
  };
}

function validateExchangeTicketForm(form) {
  const errors = [];
  if (!field(form, "ticket_number")) errors.push("Ticket raqamini kiriting.");
  if (!field(form, "ticket_date")) errors.push("Ticket sanasini kiriting.");
  if (!field(form, "supplier_id")) errors.push("Ta'minotchini tanlang.");
  if (!field(form, "product_name")) errors.push("Mahsulot nomini kiriting.");
  if (!field(form, "unit")) errors.push("Birlikni kiriting.");
  if (numberValue(field(form, "quantity")) <= 0) errors.push("Miqdor 0 dan katta bo'lishi kerak.");
  if (numberValue(field(form, "unit_price")) < 0) errors.push("Birlik narxi manfiy bo'lishi mumkin emas.");
  if (numberValue(field(form, "vat_rate") || 0) < 0) errors.push("QQS foizi manfiy bo'lishi mumkin emas.");
  if (Number(field(form, "payment_term_days") || 0) < 0) errors.push("To'lov muddati manfiy bo'lishi mumkin emas.");
  return errors;
}

function updateExchangeTicketTotals(form) {
  const ticketDate = field(form, "ticket_date");
  const term = Number(field(form, "payment_term_days") || 90);
  const quantity = numberValue(field(form, "quantity"));
  const unitPrice = numberValue(field(form, "unit_price"));
  const vatRate = numberValue(field(form, "vat_rate") || 12);
  const subtotal = quantity * unitPrice;
  const vat = subtotal * vatRate / 100;
  const due = ticketDate ? new Date(ticketDate) : null;
  if (due) due.setDate(due.getDate() + term);
  form.querySelector("[data-ticket-due]").textContent = due ? due.toISOString().slice(0, 10) : dash;
  form.querySelector("[data-ticket-subtotal]").textContent = fmtMoney(subtotal);
  form.querySelector("[data-ticket-vat]").textContent = fmtMoney(vat);
  form.querySelector("[data-ticket-total]").textContent = fmtMoney(subtotal + vat);
}

async function renderNewExchangeTicket() {
  const supplierOptions = await fetchSuppliersOptions();
  const today = new Date().toISOString().slice(0, 10);
  app.innerHTML = `<div class="page"><div class="page-header"><div class="page-title"><h1>Yangi birja ticketi</h1><p>Ticket ochilganda ta'minotchi omboridagi kompaniya zaxirasi yaratiladi.</p></div><div class="actions"><button class="btn" data-nav="/exchange-tickets">Orqaga</button></div></div><form id="exchange-ticket-form">${section("Ticket ma'lumotlari", `<div class="grid">${textField("ticket_number", "Ticket raqami")}${textField("ticket_date", "Ticket sanasi", today, "date")}<label>Ta'minotchi<select name="supplier_id"><option value="">Tanlang</option>${supplierOptions}</select></label>${textField("product_name", "Mahsulot")}${textField("quantity", "Miqdor", "", "number")}${textField("unit", "Birlik", "tonna")}${textField("unit_price", "Birlik narxi", "", "number")}${textField("vat_rate", "QQS %", 12, "number")}${textField("payment_term_days", "To'lov muddati, kun", 90, "number")}${readonlyField("due_date_preview", "To'lov muddati", "")}${textField("created_by", "Yaratgan")}${textArea("notes", "Izoh")}</div>`)}${section("Hisob-kitob", summaryCards([["To'lov muddati", `<span data-ticket-due>${dash}</span>`], ["Oraliq summa", `<span data-ticket-subtotal>${dash}</span>`], ["QQS", `<span data-ticket-vat>${dash}</span>`], ["Jami summa", `<span data-ticket-total>${dash}</span>`]]))}<div class="form-footer"><button class="btn" type="button" data-nav="/exchange-tickets">Bekor qilish</button><button class="btn primary">Ticketni ochish</button></div></form></div>`;
  const form = document.querySelector("#exchange-ticket-form");
  form.addEventListener("input", () => updateExchangeTicketTotals(form));
  form.addEventListener("change", () => updateExchangeTicketTotals(form));
  updateExchangeTicketTotals(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errors = validateExchangeTicketForm(form);
    if (errors.length) {
      showToast(errors[0], true);
      return;
    }
    try {
      const saved = await api("/api/exchange-tickets", { method: "POST", body: JSON.stringify(exchangeTicketPayload(form)) });
      showToast("Ticket ochildi va ta'minotchi omboridagi zaxira yaratildi.");
      navigate(`/exchange-tickets/${saved.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderExchangeTicketDetail(id) {
  const ticket = await api(`/api/exchange-tickets/${id}`);
  const lot = ticket.stock_lot;
  const warnings = [];
  const dueDays = daysUntil(ticket.due_date);
  if (typeof dueDays === "number" && dueDays <= 7 && !["paid", "closed", "cancelled"].includes(ticket.status)) warnings.push(`Ticket to'lov muddati tugashiga ${dueDays} kun qoldi.`);
  if (!lot) warnings.push("Zaxira partiyasi hali yaratilmagan.");
  app.innerHTML = `<div class="page">${workflowHeader({ title: ticket.ticket_number, subtitle: `${fmt(ticket.supplier_name)} · ${fmt(ticket.product_name)} · ${fmt(ticket.ticket_date)}`, backPath: "/exchange-tickets", actions: [{ label: "Zaxirani ko'rish", path: lot ? `/stock/${lot.id}` : "/stock", primary: Boolean(lot) }, { label: "Hujjat yuklash", path: `/exchange-tickets/${ticket.id}#documents` }] })}${workflowStatusGrid([["Ticket holati", statusBadge(ticket.status)], ["Zaxira holati", lot ? statusBadge(lot.stock_status) : statusChip({ label: "Yaratilmagan", tone: "warning" })], ["To'lov holati", statusChip({ label: optionLabel(exchangeTicketStatuses, ticket.status), tone: dueDays < 0 ? "warning" : "muted" })], ["Hujjat holati", statusChip({ label: "Keyingi bosqich", tone: "muted" })]])}${summaryCards([["Miqdor", fmtQty(ticket.quantity, ticket.unit)], ["Birlik narxi", fmtMoney(ticket.unit_price)], ["Jami summa", fmtMoney(ticket.total_amount)], ["To'lov muddati", fmt(ticket.due_date)], ["Qoldiq kun", fmt(dueDays)], ["Mavjud zaxira", lot ? fmtQty(lot.quantity_available, lot.unit) : dash]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(!lot ? { title: "Ticketni oching", button: "Ticketni ochish", path: `/exchange-tickets/${ticket.id}` } : { title: "Zaxira orderga ajratishga tayyor", button: "Zaxirani ko'rish", path: `/stock/${lot.id}`, done: true })}${workflowTabs("general", [["general", "Umumiy"], ["product", "Mahsulot"], ["stock", "Zaxira"], ["finance", "Moliya"], ["documents", "Hujjatlar"], ["history", "Tarix"]], "exchange-ticket-tab")}${section("Umumiy", detailList([["Ticket raqami", ticket.ticket_number], ["Ticket sanasi", ticket.ticket_date], ["Ta'minotchi", ticket.supplier_name], ["Status", optionLabel(exchangeTicketStatuses, ticket.status)], ["Izoh", ticket.notes]]))}${section("Mahsulot", detailList([["Mahsulot", ticket.product_name], ["Miqdor", fmtQty(ticket.quantity, ticket.unit)], ["Birlik narxi", fmtMoney(ticket.unit_price)], ["Oraliq summa", fmtMoney(ticket.subtotal_amount)], ["QQS", fmtMoney(ticket.vat_amount)], ["Jami summa", fmtMoney(ticket.total_amount)]]))}${section("Zaxira", lot ? detailList([["Zaxira partiyasi", lot.ticket_number], ["Joylashuv", lot.location_name], ["Manzil", lot.location_address], ["Dastlabki miqdor", fmtQty(lot.quantity_initial, lot.unit)], ["Mavjud miqdor", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan", fmtQty(lot.quantity_reserved, lot.unit)], ["Status", optionLabel(stockStatuses, lot.stock_status)]]) : `<div class="empty">Zaxira partiyasi hali yaratilmagan.</div>`)}${section("Moliya", detailList([["To'lov muddati, kun", ticket.payment_term_days], ["To'lov muddati", ticket.due_date], ["Qoldiq kun", dueDays], ["Kreditor summa", fmtMoney(ticket.total_amount)]]))}${section("Hujjatlar", `<div class="empty" id="documents">Ticket hujjatlari keyingi bosqichda ulanadi.</div>`)}${section("Tarix", workflowTimeline([["Yaratildi", fmtDate(ticket.created_at)], ["Status", optionLabel(exchangeTicketStatuses, ticket.status)], ["Yangilandi", fmtDate(ticket.updated_at)]]))}</div>`;
}

async function renderStockList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/stock-lots?${params.toString()}`);
  const totalAvailable = data.items.reduce((sum, lot) => sum + numberValue(lot.quantity_available), 0);
  const reserved = data.items.reduce((sum, lot) => sum + numberValue(lot.quantity_reserved), 0);
  const value = data.items.reduce((sum, lot) => sum + stockValue(lot), 0);
  app.innerHTML = opsListPage({
    className: "stock-ops-page",
    title: "Zaxira",
    tabs: [
      { label: "Ta'minotchilar", path: "/suppliers" },
      { label: "Birja ticketlari", path: "/exchange-tickets" },
      { label: "Zaxira", active: true },
    ],
    clearPath: "/stock",
    counter: `${fmt(data.total)} ta zaxira partiyasi · ${fmtQty(totalAvailable)} mavjud · ${fmtQty(reserved)} band · ${fmtMoney(value)} qiymat`,
    formId: "stock-search-form",
    filters: `<input name="search" placeholder="Mahsulot, ta'minotchi, ticket" value="${esc(params.get("search") || "")}" /><select name="location_type"><option value="">Joylashuv</option>${stockLocationTypes.map(([key, label]) => `<option value="${key}" ${params.get("location_type") === key ? "selected" : ""}>${label}</option>`).join("")}</select><label class="inline-check"><input type="checkbox" name="available_only" value="true" ${params.get("available_only") === "true" ? "checked" : ""} /> Mavjud</label><label class="inline-check"><input type="checkbox" name="reserved_only" value="true" ${params.get("reserved_only") === "true" ? "checked" : ""} /> Band</label>`,
    headers: ["Mahsulot", "Ta'minotchi", "Joylashuv", "Ticket", "Dastlabki", "Mavjud", "Band", "Birlik xarid narxi", "Status", ""],
    rows: data.items.map((lot) => `<tr><td><button class="ops-primary-link" data-nav="/stock/${lot.id}">${fmt(lot.product_name)}</button></td><td>${fmt(lot.supplier_name)}</td><td>${fmt(lot.location_name)}</td><td>${fmt(lot.ticket_number)}</td><td>${fmtQty(lot.quantity_initial, lot.unit)}</td><td>${fmtQty(lot.quantity_available, lot.unit)}</td><td>${fmtQty(lot.quantity_reserved, lot.unit)}</td><td class="ops-money">${fmtMoney(lot.unit_cost)}</td><td>${statusBadge(lot.stock_status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/stock/${lot.id}">Ko'rish</button>${canEdit("sotuv") ? `<button class="link-btn" data-nav="/orders/new?source_type=supplier_held_stock&stock_lot_id=${lot.id}">Orderga ajratish</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Zaxira topilmadi.",
    colspan: 10,
    footer: opsFooter(data, "stock"),
  });
  bindOpsSearch("stock-search-form", "/stock", ["search", "location_type", "available_only", "reserved_only"]);
  bindOpsPagination("stock", "/stock");
}

async function renderStockLotDetail(id) {
  const lot = await api(`/api/stock-lots/${id}`);
  const warnings = [];
  if (numberValue(lot.quantity_available) <= 0) warnings.push("Mavjud zaxira qolmagan.");
  if (numberValue(lot.quantity_reserved) > 0 && !lot.allocations?.some((allocation) => allocation.delivery_batch_id)) warnings.push("Zaxira band qilingan, lekin partiya hali ulanmagan.");
  app.innerHTML = `<div class="page">${workflowHeader({ title: lot.product_name, subtitle: `${fmt(lot.supplier_name)} · ${fmt(lot.ticket_number)} · ${fmt(optionLabel(stockStatuses, lot.stock_status))}`, backPath: "/stock", actions: [{ label: "Orderga ajratish", path: `/orders/new?source_type=supplier_held_stock&stock_lot_id=${lot.id}`, primary: true }, { label: "Ticketni ochish", path: `/exchange-tickets/${lot.ticket_id}` }] })}${workflowStatusGrid([["Zaxira holati", statusBadge(lot.stock_status)], ["Mavjud miqdor", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan", fmtQty(lot.quantity_reserved, lot.unit)], ["To'lov muddati", fmt(lot.due_date)]])}${summaryCards([["Dastlabki miqdor", fmtQty(lot.quantity_initial, lot.unit)], ["Mavjud miqdor", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan miqdor", fmtQty(lot.quantity_reserved, lot.unit)], ["Birlik xarid narxi", fmtMoney(lot.unit_cost)], ["Mavjud qiymat", fmtMoney(stockValue(lot))]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(numberValue(lot.quantity_available) > 0 ? { title: "Zaxirani orderga ajratish mumkin", button: "Order yaratish", path: `/orders/new?source_type=supplier_held_stock&stock_lot_id=${lot.id}` } : { title: "Zaxira ishlatilgan", button: "Harakatlar tarixi", path: `/stock/${lot.id}`, done: true })}${section("Ticket va ta'minotchi", detailList([["Ticket", lot.ticket_number], ["Ta'minotchi", lot.supplier_name], ["Joylashuv", lot.location_name], ["Manzil", lot.location_address], ["To'lov muddati", lot.due_date]]))}${section("Miqdor xulosasi", detailList([["Dastlabki miqdor", fmtQty(lot.quantity_initial, lot.unit)], ["Mavjud miqdor", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan miqdor", fmtQty(lot.quantity_reserved, lot.unit)], ["Status", optionLabel(stockStatuses, lot.stock_status)]]))}${section("Ajratmalar", tableOrEmpty(lot.allocations || [], ["Buyurtma", "Miqdor", "Partiya", "Status"], (allocation) => `<tr><td>${fmt(allocation.order_id)}</td><td>${fmtQty(allocation.allocated_quantity, lot.unit)}</td><td>${fmt(allocation.delivery_batch_id)}</td><td>${fmt(optionLabel(stockAllocationStatuses, allocation.status))}</td></tr>`, "Ajratmalar yo'q."))}${section("Zaxira harakatlari", tableOrEmpty(lot.movements || [], ["Sana", "Turi", "Miqdor", "Izoh"], (movement) => `<tr><td>${fmtDate(movement.created_at)}</td><td>${fmt(optionLabel(stockMovementTypes, movement.movement_type))}</td><td>${fmtQty(movement.quantity, lot.unit)}</td><td>${fmt(movement.notes)}</td></tr>`, "Harakatlar yo'q."))}</div>`;
}

async function renderSupplierDetail(id) {
  const s = await api(`/api/suppliers/${id}`);
  const supplierStock = await api(`/api/stock-lots?supplier_id=${id}&page_size=100`).catch(() => ({ items: [] }));
  const editable = canEdit("taminot");
  const warnings = [];
  if (!s.inn || !s.phone) warnings.push("Asosiy rekvizitlar to'liq emas.");
  if (!s.contacts?.length) warnings.push("Kontaktlar kiritilmagan.");
  if (!s.bank_accounts?.length) warnings.push("Bank rekvizitlari kiritilmagan.");
  if (!hasDocs(s)) warnings.push("Hujjatlar yuklanmagan.");
  const headerActions = [{label:"Xaridlar tarixi",path:"/procurements",primary:true}];
  if (editable) headerActions.push({label:"Birja ticketi",path:"/exchange-tickets/new"});
  headerActions.push({label:"Hujjat yuklash",path:`/suppliers/${s.id}#documents`});
  const nextAction = !s.contacts?.length?{title:"Kontakt qo'shing",...(editable?{button:"To'liq tahrirlash",path:`/suppliers/${s.id}/edit`}:{})}:!s.bank_accounts?.length?{title:"Bank rekvizitlarini qo'shing",...(editable?{button:"To'liq tahrirlash",path:`/suppliers/${s.id}/edit`}:{})}:!hasDocs(s)?{title:"Ta'minotchi hujjatini yuklang",button:"Hujjatlar",path:`/suppliers/${s.id}#documents`}:{title:"Ta'minotchi kartasi tayyor",button:"Xaridlar",path:"/procurements",done:true};
  app.innerHTML = `<div class="page">${workflowHeader({title:s.name,subtitle:`STIR ${fmt(s.inn)} · Telefon ${fmt(s.phone)}`,backPath:"/suppliers",fullEditPath:editable ? `/suppliers/${s.id}/edit` : "",actions:headerActions})}${workflowStatusGrid([["Kontaktlar",statusChip(s.contacts?.length?{label:`${s.contacts.length} ta`,tone:"success"}:{label:"Kutilmoqda",tone:"warning"})],["Manzillar",statusChip(s.addresses?.length?{label:`${s.addresses.length} ta`,tone:"success"}:{label:"Kutilmoqda",tone:"muted"})],["Bizning zaxira",statusChip(supplierStock.items.length?{label:`${supplierStock.items.length} partiya`,tone:"success"}:{label:"Yo'q",tone:"muted"})],["Hujjatlar",statusChip(hasDocs(s)?{label:"Yuklangan",tone:"success"}:{label:"Kutilmoqda",tone:"warning"})]])}${summaryCards([["Jami mahsulot miqdori", fmtQty(supplierStock.items.reduce((sum, lot) => sum + numberValue(lot.quantity_initial), 0))], ["Mavjud zaxira", fmtQty(supplierStock.items.reduce((sum, lot) => sum + numberValue(lot.quantity_available), 0))], ["Band qilingan zaxira", fmtQty(supplierStock.items.reduce((sum, lot) => sum + numberValue(lot.quantity_reserved), 0))], ["To'lov muddati yaqin", fmt(supplierStock.items.filter((lot) => { const d = daysUntil(lot.due_date); return typeof d === "number" && d <= 7; }).length)]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${workflowTabs("general",[["general","Umumiy"],["stock","Bizning zaxira"],["contacts","Kontaktlar"],["addresses","Manzillar"],["bank","Rekvizitlar"],["documents","Hujjatlar"],["history","Tarix"]],"supplier-tab")}${section("Umumiy ma'lumotlar", detailList([["Nomi",s.name],["STIR",s.inn],["OKED",s.oked],["Telefon",s.phone],["Email",s.email],["Izoh",s.notes],["Yaratilgan",fmtDate(s.created_at)],["Yangilangan",fmtDate(s.updated_at)]]))}${section("Bizning zaxira", tableOrEmpty(supplierStock.items,["Mahsulot","Ticket","Dastlabki miqdor","Mavjud","Band qilingan","Birlik xarid narxi","To'lov muddati","Status"],(lot)=>`<tr><td><button class="link-btn" data-nav="/stock/${lot.id}">${fmt(lot.product_name)}</button></td><td>${fmt(lot.ticket_number)}</td><td>${fmtQty(lot.quantity_initial,lot.unit)}</td><td>${fmtQty(lot.quantity_available,lot.unit)}</td><td>${fmtQty(lot.quantity_reserved,lot.unit)}</td><td>${fmtMoney(lot.unit_cost)}</td><td>${fmt(lot.due_date)}</td><td>${statusBadge(lot.stock_status)}</td></tr>`,"Bu ta'minotchida kompaniya zaxirasi yo'q."))}${section("Kontaktlar", tableOrEmpty(s.contacts,["Ism","Lavozim","Telefon","Email","Asosiy"],(c)=>`<tr><td>${fmt(c.full_name)}</td><td>${fmt(c.position)}</td><td>${fmt(c.phone)}</td><td>${fmt(c.email)}</td><td>${c.is_primary ? '<span class="pill">Asosiy</span>' : dash}</td></tr>`,"Kontaktlar yo'q."))}${section("Manzillar", tableOrEmpty(s.addresses,["Turi","Hudud","Tuman","Manzil"],(a)=>`<tr><td>${fmt(optionLabel(supplierAddressTypes,a.address_type))}</td><td>${fmt(a.region)}</td><td>${fmt(a.district)}</td><td>${fmt(a.address)}</td></tr>`,"Manzillar yo'q."))}${section("Rekvizitlar", tableOrEmpty(s.bank_accounts,["Bank","MFO","Hisob raqami","Asosiy"],(b)=>`<tr><td>${fmt(b.bank_name)}</td><td>${fmt(b.mfo)}</td><td>${fmt(b.account_number)}</td><td>${b.is_primary ? '<span class="pill">Asosiy</span>' : dash}</td></tr>`,"Bank rekvizitlari yo'q."))}<div id="documents">${section("Hujjatlar", tableOrEmpty(s.documents,["Hujjat nomi","Turi","Yuklangan"],(d)=>`<tr><td>${fmt(d.title)}</td><td>${fmt(d.document_type)}</td><td>${fmtDate(d.uploaded_at)}</td></tr>`,"Hujjatlar yo'q."))}</div>${section("Tarix", tableOrEmpty(s.notes_history,["Sana","Foydalanuvchi","Izoh"],(n)=>`<tr><td>${fmtDate(n.created_at)}</td><td>${fmt(n.created_by)}</td><td>${fmt(n.note)}</td></tr>`,"Tarix yozuvlari yo'q."))}</div>`;
}

async function fetchSuppliersOptions(selectedId = null) {
  const data = await api("/api/suppliers?page_size=100");
  return data.items.map((s)=>`<option value="${s.id}" ${Number(selectedId) === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
}

async function renderProcurementsList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/procurements?${params.toString()}`);
  app.innerHTML = opsListPage({className:"procurements-ops-page",title:"Xaridlar",tabs:[{label:"Ta'minotchilar",path:"/suppliers"},{label:"Xaridlar",active:true},{label:"Buyurtmalar",path:"/orders"}],clearPath:"/procurements",counter:`${fmt(data.total)} ta xarid`,formId:"procurement-search-form",filters:`<input name="search" placeholder="Xarid, buyurtma, mijoz, mahsulot" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${procurementStatuses.map(([k,l])=>`<option value="${k}" ${params.get("status")===k?"selected":""}>${l}</option>`).join("")}</select>`,headers:["Xarid raqami","Sana","Buyurtma","Mijoz","Mahsulot","Talab","Tanlangan","Ta'minotchilar","Yakuniy xarid","Status",""],rows:data.items.map((p)=>`<tr><td><button class="ops-primary-link" data-nav="/procurements/${p.id}">${fmt(p.procurement_number)}</button></td><td>${fmt(p.procurement_date)}</td><td>${fmt(p.order?.order_number)}</td><td>${fmt(p.client?.name)}</td><td>${fmt(p.product)}</td><td>${fmtQty(p.required_quantity)}</td><td>${fmtQty(p.selected_quantity)}</td><td>${fmt(p.selected_suppliers_count)}</td><td class="ops-money">${fmtMoney(p.final_purchase_amount)}</td><td>${statusBadge(p.status)}</td><td><button class="link-btn" data-nav="/procurements/${p.id}">Ochish</button></td></tr>`).join(""),emptyText:"Xaridlar topilmadi. Yangi buyurtmalar xaridlarni avtomatik yaratadi.",colspan:11,footer:opsFooter(data,"procurement")});
  bindOpsSearch("procurement-search-form","/procurements",["search","status"]);
  bindOpsPagination("procurement","/procurements");
}

function procurementOfferItemRow(item, index) {
  return `<div class="item-row" data-procurement-offer-row><input type="hidden" name="procurement_item_id_${index}" value="${esc(item.id)}" />${readonlyField(`product_name_${index}`,"Mahsulot",item.product_name)}${textField(`offered_quantity_${index}`,"Taklif miqdori",item.required_quantity,"number")}${textField(`selected_quantity_${index}`,"Tanlangan miqdor",0,"number")}${textField(`unit_price_${index}`,"Birlik xarid narxi","","number")}${textField(`vat_rate_${index}`,"QQS %",12,"number")}</div>`;
}

function collectSupplierOfferItems(form) {
  return [...form.querySelectorAll("[data-procurement-offer-row]")].map((row, index) => ({
    procurement_item_id: Number(field(form, `procurement_item_id_${index}`)),
    offered_quantity: field(form, `offered_quantity_${index}`),
    selected_quantity: field(form, `selected_quantity_${index}`) || "0",
    unit_price: field(form, `unit_price_${index}`) || "0",
    vat_rate: field(form, `vat_rate_${index}`) || "12",
  })).filter((item) => item.procurement_item_id && Number(item.offered_quantity) > 0);
}

async function renderProcurementDetail(id) {
  const p = await api(`/api/procurements/${id}`);
  const editable = canEdit("taminot");
  const supplierOptions = editable ? await fetchSuppliersOptions() : "";
  const warnings = [];
  if (!p.offers?.length) warnings.push("Ta'minotchi takliflari hali kiritilmagan.");
  if (numberValue(p.summary?.remaining_quantity) > 0) warnings.push("Tanlangan miqdor buyurtma talabini to'liq yopmagan.");
  if (!p.summary?.selected_suppliers_count) warnings.push("Ta'minotchi hali tasdiqlanmagan.");
  const nextAction = !p.offers?.length
    ? { title: "Ta'minotchi taklifini qo'shing", ...(editable ? { button: "Taklif qo'shish", path: `/procurements/${p.id}#supplier-offer-form` } : {}) }
    : numberValue(p.summary?.remaining_quantity) > 0
      ? { title: "Takliflardan miqdor tanlang", button: "Takliflarni ko'rish", path: `/procurements/${p.id}` }
      : { title: "Xarid partiya yaratishga tayyor", button: "Buyurtmani ochish", path: `/orders/${p.order_id}?tab=batches`, done: true };
  const headerActions = [{label:"Buyurtmani ochish",path:`/orders/${p.order_id}`}];
  if (editable) headerActions.push({label:"Taklif qo'shish",path:`/procurements/${p.id}#supplier-offer-form`,primary:true});
  app.innerHTML = `<div class="page">${workflowHeader({title:p.procurement_number,subtitle:`${fmt(p.client?.name)} · ${fmt(p.order?.order_number)} · ${fmt(optionLabel(procurementStatuses,p.status))}`,backPath:"/procurements",actions:headerActions})}${workflowStatusGrid([["Xarid holati",statusBadge(p.status)],["Takliflar holati",statusChip(p.offers?.length?{label:`${p.offers.length} ta taklif`,tone:"success"}:{label:"Taklif kutilmoqda",tone:"warning"})],["Tanlangan miqdor",fmtQty(p.summary?.selected_quantity)],["Ta'minotchi tasdiqi",statusChip(p.summary?.selected_suppliers_count?{label:"Tasdiqlangan",tone:"success"}:{label:"Kutilmoqda",tone:"muted"})]])}${summaryCards([["Talab miqdori",fmtQty(p.summary?.required_quantity)],["Tanlangan",fmtQty(p.summary?.selected_quantity)],["Qoldiq",fmtQty(p.summary?.remaining_quantity)],["Takliflar",fmt(p.summary?.offers_count)],["Ta'minotchilar",fmt(p.summary?.selected_suppliers_count)],["Yakuniy xarid",fmtMoney(p.summary?.final_purchase_amount)]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${workflowTabs("items",[["items","Mahsulotlar"],["offers","Takliflar"],["finance","Moliya"],["history","Tarix"]],"procurement-tab")}${section("Mahsulotlar", tableOrEmpty(p.items,["Mahsulot","Birlik","Talab miqdori","Xarid qilingan"],(item)=>`<tr><td>${fmt(item.product_name)}</td><td>${fmt(item.unit)}</td><td>${fmtQty(item.required_quantity,item.unit)}</td><td>${fmtQty(item.purchased_quantity,item.unit)}</td></tr>`,"Mahsulotlar topilmadi."))}${section("Takliflar", `${editable ? `<div class="actions"><button class="btn primary" type="button" onclick="document.querySelector('#supplier-offer-box')?.setAttribute('open','open'); document.querySelector('#supplier-offer-form')?.scrollIntoView({behavior:'smooth',block:'start'});">Taklif qo'shish</button></div>` : ""}${tableOrEmpty(p.offers,["Taklif","Ta'minotchi","Sana","Status","Jami","Mahsulotlar","Amallar"],(offer)=>`<tr><td>${fmt(offer.offer_number)}</td><td>${fmt(offer.supplier_name)}</td><td>${fmt(offer.offer_date)}</td><td>${fmt(optionLabel(supplierOfferStatuses,offer.status))}</td><td>${fmtMoney(offer.total_amount)}</td><td>${offer.items.map((item)=>`<div class="inline-edit"><span>${fmt(item.product_name)}: ${fmtQty(item.offered_quantity,item.unit)} taklif, ${fmtQty(item.selected_quantity,item.unit)} tanlangan</span>${editable ? `<input type="number" step="any" value="${esc(item.selected_quantity)}" data-offer-item-qty="${item.id}" /><button class="link-btn" data-offer-item-select="${item.id}">Miqdorni yangilash</button>` : ""}</div>`).join("")}</td><td>${editable ? `<button class="link-btn" data-offer-confirm="${offer.id}">Tasdiqlash</button>` : ""}</td></tr>`,"Takliflar hali kiritilmagan.")}`)}${editable ? section("Ta'minotchi taklifini qo'shish", `<details id="supplier-offer-box" class="action-form-box"><summary>Taklif formasini ochish</summary><form id="supplier-offer-form"><div class="grid"><label>Ta'minotchi<select name="supplier_id"><option value="">Ro'yxatdan tanlanmagan</option>${supplierOptions}</select></label>${textField("supplier_name","Ta'minotchi nomi")}${textField("offer_number","Taklif raqami")}${textField("offer_date","Taklif sanasi",new Date().toISOString().slice(0,10),"date")}${selectField("status","Status",supplierOfferStatuses,"received")}${textField("estimated_delivery_cost","Taxminiy yetkazish xarajati",0,"number")}${textArea("delivery_terms","Yetkazib berish shartlari")}${textArea("payment_terms","To'lov shartlari")}${textArea("notes","Izoh")}</div><div id="supplier-offer-items">${p.items.map(procurementOfferItemRow).join("")}</div><div class="form-footer"><button class="btn primary">Taklifni saqlash</button></div></form></details>`) : ""}${section("Moliya", detailList([["Yakuniy xarid summasi", fmtMoney(p.summary?.final_purchase_amount)], ["Ta'minotchilar soni", p.summary?.selected_suppliers_count], ["Buyurtma", p.order?.order_number]]))}${section("Tarix", workflowTimeline([["Yaratildi", fmtDate(p.created_at)], ["Holat", optionLabel(procurementStatuses, p.status)], ["Yangilandi", fmtDate(p.updated_at)]]))}</div>`;
  document.querySelector("#supplier-offer-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const selected = form.elements.supplier_id;
    const selectedName = selected.value ? selected.options[selected.selectedIndex].textContent : field(form, "supplier_name");
    const payload = { supplier_id: selected.value ? Number(selected.value) : null, supplier_name: selectedName, offer_number: field(form, "offer_number"), offer_date: field(form, "offer_date"), status: field(form, "status"), currency: "UZS", estimated_delivery_cost: field(form, "estimated_delivery_cost") || "0", delivery_terms: field(form, "delivery_terms"), payment_terms: field(form, "payment_terms"), notes: field(form, "notes"), items: collectSupplierOfferItems(form) };
    try {
      await api(`/api/procurements/${id}/offers`, { method: "POST", body: JSON.stringify(payload) });
      showToast("Ta'minotchi taklifi saqlandi.");
      await renderProcurementDetail(id);
    } catch (error) { showToast(error.message, true); }
  });
  app.querySelectorAll("[data-offer-item-select]").forEach((button) => button.addEventListener("click", async () => {
    const itemId = button.dataset.offerItemSelect;
    const value = normalizeNumberInputValue(app.querySelector(`[data-offer-item-qty="${itemId}"]`).value);
    try {
      await api(`/api/procurements/offer-items/${itemId}?selected_quantity=${encodeURIComponent(value)}`, { method: "PATCH" });
      showToast("Tanlov yangilandi.");
      await renderProcurementDetail(id);
    } catch (error) { showToast(error.message, true); }
  }));
  app.querySelectorAll("[data-offer-confirm]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await api(`/api/procurements/${id}/offers/${button.dataset.offerConfirm}/confirm`, { method: "POST" });
      showToast("Ta'minotchi taklifi tasdiqlandi.");
      await renderProcurementDetail(id);
    } catch (error) { showToast(error.message, true); }
  }));
}

async function fetchProcurementsOptions(selectedId = null, filters = {}) {
  const query = new URLSearchParams({ page_size: "100" });
  if (filters.supplierId) query.set("supplier_id", filters.supplierId);
  if (filters.clientId) query.set("client_id", filters.clientId);
  if (filters.contractId) query.set("contract_id", filters.contractId);
  if (filters.orderId) query.set("order_id", filters.orderId);
  const data = await api(`/api/procurements?${query.toString()}`);
  return data.items.map((p)=>`<option value="${p.id}" ${Number(selectedId) === p.id ? "selected" : ""}>${esc(p.procurement_number)} - ${esc(p.client?.name || "")}</option>`).join("");
}

async function fetchSupplierInvoicesOptions(supplierId = null) {
  if (!supplierId) return "";
  const data = await api(`/api/supplier-invoices?page_size=100${supplierId ? `&supplier_id=${supplierId}` : ""}`);
  return data.items.filter((i)=>Number(i.remaining_amount) > 0).map((i)=>`<option value="${i.id}">${esc(i.invoice_number)} - ${fmtMoney(i.remaining_amount)}</option>`).join("");
}

function supplierFinanceItemRow(item = {}, index = 0) {
  return `<div class="item-row" data-supplier-finance-item-row>${textField(`description_${index}`,"Description",item.description)}${textField(`product_name_${index}`,"Product",item.product_name)}${textField(`unit_${index}`,"Unit",item.unit || "ton")}${textField(`quantity_${index}`,"Quantity",item.quantity ?? 1,"number")}${textField(`unit_price_${index}`,"Unit price",item.unit_price ?? "","number")}${textField(`vat_rate_${index}`,"VAT %",item.vat_rate ?? 12,"number")}<button type="button" class="btn danger" data-remove-supplier-finance-item>Remove</button></div>`;
}

function collectSupplierFinanceItems(form) {
  return [...form.querySelectorAll("[data-supplier-finance-item-row]")].map((row,index)=>({
    description: field(form, `description_${index}`),
    product_name: field(form, `product_name_${index}`),
    unit: field(form, `unit_${index}`),
    quantity: field(form, `quantity_${index}`),
    unit_price: field(form, `unit_price_${index}`),
    vat_rate: field(form, `vat_rate_${index}`) || "12",
  })).filter((item)=>item.description && item.quantity);
}

function calculateSupplierFinanceForm(form) {
  let subtotal = 0, vat = 0;
  [...form.querySelectorAll("[data-supplier-finance-item-row]")].forEach((row)=>{
    const q = numberValue(row.querySelector("[name^='quantity_']").value);
    const p = numberValue(row.querySelector("[name^='unit_price_']").value);
    const r = numberValue(row.querySelector("[name^='vat_rate_']").value || 12);
    subtotal += q * p;
    vat += q * p * r / 100;
  });
  form.querySelectorAll("[data-supplier-subtotal]").forEach((el)=>el.textContent = fmtMoney(subtotal));
  form.querySelectorAll("[data-supplier-vat]").forEach((el)=>el.textContent = fmtMoney(vat));
  form.querySelectorAll("[data-supplier-total]").forEach((el)=>el.textContent = fmtMoney(subtotal + vat));
}

async function supplierInvoiceForm(invoice = null) {
  const suppliers = await fetchSuppliersOptions(invoice?.supplier_id);
  const procurements = invoice?.supplier_id ? await fetchProcurementsOptions(invoice?.procurement_id, { supplierId: invoice.supplier_id }) : "";
  const today = new Date().toISOString().slice(0,10);
  const rows = invoice?.items?.length ? invoice.items : [{}];
  return `<div class="page"><div class="page-header"><div class="page-title"><h1>${invoice ? "Edit supplier invoice" : "New supplier invoice"}</h1><p>Supplier-side invoice with manual items and allocation support.</p></div><div class="actions"><button class="btn" data-nav="${invoice ? `/supplier-invoices/${invoice.id}` : "/supplier-invoices"}">Back</button></div></div><form id="supplier-invoice-form"><input type="hidden" name="supplier_offer_id" value="${esc(invoice?.supplier_offer_id || "")}" /><input type="hidden" name="delivery_batch_id" value="${esc(invoice?.delivery_batch_id || "")}" /><input type="hidden" name="logistics_id" value="${esc(invoice?.logistics_id || "")}" />${section("Basic information", `<div class="grid"><label>Supplier<select name="supplier_id"><option value="">Select supplier</option>${suppliers}</select></label><label>Procurement<select name="procurement_id"><option value="">Select procurement</option>${procurements}</select></label>${textField("invoice_number","Invoice number",invoice?.invoice_number)}${textField("invoice_date","Invoice date",invoice?.invoice_date || today,"date")}${textField("due_date","Due date",invoice?.due_date || today,"date")}${selectField("invoice_type","Type",supplierInvoiceTypes,invoice?.invoice_type || "product_purchase")}${selectField("status","Status",supplierInvoiceStatuses,invoice?.status || "received")}${textArea("notes","Notes",invoice?.notes)}</div>`)}${section("Invoice items", `<div id="supplier-finance-items">${rows.map(supplierFinanceItemRow).join("")}</div><button type="button" class="btn" id="add-supplier-finance-item">Add item</button><div class="totals-bar"><div class="total-box"><span>Subtotal</span><strong data-supplier-subtotal>${dash}</strong></div><div class="total-box"><span>VAT</span><strong data-supplier-vat>${dash}</strong></div><div class="total-box"><span>Total</span><strong data-supplier-total>${dash}</strong></div></div>`)}${section("Documents", `<div class="empty">Supplier finance document metadata can be added from detail/API workflow.</div>`)}<div class="form-footer"><button type="button" class="btn" data-nav="${invoice ? `/supplier-invoices/${invoice.id}` : "/supplier-invoices"}">Cancel</button><button class="btn primary">Save</button></div></form></div>`;
}

function bindSupplierInvoiceForm(invoice = null) {
  const form = document.querySelector("#supplier-invoice-form");
  form.elements.supplier_id.addEventListener("change", async () => {
    form.elements.procurement_id.innerHTML = `<option value="">Select procurement</option>${await fetchProcurementsOptions(null, { supplierId: form.elements.supplier_id.value })}`;
  });
  form.addEventListener("input",()=>calculateSupplierFinanceForm(form));
  document.querySelector("#add-supplier-finance-item").addEventListener("click",()=>{
    const index = form.querySelectorAll("[data-supplier-finance-item-row]").length;
    document.querySelector("#supplier-finance-items").insertAdjacentHTML("beforeend", supplierFinanceItemRow({}, index));
    calculateSupplierFinanceForm(form);
  });
  form.addEventListener("click",(event)=>{
    if (!event.target.matches("[data-remove-supplier-finance-item]")) return;
    if (form.querySelectorAll("[data-supplier-finance-item-row]").length <= 1) return showToast("Invoice must have at least one item.", true);
    event.target.closest("[data-supplier-finance-item-row]").remove();
    calculateSupplierFinanceForm(form);
  });
  form.addEventListener("submit", async (event)=>{
    event.preventDefault();
    const payload = { supplier_id: Number(field(form,"supplier_id")), procurement_id: Number(field(form,"procurement_id")), supplier_offer_id: field(form,"supplier_offer_id") ? Number(field(form,"supplier_offer_id")) : null, delivery_batch_id: field(form,"delivery_batch_id") ? Number(field(form,"delivery_batch_id")) : null, logistics_id: field(form,"logistics_id") ? Number(field(form,"logistics_id")) : null, invoice_number: field(form,"invoice_number"), invoice_date: field(form,"invoice_date"), due_date: field(form,"due_date"), invoice_type: field(form,"invoice_type"), status: field(form,"status"), currency: "UZS", notes: field(form,"notes"), items: collectSupplierFinanceItems(form) };
    try {
      const saved = await api(invoice ? `/api/supplier-invoices/${invoice.id}` : "/api/supplier-invoices", { method: invoice ? "PATCH" : "POST", body: JSON.stringify(payload) });
      showToast("Supplier invoice saved.");
      navigate(`/supplier-invoices/${saved.id}`);
    } catch (error) { showToast(error.message, true); }
  });
  calculateSupplierFinanceForm(form);
}

async function renderSupplierInvoicesList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/supplier-invoices?${params.toString()}`);
  const editable = canEdit("moliya");
  app.innerHTML = opsListPage({className:"supplier-invoices-ops-page",title:"Ta'minotchi hisoblari",tabs:[{label:"Hisoblar",active:true},{label:"To'lovlar",path:"/supplier-payments"},{label:"Kreditorlik",path:"/payables"}],createPath:editable ? "/supplier-invoices/new" : undefined,clearPath:"/supplier-invoices",counter:`${fmt(data.total)} ta hisob`,formId:"supplier-invoice-search-form",filters:`<input name="search" placeholder="Hisob, ta'minotchi, xarid, partiya" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${supplierInvoiceStatuses.map(([k,l])=>`<option value="${k}" ${params.get("status")===k?"selected":""}>${l}</option>`).join("")}</select>`,headers:["Hisob raqami","Hisob sanasi","To'lov muddati","Ta'minotchi","Xarid","Partiya","Turi","Jami","To'langan","Qoldiq","Status",""],rows:data.items.map((i)=>`<tr><td><button class="ops-primary-link" data-nav="/supplier-invoices/${i.id}">${fmt(i.invoice_number)}</button></td><td>${fmt(i.invoice_date)}</td><td>${fmt(i.due_date)}</td><td>${fmt(i.supplier?.name)}</td><td>${fmt(i.procurement?.procurement_number)}</td><td>${fmt(i.delivery_batch?.batch_number)}</td><td>${fmt(optionLabel(supplierInvoiceTypes,i.invoice_type))}</td><td class="ops-money">${fmtMoney(i.total_amount)}</td><td class="ops-money">${fmtMoney(i.paid_amount)}</td><td class="ops-money ${numberValue(i.remaining_amount)>0?"ops-warning":""}">${fmtMoney(i.remaining_amount)}</td><td>${statusBadge(i.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/supplier-invoices/${i.id}">Ochish</button>${editable ? `<button class="link-btn" data-nav="/supplier-invoices/${i.id}/edit">Tahrirlash</button><button class="link-btn" data-nav="/supplier-payments/new">To'lov</button>` : ""}</div></td></tr>`).join(""),emptyText:"Ta'minotchi hisoblari topilmadi.",colspan:12,footer:opsFooter(data,"supplierinvoice")});
  bindOpsSearch("supplier-invoice-search-form","/supplier-invoices",["search","status"]);
  bindOpsPagination("supplierinvoice","/supplier-invoices");
}

async function renderNewSupplierInvoice(){ app.innerHTML = await supplierInvoiceForm(); bindSupplierInvoiceForm(); }
async function renderEditSupplierInvoice(id){ const invoice = await api(`/api/supplier-invoices/${id}`); app.innerHTML = await supplierInvoiceForm(invoice); bindSupplierInvoiceForm(invoice); }

async function renderSupplierInvoiceDetail(id) {
  const i = await api(`/api/supplier-invoices/${id}`);
  const payState = financePaymentState(i);
  const editable = canEdit("moliya");
  const warnings = [];
  if (numberValue(i.remaining_amount) > 0) warnings.push("Ta'minotchi hisobi bo'yicha to'lanmagan qoldiq mavjud.");
  if (!i.procurement && !i.delivery_batch && !i.logistics) warnings.push("Hisob xarid yoki partiya bilan bog'lanmagan.");
  if (!hasDocs(i)) warnings.push("Ta'minotchi hisobi fayli yuklanmagan.");
  const headerActions = [];
  if (editable) headerActions.push({label:"To'lov kiritish",path:"/supplier-payments/new",primary:true});
  headerActions.push({label:"Hujjat yuklash",path:`/supplier-invoices/${i.id}#documents`});
  const nextAction = numberValue(i.remaining_amount)>0
    ? { title: "Ta'minotchiga to'lov kiriting", ...(editable ? { button: "To'lov kiritish", path: "/supplier-payments/new" } : {}) }
    : { title: "Hisob to'liq yopilgan", button: "Tarix", path: `/supplier-invoices/${i.id}#history`, done: true };
  app.innerHTML = `<div class="page">${workflowHeader({title:i.invoice_number,subtitle:`${fmt(i.supplier?.name)} · ${fmt(optionLabel(supplierInvoiceTypes,i.invoice_type))} · ${fmt(optionLabel(supplierInvoiceStatuses,i.status))}`,backPath:"/supplier-invoices",fullEditPath:editable ? `/supplier-invoices/${i.id}/edit` : "",actions:headerActions})}${workflowStatusGrid([["Hisob holati",statusBadge(i.status)],["To'lov holati",statusChip(payState)],["Xarid bog'lanishi",statusChip((i.procurement||i.delivery_batch||i.logistics)?{label:"Bog'langan",tone:"success"}:{label:"Bog'lanmagan",tone:"warning"})],["Hujjat holati",statusChip(hasDocs(i)?{label:"Yuklangan",tone:"success"}:{label:"Kutilmoqda",tone:"warning"})]])}${summaryCards([["Sof summa",fmtMoney(i.subtotal_amount)],["QQS",fmtMoney(i.vat_amount)],["Jami",fmtMoney(i.total_amount)],["To'langan",fmtMoney(i.paid_amount)],["Qoldiq",fmtMoney(i.remaining_amount)],["To'lov muddati",fmt(i.due_date)]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${section("Umumiy ma'lumotlar", detailList([["Hisob raqami",i.invoice_number],["Hisob sanasi",i.invoice_date],["To'lov muddati",i.due_date],["Turi",optionLabel(supplierInvoiceTypes,i.invoice_type)],["Status",optionLabel(supplierInvoiceStatuses,i.status)],["Ta'minotchi",i.supplier?.name],["Xarid",i.procurement?.procurement_number],["Taklif",i.supplier_offer?.offer_number],["Partiya",i.delivery_batch?.batch_number],["Logistika",i.logistics?.logistics_number],["Valyuta",i.currency],["Izoh",i.notes],["Yaratilgan",fmtDate(i.created_at)],["Yangilangan",fmtDate(i.updated_at)]]))}${section("Hisob elementlari", tableOrEmpty(i.items,["Tavsif","Mahsulot","Birlik","Miqdor","Birlik narxi","QQS","Jami"],(it)=>`<tr><td>${fmt(it.description)}</td><td>${fmt(it.product_name)}</td><td>${fmt(it.unit)}</td><td>${fmtQty(it.quantity)}</td><td>${fmtMoney(it.unit_price)}</td><td>${fmtMoney(it.vat_amount)}</td><td>${fmtMoney(it.total_with_vat)}</td></tr>`,"Hisob elementlari yo'q."))}${section("To'lovlar / Taqsimlash", tableOrEmpty(i.allocations,["To'lov","Taqsimlangan","Yaratgan","Yaratilgan"],(a)=>`<tr><td>${fmt(a.supplier_payment?.payment_number || a.payment_number || "Ta'minotchi to'lovi")}</td><td>${fmtMoney(a.allocated_amount)}</td><td>${fmt(a.created_by)}</td><td>${fmtDate(a.created_at)}</td></tr>`,"Taqsimlash yozuvlari yo'q."))}<div id="documents">${section("Hujjatlar", tableOrEmpty(i.documents,["Hujjat nomi","Turi","Yuklangan"],(d)=>`<tr><td>${fmt(d.title)}</td><td>${fmt(optionLabel(supplierFinanceDocumentTypes,d.document_type))}</td><td>${fmtDate(d.uploaded_at)}</td></tr>`,"Hujjatlar yo'q."))}</div><div id="history">${section("Tarix", tableOrEmpty(i.notes_history,["Sana","Foydalanuvchi","Izoh"],(n)=>`<tr><td>${fmtDate(n.created_at)}</td><td>${fmt(n.created_by)}</td><td>${fmt(n.note)}</td></tr>`,"Tarix yozuvlari yo'q."))}</div></div>`;
}

async function supplierPaymentForm(payment = null) {
  const suppliers = await fetchSuppliersOptions(payment?.supplier_id);
  const invoiceOptions = await fetchSupplierInvoicesOptions(payment?.supplier_id);
  const today = new Date().toISOString().slice(0,10);
  return `<div class="page"><div class="page-header"><div class="page-title"><h1>${payment ? "Edit supplier payment" : "New supplier payment"}</h1><p>Supplier payment with optional manual invoice allocation.</p></div><div class="actions"><button class="btn" data-nav="${payment ? `/supplier-payments/${payment.id}` : "/supplier-payments"}">Back</button></div></div><form id="supplier-payment-form">${section("Basic information", `<div class="grid"><label>Supplier<select name="supplier_id"><option value="">Select supplier</option>${suppliers}</select></label>${textField("payment_number","Payment number",payment?.payment_number)}${textField("payment_date","Payment date",payment?.payment_date || today,"date")}${textField("amount","Amount",payment?.amount || "","number")}${selectField("payment_method","Payment method",paymentMethods,payment?.payment_method || "bank_transfer")}${textField("bank_account","Bank account",payment?.bank_account)}${textField("reference_number","Reference number",payment?.reference_number)}${textArea("notes","Notes",payment?.notes)}</div>`)}${section("Manual allocation", `<div class="grid"><label>Open invoice<select name="allocation_invoice_id"><option value="">Leave unallocated</option>${invoiceOptions}</select></label>${textField("allocated_amount","Allocate amount","","number")}</div><div class="empty">For multiple allocations, create the payment then add allocations through the API/detail workflow.</div>`)}${section("Documents", `<div class="empty">Supplier payment document metadata can be added later.</div>`)}<div class="form-footer"><button class="btn" type="button" data-nav="${payment ? `/supplier-payments/${payment.id}` : "/supplier-payments"}">Cancel</button><button class="btn primary">Save</button></div></form></div>`;
}

function bindSupplierPaymentForm(payment = null) {
  const form = document.querySelector("#supplier-payment-form");
  form.elements.supplier_id.addEventListener("change", async () => {
    form.elements.allocation_invoice_id.innerHTML = `<option value="">Leave unallocated</option>${await fetchSupplierInvoicesOptions(form.elements.supplier_id.value)}`;
  });
  form.addEventListener("submit", async (event)=>{
    event.preventDefault();
    const allocations = field(form,"allocation_invoice_id") && field(form,"allocated_amount") ? [{ supplier_invoice_id: Number(field(form,"allocation_invoice_id")), allocated_amount: field(form,"allocated_amount") }] : [];
    const payload = { supplier_id: Number(field(form,"supplier_id")), payment_number: field(form,"payment_number"), payment_date: field(form,"payment_date"), amount: field(form,"amount"), currency: "UZS", payment_method: field(form,"payment_method"), bank_account: field(form,"bank_account"), reference_number: field(form,"reference_number"), notes: field(form,"notes"), allocations };
    try {
      const saved = await api(payment ? `/api/supplier-payments/${payment.id}` : "/api/supplier-payments", { method: payment ? "PATCH" : "POST", body: JSON.stringify(payload) });
      showToast("Supplier payment saved.");
      navigate(`/supplier-payments/${saved.id}`);
    } catch (error) { showToast(error.message, true); }
  });
}

async function renderNewSupplierPayment(){ app.innerHTML = await supplierPaymentForm(); bindSupplierPaymentForm(); }
async function renderEditSupplierPayment(id){ const payment = await api(`/api/supplier-payments/${id}`); app.innerHTML = await supplierPaymentForm(payment); bindSupplierPaymentForm(payment); }

async function renderSupplierPaymentsList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/supplier-payments?${params.toString()}`);
  const editable = canEdit("moliya");
  app.innerHTML = opsListPage({className:"supplier-payments-ops-page",title:"Ta'minotchi to'lovlari",tabs:[{label:"Hisoblar",path:"/supplier-invoices"},{label:"To'lovlar",active:true},{label:"Kreditorlik",path:"/payables"}],createPath:editable ? "/supplier-payments/new" : undefined,clearPath:"/supplier-payments",counter:`${fmt(data.total)} ta to'lov`,formId:"supplier-payment-search-form",filters:`<input name="search" placeholder="To'lov, ta'minotchi, havola, bank" value="${esc(params.get("search") || "")}" />`,headers:["To'lov raqami","Sana","Ta'minotchi","Summa","Taqsimlangan","Taqsimlanmagan","Usul","Havola","Status",""],rows:data.items.map((p)=>`<tr><td><button class="ops-primary-link" data-nav="/supplier-payments/${p.id}">${fmt(p.payment_number)}</button></td><td>${fmt(p.payment_date)}</td><td>${fmt(p.supplier?.name)}</td><td class="ops-money">${fmtMoney(p.amount)}</td><td class="ops-money">${fmtMoney(p.allocated_amount)}</td><td class="ops-money ${numberValue(p.unallocated_amount)>0?"ops-warning":""}">${fmtMoney(p.unallocated_amount)}</td><td>${fmt(optionLabel(paymentMethods,p.payment_method))}</td><td>${fmt(p.reference_number)}</td><td>${statusBadge(p.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/supplier-payments/${p.id}">Ochish</button>${editable ? `<button class="link-btn" data-nav="/supplier-payments/${p.id}/edit">Tahrirlash</button>` : ""}</div></td></tr>`).join(""),emptyText:"Ta'minotchi to'lovlari topilmadi.",colspan:10,footer:opsFooter(data,"supplierpayment")});
  bindOpsSearch("supplier-payment-search-form","/supplier-payments",["search"]);
  bindOpsPagination("supplierpayment","/supplier-payments");
}

async function renderSupplierPaymentDetail(id) {
  const p = await api(`/api/supplier-payments/${id}`);
  const unallocated = numberValue(p.summary?.unallocated_amount);
  const editable = canEdit("moliya");
  const warnings = [];
  if (unallocated > 0) warnings.push("To'lovning taqsimlanmagan qismi mavjud.");
  if (!hasDocs(p)) warnings.push("To'lov hujjati yuklanmagan.");
  const headerActions = [];
  if (editable) headerActions.push({label:"Taqsimlash",path:`/supplier-payments/${p.id}/edit`,primary:unallocated>0});
  headerActions.push({label:"Hujjat yuklash",path:`/supplier-payments/${p.id}#documents`});
  const nextAction = unallocated>0
    ? { title: "To'lovni ta'minotchi hisoblariga taqsimlang", ...(editable ? { button: "Taqsimlash", path: `/supplier-payments/${p.id}/edit` } : {}) }
    : { title: "To'lov to'liq taqsimlangan", button: "Tarix", path: `/supplier-payments/${p.id}#history`, done: true };
  app.innerHTML = `<div class="page">${workflowHeader({title:p.payment_number,subtitle:`${fmt(p.supplier?.name)} · ${fmtMoney(p.amount)} · ${fmt(optionLabel(supplierPaymentStatuses,p.status))}`,backPath:"/supplier-payments",fullEditPath:editable ? `/supplier-payments/${p.id}/edit` : "",actions:headerActions})}${workflowStatusGrid([["To'lov holati",statusBadge(p.status)],["Taqsimlangan summa",fmtMoney(p.summary?.allocated_amount)],["Taqsimlanmagan summa",fmtMoney(p.summary?.unallocated_amount)],["Hujjat holati",statusChip(hasDocs(p)?{label:"Yuklangan",tone:"success"}:{label:"Kutilmoqda",tone:"warning"})]])}${summaryCards([["To'lov summasi",fmtMoney(p.summary?.amount)],["Taqsimlangan",fmtMoney(p.summary?.allocated_amount)],["Taqsimlanmagan",fmtMoney(p.summary?.unallocated_amount)],["To'lov sanasi",fmt(p.payment_date)],["Usul",fmt(optionLabel(paymentMethods,p.payment_method))],["Status",fmt(optionLabel(supplierPaymentStatuses,p.status))]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${section("Umumiy ma'lumotlar", detailList([["To'lov raqami",p.payment_number],["To'lov sanasi",p.payment_date],["Ta'minotchi",p.supplier?.name],["Summa",fmtMoney(p.amount)],["Valyuta",p.currency],["Usul",optionLabel(paymentMethods,p.payment_method)],["Bank hisob raqami",p.bank_account],["Havola",p.reference_number],["Status",optionLabel(supplierPaymentStatuses,p.status)],["Izoh",p.notes],["Yaratilgan",fmtDate(p.created_at)],["Yangilangan",fmtDate(p.updated_at)]]))}${section("Taqsimlash", tableOrEmpty(p.allocations,["Hisob","Taqsimlangan","Yaratilgan"],(a)=>`<tr><td>${fmt(a.supplier_invoice?.invoice_number || a.invoice_number || "Ta'minotchi hisobi")}</td><td>${fmtMoney(a.allocated_amount)}</td><td>${fmtDate(a.created_at)}</td></tr>`,"Taqsimlash yozuvlari yo'q."))}<div id="documents">${section("Hujjatlar", tableOrEmpty(p.documents,["Hujjat nomi","Turi","Yuklangan"],(d)=>`<tr><td>${fmt(d.title)}</td><td>${fmt(optionLabel(supplierFinanceDocumentTypes,d.document_type))}</td><td>${fmtDate(d.uploaded_at)}</td></tr>`,"Hujjatlar yo'q."))}</div><div id="history">${section("Tarix", tableOrEmpty(p.notes_history,["Sana","Foydalanuvchi","Izoh"],(n)=>`<tr><td>${fmtDate(n.created_at)}</td><td>${fmt(n.created_by)}</td><td>${fmt(n.note)}</td></tr>`,"Tarix yozuvlari yo'q."))}</div></div>`;
}
