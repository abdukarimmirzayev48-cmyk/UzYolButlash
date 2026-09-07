// Ta'minot bo'limining umumiy ko'rinishi. Ticket -- pul majburiyati, zaxira
// -- o'sha pulga olingan mol; ikkalasi bir ekranda turmaguncha «qaysi
// mahsulotdan qancha qoldi va qaysi to'lov qachon» degan savolga javob yig'ish
// uchun ikkita ro'yxatni qo'lda solishtirish kerak edi.
const SUPPLY_FILTER_KEYS = ["product", "supplier_id", "status", "due_from", "due_to"];

function supplyToolbar(params, options) {
  const opt = (value, label, selected) => `<option value="${esc(value)}" ${selected ? "selected" : ""}>${label}</option>`;
  return `<div class="overview-toolbar">
    <div class="overview-toolbar-actions">
      <button class="btn primary" type="button" data-nav="/exchange-tickets/new">${overviewIcon("plus", 16)}<span>Yangi ticket</span></button>
      <button class="btn" type="button" data-nav="/stock">${overviewIcon("box", 16)}<span>Zaxira</span></button>
    </div>
    <form class="overview-toolbar-filters" id="supply-filter-form">
      <select name="product">
        ${opt("", "Barcha mahsulotlar", !params.get("product"))}
        ${options.products.map((name) => opt(name, esc(name), params.get("product") === name)).join("")}
      </select>
      <select name="supplier_id">
        ${opt("", "Barcha ta'minotchilar", !params.get("supplier_id"))}
        ${options.suppliers.map((s) => opt(s.id, esc(s.name), params.get("supplier_id") === String(s.id))).join("")}
      </select>
      <select name="status">
        ${opt("", "Barcha holatlar", !params.get("status"))}
        ${options.statuses.map((s) => opt(s.key, s.label, params.get("status") === s.key)).join("")}
      </select>
      <input type="date" name="due_from" value="${esc(params.get("due_from") || "")}" title="To'lov muddati: dan" />
      <span class="overview-date-sep" data-noloc>–</span>
      <input type="date" name="due_to" value="${esc(params.get("due_to") || "")}" title="To'lov muddati: gacha" />
      <button class="ops-tool-btn" type="submit">${overviewIcon("filter", 14)}<span>Qo'llash</span></button>
      <button class="ops-tool-btn" type="button" data-nav="/supply">Tozalash</button>
    </form>
  </div>`;
}

function supplyHeadline(n) {
  const cards = [
    ["wallet", "Ochiq majburiyat", fmtMoney(n.obligation), `${fmt(n.tickets_open)} ta ochiq ticket`, "/payables"],
    ["alert", "Muddati o'tgan", fmtMoney(n.overdue_amount), `${fmt(n.overdue_count)} ta ticket`, "/exchange-tickets?overdue_only=true"],
    ["hourglass", "7 kun ichida to'lanadi", fmtMoney(n.due_soon_amount), `${fmt(n.due_soon_count)} ta ticket`, ""],
    ["box", "Zaxirada erkin", fmtQty(n.stock_available, "t"), "Sotishga tayyor", "/stock?available_only=true"],
    ["droplet", "Zaxira qiymati", fmtMoney(n.stock_value), "Erkin molning tannarxi", "/stock"],
  ];
  return `<div class="headline-cards">${cards.map(([icon, label, value, note, path]) => `
    <div class="headline-card" ${path ? `data-nav="${path}"` : ""}>
      <span class="headline-icon">${overviewIcon(icon, 20)}</span>
      <span class="headline-copy">
        <span class="headline-label">${label}</span>
        <strong>${value}</strong>
        <span class="headline-note">${note}</span>
      </span>
    </div>`).join("")}</div>`;
}

// Mol qayerda turibdi: olinganidan qanchasi hali erkin, qanchasi buyurtmaga
// band qilingan, qanchasi mijozga ketgan.
function supplyStockFlow(n) {
  const total = numberValue(n.stock_initial) || 1;
  const parts = [
    ["free", "Erkin", numberValue(n.stock_available)],
    ["reserved", "Band qilingan", numberValue(n.stock_reserved)],
    ["shipped", "Mijozga ketgan", numberValue(n.stock_shipped)],
  ];
  return `<div class="flow-block">
    <div class="flow-bar">${parts.map(([key, , value]) => value > 0
      ? `<span class="flow-part flow-${key}" style="width:${(value / total * 100).toFixed(2)}%"></span>` : "").join("")}</div>
    <div class="flow-legend">${parts.map(([key, label, value]) => `
      <span class="flow-legend-item"><i class="flow-dot flow-${key}"></i><span>${label}</span><b data-noloc>${fmtQty(value, "t")}</b></span>`).join("")}</div>
    <p class="helper-text"><span>Ticketlar bo'yicha zaxiraga tushgan jami:</span> <b data-noloc>${fmtQty(n.stock_initial, "t")}</b></p>
  </div>`;
}

