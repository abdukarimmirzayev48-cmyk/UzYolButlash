// ---- Language (Latin source of truth, Cyrillic rendered on top) ----

const LANG_KEY = "bitum.lang";

function currentLang() {
  return localStorage.getItem(LANG_KEY) === "lat" ? "lat" : "cyr";
}

// True when a form on the page holds something the user typed and has not
// saved. Switching alphabet reloads the page, and losing a half-filled client
// or order form to a mis-click is a real cost -- so ask first, but only when
// there is actually something to lose.
function hasUnsavedInput() {
  return [...document.querySelectorAll("#app form")].some((form) =>
    [...form.elements].some((element) => {
      if (element.disabled || element.readOnly) return false;
      if (element.type === "checkbox" || element.type === "radio") return element.checked !== element.defaultChecked;
      if (element instanceof HTMLSelectElement) {
        // With no option carrying `selected`, the browser picks the first one
        // itself -- that is the untouched state, not a change the user made.
        const options = [...element.options];
        if (!options.some((option) => option.defaultSelected)) return element.selectedIndex > 0;
        return options.some((option) => option.selected !== option.defaultSelected);
      }
      if (["hidden", "submit", "button", "file"].includes(element.type)) return false;
      return typeof element.value === "string" && element.value !== element.defaultValue;
    })
  );
}

function setLang(lang) {
  if (hasUnsavedInput() && !confirmMsg("Sahifada saqlanmagan ma'lumot bor. Til almashtirilsa u yo'qoladi. Davom etasizmi?")) {
    return;
  }
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
  // The guard used to be "contains any Cyrillic -> leave alone", which broke on
  // server messages that interpolate a record name: the name is Cyrillic, so
  // the Latin sentence around it was left untranslated. Cyrillic characters are
  // not in the transliteration table and pass through untouched, so the only
  // thing that has to be true is that there is Latin text to convert at all.
  if (currentLang() !== "cyr" || !/[A-Za-z]/.test(text)) return text;
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

// A dialog the app owns, instead of the browser's bare prompt()/confirm().
//
// prompt() cannot be styled or translated, gives one short line for what is
// often a paragraph of explanation, and -- the part that actually bites --
// returns null on Escape, which is easy to forget to check. Every caller here
// gets an explicit {confirmed} back, so cancelling can never be mistaken for
// an empty answer.
//
// Resolves {confirmed, comment}.
function appDialog({ title, intro = "", subject = "", confirmLabel = "Tasdiqlash", tone = "primary", comment = null }) {
  return new Promise((resolve) => {
    document.querySelector("#app-dialog")?.remove();
    const backdrop = document.createElement("div");
    backdrop.id = "app-dialog";
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal-panel app-dialog-panel">
        <div class="modal-header">
          <h2>${esc(title)}</h2>
          <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
        </div>
        <form>
          <div class="modal-body">
            ${subject ? `<p class="app-dialog-subject" data-noloc>${esc(subject)}</p>` : ""}
            ${intro ? `<p class="app-dialog-intro">${esc(intro)}</p>` : ""}
            ${comment ? `<label class="app-dialog-field">
              <span class="field-label-text">${esc(comment.label)}${comment.optional ? "" : ` <span class="required-mark" aria-hidden="true">*</span>`}</span>
              ${comment.singleLine
                ? `<input type="text" name="comment" maxlength="${esc(comment.maxlength || 120)}" placeholder="${esc(comment.placeholder || "")}" />`
                : `<textarea name="comment" rows="4" placeholder="${esc(comment.placeholder || "")}"></textarea>`}
              <span class="app-dialog-error" data-dialog-error hidden>Bu maydonni to'ldiring.</span>
            </label>` : ""}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-dialog-cancel>Bekor qilish</button>
            <button type="submit" class="btn ${tone}">${esc(confirmLabel)}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    // Modals live outside #app, which is the only thing the language observer
    // watches -- so translate this subtree by hand.
    localizeDom(backdrop);

    const field = backdrop.querySelector("textarea, .app-dialog-field input");
    const error = backdrop.querySelector("[data-dialog-error]");
    const close = (result) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(result);
    };
    const onKey = (event) => { if (event.key === "Escape") close({ confirmed: false }); };
    document.addEventListener("keydown", onKey);
    backdrop.querySelector(".modal-close").addEventListener("click", () => close({ confirmed: false }));
    backdrop.querySelector("[data-dialog-cancel]").addEventListener("click", () => close({ confirmed: false }));
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close({ confirmed: false }); });
    field?.addEventListener("input", () => { if (field.value.trim()) error.hidden = true; });
    backdrop.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const text = field ? field.value.trim() : "";
      // An optional field is still offered, just not demanded -- a forward step
      // is often self-explanatory, while a reversal or a rejection is not.
      if (field && !text && !comment?.optional) {
        error.hidden = false;
        field.focus();
        return;
      }
      close({ confirmed: true, comment: text || null });
    });
    (field || backdrop.querySelector('button[type="submit"]'))?.focus();
  });
}

// Oyna ichidagi maydonga tegishli xato oynaning o'zida aytilishi kerak.
// Ilgari u faqat toast bo'lib chiqardi: ekranning narigi burchagida, 3.6
// soniyada yo'qoladigan joyda. Foydalanuvchi esa bosilgan tugmaga qarab
// turadi va «tugma o'lik» degan xulosaga keladi. Endi xabar tugmaning yonida
// turadi va tuzatilgunga qadar yo'qolmaydi.
function openModalForm() {
  // Oynalar body ga qo'shiladi va bir vaqtda bittasi ochiq bo'ladi.
  // #app-dialog ning o'z xato satri bor va u toast bilan ishlamaydi.
  const backdrops = document.querySelectorAll(".modal-backdrop:not(#app-dialog)");
  const backdrop = backdrops[backdrops.length - 1];
  return backdrop ? backdrop.querySelector("form") || backdrop : null;
}

function modalErrorHolder(form) {
  let holder = form.querySelector("[data-modal-error]");
  if (holder) return holder;
  holder = document.createElement("div");
  holder.className = "modal-error";
  holder.dataset.modalError = "true";
  const footer = form.querySelector(".modal-footer");
  const body = form.querySelector(".modal-body");
  if (footer) footer.insertAdjacentElement("beforebegin", holder);
  else if (body) body.appendChild(holder);
  else form.insertAdjacentElement("afterbegin", holder);
  // Foydalanuvchi biror narsani o'zgartirishi bilan xabar ketadi -- aks holda
  // tuzatilgandan keyin ham qizarib turaveradi.
  form.addEventListener("input", () => { holder.hidden = true; });
  form.addEventListener("change", () => { holder.hidden = true; });
  return holder;
}

