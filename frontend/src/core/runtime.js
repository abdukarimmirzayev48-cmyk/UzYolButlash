function localizeText(value) {
  const text = String(value ?? "");
  const trimmed = text.trim();
  if (!trimmed) return text;
  let translated = uzTranslations[trimmed] || trimmed;
  translated = translated.replace(/^Showing (\d+) of (\d+) clients\.$/, "$1 ta mijozdan $2 tasi ko'rsatilmoqda.");
  translated = translated.replace(/^Showing (\d+) of (\d+) contracts\.$/, "$1 ta shartnomadan $2 tasi ko'rsatilmoqda.");
  translated = translated.replace(/^(.+) module will be added in a future stage\.$/, "$1 moduli keyingi bosqichda qo'shiladi.");
  return text.replace(trimmed, translated);
}

function localizeDom(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const translated = localizeText(node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  });
  root.querySelectorAll?.("[placeholder], [title], [aria-label]").forEach((element) => {
    ["placeholder", "title", "aria-label"].forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      const translated = localizeText(element.getAttribute(attr));
      if (translated !== element.getAttribute(attr)) element.setAttribute(attr, translated);
    });
  });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function fmt(value) {
  if (value === null || value === undefined || value === "") return dash;
  return esc(value);
}

function fmtDate(value) {
  if (!value) return dash;
  return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function showToast(message, isError = false) {
  toast.textContent = localizeText(message);
  toast.className = `toast${isError ? " error" : ""}`;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

const AUTH_EXEMPT_PATHS = ["/api/auth/login", "/api/auth/me", "/api/auth/logout"];

function handleAuthResponse(path, response) {
  if (response.status === 401 && !AUTH_EXEMPT_PATHS.includes(path) && location.pathname !== "/login") {
    currentUser = null;
    navigate("/login");
  }
  if (response.status === 403) {
    showToast("Sizda bu amalni bajarish huquqi yo'q.", true);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    handleAuthResponse(path, response);
    const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join(", ") : body.detail;
    throw new Error(detail || "Request failed");
  }
  return body;
}

async function apiForm(path, formData, options = {}) {
  const response = await fetch(path, { method: options.method || "POST", body: formData });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    handleAuthResponse(path, response);
    const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join(", ") : body.detail;
    throw new Error(detail || "Request failed");
  }
  return body;
}

function navigate(path) {
  history.pushState({}, "", path);
  render();
}

function initSidebar() {
  const saved = localStorage.getItem("bitum.sidebarCollapsed");
  if (saved === "1" || (saved === null && window.matchMedia("(max-width: 980px)").matches)) {
    document.body.classList.add("sidebar-collapsed");
  }

  document.querySelectorAll("[data-sidebar-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-collapsed");
      localStorage.setItem("bitum.sidebarCollapsed", document.body.classList.contains("sidebar-collapsed") ? "1" : "0");
    });
  });

  document.querySelectorAll(".sidebar nav a, .app-topbar a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.body.classList.add("top-nav-closed");
      document.activeElement?.blur?.();
      if (window.matchMedia("(max-width: 980px)").matches) {
        document.body.classList.add("sidebar-collapsed");
        localStorage.setItem("bitum.sidebarCollapsed", "1");
      }
      navigate(link.getAttribute("href"));
    });
  });

  document.querySelectorAll(".top-nav-group").forEach((group) => {
    group.addEventListener("mouseenter", () => document.body.classList.remove("top-nav-closed"));
  });

  localizeDom(document.body);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) localizeDom(node);
        if (node.nodeType === Node.TEXT_NODE) {
          const translated = localizeText(node.nodeValue);
          if (translated !== node.nodeValue) node.nodeValue = translated;
        }
      });
    });
  });
  observer.observe(app, { childList: true, subtree: true });
}

function updateSidebarActiveLink() {
  document.querySelectorAll(".sidebar nav a, .app-topbar a").forEach((link) => {
    const href = link.getAttribute("href");
    const isActive = location.pathname === href || location.pathname.startsWith(`${href}/`);
    link.classList.toggle("active", isActive);
  });
  document.querySelectorAll(".top-nav-group").forEach((group) => {
    const hasActive = [...group.querySelectorAll("a")].some((link) => link.classList.contains("active"));
    group.classList.toggle("active", hasActive);
  });
}

