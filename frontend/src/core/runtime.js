// ---- Language (Latin source of truth, Cyrillic rendered on top) ----

const LANG_KEY = "bitum.lang";

function currentLang() {
  return localStorage.getItem(LANG_KEY) === "lat" ? "lat" : "cyr";
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang === "lat" ? "lat" : "cyr");
  // Full reload rather than a live re-render: the MutationObserver only
  // localizes *added* nodes, so switching in place would strand text that has
  // already been translated.
  location.reload();
}

function toCyrillic(text) {
  if (typeof uzCyrillic !== "object") return undefined;
  const exact = uzCyrillic[text];
  if (exact) return exact;
  // Templates carrying live values ("267 ta mijoz", "Ko'rsatilmoqda: 1-20 / 267"):
  // blank the numbers, look the shape up, then put the same numbers back in
  // order. Still dictionary-driven — a shape we didn't ship never matches, so
  // API data can't be caught by this.
  if (typeof uzCyrillicPatterns !== "object" || !/\d/.test(text)) return undefined;
  const values = [];
  // Digit groups may contain thousand separators ("1 250 000") but must not
  // swallow the trailing space, or the shape stops matching the template.
  // The currency word is glued to the amount by fmtMoney, so it has to be
  // swallowed with it -- otherwise "1 047 780 000 сўм qiymat" never matches
  // the stored "{n} qiymat" shape and the whole line stays Latin.
  const shape = text.replace(/\d+(?:[.,\s]\d+)*(?:\s*(?:so'm|сўм))?/g, (hit) => {
    values.push(hit);
    return "{n}";
  });
  const template = uzCyrillicPatterns[shape];
  if (!template) return undefined;
  let i = 0;
  return template.replace(/\{n\}/g, () => (i < values.length ? values[i++] : "{n}"));
}

function localizeText(value) {
  const text = String(value ?? "");
  const trimmed = text.trim();
  if (!trimmed) return text;
  let translated = uzTranslations[trimmed] || trimmed;
  translated = translated.replace(/^Showing (\d+) of (\d+) clients\.$/, "$1 ta mijozdan $2 tasi ko'rsatilmoqda.");
  translated = translated.replace(/^Showing (\d+) of (\d+) contracts\.$/, "$1 ta shartnomadan $2 tasi ko'rsatilmoqda.");
  translated = translated.replace(/^(.+) module will be added in a future stage\.$/, "$1 moduli keyingi bosqichda qo'shiladi.");
  if (currentLang() === "cyr") {
    // Dictionary lookup ONLY. This runs across the whole DOM, so anything not
    // recognised as UI text — client names, addresses, notes, emails, plate
    // numbers — must pass through untouched.
    translated = toCyrillic(translated) || translated;
  }
  return text.replace(trimmed, translated);
}

// For system messages (toasts, API errors) rather than page content. Falls back
// to live transliteration so interpolated backend messages like
// "Bu bo'limga 5 ta xodim biriktirilgan..." still get translated. Safe here
// because these strings are always our own copy, never raw table data.
function localizeMessage(value) {
  const text = localizeText(value);
  if (currentLang() !== "cyr" || /[Ѐ-ӿ]/.test(text)) return text;
  return transliterateToCyrillic(text);
}

function localizeDom(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    // [data-noloc] opts an element out — e.g. the language switcher, whose
    // label deliberately shows the language you'd switch *to*.
    if (node.parentElement?.closest("[data-noloc]")) return;
    const translated = localizeText(node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  });
  root.querySelectorAll?.("[placeholder], [title], [aria-label], [data-short]").forEach((element) => {
    ["placeholder", "title", "aria-label", "data-short"].forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      const translated = localizeText(element.getAttribute(attr));
      if (translated !== element.getAttribute(attr)) element.setAttribute(attr, translated);
    });
  });
}

