const customerRequestStatuses = [
  ["new", "Yangi"],
  ["reviewing", "Ko'rib chiqilmoqda"],
  ["negotiation", "Muzokarada"],
  ["contract_preparation", "Shartnoma tayyorlanmoqda"],
  ["contract_signed", "Shartnoma imzolandi"],
  ["converted_to_order", "Buyurtmaga o'tkazildi"],
  ["rejected", "Rad etildi"],
];

// The status buttons are no longer listed here. They came as a fixed five,
// shown whatever state the request was in, which is how a new talabnoma could
// jump straight to "Shartnoma imzolandi". The flow now lives in
// backend/app/services/customer_request_workflow.py and reaches this page as
// request.available_transitions.

const customerTypes = [
  ["internal_organization", "Tizim tashkiloti"],
  ["external_customer", "Tashqi mijoz"],
];

const paymentSources = [
  ["treasury", "G'azna"],
  ["bank", "Bank"],
];

const monthLabels = [
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

function requestStatusBadge(item) {
  return `<span class="status-badge ${esc(item.status || "")}">${fmt(item.status_label || optionLabel(customerRequestStatuses, item.status))}</span>`;
}

async function customerRequestProductOptions() {
  const response = await api("/api/public/products");
  return (response.data || []).map((product) => [String(product.id), `${product.name}${product.product_type ? ` - ${product.product_type}` : ""}`]);
}

async function renderCustomerRequestsList() {
  const params = new URLSearchParams(location.search);
  app.innerHTML = `<div class="page ops-page"><div class="empty">Talabnomalar yuklanmoqda...</div></div>`;
  const products = await customerRequestProductOptions();
  const data = await api(`/api/customer-requests?${params.toString()}`);
  app.innerHTML = opsListPage({
    className: "customer-requests-ops-page",
    title: "Talabnomalar",
    tabs: [
      { label: "Ro'yxat", active: true },
      { label: "Panel", path: "/customer-requests?view=dashboard" },
    ],
    createPath: canEdit("sotuv") ? "/customer-requests/new" : undefined,
    createLabel: "Talabnoma yaratish",
    clearPath: "/customer-requests",
    counter: `${fmt(data.total)} ta talabnoma`,
    formId: "customer-request-search-form",
    filters: `
      <input name="search" placeholder="Qidiruv" value="${esc(params.get("search") || "")}" />
      <select name="status"><option value="">Status</option>${customerRequestStatuses.map(([k, l]) => `<option value="${k}" ${params.get("status") === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select name="customer_type"><option value="">Mijoz turi</option>${customerTypes.map(([k, l]) => `<option value="${k}" ${params.get("customer_type") === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select name="payment_source"><option value="">To'lov manbasi</option>${paymentSources.map(([k, l]) => `<option value="${k}" ${params.get("payment_source") === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select name="product_id"><option value="">Mahsulot</option>${products.map(([k, l]) => `<option value="${k}" ${params.get("product_id") === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
    `,
    headers: ["Talabnoma raqami", "Mijoz turi", "Korxona nomi", "STIR", "Mahsulot", "Umumiy miqdor", "To'lov manbasi", "Status", "Yuborilgan sana", "Amallar"],
    rows: data.items.map((item) => `
      <tr>
        <td><button class="ops-primary-link" data-nav="/customer-requests/${item.id}">${fmt(item.request_number)}</button></td>
        <td>${fmt(item.customer_type_label)}</td>
        <td>${fmt(item.company_name)}</td>
        <td>${fmt(item.inn)}</td>
        <td>${fmt(item.product?.name)}</td>
        <td>${fmtQty(item.total_quantity, item.unit)}</td>
        <td>${fmt(item.payment_source_label)}</td>
        <td>${requestStatusBadge(item)}</td>
        <td>${fmtDate(item.created_at)}</td>
        <td><div class="ops-row-actions"><button class="link-btn" data-nav="/customer-requests/${item.id}">Ko'rish</button>${canEdit("sotuv") ? `<button class="link-btn" data-nav="/customer-requests/${item.id}/edit">Tahrirlash</button><button class="link-btn" style="color:var(--danger)" data-delete-request="${item.id}" data-request-number="${esc(item.request_number || "")}">O'chirish</button>` : ""}</div></td>
      </tr>
    `).join(""),
    emptyText: "Talabnomalar topilmadi.",
    colspan: 10,
    footer: opsFooter(data, "customerrequest"),
  });
  bindOpsSearch("customer-request-search-form", "/customer-requests", ["search", "status", "customer_type", "payment_source", "product_id"]);
  bindOpsPagination("customerrequest", "/customer-requests");
  bindCustomerRequestDelete(() => renderCustomerRequestsList());
}

async function renderCustomerRequestDetail(id) {
  app.innerHTML = `<div class="page"><div class="empty">Talabnoma yuklanmoqda...</div></div>`;
  const request = await api(`/api/customer-requests/${id}`);
  const scheduleTotal = (request.schedule || []).reduce((sum, item) => sum + numberValue(item.quantity), 0);
  app.innerHTML = `
    <div class="page">
      <div class="workflow-header">
        <div class="page-title">
          <h1>Talabnoma kartasi</h1>
          <p>${fmt(request.request_number)} · ${fmt(request.company_name)} · ${fmtDate(request.created_at)} · ${requestStatusBadge(request)}</p>
        </div>
        <div class="actions workflow-actions">
          <button class="btn" data-nav="/customer-requests">Orqaga</button>
          ${canEdit("sotuv") ? `<button class="btn" data-nav="/customer-requests/${request.id}/edit">Tahrirlash</button>
          ${request.can_convert_to_order ? `<button class="btn primary" data-convert-request="${request.id}">Buyurtmaga o'tkazish</button>` : ""}
          <button class="btn danger" data-delete-request="${request.id}" data-request-number="${esc(request.request_number || "")}">O'chirish</button>` : ""}
        </div>
      </div>
      ${section("Mijoz turi va to'lov manbasi", detailList([["Mijoz turi", request.customer_type_label], ["To'lov manbasi", request.payment_source_label], ["Status", request.status_label]]))}
      ${section("Korxona ma'lumotlari", detailList([["Korxona nomi", request.company_name], ["STIR", request.inn], ["Hudud", request.region], ["Yuridik manzil", request.legal_address], ["Asosiy faoliyat turi", request.activity_type], ["Funksiyasi va vazifalari", request.function_description], ["OKED", request.oked], ["Direktor F.I.Sh.", request.director_full_name]]))}
      ${section("Rekvizitlar", detailList([["Hisob raqami", request.bank_account], ["Bank nomi", request.bank_name], ["MFO", request.mfo]]))}
      ${section("Yetkazish nuqtasi", detailList([["ABZ nuqtasi", deliveryPointDetail(request.delivery_point)]]))}
      ${section("Kontakt ma'lumotlari", detailList([["Telefon raqami", request.phone], ["Kontakt shaxs F.I.Sh.", request.contact_full_name], ["Kontakt telefon raqami", request.contact_phone]]))}
      ${section("Mahsulot talabi", detailList([["Mahsulot nomi", request.product?.name], ["Marka", request.product?.brand], ["O'lchov birligi", request.unit], ["Umumiy miqdor", fmtQty(request.total_quantity, request.unit)]]))}
      ${section("Kalendar grafik", `
        ${tableOrEmpty(request.schedule, ["Yil", "Oy", "Miqdor"], (item) => `<tr><td>${fmt(item.year)}</td><td>${fmt(optionLabel(monthLabels.map(([k, l]) => [String(k), l]), String(item.month)))}</td><td>${fmtQty(item.quantity, request.unit)}</td></tr>`, "Kalendar grafik kiritilmagan.")}
        <div class="totals-bar">
          <div class="total-box"><span>Grafik jami</span><strong>${fmtQty(scheduleTotal, request.unit)}</strong></div>
          <div class="total-box"><span>Umumiy miqdor</span><strong>${fmtQty(request.total_quantity, request.unit)}</strong></div>
        </div>
      `)}
      ${canEdit("sotuv") ? section("Statusni o'zgartirish", requestTransitionsHtml(request)) : ""}
      ${section("Status tarixi", tableOrEmpty(request.status_history, ["Sana", "Oldingi status", "Yangi status", "Izoh", "Foydalanuvchi"], (item) => `<tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.old_status_label)}</td><td>${fmt(item.new_status_label)}</td><td>${fmt(item.comment)}</td><td>${fmt(item.changed_by)}</td></tr>`, "Status tarixi mavjud emas."))}
    </div>
  `;
  bindCustomerRequestDetailActions(request);
}

// Shared by the list and the card so both delete the same way. The backend
// refuses once a contract was built from the request, and that refusal is what
// the user sees -- no need to duplicate the rule here.
function bindCustomerRequestDelete(onDeleted) {
  app.querySelectorAll("[data-delete-request]").forEach((button) => {
    button.addEventListener("click", async () => {
      const number = button.dataset.requestNumber || "";
      if (!confirmMsg(`${number} talabnomasi butunlay o'chiriladi. Bu amalni bekor qilib bo'lmaydi.`)) return;
      try {
        await api(`/api/customer-requests/${button.dataset.deleteRequest}`, { method: "DELETE" });
        showToast("Talabnoma o'chirildi.");
        onDeleted();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

// Buttons come from the server's own description of the flow, so what is on
// screen is exactly what the API will accept. A fixed list of five offered
// "Shartnoma imzolandi" on a brand-new talabnoma and the server took it.
// Written as plain literals so the dictionary generator picks them up.
const REQUEST_BACK_LABEL = "Orqaga qaytarish";
const REQUEST_REJECT_LABEL = "Rad etish";

// What each kind of move asks before it happens. A status change is a record
// other people read later, so the box says what it is about to do rather than
// showing a bare input.
const REQUEST_STATUS_DIALOGS = {
  forward: {
    title: "Keyingi bosqichga o'tkazish",
    intro: "Talabnoma quyidagi holatga o'tadi. Izoh ixtiyoriy, lekin u status tarixida qoladi.",
    confirmLabel: "O'tkazish",
    tone: "primary",
    commentLabel: "Izoh",
    placeholder: "Nima qilindi? Keyingi bosqichga nima uchun o'tilyapti?",
    required: false,
  },
  backward: {
    title: "Oldingi bosqichga qaytarish",
    intro: "Talabnoma orqaga qaytariladi. Sabab majburiy — u status tarixida qoladi.",
    confirmLabel: "Qaytarish",
    tone: "primary",
    commentLabel: "Qaytarish sababi",
    placeholder: "Nima noto'g'ri edi? Nimani tuzatish kerak?",
    required: true,
  },
  reject: {
    title: "Talabnomani rad etish",
    intro: "Talabnoma rad etiladi. Sabab majburiy — u mijozga tushuntirish uchun ham kerak bo'ladi.",
    confirmLabel: "Rad etish",
    tone: "danger",
    commentLabel: "Rad etish sababi",
    placeholder: "Nima uchun rad etilyapti?",
    required: true,
  },
};

function requestTransitionsHtml(request) {
  const moves = request.available_transitions || [];
  if (!moves.length) {
    return `<div class="empty">Bu holatdan status o'zgartirilmaydi.</div>`;
  }
  const order = { forward: 0, backward: 1, reject: 2 };
  const buttons = [...moves]
    .sort((a, b) => order[a.direction] - order[b.direction])
    .map((move) => {
      const cls = move.direction === "forward" ? "btn primary" : move.direction === "reject" ? "btn danger" : "btn";
      // The status label names a state; a button names an act. "Rad etildi" is
      // what the request becomes, "Rad etish" is what the button does.
      if (move.direction === "reject") {
        return `<button class="${cls}" type="button" data-request-status="${esc(move.status)}" data-request-direction="reject">${REQUEST_REJECT_LABEL}</button>`;
      }
      // Going back to "Ko'rib chiqilmoqda" and moving forward to it are
      // different acts and used to read identically, so the direction is said
      // out loud. The two words are separate text nodes because the Cyrillic
      // dictionary matches a whole node -- glued together they match nothing.
      // The button is a flex row, so its spans already sit apart -- an arrow
      // reads better between them than punctuation, which the gap would leave
      // floating on both sides.
      const prefix = move.direction === "backward"
        ? `<span>${REQUEST_BACK_LABEL}</span><span data-noloc>\u2190</span>`
        : "";
      return `<button class="${cls}" type="button" data-request-status="${esc(move.status)}" data-request-direction="${esc(move.direction)}">${prefix}<span>${esc(move.label)}</span></button>`;
    })
    .join("");
  const hint = moves.some((move) => move.direction === "backward")
    ? `<p class="form-hint">Orqaga qaytarish uchun sabab yozish shart — u status tarixida qoladi.</p>`
    : "";
  return `${hint}<div class="actions">${buttons}</div>`;
}

function bindCustomerRequestDetailActions(request) {
  app.querySelectorAll("[data-request-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextStatus = button.dataset.requestStatus;
      const direction = button.dataset.requestDirection;
      // The last span holds the target status; on a backward button the ones
      // before it are the "Orqaga qaytarish ←" prefix, which is not the subject.
      const target = (button.querySelector("span:last-child") || button).textContent.trim();
      const cfg = REQUEST_STATUS_DIALOGS[direction] || REQUEST_STATUS_DIALOGS.forward;
      // appDialog reports cancelling explicitly. prompt() returned null for
      // Escape and "" for an empty answer, and only the rejection branch ever
      // told them apart -- so on every other status, closing the box with
      // Escape still moved the talabnoma on.
      const { confirmed, comment } = await appDialog({
        title: cfg.title,
        intro: cfg.intro,
        // Rejection has no target worth naming -- the title already says it.
        subject: direction === "reject" ? "" : target,
        confirmLabel: cfg.confirmLabel,
        tone: cfg.tone,
        comment: cfg.required
          ? { label: cfg.commentLabel, placeholder: cfg.placeholder }
          : { label: cfg.commentLabel, placeholder: cfg.placeholder, optional: true },
      });
      if (!confirmed) return;
      try {
        await api(`/api/customer-requests/${request.id}/status`, {
          method: "POST",
          body: JSON.stringify({ status: nextStatus, comment, rejection_reason: direction === "reject" ? comment : null }),
        });
        showToast("Talabnoma statusi yangilandi.");
        await renderCustomerRequestDetail(request.id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
  app.querySelector("[data-convert-request]")?.addEventListener("click", async () => {
    try {
      const response = await api(`/api/customer-requests/${request.id}/convert-to-order`, { method: "POST" });
      showToast(response.data?.message || "Talabnoma buyurtmaga o'tkazildi.");
    } catch (error) {
      showToast(error.message, true);
    }
  });
  bindCustomerRequestDelete(() => navigate("/customer-requests"));
}

async function renderEditCustomerRequest(id) {
  app.innerHTML = `<div class="page"><div class="empty">Talabnoma yuklanmoqda...</div></div>`;
  const [request, products] = await Promise.all([
    api(`/api/customer-requests/${id}`),
    customerRequestProductOptions(),
  ]);
  app.innerHTML = customerRequestForm(request, products, await customerRequestClientOptions(request.client_id), await deliveryPointOptions(request.delivery_point_id));
  bindCustomerRequestForm(request);
}

// Bir forma ikkala holat uchun: yangi talabnoma ham, tahrirlash ham.
// Ikkita nusxa bo'lsa, maydon qo'shilganda biri unutilib qoladi va portal
// bilan ichki forma bir-biridan farq qila boshlaydi.
// Mijozlar ro'yxati moliya formalaridagi bilan bir xil yordamchidan
// olinadi: u sahifalarni bosib o'tadi va nom bo'yicha tartiblaydi. O'z
// so'rovimni yozganimda `page_size=500` chegaradan oshib ketdi va ro'yxat
// jimgina bo'sh qolgan edi.
//
// Taxallus qilib qo'yish mumkin emas: bu fayl customerFinance.js dan
// oldin yuklanadi va yuklanish paytida u funksiya hali mavjud emas.
async function customerRequestClientOptions(selectedId = null) {
  return fetchClientsOptions(selectedId);
}

// Mijoz tanlangach maydonlar server bergan qiymatlar bilan to'ldiriladi.
// Ularni brauzerda yig'ish ham mumkin edi, lekin unda saqlanadigan qiymat
// bilan ekrandagi qiymat boshqa-boshqa joydan chiqardi.
const REQUEST_PREFILL_FIELDS = [
  "inn", "region", "oked", "director_full_name", "legal_address",
  "bank_name", "mfo", "bank_account", "activity_type", "function_description",
  "privatization_project_name", "contact_full_name", "contact_phone", "phone",
];

async function applyRequestClient(form) {
  const clientId = field(form, "client_id");
  const holder = document.querySelector("#request-client-warnings");
  if (!clientId) {
    REQUEST_PREFILL_FIELDS.forEach((name) => { if (form.elements[name]) form.elements[name].value = ""; });
    if (holder) holder.innerHTML = "";
    return;
  }
  try {
    const prefill = await api(`/api/customer-requests/prefill?client_id=${clientId}`);
    REQUEST_PREFILL_FIELDS.forEach((name) => {
      const input = form.elements[name];
      if (!input) return;
      // Kontakt maydonlari qo'lda o'zgartirilishi mumkin: har talabnomada
      // boshqa odam bo'lishi mumkin. Yozilgani ustidan yozilmaydi.
      const keepTyped = ["contact_full_name", "contact_phone"].includes(name) && input.value.trim();
      if (!keepTyped) input.value = prefill[name] ?? "";
    });
    if (holder) {
      holder.innerHTML = workflowWarningsPanel(prefill.warnings || []);
      localizeDom(holder);
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

async function renderNewCustomerRequest() {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const products = await customerRequestProductOptions();
  const today = new Date();
  app.innerHTML = customerRequestForm(
    { schedule: [{ year: today.getFullYear(), month: today.getMonth() + 1, quantity: "" }] },
    products,
    await customerRequestClientOptions(),
    await deliveryPointOptions(),
  );
  bindCustomerRequestForm({});
}

function customerRequestForm(request, products, clients = "", points = "") {
  const isNew = !request.id;
  const backPath = isNew ? "/customer-requests" : `/customer-requests/${request.id}`;
  return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>${isNew ? "Yangi talabnoma" : "Talabnomani tahrirlash"}</h1>
          <p>${isNew ? "Telefon yoki xat orqali kelgan talabnomani kiriting." : `${fmt(request.request_number)} · ${fmt(request.company_name)}`}</p>
        </div>
        <div class="actions"><button class="btn" data-nav="${backPath}">Orqaga</button></div>
      </div>
      <form id="customer-request-form">
        ${section("To'lov manbasi", `<div class="grid">${selectField("payment_source", "To'lov manbasi", paymentSources, request.payment_source || "treasury", { required: true })}</div>`)}
        ${section("Korxona", `<div class="grid">
          <label class="form-field"><span class="field-label-text">Korxona <span class="required-mark">*</span></span>${selectSearch("client_id", "Korxona nomi yoki STIR bo'yicha qidiring")}<select name="client_id" required><option value="">Mijozni tanlang</option>${clients}</select></label>
          ${readonlyField("inn", "STIR", request.inn)}
          ${readonlyField("region", "Hudud", request.region)}
          ${readonlyField("oked", "OKED", request.oked)}
          ${readonlyField("director_full_name", "Direktor F.I.Sh.", request.director_full_name)}
          ${readonlyField("legal_address", "Yuridik manzil", request.legal_address)}
          ${readonlyField("bank_name", "Bank nomi", request.bank_name)}
          ${readonlyField("mfo", "MFO", request.mfo)}
          ${readonlyField("bank_account", "Hisob raqami", request.bank_account)}
        </div><div class="form-hint">Bu maydonlar mijoz kartochkasidan olinadi. O'zgartirish kerak bo'lsa, mijoz kartochkasida to'g'rilang.</div><div id="request-client-warnings"></div>`)}
        ${section("Yetkazish nuqtasi", `<div class="grid">${deliveryPointField("ABZ nuqtasi", request.delivery_point_id, points)}</div><div class="form-hint">Bitum qayerga yetkaziladi. Nuqta shartnoma va partiyalarga ham o'tadi.</div>`)}
        ${section("Qo'shimcha ma'lumotlar", `<div class="grid">${textArea("activity_type", "Asosiy faoliyat turi", request.activity_type)}${textArea("function_description", "Funksiyasi va vazifalari", request.function_description)}${textField("privatization_project_name", "205 xususiylashtirish loyiha", request.privatization_project_name)}</div>`)}
        ${section("Kontakt ma'lumotlari", `<div class="grid">${textField("phone", "Telefon raqami", request.phone, "text", { required: true })}${textField("contact_full_name", "Kontakt shaxs F.I.Sh.", request.contact_full_name)}${textField("contact_phone", "Kontakt telefon raqami", request.contact_phone)}</div>`)}
        ${section("Mahsulot talabi", `<div class="grid">${selectField("product_id", "Mahsulot nomi", products, String(request.product?.id || request.product_id || ""), { required: true })}${textField("total_quantity", "Umumiy miqdor", request.total_quantity, "number", { required: true })}${textField("unit", "O'lchov birligi", request.unit || "t", "text", { required: true })}</div>`)}
        ${section("Kalendar grafik", customerRequestScheduleEditor(request.schedule || [], request.unit))}
        ${section("Ichki izoh", `<div class="grid">${textArea("internal_comment", "Izoh", request.internal_comment)}</div>`)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="${backPath}">Bekor qilish</button>
          <button class="btn primary">${isNew ? "Talabnoma yaratish" : "Saqlash"}</button>
        </div>
      </form>
    </div>
  `;
}

function customerRequestScheduleEditor(schedule, unit) {
  const rows = schedule.length ? schedule : [{ year: new Date().getFullYear(), month: 7, quantity: "" }];
  return `
    <div id="customer-request-schedule">
      ${rows.map((item) => customerRequestScheduleRow(item)).join("")}
    </div>
    <div class="actions"><button class="btn" type="button" id="add-request-schedule-row">Qator qo'shish</button></div>
    <div class="totals-bar">
      <div class="total-box"><span>Grafik jami</span><strong data-request-schedule-total>${fmtQty(0, unit)}</strong></div>
      <div class="total-box"><span>Umumiy miqdor</span><strong data-request-total>${dash}</strong></div>
    </div>
    <div class="empty warning" data-request-schedule-warning hidden>Kalendar grafikdagi jami miqdor umumiy miqdorga teng bo'lishi kerak.</div>
  `;
}

function customerRequestScheduleRow(item = {}) {
  return `
    <div class="grid inline-edit request-schedule-row">
      ${textField("schedule_year", "Yil", item.year || new Date().getFullYear(), "text", { required: true, pattern: "(19|20)[0-9]{2}", maxlength: 4, inputmode: "numeric", title: "To'rt xonali yil kiriting" })}
      ${selectField("schedule_month", "Oy", monthLabels.map(([k, l]) => [String(k), l]), String(item.month || 1), { required: true })}
      ${textField("schedule_quantity", "Miqdor", item.quantity || "", "number", { required: true })}
      <button class="btn danger" type="button" data-remove-schedule-row>O'chirish</button>
    </div>
  `;
}

function collectRequestSchedule() {
  return [...app.querySelectorAll(".request-schedule-row")].map((row) => ({
    year: Number(row.querySelector('[name="schedule_year"]').value.replace(/\s/g, "")),
    month: Number(row.querySelector('[name="schedule_month"]').value),
    quantity: normalizeNumberInputValue(row.querySelector('[name="schedule_quantity"]').value),
  })).filter((item) => item.year && item.month && Number(item.quantity) > 0);
}

function refreshRequestScheduleTotals() {
  const total = numberValue(app.querySelector('[name="total_quantity"]')?.value);
  const scheduleTotal = collectRequestSchedule().reduce((sum, item) => sum + numberValue(item.quantity), 0);
  const unit = app.querySelector('[name="unit"]')?.value || "";
  const scheduleTotalEl = app.querySelector("[data-request-schedule-total]");
  const totalEl = app.querySelector("[data-request-total]");
  const warning = app.querySelector("[data-request-schedule-warning]");
  if (scheduleTotalEl) scheduleTotalEl.textContent = `${formatNumberInputValue(scheduleTotal)}${unit ? ` ${unit}` : ""}`;
  if (totalEl) totalEl.textContent = `${formatNumberInputValue(total)}${unit ? ` ${unit}` : ""}`;
  if (warning) warning.hidden = scheduleTotal === total || scheduleTotal === 0;
}

function bindCustomerRequestForm(request) {
  setupFormattedNumberInputs(app);
  refreshRequestScheduleTotals();
  const form = app.querySelector("#customer-request-form");
  form?.elements.client_id?.addEventListener("change", () => applyRequestClient(form));
  // Yangi talabnomada mijoz oldindan tanlanmagan; tahrirlashda esa
  // maydonlar allaqachon to'ldirilgan va ularni qayta so'rash shart emas.
  if (!request?.id && form?.elements.client_id?.value) applyRequestClient(form);
  app.querySelector("#add-request-schedule-row")?.addEventListener("click", () => {
    app.querySelector("#customer-request-schedule").insertAdjacentHTML("beforeend", customerRequestScheduleRow({ year: new Date().getFullYear(), month: 1 }));
    setupFormattedNumberInputs(app);
    refreshRequestScheduleTotals();
  });
  app.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-schedule-row]");
    if (!button) return;
    button.closest(".request-schedule-row")?.remove();
    refreshRequestScheduleTotals();
  });
  app.querySelector("#customer-request-form")?.addEventListener("input", refreshRequestScheduleTotals);
  app.querySelector("#customer-request-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      client_id: Number(field(form, "client_id")),
      delivery_point_id: field(form, "delivery_point_id") ? Number(field(form, "delivery_point_id")) : null,
      payment_source: field(form, "payment_source"),
      company_name: field(form, "company_name"),
      inn: field(form, "inn"),
      region: field(form, "region"),
      oked: field(form, "oked"),
      director_full_name: field(form, "director_full_name"),
      legal_address: field(form, "legal_address"),
      activity_type: field(form, "activity_type"),
      function_description: field(form, "function_description"),
      privatization_project_name: field(form, "privatization_project_name"),
      bank_account: field(form, "bank_account"),
      bank_name: field(form, "bank_name"),
      mfo: field(form, "mfo"),
      phone: field(form, "phone"),
      contact_full_name: field(form, "contact_full_name"),
      contact_phone: field(form, "contact_phone"),
      product_id: Number(field(form, "product_id")),
      total_quantity: normalizeNumberInputValue(field(form, "total_quantity")),
      unit: field(form, "unit"),
      internal_comment: field(form, "internal_comment"),
      schedule: collectRequestSchedule(),
    };
    try {
      if (request.id) {
        await api(`/api/customer-requests/${request.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Talabnoma muvaffaqiyatli yangilandi.");
        navigate(`/customer-requests/${request.id}`);
      } else {
        const saved = await api("/api/customer-requests", { method: "POST", body: JSON.stringify(payload) });
        showToast("Talabnoma yaratildi.");
        navigate(`/customer-requests/${saved.id}`);
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// ---- Talabnomalar boshqaruv paneli ----
//
// Ro'yxat «shu talabnomada nima bo'lgan» degan savolga javob beradi. Panel
// boshqasiga: umuman qanday ketyapti, nechtasi shartnomaga aylandi, qaysi
// mahsulot ko'p so'ralmoqda va — eng muhimi — qaysilari javobsiz turibdi.

const REQUEST_TREND_SERIES = [
  ["created", "Kelgan", "created"],
  ["converted", "Shartnomaga aylangan", "delivered"],
];

// Uch qatorli ustunli diagramma. Kutubxona yo'q: ilovada qurilish bosqichi
// ham yo'q, shuning uchun SVG qo'lda chiziladi -- yetkazib berish
// sahifasidagi diagramma bilan bir xil uslubda.
function requestTrendChart(months) {
  const width = 620;
  const height = 210;
  const padLeft = 34;
  const padBottom = 26;
  const padTop = 10;
  const peak = Math.max(1, ...months.map((m) => Math.max(m.created, m.converted, m.rejected)));
  const ticks = Math.min(4, peak);
  const step = Math.ceil(peak / ticks);
  const max = step * ticks;
  const plotH = height - padBottom - padTop;
  const plotW = width - padLeft - 8;
  const slot = plotW / Math.max(1, months.length);
  const barW = Math.min(14, slot / 4);
  const y = (value) => padTop + plotH - (value / max) * plotH;

  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const value = step * index;
    return `<line x1="${padLeft}" y1="${y(value)}" x2="${width - 8}" y2="${y(value)}" class="chart-grid" />
      <text x="${padLeft - 8}" y="${y(value) + 4}" class="chart-tick" text-anchor="end">${Math.round(value)}</text>`;
  }).join("");

  const bars = months.map((month, index) => {
    const center = padLeft + slot * index + slot / 2;
    const column = (value, offset, cls) => `<rect x="${center + offset}" y="${y(value)}" width="${barW}" height="${Math.max(1, plotH + padTop - y(value))}" class="chart-bar ${cls}" rx="2"><title>${value}</title></rect>`;
    return `${column(month.created, -barW * 1.6, "created")}${column(month.converted, -barW * 0.5, "delivered")}${column(month.rejected, barW * 0.6, "rejected")}
      <text x="${center}" y="${height - 8}" class="chart-tick" text-anchor="middle">${esc(month.month.slice(5))}.${esc(month.month.slice(2, 4))}</text>`;
  }).join("");

  return `<div class="chart-block">
    <div class="chart-legend"><span><i class="created"></i>Kelgan</span><span><i class="delivered"></i>Shartnomaga aylangan</span><span><i class="rejected"></i>Rad etilgan</span></div>
    <div class="chart-axis-title">Talabnomalar soni</div>
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Talabnomalar dinamikasi">${grid}${bars}</svg>
  </div>`;
}

// Ulushli qator: raqamning yonida uning umumiy ulushi ham ko'rinadi --
// «Andijon 5 ta» bilan «Andijon 45%» boshqa-boshqa xulosaga olib keladi.
function requestShareRows(rows, total, unit = "") {
  if (!rows.length) return `<div class="empty">Ma'lumot yo'q.</div>`;
  return `<div class="share-list">${rows.map((row) => {
    const percent = total ? Math.round((row.count / total) * 100) : 0;
    return `<div class="share-row">
      <div class="share-head"><span>${fmt(row.label)}</span><strong><span data-noloc>${fmt(row.count)}</span> <span>ta</span>${row.quantity ? ` · <span data-noloc>${fmtQty(row.quantity, unit)}</span>` : ""}</strong></div>
      <div class="share-track"><div class="share-fill" style="width:${percent}%"></div></div>
    </div>`;
  }).join("")}</div>`;
}

async function renderCustomerRequestsDashboard() {
  const params = new URLSearchParams(location.search);
  params.delete("view");
  const [board, products] = await Promise.all([
    api(`/api/customer-requests/dashboard?${params.toString()}`),
    customerRequestProductOptions(),
  ]);
  const query = new URLSearchParams(location.search);

  app.innerHTML = opsListPage({
    className: "request-dashboard-ops-page",
    title: "Talabnomalar paneli",
    tabs: [
      { label: "Ro'yxat", path: "/customer-requests" },
      { label: "Panel", active: true },
    ],
    clearPath: "/customer-requests?view=dashboard",
    counter: `${fmt(board.total)} ta talabnoma · ${fmt(board.stale_count)} tasi javobsiz`,
    formId: "request-dashboard-form",
    filters: `<input type="hidden" name="view" value="dashboard" />${
      opsFilterField("Sanadan", ruDateField("date_from", query.get("date_from") || ""))}${
      opsFilterField("Sanagacha", ruDateField("date_to", query.get("date_to") || ""))}${
      opsFilterField("Status", `<select name="status"><option value="">Barchasi</option>${customerRequestStatuses.map(([key, label]) => `<option value="${key}" ${query.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}${
      opsFilterField("Mahsulot", `<select name="product_id"><option value="">Barchasi</option>${products}</select>`)}${
      opsFilterField("To'lov manbasi", `<select name="payment_source"><option value="">Barchasi</option>${paymentSources.map(([key, label]) => `<option value="${key}" ${query.get("payment_source") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}`,
    headers: [],
    rows: "",
    emptyText: "",
    colspan: 1,
  });

  // `opsListPage` sarlavha, tab va filtr chizig'ini beradi -- ular boshqa
  // sahifalar bilan bir xil bo'lishi kerak. Jadvali esa bu yerda kerak
  // emas: panel kartochka va diagrammalardan iborat.
  app.querySelector(".ops-table-card")?.remove();

  app.querySelector(".page")?.insertAdjacentHTML("beforeend", `
    ${summaryCards([
      ["Jami talabnoma", `<span data-noloc>${fmt(board.total)}</span> <span>ta</span>`],
      ["Ochiq", `<span data-noloc>${fmt(board.open_count)}</span> <span>ta</span>`, board.open_count ? "warning" : ""],
      ["Javobsiz turgan", `<span data-noloc>${fmt(board.stale_count)}</span> <span>ta</span>`, board.stale_count ? "danger" : ""],
      ["Shartnomaga aylangan", `<span data-noloc>${fmt(board.converted_count)}</span> <span>ta</span>`, "success"],
      ["Rad etilgan", `<span data-noloc>${fmt(board.rejected_count)}</span> <span>ta</span>`],
      ["So'ralgan miqdor", fmtQty(board.total_quantity, "t")],
    ])}
    ${summaryCards([
      ["Konversiya", board.conversion_percent === null || board.conversion_percent === undefined ? dash : `<span data-noloc>${fmtQty(board.conversion_percent)}%</span>`],
      ["Aylangan miqdor", fmtQty(board.converted_quantity, "t")],
      ["O'rtacha aylanish", board.average_days_to_convert === null || board.average_days_to_convert === undefined
        ? dash
        : `<span data-noloc>${fmtQty(board.average_days_to_convert)}</span> <span>kun</span>`],
    ])}
    ${workflowWarningsPanel(board.warnings || [])}
    ${section("Dinamika", `<div class="chart-holder">${requestTrendChart(board.by_month || [])}</div>`)}
    <div class="dashboard-columns">
      ${section("Holatlar bo'yicha", requestShareRows(board.by_status || [], board.total, "t"))}
      ${section("Mahsulot bo'yicha", requestShareRows(board.by_product || [], board.total, "t"))}
      ${section("Hudud bo'yicha", requestShareRows(board.by_region || [], board.total, "t"))}
      ${section("Eng ko'p so'ragan mijozlar", requestShareRows(board.top_clients || [], board.total, "t"))}
    </div>
    ${section("Javobsiz turgan talabnomalar", opsTableOrEmpty(
      board.stale || [],
      ["Talabnoma", "Korxona", "Status", "Necha kun", "Miqdor"],
      (row) => `<tr>
        <td><button class="ops-primary-link" data-nav="/customer-requests/${row.id}">${fmt(row.request_number)}</button></td>
        <td>${fmt(row.company_name)}</td>
        <td>${statusChip({ label: row.status_label, tone: row.status === "new" ? "warning" : "muted" })}</td>
        <td class="ops-money"><span data-noloc>${fmt(row.days_open)}</span> <span>kun</span></td>
        <td class="ops-money">${fmtQty(row.quantity, "t")}</td>
      </tr>`,
      "Javobsiz turgan talabnoma yo'q."
    ))}
  `);
  localizeDom(app);
  bindOpsSearch("request-dashboard-form", "/customer-requests", ["view", "date_from", "date_to", "status", "product_id", "payment_source"]);
}
