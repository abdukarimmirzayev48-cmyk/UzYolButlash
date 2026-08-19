const publicRequestSteps = [
  "Mijoz turi",
  "Korxona ma'lumotlari",
  "To'lov manbasi",
  "Mahsulot talabi",
  "Kalendar grafik",
  "Tasdiqlash",
];

const publicRequestMonths = [
  [1, "Yanvar"],
  [2, "Fevral"],
  [3, "Mart"],
  [4, "Aprel"],
  [5, "May"],
  [6, "Iyun"],
  [7, "Iyul"],
  [8, "Avgust"],
  [9, "Sentabr"],
  [10, "Oktabr"],
  [11, "Noyabr"],
  [12, "Dekabr"],
];

const publicRequestDraftKey = "uzyolbutlash.publicRequestDraft";

const publicRequestInitialState = {
  step: 0,
  products: [],
  loadingProducts: false,
  lookingUpInn: false,
  submitting: false,
  success: null,
  errors: {},
  confirmed: false,
  form: {
    customer_type: "",
    payment_source: "",
    company_name: "",
    inn: "",
    oked: "",
    director_full_name: "",
    legal_address: "",
    bank_account: "",
    bank_name: "",
    mfo: "",
    phone: "",
    contact_full_name: "",
    contact_phone: "",
    product_id: "",
    total_quantity: "",
    unit: "",
    schedule: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1, quantity: "" }],
  },
};

let publicRequestState = publicRequestLoadDraft();

function publicRequestLoadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(publicRequestDraftKey) || "null");
    if (saved?.form) return { ...structuredClone(publicRequestInitialState), form: { ...publicRequestInitialState.form, ...saved.form }, step: saved.step || 0 };
  } catch (_) {
    // Ignore a broken local draft; the form can start cleanly.
  }
  return structuredClone(publicRequestInitialState);
}

function publicRequestSaveDraft() {
  localStorage.setItem(publicRequestDraftKey, JSON.stringify({ step: publicRequestState.step, form: publicRequestState.form }));
}

async function renderPublicTalabnoma() {
  if (!publicRequestState.products.length && !publicRequestState.loadingProducts) {
    publicRequestState.loadingProducts = true;
    app.innerHTML = publicRequestShell(`<div class="public-card"><div class="empty">Mahsulotlar yuklanmoqda...</div></div>`);
    try {
      const response = await api("/api/public/products");
      publicRequestState.products = response.data || [];
    } catch (error) {
      publicRequestState.errors.products = error.message;
    } finally {
      publicRequestState.loadingProducts = false;
    }
  }

  app.innerHTML = publicRequestState.success
    ? publicRequestSuccess()
    : publicRequestShell(publicRequestStepContent());
  bindPublicRequestEvents();
  setupFormattedNumberInputs(app);
}

function publicRequestShell(content) {
  return `
    <div class="public-request-page">
      <header class="public-request-header">
        <a class="public-brand" href="/talabnoma"><span class="brand-mark">B</span><strong>UzYolButlash</strong></a>
        <div>
          <h1>Talabnoma yuborish</h1>
          <p>Bitum mahsulotlari bo'yicha talabnoma yuborish xizmati</p>
        </div>
        <a class="btn" href="/dashboard">ERP tizimiga kirish</a>
      </header>
      <div class="public-request-container">
        ${publicRequestStepper()}
        ${content}
        <footer class="public-request-footer">
          <strong>&copy; UzYolButlash</strong>
          <span>Talabnomalar mas'ul xodimlar tomonidan ko'rib chiqiladi.</span>
        </footer>
      </div>
    </div>
  `;
}

function publicRequestStepper() {
  return `
    <nav class="public-stepper" aria-label="Talabnoma bosqichlari">
      ${publicRequestSteps.map((label, index) => `
        <button type="button" class="${index === publicRequestState.step ? "active" : ""} ${index < publicRequestState.step ? "done" : ""}" data-public-step="${index}" ${index > publicRequestState.step ? "disabled" : ""}>
          <span>${index + 1}</span>
          <strong>${label}</strong>
        </button>
      `).join("")}
    </nav>
  `;
}

function publicRequestStepContent() {
  const step = publicRequestState.step;
  const body = [
    publicRequestCustomerTypeStep,
    publicRequestCompanyStep,
    publicRequestPaymentStep,
    publicRequestProductStep,
    publicRequestScheduleStep,
    publicRequestConfirmStep,
  ][step]();
  return `
    <section class="public-card">
      ${body}
      ${publicRequestActions()}
    </section>
  `;
}