// Yorliqlar backenddan emas, shu yerdan olinadi: lug'at faqat frontend
// matnlarini yig'adi, backend qatori esa tarjimasiz o'tib ketardi.
const SUPPLY_DUE_LABELS = {
  overdue: "Muddati o'tgan",
  week: "7 kun ichida",
  month: "8-30 kun ichida",
  quarter: "31-90 kun ichida",
  later: "90 kundan keyin",
};

// To'lov muddati bo'yicha taqsimot: qaysi pul qachon kerakligi.
function supplyDueChart(buckets) {
  const peak = Math.max(1, ...buckets.map((b) => numberValue(b.amount)));
  return `<div class="due-chart">${buckets.map((b) => {
    const value = numberValue(b.amount);
    const height = value > 0 ? Math.max(6, (value / peak) * 100) : 0;
    return `<div class="due-col ${b.key === "overdue" ? "is-overdue" : ""}">
      <span class="due-value" data-noloc>${value > 0 ? fmtMoney(value) : ""}</span>
      <span class="due-bar" style="height:${height}%"></span>
      <span class="due-label">${SUPPLY_DUE_LABELS[b.key] || b.label}</span>
      <span class="due-count"><span data-noloc>${fmt(b.count)}</span> <span>ta</span></span>
    </div>`;
  }).join("")}</div>`;
}

