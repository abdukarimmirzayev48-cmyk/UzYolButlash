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
  return `<div class="page"><div class="page-header"><div class="page-title"><h1>${supplier ? "Ta'minotchini tahrirlash" : "Yangi ta'minotchi"}</h1><p>Ta'minotchi asosiy ma'lumotlari: qoldiq, reyting va tasdiqlashsiz.</p></div><div class="actions"><button class="btn" data-nav="${supplier ? `/suppliers/${supplier.id}` : "/suppliers"}">Orqaga</button></div></div><form id="supplier-form">${section("Asosiy ma'lumotlar", `<div class="grid">${textField("name","Ta'minotchi nomi",supplier?.name,"text",{ required: true, maxlength: 255 })}${textField("inn","STIR",supplier?.inn,"text",CLIENT_FIELD_RULES.inn)}${textField("oked","OKED",supplier?.oked,"text",CLIENT_FIELD_RULES.oked)}${textField("phone","Telefon",supplier?.phone,"tel",CLIENT_FIELD_RULES.phone)}${textField("email","Email",supplier?.email,"email",CLIENT_FIELD_RULES.email)}${textArea("notes","Izohlar",supplier?.notes,{ maxlength: 2000 })}</div>`)}${!supplier ? section("Birlamchi kontakt shaxs", `<div class="grid">${textField("contact_full_name","F.I.Sh.",contact.full_name,"text",{ maxlength: 255 })}${textField("contact_position","Lavozimi",contact.position,"text",{ maxlength: 120 })}${textField("contact_phone","Telefon",contact.phone,"tel",CLIENT_FIELD_RULES.phone)}${textField("contact_email","Email",contact.email,"email",CLIENT_FIELD_RULES.email)}${textArea("contact_comment","Izoh",contact.comment,{ maxlength: 1000 })}</div>`) : ""}${!supplier ? section("Manzil", `<div class="grid">${selectField("address_type","Manzil turi",supplierAddressTypes,address.address_type || "loading")}${geoRegionField(address.region)}${geoDistrictField(address.region, address.district)}${textField("address","Manzil",address.address,"text",{ maxlength: 255 })}${textArea("address_comment","Izoh",address.comment,{ maxlength: 1000 })}</div>`) : ""}${!supplier ? section("Bank hisobi", `<div class="grid">${textField("bank_name","Bank nomi",account.bank_name,"text",{ maxlength: 160 })}${textField("mfo","MFO",account.mfo,"text",CLIENT_FIELD_RULES.mfo)}${textField("account_number","Hisob raqami",account.account_number,"text",CLIENT_FIELD_RULES.account_number)}${textArea("bank_comment","Izoh",account.comment,{ maxlength: 1000 })}</div>`) : ""}<div class="form-footer"><button type="button" class="btn" data-nav="${supplier ? `/suppliers/${supplier.id}` : "/suppliers"}">Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div></form></div>`;
}

async function renderSuppliersList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/suppliers?${params.toString()}`);
  const editable = canEdit("taminot");
  app.innerHTML = opsListPage({className:"suppliers-ops-page",title:"Ta'minotchilar",tabs:[{label:"Ta'minotchilar",active:true},{label:"Ta'minotchi hisoblari",path:"/supplier-invoices"}],createPath:editable ? "/suppliers/new" : undefined,clearPath:"/suppliers",counter:`${fmt(data.total)} ta ta'minotchi`,formId:"supplier-search-form",filters:`<input name="search" placeholder="Ta'minotchi, STIR, telefon, email" value="${esc(params.get("search") || "")}" />`,headers:["Nomi","STIR","Telefon","Mas'ul shaxs","Hudud","Yuklash manzili","Oxirgi faollik",""],rows:data.items.map((s)=>`<tr><td><button class="ops-primary-link" data-nav="/suppliers/${s.id}">${fmt(s.name)}</button></td><td>${fmt(s.inn)}</td><td>${fmt(s.phone)}</td><td>${fmt(s.primary_contact?.full_name)}</td><td>${fmt(s.primary_region)}</td><td>${fmt(s.primary_loading_address)}</td><td>${fmtDate(s.last_activity)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/suppliers/${s.id}">Ochish</button>${editable ? `<button class="link-btn" data-nav="/suppliers/${s.id}/edit">Tahrirlash</button>` : ""}</div></td></tr>`).join(""),emptyText:"Ta'minotchilar topilmadi.",colspan:8,footer:opsFooter(data,"supplier")});
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
      showToast("Ta'minotchi saqlandi.");
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
      showToast("Ta'minotchi yangilandi.");
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
      { label: "Birja ticketlari", active: true },
      { label: "Zaxira", path: "/stock" },
    ],
    createPath: canEdit("taminot") ? "/exchange-tickets/new" : undefined,
    createLabel: "Ticket yaratish",
    clearPath: "/exchange-tickets",
    counter: `${fmt(data.total)} ta ticket`,
    formId: "exchange-ticket-search-form",
    filters: `<input name="search" placeholder="Ticket, ta'minotchi, mahsulot" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${exchangeTicketStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select><label class="inline-check"><input type="checkbox" name="overdue_only" value="true" ${params.get("overdue_only") === "true" ? "checked" : ""} /> Muddati o'tgan</label>`,
    headers: ["Ticket №", "Sana", "Ta'minotchi", "Mahsulot", "Ticket miqdori", "Zaxiraga tushgan", "Zaxirada erkin", "Jami summa", "To'lov muddati", "Qoldiq kun", "Status", ""],
    rows: data.items.map((ticket) => `<tr><td><button class="ops-primary-link" data-nav="/exchange-tickets/${ticket.id}">${fmt(ticket.ticket_number)}</button></td><td>${fmt(ticket.ticket_date)}</td><td>${fmt(ticket.supplier_name)}</td><td>${fmt(ticket.product_name)}</td><td>${fmtQty(ticket.quantity, ticket.unit)}</td><td>${fmtQty(ticket.balance?.taken, ticket.unit)}</td><td>${fmtQty(ticket.balance?.available, ticket.unit)}</td><td class="ops-money">${fmtMoney(ticket.total_amount)}</td><td>${fmt(ticket.due_date)}</td><td>${fmt(daysUntil(ticket.due_date))}</td><td>${statusBadge(ticket.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/exchange-tickets/${ticket.id}">Ochish</button>${ticket.stock_lot ? `<button class="link-btn" data-nav="/stock/${ticket.stock_lot.id}">Zaxira</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Birja ticketlari topilmadi.",
    colspan: 12,
    footer: opsFooter(data, "exchange-ticket"),
  });
  bindOpsSearch("exchange-ticket-search-form", "/exchange-tickets", ["search", "status", "overdue_only"]);
  bindOpsPagination("exchange-ticket", "/exchange-tickets");
}

