async function renderClientsList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Mijozlar yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/clients?${params.toString()}`);
  app.innerHTML = opsListPage({
    className: "clients-ops-page",
    title: "Mijozlar",
    tabs: [{ label: "Mijozlar", active: true }, { label: "Shartnomalar", path: "/contracts" }, { label: "Buyurtmalar", path: "/orders" }],
    createPath: "/clients/new",
    clearPath: "/clients",
    counter: `${fmt(data.total)} ta mijoz`,
    formId: "search-form",
    filters: `<input name="name" placeholder="Mijoz nomi" value="${esc(params.get("name") || "")}" /><input name="inn" placeholder="STIR" value="${esc(params.get("inn") || "")}" /><input name="phone" placeholder="Telefon" value="${esc(params.get("phone") || "")}" /><input name="contact_person" placeholder="Mas'ul shaxs" value="${esc(params.get("contact_person") || "")}" /><input name="region" placeholder="Hudud" value="${esc(params.get("region") || "")}" />`,
    headers: ["Mijoz nomi", "STIR", "Telefon", "Mas'ul shaxs", "Hudud", "Yuridik manzil", "Faol shartnomalar", "Faol buyurtmalar", "Oxirgi faollik", ""],
    rows: data.items.map((client) => `<tr><td><button class="ops-primary-link" data-nav="/clients/${client.id}">${fmt(client.name)}</button></td><td>${fmt(client.inn)}</td><td>${fmt(client.phone)}</td><td>${fmt(client.primary_contact?.full_name)}</td><td>${fmt(client.primary_region)}</td><td>${fmt(client.legal_address)}</td><td>${fmt(client.active_contracts)}</td><td>${fmt(client.active_orders)}</td><td>${fmtDate(client.last_activity)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/clients/${client.id}">Ochish</button><button class="link-btn" data-nav="/clients/${client.id}/edit">Tahrirlash</button><button class="link-btn" data-nav="/clients/${client.id}?tab=documents">Hujjatlar</button></div></td></tr>`).join(""),
    emptyText: "Mijozlar topilmadi.",
    colspan: 10,
    footer: opsFooter(data, "client"),
  });
  bindOpsSearch("search-form", "/clients", ["name", "inn", "phone", "contact_person", "region"]);
  bindOpsPagination("client", "/clients");
}