function supplyStatusRing(mix) {
  const size = 148;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = mix.items.map((item) => {
    const length = (item.count / (mix.total || 1)) * circumference;
    const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="ring-arc ticket-${item.key}"
      stroke-width="${stroke}" fill="none"
      stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" />`;
    offset += length;
    return arc;
  }).join("");
  return `<div class="ring-block">
    <div class="ring-chart">
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Ticketlar holati">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="ring-track" stroke-width="${stroke}" fill="none" />
        ${arcs}
      </svg>
      <div class="ring-center"><span>Ticketlar</span><strong data-noloc>${fmt(mix.total)}</strong></div>
    </div>
    <ul class="ring-legend">${mix.items.map((item) => `
      <li><i class="ring-dot ticket-${item.key}"></i><span>${item.label}</span><b data-noloc>${fmt(item.count)}</b></li>`).join("") || `<li><span>Ticketlar yo'q</span></li>`}</ul>
  </div>`;
}

// Mahsulot kesimi -- eng ko'p so'raladigan qirqim: qaysi maxsulotdan qancha
// mol bor va u qanchaga tushgan.
function supplyProductTable(rows) {
  const peak = Math.max(1, ...rows.map((r) => numberValue(r.available)));
  return tableOrEmpty(rows, ["Mahsulot", "Zaxirada erkin", "Band", "Mijozga ketgan", "Erkin qiymati", "Ochiq majburiyat", "Ticketlar"], (r) => `
    <tr>
      <td>${fmt(r.product)}</td>
      <td>
        <div class="mini-bar"><span style="width:${(numberValue(r.available) / peak * 100).toFixed(1)}%"></span></div>
        <span data-noloc>${fmtQty(r.available, r.unit)}</span>
      </td>
      <td>${fmtQty(r.reserved, r.unit)}</td>
      <td>${fmtQty(r.shipped, r.unit)}</td>
      <td class="ops-money">${fmtMoney(r.value)}</td>
      <td class="ops-money">${fmtMoney(r.obligation)}</td>
      <td data-noloc>${fmt(r.tickets)}</td>
    </tr>`, "Mahsulotlar bo'yicha ma'lumot yo'q.");
}

function supplyUpcomingTable(rows) {
  return tableOrEmpty(rows, ["Ticket", "Ta'minotchi", "Mahsulot", "To'lov muddati", "Qolgan kun", "Summa", "Status"], (r) => `
    <tr>
      <td><button class="ops-primary-link" data-nav="/exchange-tickets/${r.ticket_id}">${fmt(r.ticket_number)}</button></td>
      <td>${fmt(r.supplier_name)}</td>
      <td>${fmt(r.product_name)}</td>
      <td data-noloc>${fmt(r.due_date)}</td>
      <td class="${r.days < 0 ? "negative" : ""}" data-noloc>${fmt(r.days)}</td>
      <td class="ops-money">${fmtMoney(r.amount)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`, "Yaqin to'lov muddati yo'q.");
}

async function renderSupplyOverview() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const query = new URLSearchParams();
  SUPPLY_FILTER_KEYS.forEach((key) => { if (params.get(key)) query.set(key, params.get(key)); });
  const data = await api(`/api/supply/overview?${query.toString()}`);
  const n = data.now;

  app.innerHTML = `
    <div class="page ops-page module-overview">
      <div class="overview-head">
        <h1>Ta'minot</h1>
        <p>Birja ticketlari va zaxira bitta oynada: qancha qarz, qancha mol, qaysi to'lov qachon</p>
      </div>

      ${supplyToolbar(params, data.filter_options)}
      ${supplyHeadline(n)}

      <div class="panel-grid two">
        ${section("To'lov muddati bo'yicha", supplyDueChart(data.due_buckets))}
        ${section("Ticketlar holati", supplyStatusRing(data.status_mix))}
      </div>

      ${section("Zaxira harakati", supplyStockFlow(n))}

      ${overviewCardWithLink("Mahsulot kesimida", supplyProductTable(data.by_product), "/stock")}

      <div class="panel-grid two">
        ${overviewCardWithLink("Yaqin to'lovlar", supplyUpcomingTable(data.upcoming), "/payables")}
        ${overviewCardWithLink("Ta'minotchilar kesimida", tableOrEmpty(data.by_supplier.slice(0, 6), ["Ta'minotchi", "Ochiq majburiyat", "Zaxirada erkin", "Ticketlar"], (r) => `
          <tr>
            <td><button class="link-btn" data-nav="/suppliers/${r.supplier_id}">${fmt(r.name)}</button></td>
            <td class="ops-money">${fmtMoney(r.obligation)}</td>
            <td>${fmtQty(r.available, "t")}</td>
            <td data-noloc>${fmt(r.tickets)}</td>
          </tr>`, "Ta'minotchilar bo'yicha ma'lumot yo'q."), "/suppliers")}
      </div>
    </div>
  `;

  bindOpsSearch("supply-filter-form", "/supply", SUPPLY_FILTER_KEYS);
}

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

const TICKET_FILTER_KEYS = ["search", "status", "supplier_id", "product_name", "due_from", "due_to", "overdue_only"];

async function renderExchangeTicketsList() {
  const params = new URLSearchParams(location.search);
  const [data, options] = await Promise.all([
    api(`/api/exchange-tickets?${params.toString()}`),
    api("/api/stock-lots/options"),
  ]);
  const selectOptions = (list, selected, labeller = (x) => x) => list.map((item) => {
    const [key, label] = Array.isArray(item) ? item : [item.id ?? item, labeller(item)];
    return `<option value="${esc(key)}" ${String(selected) === String(key) ? "selected" : ""}>${esc(label)}</option>`;
  }).join("");
  const open = data.items.filter((t) => ["opened", "partially_paid", "overdue"].includes(t.status));
  const obligation = open.reduce((sum, t) => sum + numberValue(t.total_amount), 0);

  app.innerHTML = opsListPage({
    className: "exchange-ticket-ops-page",
    title: "Birja ticketlari",
    tabs: [
      { label: "Umumiy ko'rinish", path: "/supply" },
      { label: "Birja ticketlari", active: true },
      { label: "Zaxira", path: "/stock" },
    ],
    createPath: canEdit("taminot") ? "/exchange-tickets/new" : undefined,
    createLabel: "Ticket yaratish",
    clearPath: "/exchange-tickets",
    counter: `${fmt(data.total)} ta ticket · ${fmt(open.length)} ta ochiq · ${fmtMoney(obligation)} majburiyat`,
    formId: "exchange-ticket-search-form",
    filters: [
      opsFilterField("Qidirish", `<input name="search" placeholder="Ticket, ta'minotchi, mahsulot" value="${esc(params.get("search") || "")}" />`),
      opsFilterField("Status", `<select name="status"><option value="">Barcha holatlar</option>${selectOptions(exchangeTicketStatuses, params.get("status"))}</select>`),
      opsFilterField("Ta'minotchi", `<select name="supplier_id"><option value="">Barcha ta'minotchilar</option>${selectOptions(options.suppliers, params.get("supplier_id"), (x) => x.name)}</select>`),
      opsFilterField("Mahsulot", `<select name="product_name"><option value="">Barcha mahsulotlar</option>${selectOptions(options.products, params.get("product_name"))}</select>`),
      opsFilterField("To'lov muddati: dan", `<input type="date" name="due_from" value="${esc(params.get("due_from") || "")}" />`),
      opsFilterField("To'lov muddati: gacha", `<input type="date" name="due_to" value="${esc(params.get("due_to") || "")}" />`),
      opsFilterField("Qo'shimcha", `<label class="inline-check"><input type="checkbox" name="overdue_only" value="true" ${params.get("overdue_only") === "true" ? "checked" : ""} /> Faqat muddati o'tganlari</label>`),
    ].join(""),
    headers: ["Ticket №", "Sana", "Ta'minotchi", "Mahsulot", "Ticket miqdori", "Band qilingan", "Zaxirada erkin", "Jami summa", "To'lov muddati", "Qoldiq kun", "Status", ""],
    rows: data.items.map((ticket) => `<tr><td><button class="ops-primary-link" data-nav="/exchange-tickets/${ticket.id}">${fmt(ticket.ticket_number)}</button></td><td>${fmt(ticket.ticket_date)}</td><td>${fmt(ticket.supplier_name)}</td><td>${fmt(ticket.product_name)}</td><td>${fmtQty(ticket.quantity, ticket.unit)}</td><td>${fmtQty(ticket.balance?.reserved, ticket.unit)}</td><td>${fmtQty(ticket.balance?.available, ticket.unit)}</td><td class="ops-money">${fmtMoney(ticket.total_amount)}</td><td>${fmt(ticket.due_date)}</td><td class="${daysUntil(ticket.due_date) < 0 ? "negative" : ""}">${fmt(daysUntil(ticket.due_date))}</td><td>${statusBadge(ticket.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/exchange-tickets/${ticket.id}">Ochish</button>${ticket.stock_lot ? `<button class="link-btn" data-nav="/stock/${ticket.stock_lot.id}">Zaxira</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Birja ticketlari topilmadi.",
    colspan: 12,
    footer: opsFooter(data, "exchange-ticket"),
  });
  bindOpsSearch("exchange-ticket-search-form", "/exchange-tickets", TICKET_FILTER_KEYS);
  bindOpsPagination("exchange-ticket", "/exchange-tickets");
}