function publicRequestActions() {
  const isLast = publicRequestState.step === publicRequestSteps.length - 1;
  return `
    <div class="public-actions">
      <button class="btn" type="button" data-public-back ${publicRequestState.step === 0 ? "disabled" : ""}>Orqaga</button>
      <button class="btn primary" type="button" data-public-next ${publicRequestState.submitting ? "disabled" : ""}>
        ${isLast ? (publicRequestState.submitting ? "Yuborilmoqda..." : "Talabnomani yuborish") : "Davom etish"}
      </button>
    </div>
  `;
}

function publicError(key) {
  return publicRequestState.errors[key] ? `<p class="public-error">${fmt(publicRequestState.errors[key])}</p>` : "";
}

function publicRequestChoice(name, value, title, description) {
  const selected = publicRequestState.form[name] === value;
  return `
    <button class="public-choice ${selected ? "selected" : ""}" type="button" data-public-choice="${name}" data-value="${value}">
      <strong>${title}</strong>
      <span>${description}</span>
    </button>
  `;
}

function publicRequestCustomerTypeStep() {
  return `
    <div class="public-card-header">
      <h2>Mijoz turini tanlang</h2>
      <p>Talabnomani yuboruvchi tashkilot turini belgilang.</p>
    </div>
    <div class="public-choice-grid">
      ${publicRequestChoice("customer_type", "internal_organization", "Tizim tashkiloti", "STIR orqali tashkilot ma'lumotlari avtomatik topiladi.")}
      ${publicRequestChoice("customer_type", "external_customer", "Tashqi mijoz", "Korxona ma'lumotlari qo'lda kiritiladi.")}
    </div>
    ${publicError("customer_type")}
  `;
}

function publicRequestCompanyStep() {
  const internal = publicRequestState.form.customer_type === "internal_organization";
  return `
    <div class="public-card-header">
      <h2>Korxona ma'lumotlari</h2>
      <p>${internal ? "Tashkilot ma'lumotlarini topish uchun STIR kiriting." : "Korxona ma'lumotlarini to'liq va aniq kiriting."}</p>
    </div>
    ${internal ? `
      <div class="public-lookup-row">
        ${publicInput("inn", "STIR", "text", "Tashkilot STIR raqami")}
        <button class="btn" type="button" data-public-inn-lookup ${publicRequestState.lookingUpInn ? "disabled" : ""}>${publicRequestState.lookingUpInn ? "Tekshirilmoqda..." : "Tekshirish"}</button>
      </div>
      ${publicError("inn_lookup")}
    ` : ""}
    <div class="public-form-grid">
      ${publicInput("company_name", "Korxona nomi", "text", "", true)}
      ${internal ? "" : publicInput("inn", "STIR")}
      ${publicInput("oked", "OKED")}
      ${publicInput("director_full_name", "Direktor F.I.Sh.")}
      ${publicTextarea("legal_address", "Yuridik manzil")}
      ${publicInput("bank_account", "Hisob raqami")}
      ${publicInput("bank_name", "Bank nomi")}
      ${publicInput("mfo", "MFO")}
      ${publicInput("phone", "Telefon raqami", "tel", "", true)}
      ${publicInput("contact_full_name", "Kontakt shaxs F.I.Sh.")}
      ${publicInput("contact_phone", "Kontakt telefon raqami", "tel")}
    </div>
    ${["company_name", "phone", "inn"].map(publicError).join("")}
  `;
}

function publicRequestPaymentStep() {
  return `
    <div class="public-card-header">
      <h2>To'lov manbasini tanlang</h2>
      <p>Talabnoma bo'yicha to'lov qaysi manba orqali amalga oshirilishini belgilang.</p>
    </div>
    <div class="public-choice-grid">
      ${publicRequestChoice("payment_source", "treasury", "G'azna", "To'lov davlat g'aznachiligi orqali amalga oshiriladi.")}
      ${publicRequestChoice("payment_source", "bank", "Bank", "To'lov bank hisob raqami orqali amalga oshiriladi.")}
    </div>
    ${publicError("payment_source")}
  `;
}

