// ---- Mijozlar (Clients) ----

// Stat cards and dropdown choices in one call. The server counts the cards over
// the same filter the table uses -- summing the first few unfiltered pages here
// used to make a filtered page show company-wide figures above rows of zeros.
async function clientsOverview(params) {
  return api(`/api/clients/overview?${params.toString()}`);
}

// Columns the server can order by. Anything not listed here is display-only
// (the legal address is long free text, so sorting it helps nobody).
const CLIENT_SORT_COLUMNS = [
  ["name", "Mijoz nomi"],
  ["inn", "STIR"],
  ["phone", "Telefon"],
  ["region", "Hudud"],
  ["active_contracts", "Faol shartnomalar"],
  ["active_orders", "Faol buyurtmalar"],
];

function clientSortHeader(key, label, params) {
  const active = (params.get("sort") || "") === key;
  const currentOrder = active && params.get("order") === "desc" ? "desc" : "asc";
  const nextOrder = active && currentOrder === "asc" ? "desc" : "asc";
  // The arrow sits in its own span with data-noloc: the Cyrillic dictionary
  // matches whole text nodes, and a label glued to a glyph matches nothing.
  const arrow = active ? (currentOrder === "desc" ? "\u2193" : "\u2191") : "\u21C5";
  return `<button type="button" class="ops-sort${active ? " active" : ""}" data-client-sort="${key}" data-client-order="${nextOrder}">
    <span>${label}</span><span class="ops-sort-arrow" data-noloc>${arrow}</span>
  </button>`;
}

const clientFilterField = opsFilterField;

function clientsFiltersHtml(params, regionOptions, contactOptions) {
  const currentRegion = params.get("region") || "";
  const currentContact = params.get("contact_person") || "";
  // The value stays exactly as stored so the filter still matches; only the
  // label the user reads is normalised.
  const option = (value, current, label = value) =>
    `<option value="${esc(value)}" ${current === value ? "selected" : ""}>${esc(label)}</option>`;
  return [
    clientFilterField(
      "Mijoz nomi",
      `<input name="name" placeholder="Nomi bo'yicha qidirish" value="${esc(params.get("name") || "")}" />`
    ),
    clientFilterField("STIR", `<input name="inn" placeholder="STIR raqami" value="${esc(params.get("inn") || "")}" />`),
    clientFilterField(
      "Hudud",
      `<select name="region"><option value="">Barcha hududlar</option>${regionOptions.map((r) => option(r, currentRegion)).join("")}</select>`
    ),
    clientFilterField(
      "Kontakt shaxs",
      `<select name="contact_person"><option value="">Barcha kontaktlar</option>${contactOptions.map((c) => option(c, currentContact, fmtPersonName(c))).join("")}</select>`
    ),
  ].join("");
}

// A filter change should swap the rows, not blank the whole page. Wiping app
// took the title, tabs, stat cards and the filter form the user was still
// looking at, and rebuilt them a moment later -- a full flash on every search.
function clientsShowTableLoading(colspan) {
  const tbody = app.querySelector(".clients-ops-page .ops-table tbody");
  if (!tbody) return false;
  tbody.innerHTML = `<tr><td colspan="${colspan}"><div class="empty">Mijozlar yuklanmoqda...</div></td></tr>`;
  localizeDom(tbody);
  return true;
}

function clientsSelectedLabel(count) {
  return `${count} ta mijoz tanlandi`;
}

function clientsSelectionBar(editable) {
  if (!editable) return "";
  return `<div class="ops-bulkbar" id="clients-bulkbar" hidden>
    <span class="ops-bulkbar-count" id="clients-selected-count">${clientsSelectedLabel(0)}</span>
    <div class="ops-bulkbar-actions">
      <button type="button" class="btn" data-client-bulk="export">Tanlanganlarni yuklash (XLSX)</button>
      <button type="button" class="btn danger" data-client-bulk="delete">Tanlanganlarni o'chirish</button>
      <button type="button" class="btn ghost" data-client-bulk="clear">Bekor qilish</button>
    </div>
  </div>`;
}