function confirmMsg(message) {
  return confirm(localizeMessage(message));
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

function fmtDayOnly(value) {
  if (!value) return dash;
  return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium" }).format(new Date(value));
}

function fmtDate(value) {
  if (!value) return dash;
  return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function showToast(message, isError = false) {
  toast.textContent = localizeMessage(message);
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

const PYDANTIC_ERROR_MESSAGES = {
  missing: "to'ldirilishi shart",
  string_type: "matn bo'lishi kerak",
  string_too_short: "juda qisqa",
  string_too_long: "juda uzun",
  string_pattern_mismatch: "formati noto'g'ri",
  int_type: "butun son bo'lishi kerak",
  int_parsing: "butun son bo'lishi kerak",
  float_type: "raqam bo'lishi kerak",
  float_parsing: "raqam bo'lishi kerak",
  decimal_parsing: "raqam bo'lishi kerak",
  bool_type: "ha/yo'q qiymati bo'lishi kerak",
  bool_parsing: "ha/yo'q qiymati bo'lishi kerak",
  greater_than: "qiymat juda kichik",
  greater_than_equal: "qiymat juda kichik",
  less_than: "qiymat juda katta",
  less_than_equal: "qiymat juda katta",
  enum: "ruxsat etilmagan qiymat",
  literal_error: "ruxsat etilmagan qiymat",
  date_parsing: "sana formati noto'g'ri",
  date_from_datetime_parsing: "sana formati noto'g'ri",
  datetime_parsing: "sana/vaqt formati noto'g'ri",
  time_parsing: "vaqt formati noto'g'ri",
  json_invalid: "ma'lumot formati noto'g'ri",
  extra_forbidden: "noma'lum maydon yuborildi",
  uuid_parsing: "identifikator formati noto'g'ri",
  list_type: "ro'yxat bo'lishi kerak",
  dict_type: "obyekt bo'lishi kerak",
  value_error: null,
};

function translateApiErrorDetail(detail) {
  if (!Array.isArray(detail)) return detail;
  return detail.map((item) => {
    const field = (item.loc || []).filter((part) => part !== "body").join(".");
    let msg = PYDANTIC_ERROR_MESSAGES[item.type];
    if (msg === undefined) msg = item.msg;
    else if (msg === null) msg = String(item.msg || "").replace(/^Value error,\s*/, "");
    return field ? `${field}: ${msg}` : msg;
  }).join("; ");
}

// A <select> needs every row, but the API caps a page at 100 and there are
// already 267 clients -- one request silently dropped two thirds of them, so
// most customers simply could not be picked. Walk the pages instead.
async function fetchAllPages(path, pageSize = 100, maxPages = 50) {
  const joiner = path.includes("?") ? "&" : "?";
  let items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await api(`${path}${joiner}page=${page}&page_size=${pageSize}`);
    items = items.concat(data.items || []);
    if (!(data.items || []).length || items.length >= (data.total || 0)) break;
  }
  return items;
}

async function fetchAllClients() {
  // The API orders by creation date, which tells a person nothing when they are
  // hunting for one name among 267. Sort for the dropdown instead.
  const clients = await fetchAllPages("/api/clients");
  return clients.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"));
}

// Search box that filters a real <select>. Deliberately not a custom combobox:
// the <select> stays the value holder, so `required`, change listeners and
// field() keep working exactly as before -- only the option list narrows.
function selectSearch(selectName, placeholder = "Qidirish") {
  return `<div class="select-search">
    <input type="search" data-select-filter="${esc(selectName)}" placeholder="${esc(placeholder)}" />
    <span class="select-search-count" data-select-count></span>
  </div>`;
}

function bindSelectSearch(root = app) {
  root.querySelectorAll("[data-select-filter]").forEach((search) => {
    if (search.dataset.searchBound) return;
    search.dataset.searchBound = "true";
    const select = root.querySelector(`select[name="${search.dataset.selectFilter}"]`);
    if (!select) return;
    const counter = search.parentElement.querySelector("[data-select-count]");
    const all = [...select.options].map((option) => ({
      value: option.value,
      text: option.text,
      haystack: option.text.toLowerCase(),
    }));
    const real = all.filter((option) => option.value).length;

    const apply = () => {
      const query = search.value.trim().toLowerCase();
      const chosen = select.value;
      // The placeholder row and whatever is currently chosen always stay, so a
      // filter can never hide the value the form is about to submit.
      const shown = all.filter((option) => !option.value || !query || option.haystack.includes(query) || option.value === chosen);
      select.innerHTML = "";
      shown.forEach((option) => select.add(new Option(option.text, option.value, false, option.value === chosen)));
      select.value = chosen;
      if (counter) {
        const matched = shown.filter((option) => option.value).length;
        counter.textContent = query ? localizeText(`${matched} / ${real}`) : localizeText(`${real} ta`);
      }
    };
    search.addEventListener("input", apply);
    apply();
  });
}

// ---- дд.мм.гггг sana maydoni ----
//
// Chromium <input type="date"> ni har doim brauzerning o'z tilida chizadi
// (bizda dd/mm/yyyy) va buni na lang="", na sahifa lokali o'zgartira oladi.
// Shuning uchun ko'rinadigan maydon -- niqobli matn katakchasi, ISO qiymat
// esa yonidagi yashirin inputda turadi, ya'ni forma uni avvalgidek nomi
// bo'yicha o'qiydi. Yonida kalendar tugmasi ham qoladi.

function isoToRuDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function ruDateToIso(text) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(text || "").trim());
  if (!match) return "";
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  // Reject 31.02.2026 and friends: the Date constructor would roll them over.
  if (date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return "";
  return `${year}-${month}-${day}`;
}

function ruDateMask(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join(".");
}

function ruDateField(name, value = "", options = {}) {
  const attrs = [options.min ? `data-min="${esc(options.min)}"` : "", options.max ? `data-max="${esc(options.max)}"` : ""].join(" ");
  return `<span class="ru-date" data-ru-date ${attrs}>
    <input type="hidden" name="${esc(name)}" value="${esc(value)}" />
    <input type="text" class="ru-date-text" data-ru-date-text inputmode="numeric" maxlength="10"
           placeholder="дд.мм.гггг" value="${esc(isoToRuDate(value))}" ${options.required ? "required" : ""} />
    <input type="date" class="ru-date-picker" data-ru-date-picker value="${esc(value)}" tabindex="-1" aria-label="Kalendar" />
  </span>`;
}

function bindRuDateFields(root = app) {
  root.querySelectorAll("[data-ru-date]").forEach((holder) => {
    if (holder.dataset.ruDateBound) return;
    holder.dataset.ruDateBound = "true";
    const hidden = holder.querySelector("input[type=hidden]");
    const text = holder.querySelector("[data-ru-date-text]");
    const picker = holder.querySelector("[data-ru-date-picker]");

    // The form listens on the hidden input by name, so tell it the value moved.
    const publish = (iso) => {
      if (hidden.value === iso) return;
      hidden.value = iso;
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    };

    text.addEventListener("input", () => {
      const masked = ruDateMask(text.value);
      const atEnd = text.selectionStart === text.value.length;
      text.value = masked;
      if (atEnd) text.setSelectionRange(masked.length, masked.length);
      const iso = ruDateToIso(masked);
      picker.value = iso;
      publish(iso);
      text.classList.toggle("invalid", masked.length === 10 && !iso);
    });
    picker.addEventListener("change", () => {
      text.value = isoToRuDate(picker.value);
      text.classList.remove("invalid");
      publish(picker.value);
    });
  });
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
    const detail = translateApiErrorDetail(body.detail);
    throw new Error(detail || "So'rovni bajarib bo'lmadi.");
  }
  return body;
}