function exchangeTicketPayload(form) {
  const supplierId = field(form, "supplier_id");
  const productId = field(form, "product_id");
  return {
    ticket_number: field(form, "ticket_number"),
    ticket_date: field(form, "ticket_date"),
    supplier_id: supplierId ? Number(supplierId) : null,
    product_id: productId ? Number(productId) : null,
    product_name: field(form, "product_name"),
    unit: field(form, "unit") || "tonna",
    quantity: field(form, "quantity"),
    unit_price: field(form, "unit_price") || "0",
    vat_rate: field(form, "vat_rate") || "12",
    payment_type: field(form, "payment_type") || "forward",
    payment_term_days: Number(field(form, "payment_term_days") || 90),
    notes: field(form, "notes"),
    created_by: field(form, "created_by"),
    open_immediately: true,
  };
}

// Spot settles almost immediately, forward is the deferred birja term. The
// day counts are starting points, not rules -- both stay editable, because a
// negotiated term is the normal case.
const TICKET_PAYMENT_TYPES = [
  ["spot", "Spot", 5],
  ["forward", "Forward", 90],
];

function bindTicketPaymentType(form) {
  const hidden = form.elements.payment_type;
  const days = form.elements.payment_term_days;
  form.querySelectorAll("[data-payment-type]").forEach((button) => button.addEventListener("click", () => {
    hidden.value = button.dataset.paymentType;
    days.value = button.dataset.days;
    form.querySelectorAll("[data-payment-type]").forEach((other) => {
      other.classList.toggle("active", other.dataset.paymentType === hidden.value);
    });
    updateExchangeTicketTotals(form);
  }));
}

function exchangeTicketProductOptions(products) {
  const grouped = new Map();
  (products || []).forEach((product) => {
    const category = product.category?.name || "Boshqa";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(product);
  });
  return [...grouped.entries()].map(([category, items]) => `
    <optgroup label="${esc(category)}">
      ${items.map((product) => `<option value="${product.id}" data-name="${esc(product.name)}" data-unit="${esc(product.unit || "tonna")}">${esc(product.name)}${product.brand ? ` · ${esc(product.brand)}` : ""}</option>`).join("")}
    </optgroup>`).join("");
}

function bindExchangeTicketProduct(form) {
  const select = form.querySelector("[data-ticket-product]");
  if (!select) return;
  const apply = () => {
    const option = select.options[select.selectedIndex];
    const name = option?.dataset.name || "";
    form.elements.product_name.value = name;
    if (name && option.dataset.unit) form.elements.unit.value = option.dataset.unit;
  };
  select.addEventListener("change", () => {
    apply();
    updateExchangeTicketTotals(form);
  });
  apply();
}