function clientsExportUrl(params, extra = {}) {
  const next = new URLSearchParams(params.toString());
  next.delete("page");
  next.set("lang", currentLang());
  Object.entries(extra).forEach(([key, value]) => next.set(key, value));
  const note = ["name", "inn", "region", "contact_person", "search"]
    .map((key) => (params.get(key) ? `${key}=${params.get(key)}` : null))
    .filter(Boolean)
    .join(", ");
  if (note) next.set("filter_note", note);
  return `/api/clients/export.xlsx?${next.toString()}`;
}

function bindClientsListActions(params, editable) {
  document.querySelectorAll("[data-client-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = new URLSearchParams(location.search);
      next.set("sort", button.dataset.clientSort);
      next.set("order", button.dataset.clientOrder);
      next.delete("page"); // a re-sort starts from the first page again
      navigate(`/clients?${next}`);
    });
  });

  document.querySelector("[data-client-export]")?.addEventListener("click", () => {
    window.location.href = clientsExportUrl(params);
  });

  if (!editable) return;

  const boxes = [...document.querySelectorAll("[data-client-pick]")];
  const all = document.querySelector("#clients-pick-all");
  const bar = document.querySelector("#clients-bulkbar");
  const counter = document.querySelector("#clients-selected-count");
  const selected = () => boxes.filter((box) => box.checked).map((box) => box.dataset.clientPick);

  const sync = () => {
    const picked = selected();
    // Written as one string so the Cyrillic dictionary can match it as a
    // "{n} ta ..." pattern -- a number split into its own element is a text
    // node of digits, which no dictionary entry can translate.
    counter.textContent = clientsSelectedLabel(picked.length);
    localizeDom(counter);
    bar.hidden = picked.length === 0;
    if (all) {
      all.checked = picked.length > 0 && picked.length === boxes.length;
      all.indeterminate = picked.length > 0 && picked.length < boxes.length;
    }
    boxes.forEach((box) => box.closest("tr")?.classList.toggle("picked", box.checked));
  };

  boxes.forEach((box) => box.addEventListener("change", sync));
  all?.addEventListener("change", () => {
    boxes.forEach((box) => {
      box.checked = all.checked;
    });
    sync();
  });

  document.querySelector('[data-client-bulk="clear"]')?.addEventListener("click", () => {
    boxes.forEach((box) => {
      box.checked = false;
    });
    sync();
  });

  document.querySelector('[data-client-bulk="export"]')?.addEventListener("click", () => {
    const picked = selected();
    if (!picked.length) return;
    window.location.href = clientsExportUrl(params, { ids: picked.join(",") });
  });

  document.querySelector('[data-client-bulk="delete"]')?.addEventListener("click", async () => {
    const picked = selected();
    if (!picked.length) return;
    if (!confirmMsg(`${picked.length} ta mijoz o'chiriladi. Davom etasizmi?`)) return;
    try {
      const result = await api("/api/clients/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: picked.map(Number) }),
      });
      // Clients with contracts or orders are refused one by one, so a partial
      // result is normal -- say plainly what went through and what did not.
      if (result.deleted.length) showToast(`${result.deleted.length} ta mijoz o'chirildi.`);
      if (result.blocked.length) {
        showToast(result.blocked[0].reason, true);
      }
      render();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderClientsList() {
  const params = new URLSearchParams(location.search);
  const editable = canEdit("sotuv");
  const colspan = editable ? 9 : 8;
  if (!clientsShowTableLoading(colspan)) {
    app.innerHTML = `<div class="page ops-page"><div class="empty">Mijozlar yuklanmoqda...</div></div>`;
  }

  const [data, overview] = await Promise.all([
    api(`/api/clients?${params.toString()}`),
    clientsOverview(params).catch(() => null),
  ]);

  const stats = overview?.stats || null;
  const regionOptions = overview ? [...overview.options.regions] : [];
  const contactOptions = overview ? [...overview.options.contacts] : [];
  const currentRegion = params.get("region") || "";
  const currentContact = params.get("contact_person") || "";
  if (currentRegion && !regionOptions.includes(currentRegion)) regionOptions.unshift(currentRegion);
  if (currentContact && !contactOptions.includes(currentContact)) contactOptions.unshift(currentContact);

  const sortable = Object.fromEntries(CLIENT_SORT_COLUMNS.map(([key, label]) => [key, clientSortHeader(key, label, params)]));
  const headers = [
    ...(editable ? [`<input type="checkbox" id="clients-pick-all" aria-label="Barchasini tanlash" />`] : []),
    sortable.name,
    sortable.inn,
    sortable.phone,
    sortable.region,
    "Yuridik manzil",
    sortable.active_contracts,
    sortable.active_orders,
    "Amallar",
  ];

  app.innerHTML = opsListPage({
    className: "clients-ops-page",
    title: "Mijozlar",
    tabs: [{ label: "Mijozlar", active: true }, { label: "Shartnomalar", path: "/contracts" }, { label: "Buyurtmalar", path: "/orders" }],
    createPath: editable ? "/clients/new" : null,
    createLabel: "Yangi mijoz",
    clearPath: "/clients",
    counter: `${fmt(data.total)} ta mijoz`,
    statCards: [
      { label: "Jami mijozlar", value: fmt(data.total) },
      { label: "Faol shartnomalar", value: stats ? fmt(stats.active_contracts) : dash },
      { label: "Faol buyurtmalar", value: stats ? fmt(stats.active_orders) : dash },
    ],
    formId: "clients-search-form",
    filters: clientsFiltersHtml(params, regionOptions, contactOptions),
    extraActions: `<button type="button" class="btn" data-client-export>Excel (XLSX)</button>`,
    beforeTable: clientsSelectionBar(editable),
    headers,
    rows: data.items.map((client) => `<tr>
      ${editable ? `<td class="ops-pick"><input type="checkbox" data-client-pick="${client.id}" aria-label="${esc(client.name || "")}" /></td>` : ""}
      <td><a class="ops-primary-link" href="/clients/${client.id}" data-nav="/clients/${client.id}">${fmt(client.name)}</a></td>
      <td>${fmt(client.inn)}</td>
      <td>${fmt(client.phone)}</td>
      <td>${fmt(client.primary_region)}</td>
      <td>${fmt(client.legal_address)}</td>
      <td class="ops-num">${fmt(client.active_contracts)}</td>
      <td class="ops-num">${fmt(client.active_orders)}</td>
      <td><div class="ops-row-actions">${editable ? `<a class="link-btn" href="/clients/${client.id}/edit" data-nav="/clients/${client.id}/edit">Tahrirlash</a>` : `<a class="link-btn" href="/clients/${client.id}" data-nav="/clients/${client.id}">Ko'rish</a>`}</div></td>
    </tr>`).join(""),
    emptyText: "Mijozlar topilmadi.",
    colspan,
    footer: opsFooter(data, "client"),
  });
  bindOpsSearch("clients-search-form", "/clients", ["name", "inn", "region", "contact_person"]);
  bindOpsPagination("client", "/clients");
  bindClientsListActions(params, editable);
}

async function renderNewClient() {
  await loadGeoRegions();
  app.innerHTML = clientForm();
  bindGeoFields(app);
  document.querySelector("#client-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!field(form, "name")) {
      showToast("Mijoz nomi kiritilishi shart.", true);
      return;
    }
    try {
      const created = await api("/api/clients", { method: "POST", body: JSON.stringify(createPayload(form)) });
      showToast("Mijoz qo'shildi.");
      navigate(`/clients/${created.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderEditClient(id) {
  app.innerHTML = `<div class="page"><div class="empty">Mijoz yuklanmoqda...</div></div>`;
  const [client] = await Promise.all([api(`/api/clients/${id}`), loadGeoRegions()]);
  app.innerHTML = clientForm(client);
  bindGeoFields(app);
  document.querySelector("#client-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!field(form, "name")) {
      showToast("Mijoz nomi kiritilishi shart.", true);
      return;
    }
    try {
      // One request carrying the whole form. It used to be four in sequence,
      // so a failure partway through left the earlier ones already written
      // with nothing telling the user which had gone in.
      await api(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(createPayload(form)) });
      showToast("Mijoz yangilandi.");
      navigate(`/clients/${id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function detailHeader(client) {
  const address = client.addresses.find((item) => item.address_type === "legal") || client.addresses[0];
  const editable = canEdit("sotuv");
  return `
    ${workflowHeader({
      title: client.name,
      subtitle: `STIR ${fmt(client.inn)} · Telefon ${fmt(client.phone)} · Hudud ${fmt(address?.region)}`,
      backPath: "/clients",
      fullEditPath: editable ? `/clients/${client.id}/edit` : "",
      actions: editable ? [
        { label: "Shartnoma yaratish", path: `/contracts/new?client_id=${client.id}` },
        { label: "Buyurtma yaratish", path: "/orders/new", primary: true },
      ] : [],
    })}
    ${summaryCards([
      ["Faol shartnomalar", fmt(client.active_contracts)],
      ["Faol buyurtmalar", fmt(client.active_orders)],
    ])}
  `;
}

function tabs(active) {
  return workflowTabs(active, [
    ["general", "Umumiy ma'lumotlar"],
    ["contacts", "Kontaktlar"],
    ["addresses", "Manzillar"],
    ["bank", "Bank hisoblari"],
    ["contracts", "Shartnomalar"],
    ["orders", "Buyurtmalar"],
    ["documents", "Hujjatlar"],
    ["notes", "Izohlar / Tarix"],
  ], "tab");
}

function generalTab(client) {
  return section("Umumiy ma'lumotlar", detailList([
    ["Nomi", client.name],
    ["STIR", client.inn],
    ["OKED", client.oked],
    ["Telefon", client.phone],
    ["Email", client.email],
    ["Izohlar", client.notes],
    ["Yaratilgan", fmtDate(client.created_at)],
    ["Yangilangan", fmtDate(client.updated_at)],
  ]));
}

function contactsTab(client) {
  const editable = canEdit("sotuv");
  return section("Kontaktlar", `
    ${editable ? `<div class="actions"><button class="btn primary" data-add="contacts">Kontakt qo'shish</button></div>` : ""}
    ${tableOrEmpty(client.contacts, ["F.I.Sh.", "Lavozimi", "Telefon", "Email", "Asosiy", "Amallar"], (item) => `
      <tr>
        <td>${fmt(fmtPersonName(item.full_name))}</td><td>${fmt(item.position)}</td><td>${fmt(item.phone)}</td><td>${fmt(item.email)}</td>
        <td>${item.is_primary ? '<span class="pill">Asosiy</span>' : dash}</td>
        <td><div class="table-actions">
          ${editable ? `<button class="link-btn" data-edit="contacts" data-id="${item.id}">Tahrirlash</button>
          <button class="link-btn" data-primary="contacts" data-id="${item.id}">Asosiy qilib belgilash</button>
          <button class="link-btn" data-delete="contacts" data-id="${item.id}">O'chirish</button>` : ""}
        </div></td>
      </tr>
    `, "Kontaktlar hali yo'q.")}
  `);
}

function addressesTab(client) {
  const editable = canEdit("sotuv");
  return section("Manzillar", `
    ${editable ? `<div class="actions"><button class="btn primary" data-add="addresses">Manzil qo'shish</button></div>` : ""}
    ${tableOrEmpty(client.addresses, ["Turi", "Hudud", "Tuman", "Manzil", "Koordinatalar", "Amallar"], (item) => {
      const hasCoords = item.latitude && item.longitude;
      return `
        <tr>
          <td>${fmt(item.address_type)}</td><td>${fmt(item.region)}</td><td>${fmt(item.district)}</td><td>${fmt(item.address)}</td>
          <td>${hasCoords ? `${fmt(item.latitude)}, ${fmt(item.longitude)}` : dash}</td>
          <td><div class="table-actions">
            ${editable ? `<button class="link-btn" data-edit="addresses" data-id="${item.id}">Tahrirlash</button>
            <button class="link-btn" data-delete="addresses" data-id="${item.id}">O'chirish</button>` : ""}
            ${hasCoords ? `<a class="link-btn" target="_blank" href="https://maps.google.com/?q=${esc(item.latitude)},${esc(item.longitude)}">Xaritada ko'rish</a>` : `<button class="link-btn" disabled>Xaritada ko'rish</button>`}
          </div></td>
        </tr>
      `;
    }, "Manzillar hali yo'q.")}
  `);
}

function bankTab(client) {
  const editable = canEdit("sotuv");
  return section("Bank hisoblari", `
    ${editable ? `<div class="actions"><button class="btn primary" data-add="bank">Bank hisobi qo'shish</button></div>` : ""}
    ${tableOrEmpty(client.bank_accounts, ["Bank", "MFO", "Hisob raqami", "Asosiy", "Amallar"], (item) => `
      <tr>
        <td>${fmt(item.bank_name)}</td><td>${fmt(item.mfo)}</td><td>${fmt(item.account_number)}</td>
        <td>${item.is_primary ? '<span class="pill">Asosiy</span>' : dash}</td>
        <td><div class="table-actions">
          ${editable ? `<button class="link-btn" data-edit="bank" data-id="${item.id}">Tahrirlash</button>
          <button class="link-btn" data-primary="bank" data-id="${item.id}">Asosiy qilib belgilash</button>
          <button class="link-btn" data-delete="bank" data-id="${item.id}">O'chirish</button>` : ""}
        </div></td>
      </tr>
    `, "Bank hisoblari hali yo'q.")}
  `);
}

function documentsTab(client) {
  const editable = canEdit("sotuv");
  return section("Hujjatlar", `
    ${editable ? `<div class="actions"><button class="btn primary" data-add="documents">Hujjat qo'shish</button></div>` : ""}
    ${tableOrEmpty(client.documents, ["Hujjat nomi", "Turi", "Yuklangan sana", "Yuklagan", "Amallar"], (item) => `
      <tr>
        <td>${fmt(item.title)}</td><td>${fmt(item.document_type)}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td>
        <td><div class="table-actions">
          ${item.file_url ? `<a class="link-btn" target="_blank" href="${esc(item.file_url)}">Ko'rish</a><a class="link-btn" href="${esc(item.file_url)}" download>Yuklab olish</a>` : `<button class="link-btn" disabled>Ko'rish</button><button class="link-btn" disabled>Yuklab olish</button>`}
          ${editable ? `<button class="link-btn" data-edit="documents" data-id="${item.id}">Tahrirlash</button>
          <button class="link-btn" data-delete="documents" data-id="${item.id}">O'chirish</button>` : ""}
        </div></td>
      </tr>
    `, "Hujjatlar hali yo'q.")}
  `);
}

function notesTab(client) {
  const editable = canEdit("sotuv");
  return section("Izohlar / Tarix", `
    ${editable ? `<div class="actions"><button class="btn primary" data-add="notes">Izoh qo'shish</button></div>` : ""}
    ${tableOrEmpty(client.notes_history, ["Sana", "Xodim/Foydalanuvchi", "Izoh", "Amallar"], (item) => `
      <tr>
        <td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td>
        <td>${editable ? `<button class="link-btn" data-delete="notes" data-id="${item.id}">O'chirish</button>` : ""}</td>
      </tr>
    `, "Izohlar hali yo'q.")}
  `);
}

function clientContractsTab(client, contracts = []) {
  const editable = canEdit("sotuv");
  return section("Shartnomalar", `
    ${editable ? `<div class="actions"><button class="btn primary" data-nav="/contracts/new?client_id=${client.id}">Shartnoma yaratish</button></div>` : ""}
    ${tableOrEmpty(contracts, ["Shartnoma raqami", "Sana", "Mahsulot", "Jami miqdor", "Jami summa", "Yetkazilgan", "Qoldiq", "Status", "Amallar"], (contract) => `
      <tr>
        <td><strong>${fmt(contract.contract_number)}</strong></td>
        <td>${fmt(contract.contract_date)}</td>
        <td>${fmt(contract.product)}</td>
        <td>${fmtQty(contract.total_quantity)}</td>
        <td>${fmtMoney(contract.total_amount)}</td>
        <td>${fmtQty(contract.delivered_quantity)}</td>
        <td>${fmtQty(contract.remaining_quantity)}</td>
        <td>${fmt(optionLabel(contractStatuses, contract.status))}</td>
        <td><div class="table-actions"><button class="link-btn" data-nav="/contracts/${contract.id}">Ko'rish</button>${editable ? `<button class="link-btn" data-nav="/contracts/${contract.id}/edit">Tahrirlash</button>` : ""}</div></td>
      </tr>
    `, "Shartnomalar topilmadi.")}
  `);
}

function clientOrdersTab(client, orders = []) {
  const editable = canEdit("sotuv");
  return section("Buyurtmalar", `
    ${editable ? `<div class="actions"><button class="btn primary" data-nav="/orders/new">Buyurtma yaratish</button></div>` : ""}
    ${tableOrEmpty(orders, ["Buyurtma raqami", "Sana", "Shartnoma", "Mahsulot", "Miqdor", "Yetkazilgan", "Qoldiq", "Ta'minotchi", "Status", "Amallar"], (order) => `
      <tr>
        <td><strong>${fmt(order.order_number)}</strong></td>
        <td>${fmt(order.order_date)}</td>
        <td>${fmt(order.contract?.contract_number)}</td>
        <td>${fmt(order.product)}</td>
        <td>${fmtQty(order.total_quantity)}</td>
        <td>${fmtQty(order.delivered_quantity)}</td>
        <td>${fmtQty(order.remaining_quantity)}</td>
        <td>${fmt(order.supplier_name)}</td>
        <td>${fmt(optionLabel(orderStatuses, order.status))}</td>
        <td><div class="table-actions"><button class="link-btn" data-nav="/orders/${order.id}">Ko'rish</button>${editable ? `<button class="link-btn" data-nav="/orders/${order.id}/edit">Tahrirlash</button>` : ""}</div></td>
      </tr>
    `, "Buyurtmalar topilmadi.")}
  `);
}

function renderActiveTab(client, active, related = {}) {
  if (active === "contacts") return contactsTab(client);
  if (active === "addresses") return addressesTab(client);
  if (active === "bank") return bankTab(client);
  if (active === "documents") return documentsTab(client);
  if (active === "notes") return notesTab(client);
  if (active === "contracts") return clientContractsTab(client, related.contracts || []);
  if (active === "orders") return clientOrdersTab(client, related.orders || []);
  return generalTab(client);
}

function childForm(kind, item = {}) {
  if (kind === "contacts") {
    return {
      title: item.id ? "Kontaktni tahrirlash" : "Kontakt qo'shish",
      body: `<div class="grid">${textField("full_name", "F.I.Sh.", item.full_name, "text", { required: true, maxlength: 255, autocomplete: "name" })}${textField("position", "Lavozimi", item.position, "text", { maxlength: 120 })}${textField("phone", "Telefon", item.phone, "tel", CLIENT_FIELD_RULES.phone)}${textField("email", "Email", item.email, "email", CLIENT_FIELD_RULES.email)}${checkField("is_primary", "Asosiy", item.is_primary)}${textArea("comment", "Izoh", item.comment, { maxlength: 1000 })}</div>`,
      payload: (form) => ({ full_name: field(form, "full_name"), position: field(form, "position"), phone: field(form, "phone"), email: field(form, "email"), is_primary: field(form, "is_primary"), comment: field(form, "comment") }),
    };
  }
  if (kind === "addresses") {
    return {
      title: item.id ? "Manzilni tahrirlash" : "Manzil qo'shish",
      body: `<div class="grid">${selectField("address_type", "Manzil turi", addressTypes, item.address_type || "legal")}${geoRegionField(item.region)}${geoDistrictField(item.region, item.district)}${textField("address", "Manzil", item.address, "text", { required: true, maxlength: 255 })}${textField("latitude", "Kenglik", item.latitude, "decimal", CLIENT_FIELD_RULES.latitude)}${textField("longitude", "Uzunlik", item.longitude, "decimal", CLIENT_FIELD_RULES.longitude)}${textArea("comment", "Izoh", item.comment, { maxlength: 1000 })}</div>`,
      payload: (form) => ({ address_type: field(form, "address_type"), region: field(form, "region"), district: field(form, "district"), address: field(form, "address"), latitude: field(form, "latitude"), longitude: field(form, "longitude"), comment: field(form, "comment") }),
    };
  }
  if (kind === "bank") {
    return {
      title: item.id ? "Bank hisobini tahrirlash" : "Bank hisobi qo'shish",
      body: `<div class="grid">${textField("bank_name", "Bank nomi", item.bank_name, "text", { required: true, maxlength: 160 })}${textField("mfo", "MFO", item.mfo, "text", CLIENT_FIELD_RULES.mfo)}${textField("account_number", "Hisob raqami", item.account_number, "text", CLIENT_FIELD_RULES.account_number)}${checkField("is_primary", "Asosiy", item.is_primary)}${textArea("comment", "Izoh", item.comment, { maxlength: 1000 })}</div>`,
      payload: (form) => ({ bank_name: field(form, "bank_name"), mfo: field(form, "mfo"), account_number: field(form, "account_number"), is_primary: field(form, "is_primary"), comment: field(form, "comment") }),
    };
  }
  if (kind === "documents") {
    return {
      title: item.id ? "Hujjatni tahrirlash" : "Hujjat qo'shish",
      body: `<div class="grid">${selectField("document_type", "Hujjat turi", documentTypes, item.document_type || "other")}${textField("title", "Hujjat nomi", item.title, "text", { required: true, maxlength: 255 })}${textField("file_url", "Fayl havolasi", item.file_url, "url", { maxlength: 500, placeholder: "https://..." })}${textField("uploaded_by", "Yuklagan", item.uploaded_by, "text", { maxlength: 120 })}</div>`,
      payload: (form) => ({ document_type: field(form, "document_type"), title: field(form, "title"), file_url: field(form, "file_url"), uploaded_by: field(form, "uploaded_by") }),
    };
  }
  return {
    title: item.id ? "Izohni tahrirlash" : "Izoh qo'shish",
    body: `<div class="grid">${textArea("note", "Izoh", item.note, { required: true, maxlength: 2000 })}${textField("created_by", "Xodim/Foydalanuvchi", item.created_by, "text", { maxlength: 120 })}</div>`,
    payload: (form) => ({ note: field(form, "note"), created_by: field(form, "created_by") }),
  };
}

async function openChildForm(client, kind, item = {}) {
  if (kind === "addresses") await loadGeoRegions();
  const cfg = childForm(kind, item);
  const tab = kind === "bank" ? "bank" : kind;
  app.innerHTML = `
    <div class="page">
      ${detailHeader(client)}
      ${section(cfg.title, `
        <form id="child-form">
          ${cfg.body}
          <div class="form-footer">
            <button type="button" class="btn" data-nav="/clients/${client.id}?tab=${tab}">Bekor qilish</button>
            <button type="submit" class="btn primary">Saqlash</button>
          </div>
        </form>
      `)}
    </div>
  `;
  bindGeoFields(app);
  document.querySelector("#child-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pathKind = kind === "bank" ? "bank-accounts" : kind;
    const path = item.id ? `/api/clients/${client.id}/${pathKind}/${item.id}` : `/api/clients/${client.id}/${pathKind}`;
    const method = item.id ? "PATCH" : "POST";
    try {
      await api(path, { method, body: JSON.stringify(cfg.payload(event.currentTarget)) });
      showToast("Saqlandi.");
      navigate(`/clients/${client.id}?tab=${tab}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderDetail(id) {
  app.innerHTML = `<div class="page"><div class="empty">Mijoz yuklanmoqda...</div></div>`;
  const client = await api(`/api/clients/${id}`);
  const params = new URLSearchParams(location.search);
  const active = params.get("tab") || "general";
  const related = {};
  if (active === "contracts") {
    related.contracts = (await api(`/api/contracts?client_id=${id}&page_size=100`)).items;
  }
  if (active === "orders") {
    related.orders = (await api(`/api/orders?client_id=${id}&page_size=100`)).items;
  }
  app.innerHTML = `<div class="page">${detailHeader(client)}${tabs(active)}${renderActiveTab(client, active, related)}</div>`;

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => navigate(`/clients/${id}?tab=${button.dataset.tab}`));
  });

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => openChildForm(client, button.dataset.add));
  });

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.edit;
      const collection = kind === "bank" ? client.bank_accounts : client[kind];
      const item = collection.find((row) => row.id === Number(button.dataset.id));
      openChildForm(client, kind, item);
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmMsg("Ushbu yozuvni o'chirishni tasdiqlaysizmi?")) return;
      const kind = button.dataset.delete;
      const pathKind = kind === "bank" ? "bank-accounts" : kind;
      try {
        await api(`/api/clients/${id}/${pathKind}/${button.dataset.id}`, { method: "DELETE" });
        showToast("O'chirildi.");
        renderDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  document.querySelectorAll("[data-primary]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.primary;
      const pathKind = kind === "bank" ? "bank-accounts" : kind;
      try {
        await api(`/api/clients/${id}/${pathKind}/${button.dataset.id}/primary`, { method: "POST" });
        showToast("Asosiy yozuv yangilandi.");
        renderDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}