function showModalError(message, form = openModalForm()) {
  if (!form || !form.querySelector) return false;
  const holder = modalErrorHolder(form);
  holder.textContent = localizeMessage(message);
  holder.hidden = false;
  return true;
}

// Oyna ichidagi maydonga tegishli xato oynaning o'zida aytilishi kerak.
// Ilgari u faqat toast bo'lib chiqardi: ekranning narigi burchagida, 3.6
// soniyada yo'qoladigan joyda. Foydalanuvchi esa bosilgan tugmaga qarab
// turadi va «tugma o'lik» degan xulosaga keladi.
function modalFormError(form, message, fieldName = "") {
  showToast(message, true, form || openModalForm());
  const field = fieldName && form ? form.elements[fieldName] : null;
  if (field) {
    field.classList.add("field-invalid");
    field.focus();
    const clear = () => {
      field.classList.remove("field-invalid");
      field.removeEventListener("input", clear);
      field.removeEventListener("change", clear);
    };
    field.addEventListener("input", clear);
    field.addEventListener("change", clear);
  }
  return undefined;
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

// Staff names arrive from the company registry in block capitals
// ("KARIMOV AZIZBEK ANVAR O'G'LI"), which shouts inside an otherwise normally
// cased interface. Only fully-uppercase values are touched -- anything a person
// typed themselves is left exactly as they wrote it, and the stored value never
// changes, so filters and exports still match on the original.
const NAME_SUFFIXES = new Set(["o'g'li", "og'li", "ogli", "ugli", "qizi", "kizi"]);

function fmtPersonName(value) {
  const text = String(value ?? "").trim();
  if (!text || text !== text.toUpperCase() || !/[A-ZА-ЯЎҚҒҲ]/.test(text)) return text;
  return text
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (NAME_SUFFIXES.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function fmt(value) {
  if (value === null || value === undefined || value === "") return dash;
  return esc(value);
}

// dateStyle:"medium" hands the choice to whatever CLDR data the browser ships.
// For uz-UZ that varies: some builds render "6-iyl, 2026", others fall back to
// the root locale and produce "2026 M07 6". Neither is the dd.mm.yyyy the rest
// of the interface uses, so the parts are spelled out and assembled here --
// the output is then the same in every browser.
//
// The values are naive wall-clock times in Asia/Tashkent (the server runs
// there and every date the user types is local), so they are read back and
// shown as written, with no timezone conversion.
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
// A trailing Z or +05:00 means the value knows its own offset and must be
// converted rather than read literally.
const TZ_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function dateParts(value) {
  if (!value) return null;
  const text = String(value);
  const match = TZ_SUFFIX_RE.test(text) ? null : NAIVE_DATETIME_RE.exec(text);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return { year, month, day, hour, minute };
  }
  // Anything else (a Date, or a string carrying an offset) is converted the
  // normal way and then read out in the company's own timezone.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tashkent",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    })
      .formatToParts(parsed)
      .map((part) => [part.type, part.value])
  );
  return parts.year ? parts : null;
}

function fmtDayOnly(value) {
  const parts = dateParts(value);
  return parts ? `${parts.day}.${parts.month}.${parts.year}` : dash;
}

function fmtDate(value) {
  const parts = dateParts(value);
  if (!parts) return dash;
  const day = `${parts.day}.${parts.month}.${parts.year}`;
  return parts.hour === undefined ? day : `${day} ${parts.hour}:${parts.minute}`;
}

function showToast(message, isError = false, modalForm = undefined) {
  toast.textContent = localizeMessage(message);
  toast.className = `toast${isError ? " error" : ""}`;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 3600);
  // Oyna ochiq turganda xato xabari o'sha oynada ham takrorlanadi. Toast
  // ekranning yuqori o'ng burchagida chiqadi va 3.6 soniyada o'chadi -- oynaga
  // qarab turgan odam uni umuman ko'rmaydi va tugmani ishlamayapti deb
  // o'ylaydi. Bu yerda qilingani uchun har bir oynadagi tekshiruv birdaniga
  // shu xatti-harakatga o'tadi.
  if (isError) showModalError(message, modalForm === undefined ? openModalForm() : modalForm);
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

// Bitta maydon: bosilganda ichida qidiruvi bor ro'yxat ochiladi. Ilgari
// qidiruv qutisi <select> ning tepasida alohida turardi -- foydalanuvchi uni
// ro'yxatning bir qismi deb bilmasdi va 267 ta mijoz ichidan sichqoncha bilan
// qidirardi.
//
// <select> o'z joyida qoladi va qiymatni o'zi saqlaydi: `required`, `change`
// ishlovchilari va `field()` avvalgidek ishlayveradi -- faqat ustiga ko'rinish
// qo'yiladi. Shuning uchun chaqiruvchi sahifalarda hech narsa o'zgarmadi.

// Ro'yxat bir yo'la nechta qator chizadi. Qolganini «Barchasini ko'rsatish»
// ochadi: 267 ta qatorni har bosishda chizish sezilarli sekinlik beradi.
const COMBO_PAGE = 50;

function comboOptionRows(select) {
  // Asl <option> tugunlari saqlanadi: ularni new Option() bilan qayta yasash
  // har qanday data-* atributini yo'qotadi va optgroup larni tekislaydi.
  return [...select.querySelectorAll("option")].map((option, index) => ({
    index,
    value: option.value,
    label: option.textContent.trim(),
    haystack: option.textContent.toLowerCase(),
    group: option.parentElement.tagName === "OPTGROUP" ? option.parentElement.label : null,
  }));
}

function buildCombobox(holder, search, select) {
  const rows = comboOptionRows(select);
  const real = rows.filter((row) => row.value).length;
  const placeholder = search.getAttribute("placeholder") || "Qidirish";
  const emptyLabel = rows.find((row) => !row.value)?.label || "Tanlang";

  const combo = document.createElement("div");
  combo.className = "combo";
  combo.innerHTML = `
    <button type="button" class="combo-trigger" aria-haspopup="listbox" aria-expanded="false">
      <span class="combo-value"></span><span class="combo-caret" data-noloc>▾</span>
    </button>
    <div class="combo-panel" hidden>
      <input type="search" class="combo-search" placeholder="${esc(placeholder)}" autocomplete="off" />
      <div class="combo-list" role="listbox"></div>
      <div class="combo-foot"><span class="combo-count" data-noloc></span><button type="button" class="link-btn combo-more" hidden>Barchasini ko'rsatish</button></div>
    </div>`;
  // Combo <select> ning o'z joyiga qo'yiladi, qidiruv qutisining joyiga emas:
  // aks holda u <label> dan tashqariga chiqib ketadi va yorliq matni
  // maydonsiz qolib ketardi.
  select.insertAdjacentElement("beforebegin", combo);
  combo.appendChild(select);
  select.classList.add("combo-native");
  holder.remove();

  const trigger = combo.querySelector(".combo-trigger");
  const panel = combo.querySelector(".combo-panel");
  const input = combo.querySelector(".combo-search");
  const list = combo.querySelector(".combo-list");
  const count = combo.querySelector(".combo-count");
  const more = combo.querySelector(".combo-more");
  let limit = COMBO_PAGE;
  let active = -1;

  const showValue = () => {
    const chosen = rows.find((row) => row.value === select.value);
    const text = chosen && chosen.value ? chosen.label : emptyLabel;
    trigger.querySelector(".combo-value").textContent = text;
    trigger.classList.toggle("is-empty", !(chosen && chosen.value));
  };

  const matches = () => {
    const query = input.value.trim().toLowerCase();
    return rows.filter((row) => row.value && (!query || row.haystack.includes(query)));
  };

  const draw = () => {
    const found = matches();
    const shown = found.slice(0, limit);
    let groupName = null;
    list.innerHTML = shown.map((row) => {
      const head = row.group && row.group !== groupName ? `<div class="combo-group">${esc(row.group)}</div>` : "";
      groupName = row.group;
      const chosen = row.value === select.value;
      return `${head}<button type="button" class="combo-option${chosen ? " is-chosen" : ""}" role="option" aria-selected="${chosen}" data-combo-value="${esc(row.value)}">${esc(row.label)}</button>`;
    }).join("") || `<div class="empty">Topilmadi.</div>`;
    count.textContent = input.value.trim() ? `${found.length} / ${real}` : `${real} ta`;
    more.hidden = found.length <= limit;
    active = -1;
  };

  const setActive = (step) => {
    const options = [...list.querySelectorAll(".combo-option")];
    if (!options.length) return;
    active = (active + step + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle("is-active", index === active));
    options[active].scrollIntoView({ block: "nearest" });
  };

  const choose = (value) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    showValue();
    close();
  };

  const open = () => {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    limit = COMBO_PAGE;
    input.value = "";
    draw();
    input.focus();
  };

  function close() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", () => (panel.hidden ? open() : close()));
  input.addEventListener("input", () => { limit = COMBO_PAGE; draw(); });
  more.addEventListener("click", () => { limit = rows.length; draw(); });
  list.addEventListener("click", (event) => {
    const option = event.target.closest("[data-combo-value]");
    if (option) choose(option.dataset.comboValue);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = list.querySelectorAll(".combo-option")[active] || list.querySelector(".combo-option");
      if (option) choose(option.dataset.comboValue);
    } else if (event.key === "Escape") {
      close();
      trigger.focus();
    }
  });
  // Tashqariga bosilganda yopiladi. Sahifa qayta chizilganda combo DOM dan
  // chiqib ketadi -- shunda kuzatuvchi ham o'zini olib tashlaydi, aks holda
  // har chizishda bittadan ishlovchi to'planib boraveradi.
  const onDocumentClick = (event) => {
    if (!combo.isConnected) {
      document.removeEventListener("click", onDocumentClick);
      return;
    }
    if (!panel.hidden && !combo.contains(event.target)) close();
  };
  document.addEventListener("click", onDocumentClick);
  // Qiymat boshqa joydan o'zgarsa (masalan formani to'ldirish), tugma matni
  // ham yangilanishi kerak.
  select.addEventListener("change", showValue);
  // Majburiy maydon bo'sh qolsa brauzer yashirilgan <select> ni fokuslay
  // olmaydi -- ro'yxatni o'zimiz ochamiz.
  select.addEventListener("invalid", () => { open(); });

  showValue();
  draw();
}