function validateExchangeTicketForm(form) {
  const errors = [];
  if (!field(form, "ticket_number")) errors.push("Ticket raqamini kiriting.");
  if (!field(form, "ticket_date")) errors.push("Ticket sanasini kiriting.");
  if (!field(form, "supplier_id")) errors.push("Ta'minotchini tanlang.");
  if (!field(form, "product_id")) errors.push("Mahsulotni tanlang.");
  if (!field(form, "unit")) errors.push("Birlikni kiriting.");
  if (numberValue(field(form, "quantity")) <= 0) errors.push("Miqdor 0 dan katta bo'lishi kerak.");
  if (numberValue(field(form, "unit_price")) < 0) errors.push("Birlik narxi manfiy bo'lishi mumkin emas.");
  if (numberValue(field(form, "vat_rate") || 0) < 0) errors.push("QQS foizi manfiy bo'lishi mumkin emas.");
  if (!field(form, "payment_type")) errors.push("To'lov turini tanlang.");
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
  const [supplierOptions, products] = await Promise.all([
    fetchSuppliersOptions(),
    api("/api/products").catch(() => []),
  ]);
  // Grouped by category, and each option carries the name and unit so picking
  // one fills them in -- the ticket must point at a catalogue product, not at
  // a hand-typed name that nothing else in the system can match.
  const productOptions = exchangeTicketProductOptions(products);
  const today = todayIso();
  app.innerHTML = `<div class="page"><div class="page-header"><div class="page-title"><h1>Yangi birja ticketi</h1><p>Ticket ochilganda ta'minotchi omboridagi kompaniya zaxirasi yaratiladi.</p></div><div class="actions"><button class="btn" data-nav="/exchange-tickets">Orqaga</button></div></div><form id="exchange-ticket-form">${section("Ticket ma'lumotlari", `<div class="grid">${textField("ticket_number", "Ticket raqami")}${textField("ticket_date", "Ticket sanasi", today, "date")}<label>Ta'minotchi<select name="supplier_id"><option value="">Tanlang</option>${supplierOptions}</select></label><label><span class="field-label-text">Mahsulot <span class="required-mark" aria-hidden="true">*</span></span>${selectSearch("product_id", "Mahsulot nomi bo'yicha qidiring")}<select name="product_id" data-ticket-product required><option value="">Mahsulotni tanlang</option>${productOptions}</select></label><input type="hidden" name="product_name" value="" />${textField("quantity", "Miqdor", "", "number")}${textField("unit", "Birlik", "tonna")}${textField("unit_price", "Birlik narxi", "", "number")}${textField("vat_rate", "QQS %", 12, "number")}<label><span class="field-label-text">To'lov turi <span class="required-mark" aria-hidden="true">*</span></span>
      <div class="choice-row">
        ${TICKET_PAYMENT_TYPES.map(([key, label, days]) => `<button type="button" class="task-chip ${key === "forward" ? "active" : ""}" data-payment-type="${key}" data-days="${days}">${label}</button>`).join("")}
      </div>
      <input type="hidden" name="payment_type" value="forward" />
    </label>${textField("payment_term_days", "To'lov muddati, kun", 90, "number")}${readonlyField("due_date_preview", "To'lov muddati", "")}${textField("created_by", "Yaratgan")}${textArea("notes", "Izoh")}</div>`)}${section("Hisob-kitob", summaryCards([["To'lov muddati", `<span data-ticket-due>${dash}</span>`], ["Oraliq summa", `<span data-ticket-subtotal>${dash}</span>`], ["QQS", `<span data-ticket-vat>${dash}</span>`], ["Jami summa", `<span data-ticket-total>${dash}</span>`]]))}<div class="form-footer"><button class="btn" type="button" data-nav="/exchange-tickets">Bekor qilish</button><button class="btn primary">Ticketni ochish</button></div></form></div>`;
  const form = document.querySelector("#exchange-ticket-form");
  bindSelectSearch(form);
  bindExchangeTicketProduct(form);
  bindTicketPaymentType(form);
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

// Ticketdan olingan mol qaysi buyurtmaga ketgani. Yalang'och ID o'rniga
// buyurtma raqami, mijoz va partiya ko'rsatiladi -- «qaysi mol qayerga
// ketdi» degan savolga javob shu jadvalda.
function stockAllocationsTable(allocations, unit) {
  return tableOrEmpty(
    allocations,
    ["Buyurtma", "Mijoz", "Ajratilgan miqdor", "Yetkazish partiyasi", "Status"],
    (a) => `<tr><td>${a.order_id ? `<button class="link-btn" data-nav="/orders/${a.order_id}">${fmt(a.order_number)}</button>` : dash}</td><td>${fmt(a.client_name)}</td><td>${fmtQty(a.allocated_quantity, unit)}</td><td>${a.delivery_batch_id ? `<button class="link-btn" data-nav="/delivery-batches/${a.delivery_batch_id}">${fmt(a.batch_number)}</button>` : dash}</td><td>${statusBadge(a.status)}</td></tr>`,
    "Bu zaxiradan hali birorta buyurtmaga ajratilmagan.",
  );
}

async function renderExchangeTicketDetail(id) {
  const ticket = await api(`/api/exchange-tickets/${id}`);
  const lot = ticket.stock_lot;
  const allocations = lot ? await api(`/api/stock-allocations?stock_lot_id=${lot.id}`).catch(() => []) : [];
  const balance = ticket.balance || {};
  const warnings = [...(balance.warnings || [])];
  const dueDays = daysUntil(ticket.due_date);
  if (typeof dueDays === "number" && dueDays <= 7 && !["paid", "closed", "cancelled"].includes(ticket.status)) warnings.push(`Ticket to'lov muddati tugashiga ${dueDays} kun qoldi.`);
  if (!lot) warnings.push("Zaxira partiyasi hali yaratilmagan.");
  app.innerHTML = `<div class="page">${workflowHeader({ title: ticket.ticket_number, subtitle: subtitleLine([{value:ticket.supplier_name,raw:true},{value:ticket.product_name,raw:true},{value:fmtDayOnly(ticket.ticket_date),raw:true}]), backPath: "/exchange-tickets", actions: [{ label: "Zaxirani ko'rish", path: lot ? `/stock/${lot.id}` : "/stock", primary: Boolean(lot) }, { label: "Hisob-faktura yaratish", path: `/supplier-invoices/new?ticket_id=${ticket.id}&supplier_id=${ticket.supplier_id}` }, { label: "Hujjat yuklash", path: `/exchange-tickets/${ticket.id}#documents` }] })}${workflowStatusGrid([["Ticket holati", statusBadge(ticket.status)], ["Zaxira holati", lot ? statusBadge(lot.stock_status) : statusChip({ label: "Yaratilmagan", tone: "warning" })], ["To'lov holati", statusChip({ label: optionLabel(exchangeTicketStatuses, ticket.status), tone: dueDays < 0 ? "warning" : "muted" })], ["Hujjat holati", statusChip({ label: "Keyingi bosqich", tone: "muted" })]])}${summaryCards([
      ["Ticket miqdori", fmtQty(balance.quota ?? ticket.quantity, ticket.unit)],
      ["Zaxiraga tushgan", fmtQty(balance.taken, ticket.unit)],
      ["Zaxirada erkin", fmtQty(balance.available, ticket.unit)],
      ["Band qilingan", fmtQty(balance.reserved, ticket.unit)],
      ["Mijozga ketgan", fmtQty(balance.shipped, ticket.unit)],
      ["Jami summa", fmtMoney(ticket.total_amount)],
      ["To'lov muddati", fmt(ticket.due_date)],
      ["Qoldiq kun", fmt(dueDays)],
    ])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(
      !lot ? { title: "Ticketni oching -- mol zaxiraga tushadi", button: "Ticketni ochish", path: `/exchange-tickets/${ticket.id}` }
      : numberValue(balance.available) > 0 ? { title: "Zaxira buyurtmaga ajratishga tayyor", button: "Zaxirani ko'rish", path: `/stock/${lot.id}`, done: true }
      : { title: "Ticket bo'yicha mol to'liq ishlatilgan", button: "Zaxirani ko'rish", path: `/stock/${lot.id}`, done: true })}${workflowTabs("general", [["general", "Umumiy"], ["product", "Mahsulot"], ["stock", "Zaxira"], ["finance", "Moliya"], ["documents", "Hujjatlar"], ["history", "Tarix"]], "exchange-ticket-tab")}${section("Umumiy", detailList([["Ticket raqami", ticket.ticket_number], ["Ticket sanasi", ticket.ticket_date], ["Ta'minotchi", ticket.supplier_name], ["Status", optionLabel(exchangeTicketStatuses, ticket.status)], ["Izoh", ticket.notes]]), "general")}${section("Mahsulot", detailList([["Mahsulot", ticket.product_name], ["Miqdor", fmtQty(ticket.quantity, ticket.unit)], ["Birlik narxi", fmtMoney(ticket.unit_price)], ["Oraliq summa", fmtMoney(ticket.subtotal_amount)], ["QQS", fmtMoney(ticket.vat_amount)], ["Jami summa", fmtMoney(ticket.total_amount)]]), "product")}${section("Zaxira", lot ? detailList([["Zaxira partiyasi", lot.ticket_number], ["Joylashuv", lot.location_name], ["Manzil", lot.location_address], ["Zaxiraga tushgan", fmtQty(lot.quantity_initial, lot.unit)], ["Zaxirada erkin", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan", fmtQty(lot.quantity_reserved, lot.unit)], ["Status", optionLabel(stockStatuses, lot.stock_status)]]) + `<h3 class="section-subtitle">Qaysi buyurtmalarga ketgan</h3>` + stockAllocationsTable(allocations, lot.unit) : `<div class="empty">Zaxira partiyasi hali yaratilmagan.</div>`, "stock")}${section("Moliya", detailList([["To'lov turi", optionLabel(ticketPaymentTypes, ticket.payment_type)], ["To'lov muddati, kun", ticket.payment_term_days], ["To'lov muddati", ticket.due_date], ["Qoldiq kun", dueDays], ["Kreditor summa", fmtMoney(ticket.total_amount)]]) + (["opened", "partially_paid", "overdue"].includes(ticket.status) ? `<div class="form-hint"><span>Bu ticket Kreditorlik ro'yxatida turadi. Hisob-faktura yaratilgach qarzni hisob ko'rsatadi.</span></div>` : ""), "finance")}${section("Hujjatlar", `<div class="empty" id="documents">Ticket hujjatlari keyingi bosqichda ulanadi.</div>`, "documents")}${section("Tarix", workflowTimeline([["Yaratildi", fmtDate(ticket.created_at)], ["Status", optionLabel(exchangeTicketStatuses, ticket.status)], ["Yangilandi", fmtDate(ticket.updated_at)]]), "history")}</div>`;
  bindPanelTabs("exchange-ticket-tab");
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
    rows: data.items.map((lot) => `<tr><td><button class="ops-primary-link" data-nav="/stock/${lot.id}">${fmt(lot.product_name)}</button></td><td>${fmt(lot.supplier_name)}</td><td>${fmt(lot.location_name)}</td><td>${fmt(lot.ticket_number)}</td><td>${fmtQty(lot.quantity_initial, lot.unit)}</td><td>${fmtQty(lot.quantity_available, lot.unit)}</td><td>${fmtQty(lot.quantity_reserved, lot.unit)}</td><td class="ops-money">${fmtMoney(lot.unit_cost)}</td><td>${statusBadge(lot.stock_status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/stock/${lot.id}">Ko'rish</button>${canEdit("sotuv") ? `<button class="link-btn" data-nav="/orders/new?source_type=supplier_held_stock&stock_lot_id=${lot.id}">Buyurtmaga ajratish</button>` : ""}</div></td></tr>`).join(""),
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
  app.innerHTML = `<div class="page">${workflowHeader({ title: lot.product_name, subtitle: subtitleLine([{value:lot.supplier_name,raw:true},{value:lot.ticket_number,raw:true},{value:optionLabel(stockStatuses, lot.stock_status)}]), backPath: "/stock", actions: [{ label: "Buyurtmaga ajratish", path: `/orders/new?source_type=supplier_held_stock&stock_lot_id=${lot.id}`, primary: true }, { label: "Ticketni ochish", path: `/exchange-tickets/${lot.ticket_id}` }] })}${workflowStatusGrid([["Zaxira holati", statusBadge(lot.stock_status)], ["Mavjud miqdor", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan", fmtQty(lot.quantity_reserved, lot.unit)], ["To'lov muddati", fmt(lot.due_date)]])}${summaryCards([["Dastlabki miqdor", fmtQty(lot.quantity_initial, lot.unit)], ["Mavjud miqdor", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan miqdor", fmtQty(lot.quantity_reserved, lot.unit)], ["Birlik xarid narxi", fmtMoney(lot.unit_cost)], ["Mavjud qiymat", fmtMoney(stockValue(lot))]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(numberValue(lot.quantity_available) > 0 ? { title: "Zaxirani buyurtmaga ajratish mumkin", button: "Buyurtma yaratish", path: `/orders/new?source_type=supplier_held_stock&stock_lot_id=${lot.id}` } : { title: "Zaxira ishlatilgan", button: "Harakatlar tarixi", path: `/stock/${lot.id}`, done: true })}${section("Ticket va ta'minotchi", detailList([["Ticket", lot.ticket_number], ["Ta'minotchi", lot.supplier_name], ["Joylashuv", lot.location_name], ["Manzil", lot.location_address], ["To'lov muddati", lot.due_date]]))}${section("Miqdor xulosasi", detailList([["Dastlabki miqdor", fmtQty(lot.quantity_initial, lot.unit)], ["Mavjud miqdor", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan miqdor", fmtQty(lot.quantity_reserved, lot.unit)], ["Status", optionLabel(stockStatuses, lot.stock_status)]]))}${section("Qaysi buyurtmalarga ketgan", stockAllocationsTable(lot.allocations || [], lot.unit))}${section("Zaxira harakatlari", tableOrEmpty(lot.movements || [], ["Sana", "Turi", "Miqdor", "Izoh"], (movement) => `<tr><td>${fmtDate(movement.created_at)}</td><td>${fmt(optionLabel(stockMovementTypes, movement.movement_type))}</td><td>${fmtQty(movement.quantity, lot.unit)}</td><td>${fmt(movement.notes)}</td></tr>`, "Harakatlar yo'q."))}</div>`;
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
  const headerActions = [];
  if (editable) headerActions.push({label:"Birja ticketi",path:"/exchange-tickets/new",primary:true});
  headerActions.push({label:"Hujjat yuklash",path:`/suppliers/${s.id}#documents`});
  const nextAction = !s.contacts?.length?{title:"Kontakt qo'shing",...(editable?{button:"To'liq tahrirlash",path:`/suppliers/${s.id}/edit`}:{})}:!s.bank_accounts?.length?{title:"Bank rekvizitlarini qo'shing",...(editable?{button:"To'liq tahrirlash",path:`/suppliers/${s.id}/edit`}:{})}:!hasDocs(s)?{title:"Ta'minotchi hujjatini yuklang",button:"Hujjatlar",path:`/suppliers/${s.id}#documents`}:{title:"Ta'minotchi kartasi tayyor",button:"Bizning zaxira",path:"/stock",done:true};
  app.innerHTML = `<div class="page">${workflowHeader({title:s.name,subtitle:subtitleLine([{value:"STIR"},{value:s.inn,raw:true},{value:"Telefon"},{value:s.phone,raw:true}]),backPath:"/suppliers",fullEditPath:editable ? `/suppliers/${s.id}/edit` : "",actions:headerActions})}${workflowStatusGrid([["Kontaktlar",statusChip(s.contacts?.length?{label:`${s.contacts.length} ta`,tone:"success"}:{label:"Kutilmoqda",tone:"warning"})],["Manzillar",statusChip(s.addresses?.length?{label:`${s.addresses.length} ta`,tone:"success"}:{label:"Kutilmoqda",tone:"muted"})],["Bizning zaxira",statusChip(supplierStock.items.length?{label:`${supplierStock.items.length} partiya`,tone:"success"}:{label:"Yo'q",tone:"muted"})],["Hujjatlar",statusChip(hasDocs(s)?{label:"Yuklangan",tone:"success"}:{label:"Kutilmoqda",tone:"warning"})]])}${summaryCards([["Jami mahsulot miqdori", fmtQty(supplierStock.items.reduce((sum, lot) => sum + numberValue(lot.quantity_initial), 0))], ["Mavjud zaxira", fmtQty(supplierStock.items.reduce((sum, lot) => sum + numberValue(lot.quantity_available), 0))], ["Band qilingan zaxira", fmtQty(supplierStock.items.reduce((sum, lot) => sum + numberValue(lot.quantity_reserved), 0))], ["To'lov muddati yaqin", fmt(supplierStock.items.filter((lot) => { const d = daysUntil(lot.due_date); return typeof d === "number" && d <= 7; }).length)]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${workflowTabs("general",[["general","Umumiy"],["stock","Bizning zaxira"],["contacts","Kontaktlar"],["addresses","Manzillar"],["bank","Rekvizitlar"],["documents","Hujjatlar"],["history","Tarix"]],"supplier-tab")}${section("Umumiy ma'lumotlar", detailList([["Nomi",s.name],["STIR",s.inn],["OKED",s.oked],["Telefon",s.phone],["Email",s.email],["Izoh",s.notes],["Yaratilgan",fmtDate(s.created_at)],["Yangilangan",fmtDate(s.updated_at)]]),"general")}${section("Bizning zaxira", tableOrEmpty(supplierStock.items,["Mahsulot","Ticket","Dastlabki miqdor","Mavjud","Band qilingan","Birlik xarid narxi","To'lov muddati","Status"],(lot)=>`<tr><td><button class="link-btn" data-nav="/stock/${lot.id}">${fmt(lot.product_name)}</button></td><td>${fmt(lot.ticket_number)}</td><td>${fmtQty(lot.quantity_initial,lot.unit)}</td><td>${fmtQty(lot.quantity_available,lot.unit)}</td><td>${fmtQty(lot.quantity_reserved,lot.unit)}</td><td>${fmtMoney(lot.unit_cost)}</td><td>${fmt(lot.due_date)}</td><td>${statusBadge(lot.stock_status)}</td></tr>`,"Bu ta'minotchida kompaniya zaxirasi yo'q."),"stock")}${section("Kontaktlar", tableOrEmpty(s.contacts,["Ism","Lavozim","Telefon","Email","Asosiy"],(c)=>`<tr><td>${fmt(c.full_name)}</td><td>${fmt(c.position)}</td><td>${fmt(c.phone)}</td><td>${fmt(c.email)}</td><td>${c.is_primary ? '<span class="pill">Asosiy</span>' : dash}</td></tr>`,"Kontaktlar yo'q."),"contacts")}${section("Manzillar", tableOrEmpty(s.addresses,["Turi","Hudud","Tuman","Manzil"],(a)=>`<tr><td>${fmt(optionLabel(supplierAddressTypes,a.address_type))}</td><td>${fmt(a.region)}</td><td>${fmt(a.district)}</td><td>${fmt(a.address)}</td></tr>`,"Manzillar yo'q."),"addresses")}${section("Rekvizitlar", tableOrEmpty(s.bank_accounts,["Bank","MFO","Hisob raqami","Asosiy"],(b)=>`<tr><td>${fmt(b.bank_name)}</td><td>${fmt(b.mfo)}</td><td>${fmt(b.account_number)}</td><td>${b.is_primary ? '<span class="pill">Asosiy</span>' : dash}</td></tr>`,"Bank rekvizitlari yo'q."),"bank")}<div id="documents">${section("Hujjatlar", tableOrEmpty(s.documents,["Hujjat nomi","Turi","Yuklangan"],(d)=>`<tr><td>${fmt(d.title)}</td><td>${fmt(d.document_type)}</td><td>${fmtDate(d.uploaded_at)}</td></tr>`,"Hujjatlar yo'q."),"documents")}</div>${section("Tarix", tableOrEmpty(s.notes_history,["Sana","Foydalanuvchi","Izoh"],(n)=>`<tr><td>${fmtDate(n.created_at)}</td><td>${fmt(n.created_by)}</td><td>${fmt(n.note)}</td></tr>`,"Tarix yozuvlari yo'q."),"history")}</div>`;
  bindPanelTabs("supplier-tab");
}

async function fetchSuppliersOptions(selectedId = null) {
  const data = await api("/api/suppliers?page_size=100");
  return data.items.map((s)=>`<option value="${s.id}" ${Number(selectedId) === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
}

// --- Xaridlar ro'yxati -------------------------------------------------
// Filtrlar manzil qatorida yashaydi: havola hamkasbning aynan o'sha
// ko'rinishini qaytaradi, eksport esa ro'yxat bilan bir xil parametrlarni
// oladi -- shuning uchun fayl va ekran hech qachon farq qilmaydi.

const PROCUREMENT_FILTER_KEYS = ["search", "status", "client_id", "product", "date_from", "date_to", "amount_min", "amount_max"];

async function fetchSupplierInvoicesOptions(supplierId = null) {
  if (!supplierId) return "";
  const data = await api(`/api/supplier-invoices?page_size=100${supplierId ? `&supplier_id=${supplierId}` : ""}`);
  return data.items.filter((i)=>Number(i.remaining_amount) > 0).map((i)=>`<option value="${i.id}">${esc(i.invoice_number)} - ${fmtMoney(i.remaining_amount)}</option>`).join("");
}

function supplierFinanceItemRow(item = {}, index = 0) {
  return `<div class="item-row" data-supplier-finance-item-row>${textField(`description_${index}`,"Tavsif",item.description)}${textField(`product_name_${index}`,"Mahsulot",item.product_name)}${textField(`unit_${index}`,"Birlik",item.unit || "ton")}${textField(`quantity_${index}`,"Miqdor",item.quantity ?? 1,"number")}${textField(`unit_price_${index}`,"Birlik narxi",item.unit_price ?? "","number")}${textField(`vat_rate_${index}`,"QQS %",item.vat_rate ?? 12,"number")}<button type="button" class="btn danger" data-remove-supplier-finance-item>O'chirish</button></div>`;
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
  const params = new URLSearchParams(location.search);
  const orders = await fetchOrderOptions(invoice?.order_id || params.get("order_id"));
  const today = todayIso();
  const rows = invoice?.items?.length ? invoice.items : [{}];
  return `<div class="page"><div class="page-header"><div class="page-title"><h1>${invoice ? "Ta'minotchi hisob-fakturasini tahrirlash" : "Yangi ta'minotchi hisob-fakturasi"}</h1><p>Ta'minotchi tomonidagi hisob-faktura: elementlar qo'lda kiritiladi, to'lovlar taqsimlanadi.</p></div><div class="actions"><button class="btn" data-nav="${invoice ? `/supplier-invoices/${invoice.id}` : "/supplier-invoices"}">Orqaga</button></div></div><form id="supplier-invoice-form"><input type="hidden" name="ticket_id" value="${esc(invoice?.ticket_id || params.get("ticket_id") || "")}" /><input type="hidden" name="delivery_batch_id" value="${esc(invoice?.delivery_batch_id || "")}" /><input type="hidden" name="logistics_id" value="${esc(invoice?.logistics_id || "")}" />${section("Asosiy ma'lumotlar", `<div class="grid"><label><span class="field-label-text">Ta'minotchi</span><select name="supplier_id"><option value="">Ta'minotchini tanlang</option>${suppliers}</select></label><label><span class="field-label-text">Buyurtma</span><select name="order_id"><option value="">Buyurtmani tanlang</option>${orders}</select></label>${textField("invoice_number","Hisob-faktura raqami",invoice?.invoice_number,"text",{ maxlength: 60 })}${textField("invoice_date","Hisob-faktura sanasi",invoice?.invoice_date || today,"date")}${textField("due_date","To'lov muddati",invoice?.due_date || today,"date")}${selectField("invoice_type","Turi",supplierInvoiceTypes,invoice?.invoice_type || "product_purchase")}${selectField("status","Status",supplierInvoiceStatuses,invoice?.status || "received")}${textArea("notes","Izohlar",invoice?.notes,{ maxlength: 2000 })}</div>`)}${section("Hisob-faktura elementlari", `<div id="supplier-finance-items">${rows.map(supplierFinanceItemRow).join("")}</div><button type="button" class="btn" id="add-supplier-finance-item">Element qo'shish</button><div class="totals-bar"><div class="total-box"><span>Subtotal</span><strong data-supplier-subtotal>${dash}</strong></div><div class="total-box"><span>QQS</span><strong data-supplier-vat>${dash}</strong></div><div class="total-box"><span>Jami</span><strong data-supplier-total>${dash}</strong></div></div>`)}${section("Documents", `<div class="empty">Hujjatlarni keyinroq, hisob-faktura kartochkasidan qo'shish mumkin.</div>`)}<div class="form-footer"><button type="button" class="btn" data-nav="${invoice ? `/supplier-invoices/${invoice.id}` : "/supplier-invoices"}">Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div></form></div>`;
}

function bindSupplierInvoiceForm(invoice = null) {
  const form = document.querySelector("#supplier-invoice-form");
  // Ticket kartochkasidan kelganda ta'minotchi oldindan tanlangan bo'ladi.
  const presetSupplier = new URLSearchParams(location.search).get("supplier_id");
  if (presetSupplier && form && !form.elements.supplier_id.value) form.elements.supplier_id.value = presetSupplier;
  // Ta'minotchi almashtirilsa buyurtma ro'yxati o'zgarmaydi: bitta
  // buyurtmaning moli har xil ta'minotchidan kelishi mumkin.
  form.addEventListener("input",()=>calculateSupplierFinanceForm(form));
  document.querySelector("#add-supplier-finance-item").addEventListener("click",()=>{
    const index = form.querySelectorAll("[data-supplier-finance-item-row]").length;
    document.querySelector("#supplier-finance-items").insertAdjacentHTML("beforeend", supplierFinanceItemRow({}, index));
    calculateSupplierFinanceForm(form);
  });
  form.addEventListener("click",(event)=>{
    if (!event.target.matches("[data-remove-supplier-finance-item]")) return;
    if (form.querySelectorAll("[data-supplier-finance-item-row]").length <= 1) return showToast("Hisob-fakturada kamida bitta element bo'lishi kerak.", true);
    event.target.closest("[data-supplier-finance-item-row]").remove();
    calculateSupplierFinanceForm(form);
  });
  form.addEventListener("submit", async (event)=>{
    event.preventDefault();
    const payload = { supplier_id: Number(field(form,"supplier_id")), order_id: field(form,"order_id") ? Number(field(form,"order_id")) : null, ticket_id: field(form,"ticket_id") ? Number(field(form,"ticket_id")) : null, delivery_batch_id: field(form,"delivery_batch_id") ? Number(field(form,"delivery_batch_id")) : null, logistics_id: field(form,"logistics_id") ? Number(field(form,"logistics_id")) : null, invoice_number: field(form,"invoice_number"), invoice_date: field(form,"invoice_date"), due_date: field(form,"due_date"), invoice_type: field(form,"invoice_type"), status: field(form,"status"), currency: "UZS", notes: field(form,"notes"), items: collectSupplierFinanceItems(form) };
    try {
      const saved = await api(invoice ? `/api/supplier-invoices/${invoice.id}` : "/api/supplier-invoices", { method: invoice ? "PATCH" : "POST", body: JSON.stringify(payload) });
      showToast("Ta'minotchi hisob-fakturasi saqlandi.");
      navigate(`/supplier-invoices/${saved.id}`);
    } catch (error) { showToast(error.message, true); }
  });
  calculateSupplierFinanceForm(form);
}

async function renderSupplierInvoicesList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/supplier-invoices?${params.toString()}`);
  const editable = canEdit("moliya");
  app.innerHTML = opsListPage({className:"supplier-invoices-ops-page",title:"Ta'minotchi hisoblari",tabs:[{label:"Hisoblar",active:true},{label:"To'lovlar",path:"/supplier-payments"},{label:"Kreditorlik",path:"/payables"}],createPath:editable ? "/supplier-invoices/new" : undefined,clearPath:"/supplier-invoices",counter:`${fmt(data.total)} ta hisob`,formId:"supplier-invoice-search-form",filters:`<input name="search" placeholder="Hisob, ta'minotchi, buyurtma, partiya" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${supplierInvoiceStatuses.map(([k,l])=>`<option value="${k}" ${params.get("status")===k?"selected":""}>${l}</option>`).join("")}</select>`,headers:["Hisob raqami","Hisob sanasi","To'lov muddati","Ta'minotchi","Buyurtma","Partiya","Turi","Jami","To'langan","Qoldiq","Status",""],rows:data.items.map((i)=>`<tr><td><button class="ops-primary-link" data-nav="/supplier-invoices/${i.id}">${fmt(i.invoice_number)}</button></td><td>${fmt(i.invoice_date)}</td><td>${fmt(i.due_date)}</td><td>${fmt(i.supplier?.name)}</td><td>${i.order ? `<button class="link-btn" data-nav="/orders/${i.order.id}">${fmt(i.order.order_number)}</button>` : (i.ticket ? `<button class="link-btn" data-nav="/exchange-tickets/${i.ticket.id}">${fmt(i.ticket.ticket_number)}</button>` : dash)}</td><td>${fmt(i.delivery_batch?.batch_number)}</td><td>${fmt(optionLabel(supplierInvoiceTypes,i.invoice_type))}</td><td class="ops-money">${fmtMoney(i.total_amount)}</td><td class="ops-money">${fmtMoney(i.paid_amount)}</td><td class="ops-money ${numberValue(i.remaining_amount)>0?"ops-warning":""}">${fmtMoney(i.remaining_amount)}</td><td>${statusBadge(i.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/supplier-invoices/${i.id}">Ochish</button>${editable ? `<button class="link-btn" data-nav="/supplier-invoices/${i.id}/edit">Tahrirlash</button><button class="link-btn" data-nav="/supplier-payments/new">To'lov</button>` : ""}</div></td></tr>`).join(""),emptyText:"Ta'minotchi hisoblari topilmadi.",colspan:12,footer:opsFooter(data,"supplierinvoice")});
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
  if (!i.order && !i.ticket && !i.delivery_batch) warnings.push("Hisob buyurtma, ticket yoki partiya bilan bog'lanmagan.");
  if (!hasDocs(i)) warnings.push("Ta'minotchi hisobi fayli yuklanmagan.");
  const headerActions = [];
  if (editable) headerActions.push({label:"To'lov kiritish",path:"/supplier-payments/new",primary:true});
  headerActions.push({label:"Hujjat yuklash",path:`/supplier-invoices/${i.id}#documents`});
  const nextAction = numberValue(i.remaining_amount)>0
    ? { title: "Ta'minotchiga to'lov kiriting", ...(editable ? { button: "To'lov kiritish", path: "/supplier-payments/new" } : {}) }
    : { title: "Hisob to'liq yopilgan", button: "Tarix", path: `/supplier-invoices/${i.id}#history`, done: true };
  app.innerHTML = `<div class="page">${workflowHeader({title:i.invoice_number,subtitle:subtitleLine([{value:i.supplier?.name,raw:true},{value:optionLabel(supplierInvoiceTypes,i.invoice_type)},{value:optionLabel(supplierInvoiceStatuses,i.status)}]),backPath:"/supplier-invoices",fullEditPath:editable ? `/supplier-invoices/${i.id}/edit` : "",actions:headerActions})}${workflowStatusGrid([["Hisob holati",statusBadge(i.status)],["To'lov holati",statusChip(payState)],["Bog'lanishi",statusChip((i.order||i.ticket||i.delivery_batch||i.logistics)?{label:"Bog'langan",tone:"success"}:{label:"Bog'lanmagan",tone:"warning"})],["Hujjat holati",statusChip(hasDocs(i)?{label:"Yuklangan",tone:"success"}:{label:"Kutilmoqda",tone:"warning"})]])}${summaryCards([["Sof summa",fmtMoney(i.subtotal_amount)],["QQS",fmtMoney(i.vat_amount)],["Jami",fmtMoney(i.total_amount)],["To'langan",fmtMoney(i.paid_amount)],["Qoldiq",fmtMoney(i.remaining_amount)],["To'lov muddati",fmt(i.due_date)]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${section("Umumiy ma'lumotlar", detailList([["Hisob raqami",i.invoice_number],["Hisob sanasi",i.invoice_date],["To'lov muddati",i.due_date],["Turi",optionLabel(supplierInvoiceTypes,i.invoice_type)],["Status",optionLabel(supplierInvoiceStatuses,i.status)],["Ta'minotchi",i.supplier?.name],["Buyurtma",i.order?.order_number],["Birja ticketi",i.ticket?.ticket_number],["Partiya",i.delivery_batch?.batch_number],["Logistika",i.logistics?.logistics_number],["Valyuta",i.currency],["Izoh",i.notes],["Yaratilgan",fmtDate(i.created_at)],["Yangilangan",fmtDate(i.updated_at)]]))}${section("Hisob elementlari", tableOrEmpty(i.items,["Tavsif","Mahsulot","Birlik","Miqdor","Birlik narxi","QQS","Jami"],(it)=>`<tr><td>${fmt(it.description)}</td><td>${fmt(it.product_name)}</td><td>${fmt(it.unit)}</td><td>${fmtQty(it.quantity)}</td><td>${fmtMoney(it.unit_price)}</td><td>${fmtMoney(it.vat_amount)}</td><td>${fmtMoney(it.total_with_vat)}</td></tr>`,"Hisob elementlari yo'q."))}${section("To'lovlar / Taqsimlash", tableOrEmpty(i.allocations,["To'lov","Taqsimlangan","Yaratgan","Yaratilgan"],(a)=>`<tr><td>${fmt(a.supplier_payment?.payment_number || a.payment_number || "Ta'minotchi to'lovi")}</td><td>${fmtMoney(a.allocated_amount)}</td><td>${fmt(a.created_by)}</td><td>${fmtDate(a.created_at)}</td></tr>`,"Taqsimlash yozuvlari yo'q."))}<div id="documents">${section("Hujjatlar", tableOrEmpty(i.documents,["Hujjat nomi","Turi","Yuklangan"],(d)=>`<tr><td>${fmt(d.title)}</td><td>${fmt(optionLabel(supplierFinanceDocumentTypes,d.document_type))}</td><td>${fmtDate(d.uploaded_at)}</td></tr>`,"Hujjatlar yo'q."))}</div><div id="history">${section("Tarix", tableOrEmpty(i.notes_history,["Sana","Foydalanuvchi","Izoh"],(n)=>`<tr><td>${fmtDate(n.created_at)}</td><td>${fmt(n.created_by)}</td><td>${fmt(n.note)}</td></tr>`,"Tarix yozuvlari yo'q."))}</div></div>`;
}

async function supplierPaymentForm(payment = null) {
  const suppliers = await fetchSuppliersOptions(payment?.supplier_id);
  const invoiceOptions = await fetchSupplierInvoicesOptions(payment?.supplier_id);
  const today = todayIso();
  return `<div class="page"><div class="page-header"><div class="page-title"><h1>${payment ? "Ta'minotchi to'lovini tahrirlash" : "Yangi ta'minotchi to'lovi"}</h1><p>Ta'minotchi to'lovi: xohishga ko'ra hisob-fakturaga qo'lda taqsimlanadi.</p></div><div class="actions"><button class="btn" data-nav="${payment ? `/supplier-payments/${payment.id}` : "/supplier-payments"}">Orqaga</button></div></div><form id="supplier-payment-form">${section("Asosiy ma'lumotlar", `<div class="grid"><label><span class="field-label-text">Ta'minotchi</span><select name="supplier_id"><option value="">Ta'minotchini tanlang</option>${suppliers}</select></label>${textField("payment_number","To'lov raqami",payment?.payment_number,"text",{ maxlength: 60, placeholder: "Bo'sh qoldirilsa avtomatik beriladi" })}${textField("payment_date","To'lov sanasi",payment?.payment_date || today,"date")}${textField("amount","Summa",payment?.amount || "","number")}${selectField("payment_method","To'lov usuli",paymentMethods,payment?.payment_method || "bank_transfer")}${textField("bank_account","Bank hisob raqami",payment?.bank_account,"text",CLIENT_FIELD_RULES.account_number)}${textField("reference_number","Havola raqami",payment?.reference_number,"text",{ maxlength: 60 })}${textArea("notes","Izohlar",payment?.notes,{ maxlength: 2000 })}</div>`)}${section("Qo'lda taqsimlash", `<div class="grid"><label><span class="field-label-text">Ochiq hisob-faktura</span><select name="allocation_invoice_id"><option value="">Taqsimlanmasin</option>${invoiceOptions}</select></label>${textField("allocated_amount","Taqsimlanadigan summa","","number")}</div><div class="empty">Bir nechta hisob-fakturaga taqsimlash kerak bo'lsa, avval to'lovni saqlang va uning kartochkasidan qo'shing.</div>`)}${section("Hujjatlar", `<div class="empty">To'lov hujjatlarini keyinroq, to'lov kartochkasidan qo'shish mumkin.</div>`)}<div class="form-footer"><button class="btn" type="button" data-nav="${payment ? `/supplier-payments/${payment.id}` : "/supplier-payments"}">Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div></form></div>`;
}

function bindSupplierPaymentForm(payment = null) {
  const form = document.querySelector("#supplier-payment-form");
  form.elements.supplier_id.addEventListener("change", async () => {
    form.elements.allocation_invoice_id.innerHTML = `<option value="">Taqsimlanmasin</option>${await fetchSupplierInvoicesOptions(form.elements.supplier_id.value)}`;
  });
  form.addEventListener("submit", async (event)=>{
    event.preventDefault();
    const allocations = field(form,"allocation_invoice_id") && field(form,"allocated_amount") ? [{ supplier_invoice_id: Number(field(form,"allocation_invoice_id")), allocated_amount: field(form,"allocated_amount") }] : [];
    const payload = { supplier_id: Number(field(form,"supplier_id")), payment_number: field(form,"payment_number") || undefined, payment_date: field(form,"payment_date"), amount: field(form,"amount"), currency: "UZS", payment_method: field(form,"payment_method"), bank_account: field(form,"bank_account"), reference_number: field(form,"reference_number"), notes: field(form,"notes"), allocations };
    try {
      const saved = await api(payment ? `/api/supplier-payments/${payment.id}` : "/api/supplier-payments", { method: payment ? "PATCH" : "POST", body: JSON.stringify(payload) });
      showToast("Ta'minotchi to'lovi saqlandi.");
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
  app.innerHTML = `<div class="page">${workflowHeader({title:p.payment_number,subtitle:subtitleLine([{value:p.supplier?.name,raw:true},{value:fmtMoney(p.amount),raw:true},{value:optionLabel(supplierPaymentStatuses,p.status)}]),backPath:"/supplier-payments",fullEditPath:editable ? `/supplier-payments/${p.id}/edit` : "",actions:headerActions})}${workflowStatusGrid([["To'lov holati",statusBadge(p.status)],["Taqsimlangan summa",fmtMoney(p.summary?.allocated_amount)],["Taqsimlanmagan summa",fmtMoney(p.summary?.unallocated_amount)],["Hujjat holati",statusChip(hasDocs(p)?{label:"Yuklangan",tone:"success"}:{label:"Kutilmoqda",tone:"warning"})]])}${summaryCards([["To'lov summasi",fmtMoney(p.summary?.amount)],["Taqsimlangan",fmtMoney(p.summary?.allocated_amount)],["Taqsimlanmagan",fmtMoney(p.summary?.unallocated_amount)],["To'lov sanasi",fmt(p.payment_date)],["Usul",fmt(optionLabel(paymentMethods,p.payment_method))],["Status",fmt(optionLabel(supplierPaymentStatuses,p.status))]])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(nextAction)}${section("Umumiy ma'lumotlar", detailList([["To'lov raqami",p.payment_number],["To'lov sanasi",p.payment_date],["Ta'minotchi",p.supplier?.name],["Summa",fmtMoney(p.amount)],["Valyuta",p.currency],["Usul",optionLabel(paymentMethods,p.payment_method)],["Bank hisob raqami",p.bank_account],["Havola",p.reference_number],["Status",optionLabel(supplierPaymentStatuses,p.status)],["Izoh",p.notes],["Yaratilgan",fmtDate(p.created_at)],["Yangilangan",fmtDate(p.updated_at)]]))}${section("Taqsimlash", tableOrEmpty(p.allocations,["Hisob","Taqsimlangan","Yaratilgan"],(a)=>`<tr><td>${fmt(a.supplier_invoice?.invoice_number || a.invoice_number || "Ta'minotchi hisobi")}</td><td>${fmtMoney(a.allocated_amount)}</td><td>${fmtDate(a.created_at)}</td></tr>`,"Taqsimlash yozuvlari yo'q."))}<div id="documents">${section("Hujjatlar", tableOrEmpty(p.documents,["Hujjat nomi","Turi","Yuklangan"],(d)=>`<tr><td>${fmt(d.title)}</td><td>${fmt(optionLabel(supplierFinanceDocumentTypes,d.document_type))}</td><td>${fmtDate(d.uploaded_at)}</td></tr>`,"Hujjatlar yo'q."))}</div><div id="history">${section("Tarix", tableOrEmpty(p.notes_history,["Sana","Foydalanuvchi","Izoh"],(n)=>`<tr><td>${fmtDate(n.created_at)}</td><td>${fmt(n.created_by)}</td><td>${fmt(n.note)}</td></tr>`,"Tarix yozuvlari yo'q."))}</div></div>`;
}