async function apiForm(path, formData, options = {}) {
  const response = await fetch(path, { method: options.method || "POST", body: formData });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    handleAuthResponse(path, response);
    const detail = translateApiErrorDetail(body.detail);
    throw new Error(detail || "So'rovni bajarib bo'lmadi.");
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

  // A section button with data-nav-module opens that module's own overview page;
  // the dropdown still lists the individual pages underneath it.
  document.querySelectorAll("[data-nav-module]").forEach((button) => {
    button.addEventListener("click", () => {
      document.body.classList.add("top-nav-closed");
      button.blur();
      navigate(button.dataset.navModule);
    });
  });

  const langButton = document.querySelector("#top-lang-toggle");
  if (langButton) {
    langButton.textContent = currentLang() === "cyr" ? "Lotin" : "Кирилл";
    langButton.title = currentLang() === "cyr" ? "Lotin alifbosiga o'tish" : "Кирилл алифбосига ўтиш";
    langButton.addEventListener("click", () => setLang(currentLang() === "cyr" ? "lat" : "cyr"));
  }

  localizeDom(document.body);
  document.title = localizeText(document.title);
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
  if (normalized === "") return "";

  // Group only the whole part and leave the fraction alone, so a half-typed
  // decimal survives keystroke by keystroke. Running the whole string through
  // Intl on every keypress turned Number("22.") back into 22 and swallowed the
  // separator, which meant a fractional amount could not be typed at all:
  // "22.5" landed as 225 and "1234.75" as 123 475.
  const negative = normalized.startsWith("-");
  const digits = normalized.replace(/[^0-9.]/g, "");
  const hasSeparator = digits.includes(".");
  const [whole, ...rest] = digits.split(".");
  const fraction = rest.join("").slice(0, options.maximumFractionDigits ?? 3);
  // A lone "-" has to survive too, or a negative amount can never be started.
  if (whole === "" && !hasSeparator) return negative ? "-" : "";
  const wholeNumber = whole === "" ? 0 : Number(whole);
  if (!Number.isFinite(wholeNumber)) return "";
  const grouped = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(wholeNumber);
  return `${negative ? "-" : ""}${grouped}${hasSeparator ? "," : ""}${fraction}`;
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
  // The currency word is part of the same text node as the digits, so the DOM
  // pass can never reach it -- translate it here, while it is still separate.
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value))} ${localizeText("so'm")}`;
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
    // Appended last so nothing already resolving changes: these were simply
    // missing, so stock and ticket badges showed the raw key ("partially_used").
    exchangeTicketStatuses,
    stockStatuses,
    stockAllocationStatuses,
    supplierStatuses,
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
  const title = client ? "Mijozni tahrirlash" : "Yangi mijoz";
  return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>${title}</h1>
          <p>${client ? "Mijoz profilini yangilang." : "Yuridik shaxs mijoz profilini yarating."}</p>
        </div>
        <div class="actions"><button class="btn" data-nav="${client ? `/clients/${client.id}` : "/clients"}">Orqaga</button></div>
      </div>
      <form id="client-form">
        ${section("Asosiy ma'lumotlar", `
          <div class="grid">
            ${textField("name", "Mijoz nomi", client?.name)}
            ${textField("inn", "INN", client?.inn)}
            ${textField("oked", "OKED", client?.oked)}
            ${textField("phone", "Telefon", client?.phone)}
            ${textField("email", "Email", client?.email, "email")}
            ${textArea("notes", "Izohlar", client?.notes)}
          </div>
        `)}
        ${section("Birlamchi kontakt shaxs", `
          <div class="grid">
            ${textField("contact_full_name", "F.I.Sh.", contact.full_name)}
            ${textField("contact_position", "Lavozimi", contact.position)}
            ${textField("contact_phone", "Telefon", contact.phone)}
            ${textField("contact_email", "Email", contact.email, "email")}
            ${checkField("contact_is_primary", "Asosiy kontakt", contact.is_primary ?? true)}
            ${textArea("contact_comment", "Izoh", contact.comment)}
          </div>
        `)}
        ${section("Manzil", `
          <div class="grid">
            ${selectField("address_type", "Manzil turi", addressTypes, address.address_type || "legal")}
            ${textField("region", "Hudud", address.region)}
            ${textField("district", "Tuman", address.district)}
            ${textField("address", "Manzil", address.address)}
            ${textField("latitude", "Kenglik", address.latitude)}
            ${textField("longitude", "Uzunlik", address.longitude)}
            ${textArea("address_comment", "Izoh", address.comment)}
          </div>
        `)}
        ${section("Bank hisobi", `
          <div class="grid">
            ${textField("bank_name", "Bank nomi", account.bank_name)}
            ${textField("mfo", "MFO", account.mfo)}
            ${textField("account_number", "Hisob raqami", account.account_number)}
            ${checkField("bank_is_primary", "Asosiy hisob", account.is_primary ?? true)}
            ${textArea("bank_comment", "Izoh", account.comment)}
          </div>
        `)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="${client ? `/clients/${client.id}` : "/clients"}">Bekor qilish</button>
          <button type="submit" class="btn primary">Saqlash</button>
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
  if (!action.done && !canEdit("yetkazib_berish")) {
    return `<section class="next-action-panel"><div><span>Keyingi amal</span><strong>${fmt(action.title)}</strong></div></section>`;
  }
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

function opsListPage({ className = "", title, tabs = [], createPath, createLabel = "Yaratish", clearPath, counter = "", statCards = [], formId, filters = "", headers = [], rows = "", emptyText = "Ma'lumot topilmadi.", colspan = headers.length, footer = "" }) {
  return `<div class="page ops-page ${className}"><div class="ops-titlebar"><div class="ops-title-left"><button class="ops-menu-btn" type="button" aria-label="Menyu">=</button><h1>${title}</h1></div>${tabs.length ? `<nav class="ops-tabs" aria-label="${title} ko'rinishlari">${tabs.map((tab) => `<button class="${tab.active ? "active" : ""}" type="button" ${tab.path ? `data-nav="${tab.path}"` : ""}>${tab.label}</button>`).join("")}</nav>` : ""}</div>${statCards.length ? summaryCards(statCards.map((c) => [c.label, c.value, c.cls])) : ""}<div class="ops-commandbar"><div class="ops-command-left">${createPath ? `<button class="btn primary" data-nav="${createPath}">${createLabel}</button>` : ""}${clearPath ? `<button class="btn" type="button" data-nav="${clearPath}">Tozalash</button>` : ""}${counter ? `<span class="ops-counter">${counter}</span>` : ""}</div>${formId ? `<form class="ops-search" id="${formId}">${filters}<button class="ops-tool-btn" type="submit">Saralash</button>${clearPath ? `<button class="ops-tool-btn" type="button" data-nav="${clearPath}">Yangilash</button>` : ""}</form>` : ""}</div><section class="ops-table-card"><table class="ops-table"><thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${colspan}"><div class="empty">${emptyText}</div></td></tr>`}</tbody></table></section>${footer}</div>`;
}