function bindSelectSearch(root = app) {
  root.querySelectorAll("[data-select-filter]").forEach((search) => {
    if (search.dataset.searchBound) return;
    search.dataset.searchBound = "true";
    const select = root.querySelector(`select[name="${search.dataset.selectFilter}"]`);
    if (!select) return;
    buildCombobox(search.closest(".select-search") || search, search, select);
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

// Ketayotgan so'rovlar soni. Formani ikki marta yuborishdan himoya shu
// hisobga tayanadi: so'rovlar tugagach «bo'sh» hodisasi chiqadi va tugmalar
// qaytadan ochiladi.
let pendingRequests = 0;

function requestStarted() {
  pendingRequests += 1;
}

function requestFinished() {
  pendingRequests = Math.max(0, pendingRequests - 1);
  if (pendingRequests === 0) document.dispatchEvent(new CustomEvent("bitum:idle"));
}

async function api(path, options = {}) {
  requestStarted();
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } finally {
    requestFinished();
  }
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
  requestStarted();
  let response;
  try {
    response = await fetch(path, { method: options.method || "POST", body: formData });
  } finally {
    requestFinished();
  }
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
  observeDynamicForms();
  guardDoubleSubmit();
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
  // Watching #app alone left everything outside it -- the topbar user role, the
  // notifications dropdown -- in Latin, because those are written after the
  // one-off localizeDom(document.body) above. Topbar mutations are rare, so
  // widening the root costs nothing measurable.
  observer.observe(document.body, { childList: true, subtree: true });
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

// Kept in step with components/FormField.js -- this branch runs only if that
// script has not loaded, and a field that silently drops its constraints there
// would be worse than no fallback at all.
const VALIDATION_ATTRS = ["pattern", "maxlength", "minlength", "inputmode", "placeholder", "title", "autocomplete", "min", "max", "step"];

function validationAttrs(options = {}) {
  return VALIDATION_ATTRS
    .filter((key) => options[key] !== undefined && options[key] !== null && options[key] !== "")
    .map((key) => `${key}="${esc(options[key])}"`)
    .join(" ");
}

function textField(name, label, value = "", type = "text", options = {}) {
  const cfg = fieldOptions(options);
  if (window.BitumFrontend?.components?.textField) {
    return window.BitumFrontend.components.textField({ name, label, value, type, ...cfg });
  }
  const mark = cfg.required ? ' <span class="required-mark">*</span>' : "";
  const extra = validationAttrs(cfg);
  if (type === "number") {
    // trimFraction: qiymat serverdan keladi, klaviaturadan emas. Decimal(18,3)
    // «200.000» bo'lib serializatsiya qilinadi va kesilmasa maydonda
    // «200,000» ko'rinadi -- tizimning qolgan joyida minglar probel bilan
    // ajratilgani uchun bu ikki yuz ming tonna deb o'qiladi.
    return `<label>${label}${mark}<input type="text" inputmode="decimal" data-format-number name="${name}" value="${esc(formatNumberInputValue(value, { trimFraction: true }))}" ${extra} ${cfg.required ? "required" : ""} /></label>`;
  }
  if (type === "decimal") {
    return `<label>${label}${mark}<input type="number" data-raw-number ${cfg.step === undefined ? 'step="any"' : ""} name="${name}" value="${esc(value ?? "")}" ${extra} ${cfg.required ? "required" : ""} /></label>`;
  }
  return `<label>${label}${mark}<input type="${type}" name="${name}" value="${esc(value ?? "")}" ${extra} ${cfg.required ? "required" : ""} /></label>`;
}

function readonlyField(name, label, value = "", type = "text", options = {}) {
  const cfg = fieldOptions(options);
  if (window.BitumFrontend?.components?.textField) {
    return window.BitumFrontend.components.textField({ name, label, value, type, readonly: true, ...cfg });
  }
  return `<label>${label}<input type="${type}" name="${name}" value="${esc(value ?? "")}" readonly /></label>`;
}

// Sana arifmetikasi UTC da bajariladi va UTC da qaytariladi.
//
// Ilgari sana `new Date("2026-08-24T00:00:00")` bilan -- ya'ni MAHALLIY yarim
// tunda -- o'qilib, `toISOString()` bilan qaytarilardi. Toshkent UTC+5, shuning
// uchun mahalliy yarim tun UTC da avvalgi kunning 19:00 i: har bir natija bir
// kunga kam chiqardi. «Partiya to'lovi muddati: 7 kun» aslida 6 kun berardi,
// avans muddati esa dam olish kuniga tushib qolardi.
function parseIsoDate(dateString) {
  const parts = String(dateString || "").slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return new Date(NaN);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function toIsoDate(date) {
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

// Bugungi sana foydalanuvchining soatiga ko'ra, UTC ga ko'ra emas: soat 05:00
// gacha `new Date().toISOString()` kechagi kunni qaytarardi.
function todayIso() {
  const now = new Date();
  return toIsoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function addDays(dateString, days = 0) {
  const value = Number(days);
  const date = parseIsoDate(dateString);
  if (Number.isNaN(date.getTime())) return "";
  if (Number.isFinite(value)) date.setUTCDate(date.getUTCDate() + value);
  return toIsoDate(date);
}

// Skips Saturday/Sunday only (standard Mon-Fri work week) — does not account
// for public holidays, since this app has no holiday calendar to check against.
function addBusinessDays(dateString, days = 0) {
  const value = Number(days);
  const date = parseIsoDate(dateString);
  if (Number.isNaN(date.getTime())) return "";
  if (!Number.isFinite(value) || value === 0) return toIsoDate(date);
  const step = value > 0 ? 1 : -1;
  let remaining = Math.trunc(Math.abs(value));
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + step);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return toIsoDate(date);
}

function textArea(name, label, value = "", options = {}) {
  const cfg = fieldOptions(options);
  if (window.BitumFrontend?.components?.textareaField) {
    return window.BitumFrontend.components.textareaField({ name, label, value, ...cfg });
  }
  return `<label>${label}${cfg.required ? ' <span class="required-mark">*</span>' : ""}<textarea name="${name}" ${validationAttrs(cfg)} ${cfg.required ? "required" : ""}>${esc(value ?? "")}</textarea></label>`;
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

// Bazada `unit_price` doim QQSsiz narxni anglatadi -- backend `calculate_item`
// undan miqdorga ko'paytirib oraliq summani, so'ng QQS ni hisoblaydi. Agar
// foydalanuvchi qog'ozdagi QQS bilan narxni kiritsa va u shundayligicha
// saqlansa, soliq ikki marta qo'shiladi: 195 000 000 lik shartnoma
// 218 400 000 bo'lib chiqadi.
//
// Shuning uchun kiritish joyida «narx QQS bilan» belgisi bor va bu ikki
// yordamchi qiymatni ikki tomonga o'giradi.
const DEFAULT_VAT_RATE = 12;

function vatFactor(vatRate) {
  const rate = vatRate === "" || vatRate === null || vatRate === undefined ? DEFAULT_VAT_RATE : numberValue(vatRate);
  return 1 + rate / 100;
}

// QQS bilan kiritilgan narxdan QQSsiz narxni ajratib oladi.
function netUnitPrice(value, vatRate, includesVat = true) {
  const price = numberValue(value);
  if (!includesVat) return price;
  const factor = vatFactor(vatRate);
  return factor ? price / factor : price;
}

// QQSsiz narxdan QQS bilan narxni chiqaradi.
function grossUnitPrice(value, vatRate) {
  return numberValue(value) * vatFactor(vatRate);
}

// Narx ustuni Numeric(18,4): to'rtta kasr xonasi tiyinlardan ancha aniq va
// 600 000 / 1.12 kabi cheksiz kasrni yo'qotmaydi.
function roundUnitPrice(value) {
  return Math.round(numberValue(value) * 10000) / 10000;
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
  // trimFraction is for a value arriving from the API rather than from the
  // keyboard. A Decimal(18,3) serialises as "200.000", and keeping those zeros
  // showed "200,000" in the box -- read as two hundred thousand tonnes, because
  // everywhere else in the app the thousands separator is a space. While
  // someone is actually typing the zeros must stay, or "200.50" could never be
  // reached.
  const shown = options.trimFraction ? fraction.replace(/0+$/, "") : fraction;
  const separator = shown || (hasSeparator && !options.trimFraction) ? "," : "";
  return `${negative ? "-" : ""}${grouped}${separator}${shown}`;
}

// A field that states its rule in `title` should say that rule when it is
// rejected. Without this the browser shows its own generic message, in its own
// language -- "Please match the requested format" told nobody what the format
// was, in an interface that is otherwise entirely in Uzbek.
// Brauzerning o'z xabarlari interfeys tilidan mustaqil: hisob-faktura oynasida
// partiya tanlanmasa «Please select an item in the list» chiqardi. Har bir
// buzilish turi uchun o'z jumlamiz bor, shunda xabar qolgan hamma narsa kabi
// tarjima qilinadi.
const VALIDITY_MESSAGES = [
  ["valueMissing", "Bu maydonni to'ldiring."],
  ["typeMismatch", "Kiritilgan qiymat mos formatda emas."],
  ["patternMismatch", "Kiritilgan qiymat talab qilingan ko'rinishda emas."],
  ["tooShort", "Kiritilgan qiymat juda qisqa."],
  ["tooLong", "Kiritilgan qiymat juda uzun."],
  ["rangeUnderflow", "Kiritilgan qiymat ruxsat etilganidan kichik."],
  ["rangeOverflow", "Kiritilgan qiymat ruxsat etilganidan katta."],
  ["stepMismatch", "Kiritilgan qiymat ruxsat etilgan qadamga mos emas."],
  ["badInput", "Kiritilgan qiymatni o'qib bo'lmadi."],
];

const MSG_SELECT_FROM_LIST = "Ro'yxatdan tanlang.";

function validationMessageFor(field) {
  // `title` faqat cheklovi bor maydonda xabar bo'ladi -- boshqa joyda u oddiy
  // maslahat matni va uni xatoga aylantirish mumkin emas.
  const constrained = ["pattern", "min", "max", "minlength", "maxlength", "step"].some((attr) =>
    field.hasAttribute(attr)
  );
  if (field.title && constrained) return localizeMessage(field.title);
  if (field.validity.valueMissing && (field.tagName === "SELECT" || field.type === "radio")) {
    return localizeMessage(MSG_SELECT_FROM_LIST);
  }
  const found = VALIDITY_MESSAGES.find(([key]) => field.validity[key]);
  return found ? localizeMessage(found[1]) : "";
}

function setupFieldValidationMessages(root = document) {
  const selector = "input, textarea, select";
  const fields = [
    ...(root instanceof Element && root.matches(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
  fields.forEach((field) => {
    if (field.dataset.validityBound) return;
    field.dataset.validityBound = "true";
    field.addEventListener("invalid", () => {
      if (field.validity.valid) return;
      const message = validationMessageFor(field);
      if (!message) return;
      field.setCustomValidity(message);
      // Brauzerning o'z ko'chib yuruvchi xabariga tayanib bo'lmaydi: u
      // birinchi bosishdayoq yo'qoladi va ba'zi holatlarda umuman
      // ko'rsatilmaydi. Oyna ochiq bo'lsa, xabar oynada ham qoladi.
      const backdrop = field.closest(".modal-backdrop:not(#app-dialog)");
      if (backdrop) {
        showModalError(message, backdrop.querySelector("form") || backdrop);
        field.classList.add("field-invalid");
        const clear = () => {
          field.classList.remove("field-invalid");
          field.removeEventListener("input", clear);
          field.removeEventListener("change", clear);
        };
        field.addEventListener("input", clear);
        field.addEventListener("change", clear);
      }
    });
    // Cleared on edit, otherwise the field stays invalid after being corrected.
    const clear = () => field.setCustomValidity("");
    field.addEventListener("input", clear);
    field.addEventListener("change", clear);
  });
}

function setupFormattedNumberInputs(root = document) {
  // data-raw-number opts a field out. Thousands grouping is right for money and
  // destructive for a value whose decimals carry meaning -- a coordinate typed
  // as 41.311081 would be regrouped and lose its precision, and converting the
  // input to text silently drops the min/max the browser was enforcing.
  const selector = "input[data-format-number]:not([data-raw-number]), input[type='number']:not([data-raw-number])";
  const inputs = [
    ...(root instanceof Element && root.matches(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
  inputs.forEach((input) => {
    if (input.type === "number") input.type = "text";
    input.inputMode = "decimal";
    input.dataset.formatNumber = "true";
    // Setup runs once over a value that came from the server; the input
    // handler below runs over what the user is typing. Only the first may
    // tidy the fraction.
    input.value = formatNumberInputValue(input.value, { trimFraction: true });
    if (input.dataset.formatNumberBound) return;
    input.dataset.formatNumberBound = "true";
    // Maydonda turgan "0" ni tanlamay ustiga yozish 25 000 000 ni
    // 250 000 000 ga aylantirardi: sichqoncha nolning chap tomoniga tushsa,
    // terilgan raqamlar nolning oldiga yozilib, qiymat o'n barobar oshardi.
    // Fokusda butun qiymatni tanlaymiz, shunda birinchi bosilgan tugma uni
    // almashtiradi. Sichqoncha tugmasi qo'yib yuborilganda brauzer tanlovni
    // bekor qilishi mumkin, shuning uchun mouseup bir marta to'xtatiladi.
    input.addEventListener("focus", () => {
      input.dataset.selectOnMouseUp = "true";
      input.select();
    });
    input.addEventListener("mouseup", (event) => {
      if (input.dataset.selectOnMouseUp !== "true") return;
      delete input.dataset.selectOnMouseUp;
      // Foydalanuvchi ataylab bir qismini belgilagan bo'lsa, unga tegmaymiz.
      if (input.selectionStart === input.selectionEnd) event.preventDefault();
    });
    input.addEventListener("blur", () => { delete input.dataset.selectOnMouseUp; });
    input.addEventListener("input", () => {
      delete input.dataset.selectOnMouseUp;
      const cursorAtEnd = input.selectionStart === input.value.length;
      input.value = formatNumberInputValue(input.value);
      if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
    });
  });
}

// #app ichidagina kuzatish modallarni chetda qoldirardi: ular document.body ga
// qo'shiladi, shuning uchun hisob-faktura oynasidagi summa maydoni jonli
// formatlanmasdi -- avtomatik to'ldirilgani «1 724 800 000», qo'lda kiritilgani
// esa «25000000» bo'lib qolardi. Til kuzatuvchisi allaqachon body ni kuzatadi;
// bular ham shu yerdan boshqariladi.
// Formani ikki marta yuborish -- BIT-2026-0005 shartnomasi shu tarzda ikki
// nusxada yaratilgan: PDF yuklanayotgan yetti soniya davomida ekranda hech
// narsa o'zgarmagan va operator tugmani qayta bosgan.
//
// Yuborish paytida saqlash tugmalari yopiladi va «Saqlanmoqda...» deb turadi.
// Ular barcha so'rovlar tugagach qaytadan ochiladi; agar ishlovchi umuman
// so'rov yubormasa (masalan tekshiruv xatosi), qisqa vaqtdan keyin ochiladi.
const SUBMIT_IDLE_FALLBACK_MS = 400;
const MSG_SAVING = "Saqlanmoqda...";

function guardDoubleSubmit() {
  if (document.body.dataset.submitGuardBound) return;
  document.body.dataset.submitGuardBound = "true";
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.submitBusy === "true") return;
    const buttons = [...form.querySelectorAll('button[type="submit"], button:not([type])')];
    if (!buttons.length) return;
    form.dataset.submitBusy = "true";
    const labels = buttons.map((button) => button.textContent);
    buttons.forEach((button, index) => {
      button.disabled = true;
      if (index === 0) button.textContent = localizeText(MSG_SAVING);
    });
    const release = () => {
      document.removeEventListener("bitum:idle", release);
      window.clearTimeout(timer);
      delete form.dataset.submitBusy;
      buttons.forEach((button, index) => {
        button.disabled = false;
        button.textContent = labels[index];
      });
    };
    const timer = window.setTimeout(() => {
      if (pendingRequests === 0) release();
    }, SUBMIT_IDLE_FALLBACK_MS);
    document.addEventListener("bitum:idle", release);
  }, true);
}

function observeDynamicForms() {
  if (document.body.dataset.dynamicFormObserverBound) return;
  document.body.dataset.dynamicFormObserverBound = "true";
  const prepare = (node) => {
    if (!(node instanceof Element)) return;
    setupFormattedNumberInputs(node);
    setupFieldValidationMessages(node);
  };
  prepare(document.body);
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach(prepare));
  }).observe(document.body, { childList: true, subtree: true });
}

function moneyInputField(name, label, value = "", options = {}) {
  const cfg = fieldOptions(options);
  return `<label>${label}${cfg.required ? ' <span class="required-mark">*</span>' : ""}<input type="text" inputmode="decimal" data-format-number name="${name}" value="${esc(formatNumberInputValue(value, { trimFraction: true }))}" ${cfg.required ? "required" : ""} /></label>`;
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
  if (!unit) return amount;
  // Plain text, never markup. Wrapping the unit in its own element to get it
  // translated meant every caller that assigns to textContent -- the wizard
  // totals, the batch quantity summaries, the supplier dialogs -- printed the
  // tags as literal text and the number became unreadable. The unit is a small
  // closed vocabulary, so it can simply be looked up here and the result stays
  // a string that is safe anywhere.
  return `${amount} ${localizeText(unit)}`;
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

// Shapes the browser can check. The server enforces the same rules -- these
// exist so a mistake is caught under the field that caused it, and so a phone
// or an account number opens a number pad on a touch screen.
const CLIENT_FIELD_RULES = {
  name: { required: true, maxlength: 255, autocomplete: "organization" },
  inn: {
    required: true,
    pattern: "[0-9]{9}",
    maxlength: 9,
    inputmode: "numeric",
    placeholder: "123456789",
    title: "STIR 9 ta raqamdan iborat bo'lishi kerak.",
  },
  oked: {
    pattern: "[0-9]{5}",
    maxlength: 5,
    inputmode: "numeric",
    placeholder: "42110",
    title: "OKED 5 ta raqamdan iborat bo'lishi kerak.",
  },
  phone: {
    pattern: "\\+998[0-9]{9}",
    maxlength: 13,
    inputmode: "tel",
    placeholder: "+998901234567",
    title: "Telefon raqami +998 bilan boshlanib, 9 ta raqam bilan davom etishi kerak.",
  },
  email: { maxlength: 255, inputmode: "email", placeholder: "info@korxona.uz" },
  mfo: {
    pattern: "[0-9]{5}",
    maxlength: 5,
    inputmode: "numeric",
    placeholder: "00014",
    title: "MFO 5 ta raqamdan iborat bo'lishi kerak.",
  },
  account_number: {
    pattern: "[0-9]{20}",
    maxlength: 20,
    inputmode: "numeric",
    placeholder: "20208000000000000001",
    title: "Hisob raqami 20 ta raqamdan iborat bo'lishi kerak.",
  },
  latitude: { min: -90, max: 90, inputmode: "decimal", placeholder: "41.311081", title: "Kenglik -90 va 90 orasida bo'lishi kerak." },
  longitude: { min: -180, max: 180, inputmode: "decimal", placeholder: "69.240562", title: "Uzunlik -180 va 180 orasida bo'lishi kerak." },
};

// The form has one slot per section, and that slot is the primary record --
// not whichever was created first. On a client with two contacts the old
// items[0] meant the form quietly edited a different row than the one the
// detail page marks as primary.
function primaryOf(items) {
  return (items || []).find((item) => item.is_primary) || (items || [])[0] || {};
}

// Reference data, loaded once per page load. A free-text region was the root
// of a whole class of problem: one "Toshkent sh." next to "Toshkent shahri"
// and the list filter silently splits in two, each half hiding the other's
// clients. Picking from a list makes that impossible.
let geoRegionsCache = null;

async function loadGeoRegions() {
  if (geoRegionsCache) return geoRegionsCache;
  try {
    geoRegionsCache = await api("/api/geo/regions");
  } catch (error) {
    geoRegionsCache = [];
  }
  return geoRegionsCache;
}

function geoRegionField(current = "") {
  const options = (geoRegionsCache || []).map(
    (region) => `<option value="${esc(region.name)}" ${region.name === current ? "selected" : ""}>${esc(region.name)}</option>`
  );
  // A region already stored but missing from the reference list would otherwise
  // be wiped by simply opening the form.
  const known = (geoRegionsCache || []).some((region) => region.name === current);
  const orphan = current && !known ? `<option value="${esc(current)}" selected>${esc(current)}</option>` : "";
  return `<label><span class="field-label-text">Hudud</span><select name="region" data-geo-region><option value="">Tanlanmagan</option>${orphan}${options.join("")}</select></label>`;
}

function geoDistrictField(region = "", current = "") {
  const entry = (geoRegionsCache || []).find((item) => item.name === region);
  const districts = entry ? entry.districts : [];
  const options = districts.map(
    (district) => `<option value="${esc(district.name)}" ${district.name === current ? "selected" : ""}>${esc(district.name)}</option>`
  );
  const orphan = current && !districts.some((d) => d.name === current) ? `<option value="${esc(current)}" selected>${esc(current)}</option>` : "";
  return `<label><span class="field-label-text">Tuman</span>
    <select name="district" data-geo-district><option value="">Tanlanmagan</option>${orphan}${options.join("")}</select>
    <small class="field-helper">Ro'yxatda yo'q bo'lsa, «Tuman qo'shish» tugmasi bilan qo'shing.</small>
    <button type="button" class="link-btn" data-geo-add-district>Tuman qo'shish</button></label>`;
}

// Re-renders the district list when the region changes, and lets a district be
// added to the reference table without leaving the form.
function bindGeoFields(root = document) {
  const regionSelect = root.querySelector("[data-geo-region]");
  const districtSelect = root.querySelector("[data-geo-district]");
  if (!regionSelect || !districtSelect) return;

  const districtsFor = (name) => ((geoRegionsCache || []).find((item) => item.name === name)?.districts || []);
  const fill = (selected = "") => {
    const list = districtsFor(regionSelect.value);
    districtSelect.innerHTML =
      `<option value="">Tanlanmagan</option>` +
      list.map((d) => `<option value="${esc(d.name)}" ${d.name === selected ? "selected" : ""}>${esc(d.name)}</option>`).join("");
    localizeDom(districtSelect);
  };

  regionSelect.addEventListener("change", () => fill());

  root.querySelector("[data-geo-add-district]")?.addEventListener("click", async () => {
    const region = (geoRegionsCache || []).find((item) => item.name === regionSelect.value);
    if (!region) {
      showToast("Avval hududni tanlang.", true);
      return;
    }
    const { confirmed, comment } = await appDialog({
      title: "Tuman qo'shish",
      intro: "Tuman tanlangan hududga qo'shiladi va boshqalar uni ro'yxatdan tanlaydi.",
      subject: region.name,
      confirmLabel: "Qo'shish",
      comment: { label: "Tuman nomi", placeholder: "Masalan: Shahrixon tumani", singleLine: true },
    });
    if (!confirmed) return;
    const name = (comment || "").trim();
    if (!name) return;
    try {
      const created = await api(`/api/geo/regions/${region.id}/districts`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (!region.districts.some((d) => d.id === created.id)) region.districts.push(created);
      region.districts.sort((a, b) => a.name.localeCompare(b.name));
      fill(created.name);
      showToast("Tuman qo'shildi.");
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function clientForm(client = null) {
  const contact = primaryOf(client?.contacts);
  const address = primaryOf(client?.addresses);
  const account = primaryOf(client?.bank_accounts);
  // Say so when there is more than one, and point at the page that manages
  // them all -- otherwise the form looks like the whole truth.
  const extra = (items, label, tab) =>
    (items || []).length > 1
      ? `<p class="form-hint">Bu mijozda ${items.length} ta ${label} bor. Bu yerda faqat birlamchisi tahrirlanadi — qolganlari <button type="button" class="link-btn" data-nav="/clients/${client.id}${tab}">mijoz kartochkasida</button>.</p>`
      : "";
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
            ${textField("name", "Mijoz nomi", client?.name, "text", CLIENT_FIELD_RULES.name)}
            ${textField("inn", "STIR", client?.inn, "text", CLIENT_FIELD_RULES.inn)}
            ${textField("oked", "OKED", client?.oked, "text", CLIENT_FIELD_RULES.oked)}
            ${textField("phone", "Telefon", client?.phone, "tel", CLIENT_FIELD_RULES.phone)}
            ${textField("email", "Email", client?.email, "email", CLIENT_FIELD_RULES.email)}
            ${textArea("notes", "Izohlar", client?.notes, { maxlength: 2000 })}
          </div>
        `)}
        ${section("Birlamchi kontakt shaxs", `
          ${extra(client?.contacts, "kontakt", "")}
          <div class="grid">
            ${textField("contact_full_name", "F.I.Sh.", contact.full_name, "text", { maxlength: 255, autocomplete: "name" })}
            ${textField("contact_position", "Lavozimi", contact.position, "text", { maxlength: 120 })}
            ${textField("contact_phone", "Telefon", contact.phone, "tel", CLIENT_FIELD_RULES.phone)}
            ${textField("contact_email", "Email", contact.email, "email", CLIENT_FIELD_RULES.email)}
            ${checkField("contact_is_primary", "Asosiy kontakt", contact.is_primary ?? true)}
            ${textArea("contact_comment", "Izoh", contact.comment, { maxlength: 1000 })}
          </div>
        `)}
        ${section("Manzil", `
          ${extra(client?.addresses, "manzil", "")}
          <div class="grid">
            ${selectField("address_type", "Manzil turi", addressTypes, address.address_type || "legal")}
            ${geoRegionField(address.region)}
            ${geoDistrictField(address.region, address.district)}
            ${textField("address", "Manzil", address.address, "text", { maxlength: 255 })}
            ${textField("latitude", "Kenglik", address.latitude, "decimal", CLIENT_FIELD_RULES.latitude)}
            ${textField("longitude", "Uzunlik", address.longitude, "decimal", CLIENT_FIELD_RULES.longitude)}
            ${textArea("address_comment", "Izoh", address.comment, { maxlength: 1000 })}
          </div>
        `)}
        ${section("Bank hisobi", `
          ${extra(client?.bank_accounts, "bank hisobi", "")}
          <div class="grid">
            ${textField("bank_name", "Bank nomi", account.bank_name, "text", { maxlength: 160 })}
            ${textField("mfo", "MFO", account.mfo, "text", CLIENT_FIELD_RULES.mfo)}
            ${textField("account_number", "Hisob raqami", account.account_number, "text", CLIENT_FIELD_RULES.account_number)}
            ${checkField("bank_is_primary", "Asosiy hisob", account.is_primary ?? true)}
            ${textArea("bank_comment", "Izoh", account.comment, { maxlength: 1000 })}
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

function opsPageShell(title, tabs, body, className = "") {
  return `<div class="page ops-page report-ops-page ${className}"><div class="ops-titlebar"><div class="ops-title-left"><h1>${title}</h1></div>${tabs?.length ? `<nav class="ops-tabs" aria-label="${title} ko'rinishlari">${tabs.map((tab) => `<button class="${tab.active ? "active" : ""}" type="button" ${tab.path ? `data-nav="${tab.path}"` : ""}>${tab.label}</button>`).join("")}</nav>` : ""}</div>${body}</div>`;
}

function summaryCards(items) {
  return `<div class="summary-grid">${items.map(([label, value, cls = ""]) => `<div class="summary-card ${cls}"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`;
}

function detailList(items) {
  return `<div class="detail-list">${items.map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}</div>`;
}

// A card subtitle mixes data with labels: a client name must not go through the
// dictionary, a status must. Built as one interpolated string the whole line
// became a single text node that matched no entry, so the labels stayed Latin
// while the same status showed in Cyrillic elsewhere on the page.
//
// Pass {value, raw: true} for anything that came from the database.
// Har bir filtr maydonining ko'rinadigan yorlig'i bo'ladi. Placeholder biror
// narsa yozilishi bilan yo'qoladi va foydalanuvchi qaysi maydonga qaraganini
// bilmay qoladi. Yorliqsiz select esa kengligini o'zi belgilay olmay, butun
// qatorni egallab, filtrlar ustma-ust tushib qolardi.
function opsFilterField(label, control) {
  return `<label class="ops-field"><span class="ops-field-label">${label}</span>${control}</label>`;
}

function subtitleLine(parts) {
  return parts
    .filter((part) => part && part.value !== null && part.value !== undefined && String(part.value) !== "")
    .map((part) => {
      const value = part.raw ? `<span data-noloc>${esc(part.value)}</span>` : `<span>${esc(part.value)}</span>`;
      // Yorliq alohida tugunda qoladi: «Buyurtma: ORD-...» bir butun matn
      // bo'lganda lug'atda mos kelmasdi va kirill rejimida ham lotincha
      // ko'rinardi.
      return part.label ? `<span>${esc(part.label)}</span><span data-noloc>: </span>${value}` : value;
    })
    .join('<span data-noloc> · </span>');
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

// Server warnings are written as "<sentence>: <value>". The sentence is a
// fixed phrase the dictionary knows; the value is whatever the document
// actually said and must be left alone -- transliterating a hex id or a
// catalog code would turn evidence into nonsense.
function warningParts(message) {
  const text = String(message ?? "");
  // If the dictionary already knows the whole sentence, leave it whole --
  // splitting it first was hiding messages that would have translated fine,
  // because any colon in the text broke the lookup.
  if (localizeText(text) !== text) return `<span>${esc(text)}</span>`;
  const at = text.indexOf(": ");
  if (at < 0) return `<span>${esc(text)}</span>`;
  return `<span>${esc(text.slice(0, at))}</span><span data-noloc>: ${esc(text.slice(at + 2))}</span>`;
}

function workflowWarningsPanel(messages, title = "E'tibor kerak") {
  const clean = messages.filter(Boolean);
  if (!clean.length) return "";
  return `<div class="workflow-warning"><strong>${fmt(title)}</strong><ul>${clean.map((message) => `<li>${warningParts(message)}</li>`).join("")}</ul></div>`;
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
  // Server farqni miqdorda ham, pulda ham hisoblab beradi va qaror qabul
  // qilinmaganini aytadi -- shunda ogohlantirish «farq bor» degan quruq
  // jumladan iborat bo'lmaydi.
  const differenceWarnings = batch.difference?.warnings || [];
  differenceWarnings.forEach((message) => warnings.push(message));
  // Shartnomadagi transport shartlari: yetkazib berish usuli va transport
  // to'lovi turi. Ikkalasi ham server tomonida tekshiriladi.
  (batch.transport_check?.warnings || []).forEach((message) => warnings.push(message));
  if (!differenceWarnings.length && qStatus.key === "difference") warnings.push("Yuklangan va qabul qilingan miqdor farq qiladi.");
  if (dStatus.key !== "complete") warnings.push("Hujjatlar hali to'liq yuklanmagan.");
  return warnings;
}

function batchWarningsPanel(batch) {
  const warnings = batchWarningMessages(batch);
  if (!warnings.length) return "";
  // warningParts: «matn: qiymat» ko'rinishidagi xabarning matn qismi lug'atdan
  // o'tadi, qiymati esa tegilmay qoladi. esc() bilan butun jumla bitta tugun
  // bo'lib qolar va lotincha ko'rinardi.
  return `<div class="workflow-warning"><strong>E'tibor kerak</strong><ul>${warnings.map((warning) => `<li>${warningParts(warning)}</li>`).join("")}</ul></div>`;
}

function batchNextAction(batch = {}) {
  const logistics = batch.logistics || {};
  const docs = batchDocumentStatus(batch);
  if (!logistics.id) return { title: "Logistika yozuvini yarating", button: "Logistika yaratish", path: `/delivery-batches/${batch.id}/edit` };
  if (logistics.status === "not_assigned") return { title: "Transportni biriktiring", button: "Transport biriktirish", modal: "transport" };
  if (["carrier_assigned", "vehicle_assigned", "loading"].includes(logistics.status) && !logistics.actual_pickup_date) return { title: "Haqiqiy yuklash sanasini kiriting", button: "Yuklandi deb belgilash", modal: "loading" };
  if (logistics.status === "loaded") return { title: "Yo'lga chiqdi deb belgilang", button: "Yo'lga chiqdi", action: "transit" };
  if (["in_transit", "arrived", "unloading"].includes(logistics.status) && !logistics.actual_delivery_date) return { title: "Yetkazilgan sanani kiriting", button: "Yetkazildi deb belgilash", modal: "delivery" };
  if (logistics.actual_delivery_date && !batchHasAcceptedInput(batch)) return { title: "Qabul qilingan miqdorni kiriting", button: "Qabul miqdorini kiritish", modal: "acceptance" };
  // Kamomad aniqlangan, lekin u bilan nima qilinishi hal qilinmagan -- aynan
  // shu yerda 2 tonna havoda qolib ketardi.
  if (batchHasAcceptedInput(batch) && batch.difference?.quantity > 0 && !batch.difference?.resolution) {
    return { title: "Qabul farqi bo'yicha qaror qabul qiling", button: "Farq bo'yicha qaror", modal: "acceptance" };
  }
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
      : action.modal === "acceptance"
        ? `<button class="btn primary" type="button" data-acceptance-confirmation>${fmt(action.button)}</button>`
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

function opsListPage({ className = "", title, tabs = [], createPath, createLabel = "Yaratish", clearPath, counter = "", statCards = [], formId, filters = "", extraActions = "", beforeTable = "", headers = [], rows = "", emptyText = "Ma'lumot topilmadi.", colspan = headers.length, footer = "" }) {
  return `<div class="page ops-page ${className}"><div class="ops-titlebar"><div class="ops-title-left"><h1>${title}</h1></div>${tabs.length ? `<nav class="ops-tabs" aria-label="${title} ko'rinishlari">${tabs.map((tab) => `<button class="${tab.active ? "active" : ""}" type="button" ${tab.path ? `data-nav="${tab.path}"` : ""}>${tab.label}</button>`).join("")}</nav>` : ""}</div>${statCards.length ? summaryCards(statCards.map((c) => [c.label, c.value, c.cls])) : ""}<div class="ops-commandbar"><div class="ops-command-left">${createPath ? `<button class="btn primary" data-nav="${createPath}">${createLabel}</button>` : ""}${clearPath ? `<button class="btn" type="button" data-nav="${clearPath}">Tozalash</button>` : ""}${counter ? `<span class="ops-counter">${counter}</span>` : ""}${extraActions}</div>${formId ? `<form class="ops-search" id="${formId}">${filters}<button class="ops-tool-btn primary" type="submit">Qidirish</button></form>` : ""}</div>${beforeTable}<section class="ops-table-card"><table class="ops-table"><thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${colspan}"><div class="empty">${emptyText}</div></td></tr>`}</tbody></table></section>${footer}</div>`;
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

function bindOpsSearch(formId, basePath, keys, keep = ["sort", "order"]) {
  document.querySelector(`#${formId}`)?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const next = new URLSearchParams();
    // The form only knows about its own fields, so a submit used to throw away
    // the chosen sort column and silently drop the list back to default order.
    const current = new URLSearchParams(location.search);
    keep.forEach((key) => {
      if (current.get(key)) next.set(key, current.get(key));
    });
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