// Shartnomadagi bilan bir xil qoida: bazaga doim QQSsiz narx yoziladi.
// Bozorda narx ko'pincha «QQS bilan» aytiladi, shuning uchun kiritilgan
// raqamdan soliq ajratib olinadi -- aks holda summa QQS ustiga QQS bo'lardi.
function ticketNetUnitPrice(form) {
  const price = numberValue(field(form, "unit_price"));
  const rate = numberValue(field(form, "vat_rate") || 12);
  const withVat = form.elements.price_includes_vat?.checked;
  if (!withVat || rate <= 0) return price;
  return price / (1 + rate / 100);
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
    unit_price: String(ticketNetUnitPrice(form) || 0),
    vat_rate: field(form, "vat_rate") || "12",
    payment_type: field(form, "payment_type") || "forward",
    payment_term_days: Number(field(form, "payment_term_days") || 90),
    notes: field(form, "notes"),
    // Kim yaratgani profildan olinadi: qo'lda yozilganda har xil ism
    // tushardi va yozuvni kimga bog'lash noaniq bo'lardi.
    created_by: currentUser?.full_name || currentUser?.username || null,
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

// Birlik qo'lda yozilardi va bitta mahsulot «t», «tn», «tonna» bo'lib uch
// xil yozilishi mumkin edi. Ro'yxat mahsulotlar ma'lumotnomasidagi
// qiymatlardan yig'iladi -- ya'ni bazada bori.
function ticketUnitOptions(products, selected) {
  const units = [...new Set((products || []).map((item) => item.unit).filter(Boolean))].sort();
  if (!units.length) units.push("tonna");
  return units.map((unit) => `<option value="${esc(unit)}" ${unit === selected ? "selected" : ""}>${esc(unit)}</option>`).join("");
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
    // Birlik endi ro'yxat: mahsulotning birligi ro'yxatda bo'lmasa (eski
    // yozuvda boshqacha yozilgan bo'lishi mumkin) u qo'shib qo'yiladi,
    // aks holda tanlov jimgina o'tmay qolardi.
    const unit = option?.dataset.unit;
    if (name && unit) {
      const list = form.elements.unit;
      if (![...list.options].some((row) => row.value === unit)) {
        list.append(new Option(unit, unit));
      }
      list.value = unit;
    }
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
  const vatRate = numberValue(field(form, "vat_rate") || 12);
  const unitPrice = ticketNetUnitPrice(form);
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
  app.innerHTML = `<div class="page"><div class="page-header"><div class="page-title"><h1>Yangi birja ticketi</h1><p>Ticket ochilganda ta'minotchi omboridagi kompaniya zaxirasi yaratiladi.</p></div><div class="actions"><button class="btn" data-nav="/exchange-tickets">Orqaga</button></div></div><form id="exchange-ticket-form">${section("Ticket ma'lumotlari", `<div class="grid">${textField("ticket_number", "Ticket raqami")}${textField("ticket_date", "Ticket sanasi", today, "date")}<label>Ta'minotchi<select name="supplier_id"><option value="">Tanlang</option>${supplierOptions}</select></label><label><span class="field-label-text">Mahsulot <span class="required-mark" aria-hidden="true">*</span></span>${selectSearch("product_id", "Mahsulot nomi bo'yicha qidiring")}<select name="product_id" data-ticket-product required><option value="">Mahsulotni tanlang</option>${productOptions}</select></label><input type="hidden" name="product_name" value="" />${textField("quantity", "Miqdor", "", "number")}<label><span class="field-label-text">Birlik</span><select name="unit" data-noloc>${ticketUnitOptions(products, "")}</select></label>${textField("unit_price", "Birlik narxi", "", "number")}${textField("vat_rate", "QQS %", 12, "number")}<label class="inline-check price-vat-toggle"><input type="checkbox" name="price_includes_vat" /><span>Kiritilgan birlik narxi QQS bilan</span></label><label><span class="field-label-text">To'lov turi <span class="required-mark" aria-hidden="true">*</span></span>
      <div class="choice-row">
        ${TICKET_PAYMENT_TYPES.map(([key, label, days]) => `<button type="button" class="task-chip ${key === "forward" ? "active" : ""}" data-payment-type="${key}" data-days="${days}">${label}</button>`).join("")}
      </div>
      <input type="hidden" name="payment_type" value="forward" />
    </label>${textField("payment_term_days", "To'lov muddati, kun", 90, "number")}${textArea("notes", "Izoh")}</div>`)}<p class="helper-text">Belgi qo'yilsa, kiritilgan raqamdan soliq ajratiladi va bazaga QQSsiz narx yoziladi.</p>${section("Hisob-kitob", summaryCards([["To'lov muddati", `<span data-ticket-due>${dash}</span>`], ["Oraliq summa", `<span data-ticket-subtotal>${dash}</span>`], ["QQS", `<span data-ticket-vat>${dash}</span>`], ["Jami summa", `<span data-ticket-total>${dash}</span>`]]))}<div class="form-footer"><button class="btn" type="button" data-nav="/exchange-tickets">Bekor qilish</button><button class="btn primary">Ticketni ochish</button></div></form></div>`;
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

const TICKET_DOCUMENT_TYPES = {
  ticket_contract: "Ticket shartnomasi",
  act: "Dalolatnoma",
  other: "Boshqa",
};

// Ticketda ikkita har xil qoldiq bor va ularni chalkashtirmaslik kerak:
// kvotada qolgan -- ta'minotchidan yana olish mumkin bo'lgani; zaxirada erkin
// -- olib kelingan, lekin hali buyurtmaga biriktirilmagani.
function ticketIntakeRow(ticket, intake, editable) {
  const act = (ticket.documents || []).find((doc) => doc.intake_id === intake.id && doc.document_type === "act");
  return `<tr>
    <td>${fmtDayOnly(intake.intake_date)}</td>
    <td>${fmtQty(intake.quantity, ticket.unit)}</td>
    <td>${fmt(intake.document_number)}</td>
    <td>${act?.file_url ? `<a class="link-btn" target="_blank" href="${esc(act.file_url)}">Dalolatnoma</a>` : dash}</td>
    <td>${fmt(intake.created_by)}</td>
    <td>${editable ? `<button type="button" class="link-btn" data-intake-remove="${intake.id}">Olib tashlash</button>` : ""}</td>
  </tr>`;
}

// Mol hujjatsiz zaxiraga kirmaydi: dalolatnoma aynan shu qabulni, ticket
// shartnomasi esa bitimning o'zini tasdiqlaydi. Shartnoma bir marta
// yuklanadi, keyingi qabullarda qayta so'ralmaydi.
function ticketIntakeForm(ticket) {
  const remaining = numberValue(ticket.balance?.remaining_on_ticket);
  if (remaining <= 0) {
    return `<div class="empty">Ticket kvotasi to'liq olib bo'lingan.</div>`;
  }
  const hasContract = (ticket.documents || []).some((doc) => doc.document_type === "ticket_contract");
  return `<form id="ticket-intake-form" class="grid">
    ${textField("intake_date", "Zaxiraga olingan sana", todayIso(), "date", { required: true })}
    ${textField("quantity", "Olingan miqdor", "", "number", { required: true, min: 0, max: remaining, title: "Olingan miqdor kvotada qolgan miqdordan oshmasligi kerak." })}
    ${textField("document_number", "Hujjat raqami (TTN)", "")}
    <label><span class="field-label-text">Dalolatnoma <span class="required-mark" aria-hidden="true">*</span></span>
      <input type="file" name="act_file" required />
    </label>
    <label><span class="field-label-text">Ticket shartnomasi${hasContract ? "" : ' <span class="required-mark" aria-hidden="true">*</span>'}</span>
      <input type="file" name="contract_file" ${hasContract ? "" : "required"} />
      <span class="helper-text">${hasContract ? "Allaqachon yuklangan, qayta yuklash shart emas." : "Birinchi qabulda bir marta yuklanadi."}</span>
    </label>
    ${textField("notes", "Izoh", "")}
    <div class="form-footer"><button class="btn primary" type="submit">Zaxiraga olish</button></div>
  </form>`;
}

function ticketDocumentRow(doc) {
  return `<tr>
    <td>${fmt(TICKET_DOCUMENT_TYPES[doc.document_type] || doc.document_type)}</td>
    <td>${fmt(doc.title)}</td>
    <td>${fmt(doc.uploaded_by)}</td>
    <td>${fmtDate(doc.uploaded_at)}</td>
    <td>${doc.file_url ? `<a class="link-btn" target="_blank" href="${esc(doc.file_url)}">Ko'rish</a>` : dash}</td>
  </tr>`;
}

async function renderExchangeTicketDetail(id) {
  const ticket = await api(`/api/exchange-tickets/${id}`);
  const lot = ticket.stock_lot;
  const allocations = lot ? await api(`/api/stock-allocations?stock_lot_id=${lot.id}`).catch(() => []) : [];
  const balance = ticket.balance || {};
  const editable = canEdit("taminot");
  const warnings = [...(balance.warnings || [])];
  const dueDays = daysUntil(ticket.due_date);
  if (typeof dueDays === "number" && dueDays <= 7 && !["paid", "closed", "cancelled"].includes(ticket.status)) warnings.push(`Ticket to'lov muddati tugashiga ${dueDays} kun qoldi.`);
  if (!lot) warnings.push("Zaxira partiyasi hali yaratilmagan.");
  app.innerHTML = `<div class="page">${workflowHeader({ title: ticket.ticket_number, subtitle: subtitleLine([{value:ticket.supplier_name,raw:true},{value:ticket.product_name,raw:true},{value:fmtDayOnly(ticket.ticket_date),raw:true}]), backPath: "/exchange-tickets", actions: [{ label: "Zaxirani ko'rish", path: lot ? `/stock/${lot.id}` : "/stock", primary: Boolean(lot) }, { label: "Hisob-faktura yaratish", path: `/supplier-invoices/new?ticket_id=${ticket.id}&supplier_id=${ticket.supplier_id}` }, { label: "Hujjat yuklash", path: `/exchange-tickets/${ticket.id}#documents` }] })}${workflowStatusGrid([["Ticket holati", statusBadge(ticket.status)], ["Zaxira holati", lot ? statusBadge(lot.stock_status) : statusChip({ label: "Yaratilmagan", tone: "warning" })], ["To'lov holati", statusChip({ label: optionLabel(exchangeTicketStatuses, ticket.status), tone: dueDays < 0 ? "warning" : "muted" })], ["Hujjat holati", statusChip({ label: "Keyingi bosqich", tone: "muted" })]])}${summaryCards([
      ["Ticket miqdori", fmtQty(balance.quota ?? ticket.quantity, ticket.unit)],
      ["Zaxiraga olingan", fmtQty(balance.taken, ticket.unit)],
      ["Kvotada qolgan", fmtQty(balance.remaining_on_ticket, ticket.unit)],
      ["Zaxirada erkin", fmtQty(balance.available, ticket.unit)],
      ["Band qilingan", fmtQty(balance.reserved, ticket.unit)],
      ["Mijozga ketgan", fmtQty(balance.shipped, ticket.unit)],
      ["Jami summa", fmtMoney(ticket.total_amount)],
      ["To'lov muddati", fmt(ticket.due_date)],
      ["Qoldiq kun", fmt(dueDays)],
    ])}${workflowWarningsPanel(warnings)}${workflowNextActionPanel(
      !lot ? { title: "Ticketni oching", button: "Ticketni ochish", path: `/exchange-tickets/${ticket.id}` }
      : numberValue(balance.remaining_on_ticket) > 0 ? { title: "Ticket bo'yicha molni zaxiraga oling", button: "Zaxiraga olish", path: `/exchange-tickets/${ticket.id}#intakes` }
      : numberValue(balance.available) > 0 ? { title: "Zaxira buyurtmaga ajratishga tayyor", button: "Zaxirani ko'rish", path: `/stock/${lot.id}`, done: true }
      : { title: "Ticket bo'yicha mol to'liq ishlatilgan", button: "Zaxirani ko'rish", path: `/stock/${lot.id}`, done: true })}${workflowTabs("general", [["general", "Umumiy"], ["product", "Mahsulot"], ["intakes", "Zaxiraga olish"], ["stock", "Zaxira"], ["finance", "Moliya"], ["documents", "Hujjatlar"], ["history", "Tarix"]], "exchange-ticket-tab")}${section("Umumiy", detailList([["Ticket raqami", ticket.ticket_number], ["Ticket sanasi", ticket.ticket_date], ["Ta'minotchi", ticket.supplier_name], ["Status", optionLabel(exchangeTicketStatuses, ticket.status)], ["Izoh", ticket.notes]]), "general")}${section("Mahsulot", detailList([["Mahsulot", ticket.product_name], ["Miqdor", fmtQty(ticket.quantity, ticket.unit)], ["Birlik narxi", fmtMoney(ticket.unit_price)], ["Oraliq summa", fmtMoney(ticket.subtotal_amount)], ["QQS", fmtMoney(ticket.vat_amount)], ["Jami summa", fmtMoney(ticket.total_amount)]]), "product")}${section("Zaxiraga olish", `<div id="intakes">${tableOrEmpty(ticket.intakes || [], ["Sana", "Miqdor", "Hujjat raqami", "Dalolatnoma", "Kim", ""], (intake) => ticketIntakeRow(ticket, intake, editable), "Ticket bo'yicha hali mol olinmagan.")}${editable ? ticketIntakeForm(ticket) : ""}</div>`, "intakes")}${section("Zaxira", lot ? detailList([["Zaxira partiyasi", lot.ticket_number], ["Joylashuv", lot.location_name], ["Manzil", lot.location_address], ["Zaxiraga tushgan", fmtQty(lot.quantity_initial, lot.unit)], ["Zaxirada erkin", fmtQty(lot.quantity_available, lot.unit)], ["Band qilingan", fmtQty(lot.quantity_reserved, lot.unit)], ["Status", optionLabel(stockStatuses, lot.stock_status)]]) + `<h3 class="section-subtitle">Qaysi buyurtmalarga ketgan</h3>` + stockAllocationsTable(allocations, lot.unit) : `<div class="empty">Zaxira partiyasi hali yaratilmagan.</div>`, "stock")}${section("Moliya", detailList([["To'lov turi", optionLabel(ticketPaymentTypes, ticket.payment_type)], ["To'lov muddati, kun", ticket.payment_term_days], ["To'lov muddati", ticket.due_date], ["Qoldiq kun", dueDays], ["Kreditor summa", fmtMoney(ticket.total_amount)]]) + (["opened", "partially_paid", "overdue"].includes(ticket.status) ? `<div class="form-hint"><span>Bu ticket Kreditorlik ro'yxatida turadi. Hisob-faktura yaratilgach qarzni hisob ko'rsatadi.</span></div>` : ""), "finance")}${section("Hujjatlar", `<div id="documents">${tableOrEmpty(ticket.documents || [], ["Turi", "Nomi", "Yuklagan", "Sana", ""], ticketDocumentRow, "Hujjatlar hali yuklanmagan.")}</div>`, "documents")}${section("Tarix", workflowTimeline([["Yaratildi", fmtDate(ticket.created_at)], ["Status", optionLabel(exchangeTicketStatuses, ticket.status)], ["Yangilandi", fmtDate(ticket.updated_at)]]), "history")}</div>`;
  bindPanelTabs("exchange-ticket-tab");

  document.querySelector("#ticket-intake-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData();
    data.append("intake_date", field(form, "intake_date"));
    data.append("quantity", normalizeNumberInputValue(field(form, "quantity")));
    if (field(form, "document_number")) data.append("document_number", field(form, "document_number"));
    if (field(form, "notes")) data.append("notes", field(form, "notes"));
    const act = form.elements.act_file?.files?.[0];
    const contract = form.elements.contract_file?.files?.[0];
    if (!act) return showToast("Dalolatnoma faylini tanlang.", true);
    data.append("act_file", act);
    if (contract) data.append("contract_file", contract);
    try {
      await apiForm(`/api/exchange-tickets/${id}/intakes`, data);
      showToast("Mol zaxiraga olindi.");
      await renderExchangeTicketDetail(id);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  app.querySelectorAll("[data-intake-remove]").forEach((button) => button.addEventListener("click", async () => {
    const confirmed = await appDialog({
      title: "Qabulni olib tashlash",
      intro: "Bu miqdor zaxiradan ayiriladi. Mol allaqachon buyurtmaga biriktirilgan bo'lsa, amal bajarilmaydi.",
      confirmLabel: "Olib tashlash",
      tone: "danger",
    });
    if (!confirmed.confirmed) return;
    try {
      await api(`/api/exchange-tickets/${id}/intakes/${button.dataset.intakeRemove}`, { method: "DELETE" });
      showToast("Qabul olib tashlandi.");
      await renderExchangeTicketDetail(id);
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

const STOCK_FILTER_KEYS = ["search", "product_name", "supplier_id", "stock_status", "location_type", "due_from", "due_to", "min_available", "available_only", "reserved_only", "due_soon"];

async function renderStockList() {
  const params = new URLSearchParams(location.search);
  const [data, options] = await Promise.all([
    api(`/api/stock-lots?${params.toString()}`),
    api("/api/stock-lots/options"),
  ]);
  const totalAvailable = data.items.reduce((sum, lot) => sum + numberValue(lot.quantity_available), 0);
  const reserved = data.items.reduce((sum, lot) => sum + numberValue(lot.quantity_reserved), 0);
  const value = data.items.reduce((sum, lot) => sum + stockValue(lot), 0);
  const selectOptions = (list, selected, labeller = (x) => x) => list.map((item) => {
    const [key, label] = Array.isArray(item) ? item : [item.id ?? item, labeller(item)];
    return `<option value="${esc(key)}" ${String(selected) === String(key) ? "selected" : ""}>${esc(label)}</option>`;
  }).join("");

  app.innerHTML = opsListPage({
    className: "stock-ops-page",
    title: "Zaxira",
    tabs: [
      { label: "Umumiy ko'rinish", path: "/supply" },
      { label: "Birja ticketlari", path: "/exchange-tickets" },
      { label: "Zaxira", active: true },
    ],
    clearPath: "/stock",
    counter: `${fmt(data.total)} ta zaxira partiyasi · ${fmtQty(totalAvailable)} mavjud · ${fmtQty(reserved)} band · ${fmtMoney(value)} qiymat`,
    formId: "stock-search-form",
    filters: [
      opsFilterField("Qidirish", `<input name="search" placeholder="Mahsulot, ta'minotchi, ticket" value="${esc(params.get("search") || "")}" />`),
      opsFilterField("Mahsulot", `<select name="product_name"><option value="">Barcha mahsulotlar</option>${selectOptions(options.products, params.get("product_name"))}</select>`),
      opsFilterField("Ta'minotchi", `<select name="supplier_id"><option value="">Barcha ta'minotchilar</option>${selectOptions(options.suppliers, params.get("supplier_id"), (x) => x.name)}</select>`),
      opsFilterField("Zaxira holati", `<select name="stock_status"><option value="">Barcha holatlar</option>${selectOptions(stockStatuses, params.get("stock_status"))}</select>`),
      opsFilterField("Joylashuv turi", `<select name="location_type"><option value="">Barcha joylashuvlar</option>${selectOptions(stockLocationTypes, params.get("location_type"))}</select>`),
      opsFilterField("To'lov muddati: dan", `<input type="date" name="due_from" value="${esc(params.get("due_from") || "")}" />`),
      opsFilterField("To'lov muddati: gacha", `<input type="date" name="due_to" value="${esc(params.get("due_to") || "")}" />`),
      opsFilterField("Eng kam mavjud miqdor", `<input type="number" step="any" min="0" name="min_available" value="${esc(params.get("min_available") || "")}" />`),
      opsFilterField("Qo'shimcha", `<label class="inline-check"><input type="checkbox" name="available_only" value="true" ${params.get("available_only") === "true" ? "checked" : ""} /> Faqat mavjudi</label><label class="inline-check"><input type="checkbox" name="reserved_only" value="true" ${params.get("reserved_only") === "true" ? "checked" : ""} /> Faqat band</label><label class="inline-check"><input type="checkbox" name="due_soon" value="true" ${params.get("due_soon") === "true" ? "checked" : ""} /> Muddati yaqin</label>`),
    ].join(""),
    headers: [
      opsSortHeader("product", "Mahsulot"),
      opsSortHeader("supplier", "Ta'minotchi"),
      "Joylashuv",
      "Ticket",
      opsSortHeader("due", "To'lov muddati"),
      opsSortHeader("initial", "Dastlabki"),
      opsSortHeader("available", "Mavjud"),
      opsSortHeader("reserved", "Band"),
      opsSortHeader("price", "Birlik xarid narxi"),
      "Qiymati",
      "Status",
      "",
    ],
    rows: data.items.map((lot) => `<tr><td><button class="ops-primary-link" data-nav="/stock/${lot.id}">${fmt(lot.product_name)}</button></td><td>${fmt(lot.supplier_name)}</td><td>${fmt(lot.location_name)}</td><td><button class="link-btn" data-nav="/exchange-tickets/${lot.ticket_id}">${fmt(lot.ticket_number)}</button></td><td data-noloc>${fmt(lot.due_date)}</td><td>${fmtQty(lot.quantity_initial, lot.unit)}</td><td>${fmtQty(lot.quantity_available, lot.unit)}</td><td>${fmtQty(lot.quantity_reserved, lot.unit)}</td><td class="ops-money">${fmtMoney(lot.unit_cost)}</td><td class="ops-money">${fmtMoney(stockValue(lot))}</td><td>${statusBadge(lot.stock_status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/stock/${lot.id}">Ko'rish</button>${canEdit("sotuv") ? `<button class="link-btn" data-nav="/orders/new?source_type=supplier_held_stock&stock_lot_id=${lot.id}">Buyurtmaga ajratish</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Zaxira topilmadi.",
    colspan: 12,
    footer: opsFooter(data, "stock"),
  });
  bindOpsSearch("stock-search-form", "/stock", STOCK_FILTER_KEYS);
  bindOpsSort("/stock");
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