function paginationChevron(direction) {
  const d = direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6";
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

function paginationPageList(current, total) {
  const pages = [...new Set([1, total, current - 1, current, current + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  let prev = 0;
  pages.forEach((p) => {
    if (p - prev > 1) result.push("...");
    result.push(p);
    prev = p;
  });
  return result;
}

function opsFooter(data, pageKey) {
  const currentPage = Number(data.page || 1);
  const pageSize = Number(data.page_size || 20);
  const start = data.total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, data.total);
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize));
  const pages = paginationPageList(currentPage, totalPages);
  return `<div class="ops-footer"><span>Ko'rsatilmoqda: ${fmt(start)}-${fmt(end)} / ${fmt(data.total)}</span><div class="ops-pagination">
    <button type="button" class="ops-page-btn" data-${pageKey}-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""} aria-label="Oldingi">${paginationChevron("left")}</button>
    ${pages.map((p) => (p === "..." ? `<span class="ops-page-btn ellipsis">…</span>` : `<button type="button" class="ops-page-btn ${p === currentPage ? "active" : ""}" data-${pageKey}-page="${p}">${fmt(p)}</button>`)).join("")}
    <button type="button" class="ops-page-btn" data-${pageKey}-page="${currentPage + 1}" ${end >= data.total ? "disabled" : ""} aria-label="Keyingi">${paginationChevron("right")}</button>
  </div></div>`;
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