function publicRequestProductStep() {
  const selected = publicSelectedProduct();
  return `
    <div class="public-card-header">
      <h2>Mahsulot talabi</h2>
      <p>Kerakli mahsulot turi, markasi va umumiy miqdorini kiriting.</p>
    </div>
    ${publicRequestState.errors.products ? `<div class="public-error">${fmt(publicRequestState.errors.products)}</div>` : ""}
    <div class="public-form-grid">
      <label>Mahsulot <span class="required-mark">*</span>
        <select name="product_id" data-public-field>
          <option value="">Mahsulotni tanlang</option>
          ${publicRequestState.products.map((product) => `<option value="${product.id}" ${String(publicRequestState.form.product_id) === String(product.id) ? "selected" : ""}>${fmt(product.name)} · ${fmt(product.product_type)} · ${fmt(product.brand)} · ${fmt(product.unit)}</option>`).join("")}
        </select>
      </label>
      ${publicInput("total_quantity", "Umumiy miqdor", "number", "", true)}
      ${publicInput("unit", "O'lchov birligi", "text", "", false, true)}
      ${publicInput("product_brand", "Marka", "text", selected?.brand || "", false, true)}
    </div>
    ${selected ? `
      <div class="public-summary-card">
        <strong>Tanlangan mahsulot</strong>
        <dl>
          <div><dt>Mahsulot nomi</dt><dd>${fmt(selected.name)}</dd></div>
          <div><dt>Marka</dt><dd>${fmt(selected.brand)}</dd></div>
          <div><dt>O'lchov birligi</dt><dd>${fmt(selected.unit)}</dd></div>
        </dl>
      </div>
    ` : ""}
    ${publicError("product_id")}${publicError("total_quantity")}
  `;
}

function publicRequestScheduleStep() {
  const total = publicScheduleTotal();
  const requested = numberValue(publicRequestState.form.total_quantity);
  return `
    <div class="public-card-header">
      <h2>Kalendar grafik</h2>
      <p>Mahsulot qaysi oyda qancha miqdorda kerak bo'lishini kiriting. Masalan: Iyul oyida 50 tonna, Avgust oyida 50 tonna.</p>
    </div>
    <div class="public-table-wrap">
      <table class="public-schedule-table">
        <thead><tr><th>Yil</th><th>Oy</th><th>Miqdor</th><th>Amallar</th></tr></thead>
        <tbody>
          ${publicRequestState.form.schedule.map((row, index) => publicScheduleRow(row, index)).join("")}
        </tbody>
      </table>
    </div>
    <button class="btn" type="button" data-public-add-schedule>Oy qo'shish</button>
    <div class="public-total-grid">
      <div><span>Umumiy miqdor</span><strong>${fmtQty(requested, publicRequestState.form.unit)}</strong></div>
      <div><span>Grafik jami</span><strong data-schedule-total>${fmtQty(total, publicRequestState.form.unit)}</strong></div>
    </div>
    ${publicError("schedule")}
    <p class="public-warning" data-schedule-warning ${total && requested && total !== requested ? "" : "hidden"}>Kalendar grafikdagi jami miqdor umumiy miqdorga teng bo'lishi kerak.</p>
  `;
}