async function renderNewClient() {
  app.innerHTML = clientForm();
  document.querySelector("#client-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!field(form, "name")) {
      showToast("Client name is required.", true);
      return;
    }
    try {
      const created = await api("/api/clients", { method: "POST", body: JSON.stringify(createPayload(form)) });
      showToast("Client created.");
      navigate(`/clients/${created.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderEditClient(id) {
  app.innerHTML = `<div class="page"><div class="empty">Loading client...</div></div>`;
  const client = await api(`/api/clients/${id}`);
  app.innerHTML = clientForm(client);
  document.querySelector("#client-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!field(form, "name")) {
      showToast("Client name is required.", true);
      return;
    }
    try {
      await api(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(baseClientPayload(form)) });
      if (client.contacts[0] && field(form, "contact_full_name")) {
        await api(`/api/clients/${id}/contacts/${client.contacts[0].id}`, { method: "PATCH", body: JSON.stringify(createPayload(form).first_contact) });
      } else if (field(form, "contact_full_name")) {
        await api(`/api/clients/${id}/contacts`, { method: "POST", body: JSON.stringify(createPayload(form).first_contact) });
      }
      if (client.addresses[0] && (field(form, "region") || field(form, "address"))) {
        await api(`/api/clients/${id}/addresses/${client.addresses[0].id}`, { method: "PATCH", body: JSON.stringify(createPayload(form).address) });
      } else if (field(form, "region") || field(form, "address")) {
        await api(`/api/clients/${id}/addresses`, { method: "POST", body: JSON.stringify(createPayload(form).address) });
      }
      if (client.bank_accounts[0] && field(form, "bank_name")) {
        await api(`/api/clients/${id}/bank-accounts/${client.bank_accounts[0].id}`, { method: "PATCH", body: JSON.stringify(createPayload(form).bank_account) });
      } else if (field(form, "bank_name")) {
        await api(`/api/clients/${id}/bank-accounts`, { method: "POST", body: JSON.stringify(createPayload(form).bank_account) });
      }
      showToast("Client updated.");
      navigate(`/clients/${id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function detailHeader(client) {
  const address = client.addresses.find((item) => item.address_type === "legal") || client.addresses[0];
  return `
    <div class="page-header">
      <div class="page-title">
        <h1>${fmt(client.name)}</h1>
        <p>INN ${fmt(client.inn)} · Phone ${fmt(client.phone)} · Region ${fmt(address?.region)}</p>
      </div>
      <div class="actions">
        <button class="btn" data-nav="/clients">Back</button>
        <button class="btn" data-nav="/clients/${client.id}/edit">Edit</button>
        <button class="btn" data-nav="/contracts/new">Create contract</button>
        <button class="btn" data-nav="/orders/new">Create order</button>
      </div>
    </div>
    <div class="summary-grid">
      <div class="summary-card"><span>Contracts</span><strong>${dash}</strong></div>
      <div class="summary-card"><span>Orders</span><strong>${dash}</strong></div>
      <div class="summary-card"><span>Deliveries</span><strong>${dash}</strong></div>
      <div class="summary-card"><span>Last activity</span><strong>${dash}</strong></div>
    </div>
  `;
}

function tabs(active) {
  const items = [
    ["general", "General information"],
    ["contacts", "Contacts"],
    ["addresses", "Addresses"],
    ["bank", "Bank accounts"],
    ["contracts", "Contracts"],
    ["orders", "Orders"],
    ["documents", "Documents"],
    ["notes", "Notes / History"],
  ];
  return `<div class="tabs">${items.map(([key, label]) => `<button class="tab ${active === key ? "active" : ""}" data-tab="${key}">${label}</button>`).join("")}</div>`;
}

function generalTab(client) {
  return section("General information", `
    <div class="detail-list">
      ${[
        ["Name", client.name],
        ["INN", client.inn],
        ["OKED", client.oked],
        ["Phone", client.phone],
        ["Email", client.email],
        ["Notes", client.notes],
        ["Created at", fmtDate(client.created_at)],
        ["Updated at", fmtDate(client.updated_at)],
      ].map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}
    </div>
  `);
}

function tableOrEmpty(rows, headers, renderRow, emptyText) {
  return `
    <div class="table-scroll">
      <table>
        <thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.map(renderRow).join("") : `<tr><td colspan="${headers.length}"><div class="empty">${emptyText}</div></td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function opsTableOrEmpty(rows, headers, renderRow, emptyText) {
  return `<section class="ops-table-card"><table class="ops-table"><thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(renderRow).join("") : `<tr><td colspan="${headers.length}"><div class="empty">${emptyText}</div></td></tr>`}</tbody></table></section>`;
}

function opsPageShell(title, tabs, body) {
  return `<div class="page ops-page report-ops-page"><div class="ops-titlebar"><div class="ops-title-left"><button class="ops-menu-btn" type="button" aria-label="Menyu">=</button><h1>${title}</h1></div>${tabs?.length ? `<nav class="ops-tabs" aria-label="${title} ko'rinishlari">${tabs.map((tab) => `<button class="${tab.active ? "active" : ""}" type="button" ${tab.path ? `data-nav="${tab.path}"` : ""}>${tab.label}</button>`).join("")}</nav>` : ""}</div>${body}</div>`;
}

function summaryCards(items) {
  return `<div class="summary-grid">${items.map(([label, value, cls = ""]) => `<div class="summary-card ${cls}"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`;
}

function detailList(items) {
  return `<div class="detail-list">${items.map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}</div>`;
}

function workflowHeader({ title, subtitle = "", backPath = "", actions = [], fullEditPath = "" }) {
  const visibleActions = actions.map((action) => {
    const attrs = action.modal ? `data-${esc(action.modal)}` : `data-nav="${esc(action.path || "#")}"`;
    return `<button class="btn ${action.primary ? "primary" : ""}" type="button" ${attrs}>${fmt(action.label)}</button>`;
  }).join("");
  const editMenu = fullEditPath ? `<details class="action-menu"><summary>Amallar</summary><div><button type="button" data-nav="${esc(fullEditPath)}">To'liq tahrirlash</button></div></details>` : "";
  return `<div class="workflow-header"><div class="page-title"><h1>${fmt(title)}</h1><p>${subtitle}</p></div><div class="actions workflow-actions">${backPath ? `<button class="btn" data-nav="${esc(backPath)}">Orqaga</button>` : ""}${visibleActions}${editMenu}</div></div>`;
}

function workflowStatusGrid(items) {
  return `<div class="workflow-status-grid">${items.map(([label, value]) => `<div class="workflow-status-card"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`;
}

function workflowWarningsPanel(messages, title = "E'tibor kerak") {
  const clean = messages.filter(Boolean);
  if (!clean.length) return "";
  return `<div class="workflow-warning"><strong>${fmt(title)}</strong><ul>${clean.map((message) => `<li>${esc(message)}</li>`).join("")}</ul></div>`;
}

function workflowNextActionPanel(action = {}) {
  if (!action.title) return "";
  const attrs = action.modal ? `data-${esc(action.modal)}` : action.path ? `data-nav="${esc(action.path)}"` : "";
  const button = attrs ? `<button class="btn primary" ${attrs}>${fmt(action.button || "Ochish")}</button>` : "";
  return `<section class="next-action-panel ${action.done ? "done" : ""}"><div><span>Keyingi amal</span><strong>${fmt(action.title)}</strong></div>${button}</section>`;
}

function workflowTabs(active, items, attr) {
  return `<div class="tabs workflow-tabs">${items.map(([key, label]) => `<button class="tab ${active === key ? "active" : ""}" data-${attr}="${key}">${label}</button>`).join("")}</div>`;
}

function workflowTimeline(items) {
  return `<div class="workflow-timeline">${items.map(([label, value]) => `<div><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}</div>`;
}

function hasDocs(entity = {}) {
  return (entity.documents || []).length > 0;
}

function financePaymentState(entity = {}) {
  const remaining = numberValue(entity.remaining_amount ?? entity.summary?.unallocated_amount);
  const paid = numberValue(entity.paid_amount ?? entity.summary?.allocated_amount);
  const total = numberValue(entity.total_amount ?? entity.amount ?? entity.summary?.amount);
  if (remaining <= 0 && total > 0) return { label: "To'liq yopilgan", tone: "success" };
  if (paid > 0) return { label: "Qisman yopilgan", tone: "warning" };
  return { label: "To'lov kutilmoqda", tone: "muted" };
}

function logisticsNumber(logistics = {}, batch = {}) {
  return logistics?.logistics_number || (batch?.batch_number ? `LOG-${batch.batch_number}` : dash);
}

function transportProfit(logistics = {}) {
  if (!logistics || (logistics.cost_amount === undefined && logistics.customer_price === undefined)) return dash;
  return fmtMoney(numberValue(logistics.customer_price) - numberValue(logistics.cost_amount));
}

function logisticsTimeline(logistics = {}, batch = {}) {
  const steps = [
    ["Yaratildi", logistics.created_at ? fmtDate(logistics.created_at) : dash],
    ["Reja yuklash", logistics.planned_pickup_date],
    ["Haqiqiy yuklash", logistics.actual_pickup_date],
    ["Reja yetkazish", logistics.planned_delivery_date],
    ["Haqiqiy yetkazish", logistics.actual_delivery_date],
    ["Qabul", batch.accepted_date],
    ["Holat", optionLabel(logisticsStatuses, logistics.status)],
  ];
  return detailList(steps);
}

function logisticsWarnings(logistics = {}, batch = {}) {
  const warnings = [];
  if (logistics.status === "completed" && !logistics.actual_delivery_date) warnings.push("Yakunlangan logistika uchun haqiqiy yetkazish sanasi kiritilmagan.");
  if (["loaded", "in_transit", "delivered"].includes(logistics.status) && !logistics.vehicle_number) warnings.push("Bu holat uchun transport raqami kiritilishi kerak.");
  if (batch.summary?.has_quantity_difference) warnings.push("Partiyada yuklangan va qabul qilingan miqdor farqi bor.");
  return warnings.length ? `<div class="empty error">${warnings.map(esc).join("<br>")}</div>` : "";
}

function batchPrimaryProduct(batch = {}) {
  const items = batch.items || [];
  if (!items.length) return batch.product || dash;
  const names = [...new Set(items.map((item) => item.product_name).filter(Boolean))];
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function batchHasAcceptedInput(batch = {}) {
  return (batch.items || []).some((item) => item.accepted_quantity !== null && item.accepted_quantity !== undefined && item.accepted_quantity !== "");
}

function batchQuantityStatus(batch = {}) {
  if (!batchHasAcceptedInput(batch)) return { key: "waiting_acceptance", label: "Qabul kutilmoqda", tone: "warning" };
  if ((batch.items || []).some((item) => item.difference_quantity !== null && numberValue(item.difference_quantity) !== 0)) {
    return { key: "difference", label: "Miqdor farqi bor", tone: "warning" };
  }
  return { key: "matched", label: "Mos", tone: "success" };
}

function batchDocumentStatus(batch = {}) {
  const docs = batch.documents || [];
  const required = ["ttn", "acceptance_act"];
  const uploaded = new Set(docs.map((doc) => doc.document_type));
  const count = required.filter((type) => uploaded.has(type)).length;
  if (count === required.length) return { key: "complete", label: "To'liq", tone: "success" };
  if (docs.length || count > 0) return { key: "partial", label: "Qisman yuklangan", tone: "warning" };
  return { key: "waiting", label: "Kutilmoqda", tone: "muted" };
}

function statusChip(state) {
  return `<span class="status-badge ${esc(state.tone || state.key || "")}">${fmt(state.label || state)}</span>`;
}

function batchWarningMessages(batch = {}) {
  const logistics = batch.logistics || {};
  const warnings = [];
  const qStatus = batchQuantityStatus(batch);
  const dStatus = batchDocumentStatus(batch);
  if (!logistics || logistics.status === "not_assigned") warnings.push("Transport biriktirilmagan.");
  if (!batchHasAcceptedInput(batch)) warnings.push("Qabul qilingan miqdor hali kiritilmagan.");
  if (qStatus.key === "difference") warnings.push("Yuklangan va qabul qilingan miqdor farq qiladi.");
  if (dStatus.key !== "complete") warnings.push("Hujjatlar hali to'liq yuklanmagan.");
  return warnings;
}

function batchWarningsPanel(batch) {
  const warnings = batchWarningMessages(batch);
  if (!warnings.length) return "";
  return `<div class="workflow-warning"><strong>E'tibor kerak</strong><ul>${warnings.map((warning) => `<li>${esc(warning)}</li>`).join("")}</ul></div>`;
}

function batchNextAction(batch = {}) {
  const logistics = batch.logistics || {};
  const docs = batchDocumentStatus(batch);
  if (!logistics.id) return { title: "Logistika yozuvini yarating", button: "Logistika yaratish", path: `/delivery-batches/${batch.id}/edit` };
  if (logistics.status === "not_assigned") return { title: "Transportni biriktiring", button: "Transport biriktirish", modal: "transport" };
  if (["carrier_assigned", "vehicle_assigned", "loading"].includes(logistics.status) && !logistics.actual_pickup_date) return { title: "Haqiqiy yuklash sanasini kiriting", button: "Yuklandi deb belgilash", modal: "loading" };
  if (logistics.status === "loaded") return { title: "Yo'lga chiqdi deb belgilang", button: "Yo'lga chiqdi", action: "transit" };
  if (["in_transit", "arrived", "unloading"].includes(logistics.status) && !logistics.actual_delivery_date) return { title: "Yetkazilgan sanani kiriting", button: "Yetkazildi deb belgilash", modal: "delivery" };
  if (logistics.actual_delivery_date && !batchHasAcceptedInput(batch)) return { title: "Qabul qilingan miqdorni kiriting", button: "Qabul miqdorini kiritish", path: `/delivery-batches/${batch.id}?tab=quantity` };
  if (batch.status !== "completed" && batchHasAcceptedInput(batch)) return { title: "Partiyani yakunlash", button: "Yakunlash", modal: "completion" };
  if (batch.status !== "completed" && docs.key !== "complete") return { title: "TTN va qabul dalolatnomasini yuklang", button: "Hujjat yuklash", path: `/delivery-batches/${batch.id}?tab=documents` };
  if (batch.status !== "completed") return { title: "Partiyani yakunlash", button: "Yakunlash", modal: "completion" };
  return { title: "Barcha jarayonlar yakunlangan", button: "Ko'rib chiqish", path: `/delivery-batches/${batch.id}?tab=history`, done: true };
}

function batchNextActionPanel(batch) {
  const action = batchNextAction(batch);
  let button = action.modal === "transport"
    ? `<button class="btn primary" type="button" data-transport-assignment>${fmt(action.button)}</button>`
    : action.modal === "loading"
      ? `<button class="btn primary" type="button" data-loading-confirmation>${fmt(action.button)}</button>`
      : action.modal === "delivery"
        ? `<button class="btn primary" type="button" data-delivery-confirmation>${fmt(action.button)}</button>`
      : action.modal === "completion"
        ? `<button class="btn primary" type="button" data-completion-confirmation>${fmt(action.button)}</button>`
      : action.action === "transit"
        ? `<button class="btn primary" type="button" data-mark-in-transit>${fmt(action.button)}</button>`
        : `<button class="btn primary" data-nav="${esc(action.path)}">${fmt(action.button)}</button>`;
  return `<section class="next-action-panel ${action.done ? "done" : ""}"><div><span>Keyingi amal</span><strong>${fmt(action.title)}</strong></div>${button}</section>`;
}

function batchStepState(batch = {}) {
  const logistics = batch.logistics || {};
  const docs = batchDocumentStatus(batch);
  return {
    planned: true,
    assigned: logistics.status && logistics.status !== "not_assigned",
    loaded: Boolean(logistics.actual_pickup_date || ["loaded", "in_transit", "arrived", "unloading", "delivered", "accepted", "completed"].includes(logistics.status)),
    transit: ["in_transit", "arrived", "unloading", "delivered", "accepted", "completed"].includes(logistics.status),
    delivered: Boolean(logistics.actual_delivery_date || ["delivered", "accepted", "completed"].includes(logistics.status)),
    accepted: batchHasAcceptedInput(batch),
    documents: docs.key === "complete",
    completed: batch.status === "completed",
  };
}

function batchWorkflowStepper(batch) {
  const state = batchStepState(batch);
  const steps = [
    ["planned", "Rejalashtirilgan"],
    ["assigned", "Transport biriktirildi"],
    ["loaded", "Yuklandi"],
    ["transit", "Yo'lda"],
    ["delivered", "Yetkazildi"],
    ["accepted", "Qabul"],
    ["documents", "Hujjatlar"],
    ["completed", "Yakunlandi"],
  ];
  const firstOpen = steps.findIndex(([key]) => !state[key]);
  const currentIndex = firstOpen === -1 ? steps.length - 1 : firstOpen;
  return `<div class="workflow-stepper">${steps.map(([key, label], index) => {
    const cls = state[key] && index < currentIndex ? "completed" : index === currentIndex ? "current" : state[key] ? "completed" : "upcoming";
    return `<div class="workflow-step ${cls}"><span class="workflow-dot">${index + 1}</span><span>${label}</span></div>`;
  }).join("")}</div>`;
}

function batchStatusCards(batch) {
  const logistics = batch.logistics || {};
  const quantity = batchQuantityStatus(batch);
  const documents = batchDocumentStatus(batch);
  return `<div class="workflow-status-grid">
    <div class="workflow-status-card"><span>Partiya holati</span><strong>${statusBadge(batch.status)}</strong></div>
    <div class="workflow-status-card"><span>Logistika holati</span><strong>${statusBadge(logistics.status || "not_assigned")}</strong></div>
    <div class="workflow-status-card"><span>Miqdor holati</span><strong>${statusChip(quantity)}</strong></div>
    <div class="workflow-status-card"><span>Hujjatlar holati</span><strong>${statusChip(documents)}</strong></div>
  </div>`;
}

function quantityDisplay(value, unit = "") {
  return value === null || value === undefined || value === "" ? dash : fmtQty(value, unit);
}

function contactsTab(client) {
  return section("Contacts", `
    <div class="actions"><button class="btn primary" data-add="contacts">Add contact</button></div>
    ${tableOrEmpty(client.contacts, ["Full name", "Position", "Phone", "Email", "Primary", "Actions"], (item) => `
      <tr>
        <td>${fmt(item.full_name)}</td><td>${fmt(item.position)}</td><td>${fmt(item.phone)}</td><td>${fmt(item.email)}</td>
        <td>${item.is_primary ? '<span class="pill">Primary</span>' : dash}</td>
        <td><div class="table-actions">
          <button class="link-btn" data-edit="contacts" data-id="${item.id}">Edit</button>
          <button class="link-btn" data-primary="contacts" data-id="${item.id}">Set as primary</button>
          <button class="link-btn" data-delete="contacts" data-id="${item.id}">Delete</button>
        </div></td>
      </tr>
    `, "No contacts yet.")}
  `);
}

function addressesTab(client) {
  return section("Addresses", `
    <div class="actions"><button class="btn primary" data-add="addresses">Add address</button></div>
    ${tableOrEmpty(client.addresses, ["Type", "Region", "District", "Address", "Coordinates", "Actions"], (item) => {
      const hasCoords = item.latitude && item.longitude;
      return `
        <tr>
          <td>${fmt(item.address_type)}</td><td>${fmt(item.region)}</td><td>${fmt(item.district)}</td><td>${fmt(item.address)}</td>
          <td>${hasCoords ? `${fmt(item.latitude)}, ${fmt(item.longitude)}` : dash}</td>
          <td><div class="table-actions">
            <button class="link-btn" data-edit="addresses" data-id="${item.id}">Edit</button>
            <button class="link-btn" data-delete="addresses" data-id="${item.id}">Delete</button>
            ${hasCoords ? `<a class="link-btn" target="_blank" href="https://maps.google.com/?q=${esc(item.latitude)},${esc(item.longitude)}">View on map</a>` : `<button class="link-btn" disabled>View on map</button>`}
          </div></td>
        </tr>
      `;
    }, "No addresses yet.")}
  `);
}

function bankTab(client) {
  return section("Bank accounts", `
    <div class="actions"><button class="btn primary" data-add="bank">Add bank account</button></div>
    ${tableOrEmpty(client.bank_accounts, ["Bank", "MFO", "Account number", "Primary", "Actions"], (item) => `
      <tr>
        <td>${fmt(item.bank_name)}</td><td>${fmt(item.mfo)}</td><td>${fmt(item.account_number)}</td>
        <td>${item.is_primary ? '<span class="pill">Primary</span>' : dash}</td>
        <td><div class="table-actions">
          <button class="link-btn" data-edit="bank" data-id="${item.id}">Edit</button>
          <button class="link-btn" data-primary="bank" data-id="${item.id}">Set as primary</button>
          <button class="link-btn" data-delete="bank" data-id="${item.id}">Delete</button>
        </div></td>
      </tr>
    `, "No bank accounts yet.")}
  `);
}

function documentsTab(client) {
  return section("Documents", `
    <div class="actions"><button class="btn primary" data-add="documents">Add document</button></div>
    ${tableOrEmpty(client.documents, ["Document title", "Type", "Uploaded date", "Uploaded by", "Actions"], (item) => `
      <tr>
        <td>${fmt(item.title)}</td><td>${fmt(item.document_type)}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td>
        <td><div class="table-actions">
          ${item.file_url ? `<a class="link-btn" target="_blank" href="${esc(item.file_url)}">View</a><a class="link-btn" href="${esc(item.file_url)}" download>Download</a>` : `<button class="link-btn" disabled>View</button><button class="link-btn" disabled>Download</button>`}
          <button class="link-btn" data-edit="documents" data-id="${item.id}">Edit</button>
          <button class="link-btn" data-delete="documents" data-id="${item.id}">Delete</button>
        </div></td>
      </tr>
    `, "No documents yet.")}
  `);
}

function notesTab(client) {
  return section("Notes / History", `
    <div class="actions"><button class="btn primary" data-add="notes">Add note</button></div>
    ${tableOrEmpty(client.notes_history, ["Date", "Employee/User", "Note", "Actions"], (item) => `
      <tr>
        <td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td>
        <td><button class="link-btn" data-delete="notes" data-id="${item.id}">Delete</button></td>
      </tr>
    `, "No notes yet.")}
  `);
}

function clientContractsTab(client, contracts = []) {
  return section("Contracts", `
    <div class="actions"><button class="btn primary" data-nav="/contracts/new">Create contract</button></div>
    ${tableOrEmpty(contracts, ["Contract number", "Date", "Product", "Total quantity", "Total amount", "Delivered", "Remaining", "Status", "Actions"], (contract) => `
      <tr>
        <td><strong>${fmt(contract.contract_number)}</strong></td>
        <td>${fmt(contract.contract_date)}</td>
        <td>${fmt(contract.product)}</td>
        <td>${fmtQty(contract.total_quantity)}</td>
        <td>${fmtMoney(contract.total_amount)}</td>
        <td>${fmtQty(contract.delivered_quantity)}</td>
        <td>${fmtQty(contract.remaining_quantity)}</td>
        <td>${fmt(optionLabel(contractStatuses, contract.status))}</td>
        <td><div class="table-actions"><button class="link-btn" data-nav="/contracts/${contract.id}">View</button><button class="link-btn" data-nav="/contracts/${contract.id}/edit">Edit</button></div></td>
      </tr>
    `, "No contracts found.")}
  `);
}

function clientOrdersTab(client, orders = []) {
  return section("Orders", `
    <div class="actions"><button class="btn primary" data-nav="/orders/new">Create order</button></div>
    ${tableOrEmpty(orders, ["Order number", "Date", "Contract", "Product", "Quantity", "Delivered", "Remaining", "Supplier", "Status", "Actions"], (order) => `
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
        <td><div class="table-actions"><button class="link-btn" data-nav="/orders/${order.id}">View</button><button class="link-btn" data-nav="/orders/${order.id}/edit">Edit</button></div></td>
      </tr>
    `, "No orders found.")}
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
      title: item.id ? "Edit contact" : "Add contact",
      body: `<div class="grid">${textField("full_name", "Full name", item.full_name)}${textField("position", "Position", item.position)}${textField("phone", "Phone", item.phone)}${textField("email", "Email", item.email, "email")}${checkField("is_primary", "Primary", item.is_primary)}${textArea("comment", "Comment", item.comment)}</div>`,
      payload: (form) => ({ full_name: field(form, "full_name"), position: field(form, "position"), phone: field(form, "phone"), email: field(form, "email"), is_primary: field(form, "is_primary"), comment: field(form, "comment") }),
    };
  }
  if (kind === "addresses") {
    return {
      title: item.id ? "Edit address" : "Add address",
      body: `<div class="grid">${selectField("address_type", "Address type", addressTypes, item.address_type || "legal")}${textField("region", "Region", item.region)}${textField("district", "District", item.district)}${textField("address", "Address", item.address)}${textField("latitude", "Latitude", item.latitude)}${textField("longitude", "Longitude", item.longitude)}${textArea("comment", "Comment", item.comment)}</div>`,
      payload: (form) => ({ address_type: field(form, "address_type"), region: field(form, "region"), district: field(form, "district"), address: field(form, "address"), latitude: field(form, "latitude"), longitude: field(form, "longitude"), comment: field(form, "comment") }),
    };
  }
  if (kind === "bank") {
    return {
      title: item.id ? "Edit bank account" : "Add bank account",
      body: `<div class="grid">${textField("bank_name", "Bank name", item.bank_name)}${textField("mfo", "MFO", item.mfo)}${textField("account_number", "Account number", item.account_number)}${checkField("is_primary", "Primary", item.is_primary)}${textArea("comment", "Comment", item.comment)}</div>`,
      payload: (form) => ({ bank_name: field(form, "bank_name"), mfo: field(form, "mfo"), account_number: field(form, "account_number"), is_primary: field(form, "is_primary"), comment: field(form, "comment") }),
    };
  }
  if (kind === "documents") {
    return {
      title: item.id ? "Edit document" : "Add document",
      body: `<div class="grid">${selectField("document_type", "Document type", documentTypes, item.document_type || "other")}${textField("title", "Document title", item.title)}${textField("file_url", "File URL", item.file_url)}${textField("uploaded_by", "Uploaded by", item.uploaded_by)}</div>`,
      payload: (form) => ({ document_type: field(form, "document_type"), title: field(form, "title"), file_url: field(form, "file_url"), uploaded_by: field(form, "uploaded_by") }),
    };
  }
  return {
    title: item.id ? "Edit note" : "Add note",
    body: `<div class="grid">${textArea("note", "Note", item.note)}${textField("created_by", "Employee/User", item.created_by)}</div>`,
    payload: (form) => ({ note: field(form, "note"), created_by: field(form, "created_by") }),
  };
}

async function openChildForm(client, kind, item = {}) {
  const cfg = childForm(kind, item);
  const tab = kind === "bank" ? "bank" : kind;
  app.innerHTML = `
    <div class="page">
      ${detailHeader(client)}
      ${section(cfg.title, `
        <form id="child-form">
          ${cfg.body}
          <div class="form-footer">
            <button type="button" class="btn" data-nav="/clients/${client.id}?tab=${tab}">Cancel</button>
            <button type="submit" class="btn primary">Save</button>
          </div>
        </form>
      `)}
    </div>
  `;
  document.querySelector("#child-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pathKind = kind === "bank" ? "bank-accounts" : kind;
    const path = item.id ? `/api/clients/${client.id}/${pathKind}/${item.id}` : `/api/clients/${client.id}/${pathKind}`;
    const method = item.id ? "PATCH" : "POST";
    try {
      await api(path, { method, body: JSON.stringify(cfg.payload(event.currentTarget)) });
      showToast("Saved.");
      navigate(`/clients/${client.id}?tab=${tab}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderDetail(id) {
  app.innerHTML = `<div class="page"><div class="empty">Loading client...</div></div>`;
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
      if (!confirm(localizeText("Delete this item?"))) return;
      const kind = button.dataset.delete;
      const pathKind = kind === "bank" ? "bank-accounts" : kind;
      try {
        await api(`/api/clients/${id}/${pathKind}/${button.dataset.id}`, { method: "DELETE" });
        showToast("Deleted.");
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
        showToast("Primary item updated.");
        renderDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}
