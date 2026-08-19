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
  app.innerHTML = customerRequestForm(request, products);
  bindCustomerRequestForm(request);
}

function customerRequestForm(request, products) {
  return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>Talabnomani tahrirlash</h1>
          <p>${fmt(request.request_number)} · ${fmt(request.company_name)}</p>
        </div>
        <div class="actions"><button class="btn" data-nav="/customer-requests/${request.id}">Orqaga</button></div>
      </div>
      <form id="customer-request-form">
        ${section("Mijoz turi va to'lov manbasi", `<div class="grid">${selectField("customer_type", "Mijoz turi", customerTypes, request.customer_type, { required: true })}${selectField("payment_source", "To'lov manbasi", paymentSources, request.payment_source, { required: true })}</div>`)}
        ${section("Korxona ma'lumotlari", `<div class="grid">${textField("company_name", "Korxona nomi", request.company_name, "text", { required: true })}${textField("inn", "STIR", request.inn)}${textField("region", "Hudud", request.region)}${textField("oked", "OKED", request.oked)}${textField("director_full_name", "Direktor F.I.Sh.", request.director_full_name)}${textArea("legal_address", "Yuridik manzil", request.legal_address)}${textArea("activity_type", "Asosiy faoliyat turi", request.activity_type)}${textArea("function_description", "Funksiyasi va vazifalari", request.function_description)}${textField("privatization_project_name", "205 xususiylashtirish loyiha", request.privatization_project_name)}</div>`)}
        ${section("Rekvizitlar", `<div class="grid">${textField("bank_account", "Hisob raqami", request.bank_account)}${textField("bank_name", "Bank nomi", request.bank_name)}${textField("mfo", "MFO", request.mfo)}</div>`)}
        ${section("Kontakt ma'lumotlari", `<div class="grid">${textField("phone", "Telefon raqami", request.phone, "text", { required: true })}${textField("contact_full_name", "Kontakt shaxs F.I.Sh.", request.contact_full_name)}${textField("contact_phone", "Kontakt telefon raqami", request.contact_phone)}</div>`)}
        ${section("Mahsulot talabi", `<div class="grid">${selectField("product_id", "Mahsulot nomi", products, String(request.product?.id || request.product_id || ""), { required: true })}${textField("total_quantity", "Umumiy miqdor", request.total_quantity, "number", { required: true })}${textField("unit", "O'lchov birligi", request.unit, "text", { required: true })}</div>`)}
        ${section("Kalendar grafik", customerRequestScheduleEditor(request.schedule || [], request.unit))}
        ${section("Ichki izoh", `<div class="grid">${textArea("internal_comment", "Izoh", request.internal_comment)}</div>`)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="/customer-requests/${request.id}">Bekor qilish</button>
          <button class="btn primary">Saqlash</button>
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
      ${textField("schedule_year", "Yil", item.year || new Date().getFullYear(), "number", { required: true })}
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
      customer_type: field(form, "customer_type"),
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
      await api(`/api/customer-requests/${request.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      showToast("Talabnoma muvaffaqiyatli yangilandi.");
      navigate(`/customer-requests/${request.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}