function publicScheduleRow(row, index) {
  return `
    <tr>
      <td><input type="text" inputmode="numeric" name="year_${index}" data-schedule-field="${index}:year" value="${esc(row.year || "")}" /></td>
      <td>
        <select name="month_${index}" data-schedule-field="${index}:month">
          ${publicRequestMonths.map(([key, label]) => `<option value="${key}" ${Number(row.month) === key ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </td>
      <td><input type="text" inputmode="decimal" data-format-number name="quantity_${index}" data-schedule-field="${index}:quantity" value="${esc(formatNumberInputValue(row.quantity || ""))}" /></td>
      <td><button class="link-btn danger" type="button" data-public-remove-schedule="${index}">O'chirish</button></td>
    </tr>
  `;
}

function publicRequestConfirmStep() {
  const selected = publicSelectedProduct();
  const form = publicRequestState.form;
  return `
    <div class="public-card-header">
      <h2>Ma'lumotlarni tasdiqlash</h2>
      <p>Talabnomani yuborishdan oldin kiritilgan ma'lumotlarni tekshiring.</p>
    </div>
    <div class="public-confirm-grid">
      ${publicSummarySection("Mijoz turi", [["Mijoz turi", form.customer_type === "internal_organization" ? "Tizim tashkiloti" : "Tashqi mijoz"]])}
      ${publicSummarySection("Korxona ma'lumotlari", [["Korxona nomi", form.company_name], ["STIR", form.inn], ["OKED", form.oked], ["Direktor F.I.Sh.", form.director_full_name], ["Yuridik manzil", form.legal_address], ["Telefon raqami", form.phone], ["Kontakt shaxs", form.contact_full_name], ["Kontakt telefon raqami", form.contact_phone]])}
      ${publicSummarySection("Rekvizitlar", [["Hisob raqami", form.bank_account], ["Bank nomi", form.bank_name], ["MFO", form.mfo]])}
      ${publicSummarySection("To'lov manbasi", [["To'lov manbasi", form.payment_source === "treasury" ? "G'azna" : "Bank"]])}
      ${publicSummarySection("Mahsulot talabi", [["Mahsulot nomi", selected?.name], ["Marka", selected?.brand], ["O'lchov birligi", form.unit], ["Umumiy miqdor", fmtQty(form.total_quantity, form.unit)]])}
      ${publicSummarySection("Kalendar grafik", form.schedule.map((row) => [`${row.year} · ${optionLabel(publicRequestMonths.map(([k, l]) => [String(k), l]), String(row.month))}`, fmtQty(row.quantity, form.unit)]).concat([["Grafik jami", fmtQty(publicScheduleTotal(), form.unit)]]))}
    </div>
    <label class="public-confirm-check">
      <input type="checkbox" name="confirmed" ${publicRequestState.confirmed ? "checked" : ""} data-public-confirmed />
      <span>Kiritilgan ma'lumotlarning to'g'riligini tasdiqlayman.</span>
    </label>
    <p class="helper-text">Talabnoma yuborilgandan so'ng ma'lumotlar ERP tizimida ko'rib chiqiladi.</p>
    ${publicError("confirmed")}${publicError("submit")}
  `;
}

function publicRequestSuccess() {
  const data = publicRequestState.success;
  return publicRequestShell(`
    <section class="public-card public-success-card">
      <div class="public-success-mark">✓</div>
      <h2>Talabnoma yuborildi</h2>
      <p>Talabnomangiz muvaffaqiyatli yuborildi. Mas'ul xodimlar tomonidan ko'rib chiqiladi.</p>
      <div class="public-total-grid">
        <div><span>Talabnoma raqami</span><strong>${fmt(data.request_number)}</strong></div>
        <div><span>Status</span><strong>${fmt(data.status_label || "Yangi")}</strong></div>
      </div>
      <div class="public-actions only">
        <button class="btn primary" type="button" data-public-new-request>Yangi talabnoma yuborish</button>
      </div>
    </section>
  `);
}

function publicInput(name, label, type = "text", placeholder = "", required = false, readonly = false) {
  const value = name === "product_brand" ? placeholder : publicRequestState.form[name];
  return `<label>${label}${required ? ' <span class="required-mark">*</span>' : ""}<input type="${type === "number" ? "text" : type}" ${type === "number" ? 'inputmode="decimal" data-format-number' : ""} name="${name}" data-public-field value="${esc(value || "")}" placeholder="${esc(placeholder && name !== "product_brand" ? placeholder : "")}" ${readonly ? "readonly" : ""} /></label>`;
}

function publicTextarea(name, label) {
  return `<label>${label}<textarea name="${name}" data-public-field>${esc(publicRequestState.form[name] || "")}</textarea></label>`;
}

function publicSummarySection(title, rows) {
  return `
    <div class="public-summary-section">
      <h3>${title}</h3>
      <dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${fmt(value)}</dd></div>`).join("")}</dl>
    </div>
  `;
}

function publicSelectedProduct() {
  return publicRequestState.products.find((product) => String(product.id) === String(publicRequestState.form.product_id));
}

function publicScheduleTotal() {
  return publicRequestState.form.schedule.reduce((sum, row) => sum + numberValue(row.quantity), 0);
}

function publicPhoneValid(value) {
  if (!value) return false;
  return /^\+?[0-9\s()\-]{7,20}$/.test(value);
}

function publicValidateStep(step = publicRequestState.step) {
  const form = publicRequestState.form;
  const errors = {};
  if (step === 0 && !form.customer_type) errors.customer_type = "Mijoz turi majburiy.";
  if (step === 1) {
    if (!form.company_name) errors.company_name = "Korxona nomi majburiy.";
    if (!form.phone) errors.phone = "Telefon raqami majburiy.";
    if (form.inn && !String(form.inn).match(/^\d+$/)) errors.inn = "STIR faqat raqamlardan iborat bo'lishi kerak.";
    if (form.phone && !publicPhoneValid(form.phone)) errors.phone = "Telefon raqami noto'g'ri formatda kiritilgan.";
  }
  if (step === 2 && !form.payment_source) errors.payment_source = "To'lov manbasi majburiy.";
  if (step === 3) {
    if (!form.product_id) errors.product_id = "Mahsulot majburiy.";
    if (numberValue(form.total_quantity) <= 0) errors.total_quantity = "Umumiy miqdor 0 dan katta bo'lishi kerak.";
  }
  if (step === 4) {
    const schedule = form.schedule.filter((row) => row.year || row.month || row.quantity);
    if (!schedule.length) errors.schedule = "Kalendar grafik majburiy.";
    if (schedule.some((row) => Number(row.month) < 1 || Number(row.month) > 12)) errors.schedule = "Oy qiymati 1 dan 12 gacha bo'lishi kerak.";
    if (schedule.some((row) => numberValue(row.quantity) <= 0)) errors.schedule = "Grafikdagi miqdor 0 dan katta bo'lishi kerak.";
    if (publicScheduleTotal() !== numberValue(form.total_quantity)) errors.schedule = "Kalendar grafikdagi jami miqdor umumiy miqdorga teng bo'lishi kerak.";
  }
  if (step === 5 && !publicRequestState.confirmed) errors.confirmed = "Ma'lumotlarning to'g'riligini tasdiqlashingiz kerak.";
  publicRequestState.errors = errors;
  return !Object.keys(errors).length;
}

function publicRequestPayload() {
  const form = publicRequestState.form;
  return {
    customer_type: form.customer_type,
    payment_source: form.payment_source,
    company_name: form.company_name,
    inn: form.inn || null,
    oked: form.oked || null,
    director_full_name: form.director_full_name || null,
    legal_address: form.legal_address || null,
    bank_account: form.bank_account || null,
    bank_name: form.bank_name || null,
    mfo: form.mfo || null,
    phone: form.phone,
    contact_full_name: form.contact_full_name || null,
    contact_phone: form.contact_phone || null,
    product_id: Number(form.product_id),
    total_quantity: normalizeNumberInputValue(form.total_quantity),
    unit: form.unit,
    schedule: form.schedule.map((row) => ({
      year: Number(row.year),
      month: Number(row.month),
      quantity: normalizeNumberInputValue(row.quantity),
    })),
  };
}

function bindPublicRequestEvents() {
  app.querySelectorAll("[data-public-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.publicStep);
      if (step <= publicRequestState.step) {
        publicRequestState.step = step;
        publicRequestState.errors = {};
        publicRequestSaveDraft();
        renderPublicTalabnoma();
      }
    });
  });
  app.querySelectorAll("[data-public-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      publicRequestState.form[button.dataset.publicChoice] = button.dataset.value;
      publicRequestState.errors = {};
      publicRequestSaveDraft();
      renderPublicTalabnoma();
    });
  });
  app.querySelectorAll("[data-public-field]").forEach((input) => {
    input.addEventListener("input", () => {
      publicRequestState.form[input.name] = input.dataset.formatNumber !== undefined
        ? normalizeNumberInputValue(input.value)
        : input.value.trim();
      publicRequestState.errors = {};
      publicRequestSaveDraft();
    });
    input.addEventListener("change", () => {
      publicRequestState.form[input.name] = input.dataset.formatNumber !== undefined
        ? normalizeNumberInputValue(input.value)
        : input.value.trim();
      if (input.name === "product_id") {
        const product = publicSelectedProduct();
        publicRequestState.form.unit = product?.unit || "";
        renderPublicTalabnoma();
        return;
      }
      publicRequestSaveDraft();
    });
  });
  app.querySelectorAll("[data-schedule-field]").forEach((input) => {
    // Neither event re-renders: the totals refresh in place and the number
    // formatting is handled by setupFormattedNumberInputs. Re-rendering on
    // change meant that clicking "Davom etish" straight after typing rebuilt
    // the step under the pointer, so the first click was swallowed.
    input.addEventListener("input", () => publicUpdateScheduleField(input, false));
    input.addEventListener("change", () => publicUpdateScheduleField(input, false));
  });
  app.querySelector("[data-public-add-schedule]")?.addEventListener("click", () => {
    publicRequestState.form.schedule.push({ year: new Date().getFullYear(), month: 1, quantity: "" });
    publicRequestSaveDraft();
    renderPublicTalabnoma();
  });
  app.querySelectorAll("[data-public-remove-schedule]").forEach((button) => {
    button.addEventListener("click", () => {
      publicRequestState.form.schedule.splice(Number(button.dataset.publicRemoveSchedule), 1);
      if (!publicRequestState.form.schedule.length) {
        publicRequestState.form.schedule.push({ year: new Date().getFullYear(), month: 1, quantity: "" });
      }
      publicRequestSaveDraft();
      renderPublicTalabnoma();
    });
  });
  app.querySelector("[data-public-inn-lookup]")?.addEventListener("click", publicLookupInn);
  app.querySelector("[data-public-confirmed]")?.addEventListener("change", (event) => {
    publicRequestState.confirmed = event.currentTarget.checked;
    publicRequestState.errors = {};
    renderPublicTalabnoma();
  });
  app.querySelector("[data-public-back]")?.addEventListener("click", () => {
    if (publicRequestState.step > 0) {
      publicRequestState.step -= 1;
      publicRequestState.errors = {};
      publicRequestSaveDraft();
      renderPublicTalabnoma();
    }
  });
  app.querySelector("[data-public-next]")?.addEventListener("click", publicNextStep);
  app.querySelector("[data-public-new-request]")?.addEventListener("click", () => {
    localStorage.removeItem(publicRequestDraftKey);
    publicRequestState = structuredClone(publicRequestInitialState);
    renderPublicTalabnoma();
  });
}