function getIdFromPath() {
  const match = location.pathname.match(/^\/clients\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getContractIdFromPath() {
  const match = location.pathname.match(/^\/contracts\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getOrderIdFromPath() {
  const match = location.pathname.match(/^\/orders\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getBatchIdFromPath() {
  const match = location.pathname.match(/^\/delivery-batches\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getLogisticsIdFromPath() {
  const match = location.pathname.match(/^\/logistics\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getTransportIdFromPath() {
  const match = location.pathname.match(/^\/transports\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getTaskIdFromPath() {
  const match = location.pathname.match(/^\/tasks\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getInvoiceIdFromPath() {
  const match = location.pathname.match(/^\/customer-invoices\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getPaymentIdFromPath() {
  const match = location.pathname.match(/^\/customer-payments\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getSupplierIdFromPath() {
  const match = location.pathname.match(/^\/suppliers\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getProcurementIdFromPath() {
  const match = location.pathname.match(/^\/procurements\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getSupplierInvoiceIdFromPath() {
  const match = location.pathname.match(/^\/supplier-invoices\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getSupplierPaymentIdFromPath() {
  const match = location.pathname.match(/^\/supplier-payments\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getExchangeTicketIdFromPath() {
  const match = location.pathname.match(/^\/exchange-tickets\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getStockLotIdFromPath() {
  const match = location.pathname.match(/^\/stock\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getProductIdFromPath() {
  const match = location.pathname.match(/^\/products\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function getCustomerRequestIdFromPath() {
  const match = location.pathname.match(/^\/customer-requests\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function field(form, name) {
  const input = form.elements[name];
  if (!input) return null;
  if (input.type === "checkbox") return input.checked;
  const value = input.value.trim();
  if (input.dataset.formatNumber !== undefined) {
    const normalized = normalizeNumberInputValue(value);
    return normalized === "" ? null : normalized;
  }
  return value === "" ? null : value;
}

function section(title, body) {
  return `
    <section class="card">
      <div class="card-header"><h2>${title}</h2></div>
      <div class="card-body">${body}</div>
    </section>
  `;
}

function fieldOptions(options = {}) {
  return typeof options === "boolean" ? { required: options } : options;
}

function textField(name, label, value = "", type = "text", options = {}) {
  const cfg = fieldOptions(options);
  if (window.BitumFrontend?.components?.textField) {
    return window.BitumFrontend.components.textField({ name, label, value, type, ...cfg });
  }
  if (type === "number") {
    return `<label>${label}${cfg.required ? ' <span class="required-mark">*</span>' : ""}<input type="text" inputmode="decimal" data-format-number name="${name}" value="${esc(formatNumberInputValue(value))}" ${cfg.required ? "required" : ""} /></label>`;
  }
  return `<label>${label}${cfg.required ? ' <span class="required-mark">*</span>' : ""}<input type="${type}" ${type === "number" ? 'step="any"' : ""} name="${name}" value="${esc(value ?? "")}" ${cfg.required ? "required" : ""} /></label>`;
}

function readonlyField(name, label, value = "", type = "text", options = {}) {
  const cfg = fieldOptions(options);
  if (window.BitumFrontend?.components?.textField) {
    return window.BitumFrontend.components.textField({ name, label, value, type, readonly: true, ...cfg });
  }
  return `<label>${label}<input type="${type}" name="${name}" value="${esc(value ?? "")}" readonly /></label>`;
}

function addDays(dateString, days = 0) {
  const value = Number(days);
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isFinite(value)) date.setDate(date.getDate() + value);
  return date.toISOString().slice(0, 10);
}

// Skips Saturday/Sunday only (standard Mon-Fri work week) — does not account
// for public holidays, since this app has no holiday calendar to check against.
function addBusinessDays(dateString, days = 0) {
  const value = Number(days);
  const date = new Date(`${dateString}T00:00:00`);
  if (!Number.isFinite(value) || value === 0) return date.toISOString().slice(0, 10);
  const step = value > 0 ? 1 : -1;
  let remaining = Math.trunc(Math.abs(value));
  while (remaining > 0) {
    date.setDate(date.getDate() + step);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function textArea(name, label, value = "", options = {}) {
  const cfg = fieldOptions(options);
  if (window.BitumFrontend?.components?.textareaField) {
    return window.BitumFrontend.components.textareaField({ name, label, value, ...cfg });
  }
  return `<label>${label}${cfg.required ? ' <span class="required-mark">*</span>' : ""}<textarea name="${name}" ${cfg.required ? "required" : ""}>${esc(value ?? "")}</textarea></label>`;
}

function selectField(name, label, options, value = "", fieldCfg = {}) {
  const cfg = fieldOptions(fieldCfg);
  if (window.BitumFrontend?.components?.selectField) {
    return window.BitumFrontend.components.selectField({ name, label, options, value, ...cfg });
  }
  return `
    <label>${label}${cfg.required ? ' <span class="required-mark">*</span>' : ""}
      <select name="${name}" ${cfg.required ? "required" : ""}>
        ${options.map(([key, labelText]) => `<option value="${key}" ${key === value ? "selected" : ""}>${labelText}</option>`).join("")}
      </select>
    </label>
  `;
}

function checkField(name, label, checked = false) {
  return `<label class="check-row"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} /> ${label}</label>`;
}

function normalizeNumberInputValue(value) {
  return String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
}

function numberValue(value) {
  const normalized = normalizeNumberInputValue(value);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumberInputValue(value, options = {}) {
  if (value === null || value === undefined || value === "") return "";
  const normalized = normalizeNumberInputValue(value);
  if (normalized === "" || Number.isNaN(Number(normalized))) return "";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(Number(normalized));
}

function setupFormattedNumberInputs(root = document) {
  const inputs = [
    ...(root instanceof Element && root.matches("input[data-format-number], input[type='number']") ? [root] : []),
    ...root.querySelectorAll("input[data-format-number], input[type='number']"),
  ];
  inputs.forEach((input) => {
    if (input.type === "number") input.type = "text";
    input.inputMode = "decimal";
    input.dataset.formatNumber = "true";
    input.value = formatNumberInputValue(input.value);
    if (input.dataset.formatNumberBound) return;
    input.dataset.formatNumberBound = "true";
    input.addEventListener("input", () => {
      const cursorAtEnd = input.selectionStart === input.value.length;
      input.value = formatNumberInputValue(input.value);
      if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
    });
  });
  if (!(root instanceof Element) || root.id !== "app" || root.dataset.formatNumberObserverBound) return;
  {
    root.dataset.formatNumberObserverBound = "true";
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) setupFormattedNumberInputs(node);
        });
      });
    }).observe(root, { childList: true, subtree: true });
  }
}

function moneyInputField(name, label, value = "", options = {}) {
  const cfg = fieldOptions(options);
  return `<label>${label}${cfg.required ? ' <span class="required-mark">*</span>' : ""}<input type="text" inputmode="decimal" data-format-number name="${name}" value="${esc(formatNumberInputValue(value))}" ${cfg.required ? "required" : ""} /></label>`;
}

function fmtMoney(value) {
  if (value === null || value === undefined || value === "") return dash;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value))} so'm`;
}

function fmtQty(value, unit = "") {
  if (value === null || value === undefined || value === "") return dash;
  const amount = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(Number(value));
  return `${amount}${unit ? ` ${esc(unit)}` : ""}`;
}

function fmtPercent(value) {
  if (value === null || value === undefined || value === "") return dash;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(Number(value))}%`;
}

function statusLabel(status) {
  const groups = [
    contractStatuses,
    orderStatuses,
    batchStatuses,
    logisticsStatuses,
    invoiceStatuses,
    paymentStatuses,
    supplierInvoiceStatuses,
    supplierPaymentStatuses,
    procurementStatuses,
    supplierOfferStatuses,
    taskStatuses,
  ];
  for (const group of groups) {
    const label = group.find(([key]) => key === status)?.[1];
    if (label) return label;
  }
  return localizeText(status || dash);
}

function statusBadge(status) {
  return `<span class="status-badge ${esc(status || "")}">${fmt(statusLabel(status))}</span>`;
}

function clientForm(client = null) {
  const contact = client?.contacts?.[0] || {};
  const address = client?.addresses?.[0] || {};
  const account = client?.bank_accounts?.[0] || {};
  const title = client ? "Edit client" : "New client";
  return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>${title}</h1>
          <p>${client ? "Update client profile information." : "Create a legal entity client profile."}</p>
        </div>
        <div class="actions"><button class="btn" data-nav="${client ? `/clients/${client.id}` : "/clients"}">Back</button></div>
      </div>
      <form id="client-form">
        ${section("Basic information", `
          <div class="grid">
            ${textField("name", "Client name", client?.name)}
            ${textField("inn", "INN", client?.inn)}
            ${textField("oked", "OKED", client?.oked)}
            ${textField("phone", "Phone", client?.phone)}
            ${textField("email", "Email", client?.email, "email")}
            ${textArea("notes", "Notes", client?.notes)}
          </div>
        `)}
        ${section("First contact person", `
          <div class="grid">
            ${textField("contact_full_name", "Full name", contact.full_name)}
            ${textField("contact_position", "Position", contact.position)}
            ${textField("contact_phone", "Phone", contact.phone)}
            ${textField("contact_email", "Email", contact.email, "email")}
            ${checkField("contact_is_primary", "Primary contact", contact.is_primary ?? true)}
            ${textArea("contact_comment", "Comment", contact.comment)}
          </div>
        `)}
        ${section("Address", `
          <div class="grid">
            ${selectField("address_type", "Address type", addressTypes, address.address_type || "legal")}
            ${textField("region", "Region", address.region)}
            ${textField("district", "District", address.district)}
            ${textField("address", "Address", address.address)}
            ${textField("latitude", "Latitude", address.latitude)}
            ${textField("longitude", "Longitude", address.longitude)}
            ${textArea("address_comment", "Comment", address.comment)}
          </div>
        `)}
        ${section("Bank account", `
          <div class="grid">
            ${textField("bank_name", "Bank name", account.bank_name)}
            ${textField("mfo", "MFO", account.mfo)}
            ${textField("account_number", "Account number", account.account_number)}
            ${checkField("bank_is_primary", "Primary account", account.is_primary ?? true)}
            ${textArea("bank_comment", "Comment", account.comment)}
          </div>
        `)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="${client ? `/clients/${client.id}` : "/clients"}">Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>
    </div>
  `;
}

function baseClientPayload(form) {
  return {
    name: field(form, "name"),
    inn: field(form, "inn"),
    oked: field(form, "oked"),
    phone: field(form, "phone"),
    email: field(form, "email"),
    notes: field(form, "notes"),
  };
}

function createPayload(form) {
  const payload = baseClientPayload(form);
  if (field(form, "contact_full_name")) {
    payload.first_contact = {
      full_name: field(form, "contact_full_name"),
      position: field(form, "contact_position"),
      phone: field(form, "contact_phone"),
      email: field(form, "contact_email"),
      is_primary: field(form, "contact_is_primary"),
      comment: field(form, "contact_comment"),
    };
  }
  if (field(form, "region") || field(form, "address")) {
    payload.address = {
      address_type: field(form, "address_type"),
      region: field(form, "region"),
      district: field(form, "district"),
      address: field(form, "address"),
      latitude: field(form, "latitude"),
      longitude: field(form, "longitude"),
      comment: field(form, "address_comment"),
    };
  }
  if (field(form, "bank_name")) {
    payload.bank_account = {
      bank_name: field(form, "bank_name"),
      mfo: field(form, "mfo"),
      account_number: field(form, "account_number"),
      is_primary: field(form, "bank_is_primary"),
      comment: field(form, "bank_comment"),
    };
  }
  return payload;
}

function opsListPage({ className = "", title, tabs = [], createPath, createLabel = "Yaratish", clearPath, counter = "", formId, filters = "", headers = [], rows = "", emptyText = "Ma'lumot topilmadi.", colspan = headers.length, footer = "" }) {
  return `<div class="page ops-page ${className}"><div class="ops-titlebar"><div class="ops-title-left"><button class="ops-menu-btn" type="button" aria-label="Menyu">=</button><h1>${title}</h1></div>${tabs.length ? `<nav class="ops-tabs" aria-label="${title} ko'rinishlari">${tabs.map((tab) => `<button class="${tab.active ? "active" : ""}" type="button" ${tab.path ? `data-nav="${tab.path}"` : ""}>${tab.label}</button>`).join("")}</nav>` : ""}</div><div class="ops-commandbar"><div class="ops-command-left">${createPath ? `<button class="btn primary" data-nav="${createPath}">${createLabel}</button>` : ""}${clearPath ? `<button class="btn" type="button" data-nav="${clearPath}">Tozalash</button>` : ""}${counter ? `<span class="ops-counter">${counter}</span>` : ""}</div>${formId ? `<form class="ops-search" id="${formId}">${filters}<button class="ops-tool-btn" type="submit">Saralash</button>${clearPath ? `<button class="ops-tool-btn" type="button" data-nav="${clearPath}">Yangilash</button>` : ""}</form>` : ""}</div><section class="ops-table-card"><table class="ops-table"><thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${colspan}"><div class="empty">${emptyText}</div></td></tr>`}</tbody></table></section>${footer}</div>`;
}

function opsFooter(data, pageKey) {
  const currentPage = Number(data.page || 1);
  const pageSize = Number(data.page_size || 20);
  const start = data.total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, data.total);
  return `<div class="ops-footer"><span>Ko'rsatilmoqda: ${fmt(start)}-${fmt(end)} / ${fmt(data.total)}</span><div class="ops-pagination"><button type="button" class="ops-tool-btn" data-${pageKey}-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Oldingi</button><span>${fmt(currentPage)}</span><button type="button" class="ops-tool-btn" data-${pageKey}-page="${currentPage + 1}" ${end >= data.total ? "disabled" : ""}>Keyingi</button></div></div>`;
}

function bindOpsSearch(formId, basePath, keys) {
  document.querySelector(`#${formId}`)?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const next = new URLSearchParams();
    keys.forEach((key) => {
      const control = form.elements[key];
      if (control?.type === "checkbox" && !control.checked) return;
      const value = control?.value?.trim();
      if (value) next.set(key, value);
    });
    navigate(`${basePath}${next.toString() ? `?${next}` : ""}`);
  });
}

function bindOpsPagination(pageKey, basePath) {
  document.querySelectorAll(`[data-${pageKey}-page]`).forEach((button) => {
    button.addEventListener("click", () => {
      const next = new URLSearchParams(location.search);
      next.set("page", button.getAttribute(`data-${pageKey}-page`));
      navigate(`${basePath}?${next}`);
    });
  });
}