function publicUpdateScheduleField(input, rerender = true) {
  const [index, key] = input.dataset.scheduleField.split(":");
  publicRequestState.form.schedule[Number(index)][key] = key === "quantity" ? normalizeNumberInputValue(input.value) : input.value;
  publicRequestSaveDraft();
  if (rerender) {
    renderPublicTalabnoma();
    return;
  }
  // While typing, refresh only the total and the mismatch warning. A full
  // re-render here would rebuild the input and throw away focus and caret.
  publicRefreshScheduleTotals();
}

function publicRefreshScheduleTotals() {
  const total = publicScheduleTotal();
  const requested = numberValue(publicRequestState.form.total_quantity);
  const totalNode = app.querySelector("[data-schedule-total]");
  if (totalNode) totalNode.textContent = localizeText(fmtQty(total, publicRequestState.form.unit));
  const warning = app.querySelector("[data-schedule-warning]");
  if (warning) warning.hidden = !(total && requested && total !== requested);
}

async function publicLookupInn() {
  const inn = publicRequestState.form.inn;
  if (!inn || !inn.match(/^\d+$/)) {
    publicRequestState.errors = { inn: "STIR faqat raqamlardan iborat bo'lishi kerak." };
    renderPublicTalabnoma();
    return;
  }
  publicRequestState.lookingUpInn = true;
  publicRequestState.errors = {};
  renderPublicTalabnoma();
  try {
    const response = await api(`/api/public/company-by-inn?inn=${encodeURIComponent(inn)}`);
    if (!response.success) {
      publicRequestState.errors = { inn_lookup: "Ushbu STIR bo'yicha tashkilot topilmadi. Ma'lumotlarni qo'lda kiriting yoki STIRni tekshiring." };
      return;
    }
    Object.assign(publicRequestState.form, response.data);
  } catch (error) {
    publicRequestState.errors = { inn_lookup: error.message };
  } finally {
    publicRequestState.lookingUpInn = false;
    publicRequestSaveDraft();
    renderPublicTalabnoma();
  }
}

async function publicNextStep() {
  if (!publicValidateStep()) {
    renderPublicTalabnoma();
    return;
  }
  if (publicRequestState.step < publicRequestSteps.length - 1) {
    publicRequestState.step += 1;
    publicRequestState.errors = {};
    publicRequestSaveDraft();
    renderPublicTalabnoma();
    return;
  }
  publicRequestState.submitting = true;
  renderPublicTalabnoma();
  try {
    const response = await api("/api/public/customer-requests", {
      method: "POST",
      body: JSON.stringify(publicRequestPayload()),
    });
    publicRequestState.success = response.data;
    localStorage.removeItem(publicRequestDraftKey);
  } catch (error) {
    publicRequestState.errors = { submit: error.message };
  } finally {
    publicRequestState.submitting = false;
    renderPublicTalabnoma();
  }
}
