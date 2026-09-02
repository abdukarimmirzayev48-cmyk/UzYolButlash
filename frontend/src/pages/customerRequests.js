const customerRequestStatuses = [
  ["new", "Yangi"],
  ["reviewing", "Ko'rib chiqilmoqda"],
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

// Mahsulot -> yetkazish usuli xaritasi. Mahsulot tanlanganda yetkazish
// nuqtalari ro'yxati shu bo'yicha qayta filtrlanadi, shuning uchun uni
// eslab qolamiz.
let requestProductMethods = {};

async function customerRequestProductOptions() {
  const response = await api("/api/public/products");
  const products = response.data || [];
  requestProductMethods = Object.fromEntries(products.map((product) => [String(product.id), product.delivery_method || ""]));
  return products.map((product) => [String(product.id), `${product.name}${product.product_type ? ` - ${product.product_type}` : ""}`]);
}

async function renderCustomerRequestsList() {
  const params = new URLSearchParams(location.search);
  app.innerHTML = `<div class="page ops-page"><div class="empty">Talabnomalar yuklanmoqda...</div></div>`;
  // Panel va ro'yxat bir xil so'rov bilan olinadi: filtr bitta, ya'ni
  // yuqoridagi raqam bilan pastdagi qatorlar bir-biriga zid bo'la olmaydi.
  const [products, data, board] = await Promise.all([
    customerRequestProductOptions(),
    api(`/api/customer-requests?${params.toString()}`),
    api(`/api/customer-requests/dashboard?${params.toString()}`),
  ]);
  const editable = canEdit("sotuv");

  app.innerHTML = opsListPage({
    className: "customer-requests-ops-page",
    title: "Talabnomalar",
    createPath: editable ? "/customer-requests/new" : undefined,
    createLabel: "Talabnoma yaratish",
    clearPath: "/customer-requests",
    counter: `${fmt(data.total)} ta talabnoma · ${fmt(board.stale_count)} tasi javobsiz`,
    formId: "customer-request-search-form",
    filters: `${opsFilterField("Qidirish", `<input name="search" placeholder="Raqam, korxona, STIR, telefon" value="${esc(params.get("search") || "")}" />`)}${
      opsFilterField("Sanadan", ruDateField("date_from", params.get("date_from") || ""))}${
      opsFilterField("Sanagacha", ruDateField("date_to", params.get("date_to") || ""))}${
      opsFilterField("Status", `<select name="status"><option value="">Barchasi</option>${customerRequestStatuses.map(([k, l]) => `<option value="${k}" ${params.get("status") === k ? "selected" : ""}>${l}</option>`).join("")}</select>`)}${
      opsFilterField("Mahsulot", `<select name="product_id"><option value="">Barchasi</option>${products.map(([k, l]) => `<option value="${k}" ${params.get("product_id") === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`)}${
      opsFilterField("To'lov manbasi", `<select name="payment_source"><option value="">Barchasi</option>${paymentSources.map(([k, l]) => `<option value="${k}" ${params.get("payment_source") === k ? "selected" : ""}>${l}</option>`).join("")}</select>`)}`,
    beforeTable: requestDashboardBlocks(board),
    headers: ["Talabnoma raqami", "Korxona nomi", "STIR", "Mahsulot", "Umumiy miqdor", "To'lov manbasi", "Status", "Yuborilgan sana", "Amallar"],
    rows: data.items.map((item) => `
      <tr>
        <td><button class="ops-primary-link" data-nav="/customer-requests/${item.id}">${fmt(item.request_number)}</button></td>
        <td>${fmt(item.company_name)}</td>
        <td>${fmt(item.inn)}</td>
        <td>${fmt(item.product?.name)}</td>
        <td>${fmtQty(item.total_quantity, item.unit)}</td>
        <td>${fmt(item.payment_source_label)}</td>
        <td>${requestStatusBadge(item)}</td>
        <td>${fmtDate(item.created_at)}</td>
        <td><div class="ops-row-actions"><button class="link-btn" data-nav="/customer-requests/${item.id}">Ko'rish</button>${editable ? `<button class="link-btn" data-nav="/customer-requests/${item.id}/edit">Tahrirlash</button><button class="link-btn" style="color:var(--danger)" data-delete-request="${item.id}" data-request-number="${esc(item.request_number || "")}">O'chirish</button>` : ""}</div></td>
      </tr>
    `).join(""),
    emptyText: "Talabnomalar topilmadi.",
    colspan: 9,
    footer: opsFooter(data, "customerrequest"),
  });
  bindOpsSearch("customer-request-search-form", "/customer-requests", ["search", "date_from", "date_to", "status", "product_id", "payment_source"]);
  bindOpsPagination("customerrequest", "/customer-requests");
  bindCustomerRequestDelete(renderCustomerRequestsList);
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
      ${requestStatusCard(request)}
      ${requestDocumentsSection(request)}
      ${section("Mijoz turi va to'lov manbasi", detailList([["Mijoz turi", request.customer_type_label], ["To'lov manbasi", request.payment_source_label]]))}
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
      ${section("Status tarixi", tableOrEmpty(request.status_history, ["Sana", "Oldingi status", "Yangi status", "Izoh", "Foydalanuvchi"], (item) => `<tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.old_status_label)}</td><td>${fmt(item.new_status_label)}</td><td>${fmt(item.comment)}</td><td>${fmt(item.changed_by)}</td></tr>`, "Status tarixi mavjud emas."))}
    </div>
  `;
  bindCustomerRequestDetailActions(request);
  bindRequestDocuments(request, () => renderCustomerRequestDetail(id));
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

function requestTransitionsHtml(request, { blocked = false } = {}) {
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
      const off = blocked && move.status === "contract_preparation" && move.direction === "forward";
      return `<button class="${cls}" type="button" data-request-status="${esc(move.status)}" data-request-direction="${esc(move.direction)}" ${off ? "disabled" : ""}>${prefix}<span>${esc(move.label)}</span></button>`;
    })
    .join("");
  const hint = moves.some((move) => move.direction === "backward")
    ? `<p class="form-hint">Orqaga qaytarish uchun sabab yozish shart — u status tarixida qoladi.</p>`
    : "";
  return `<div class="actions">${buttons}</div>${hint}`;
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
    markWizardFields(form);
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
    markWizardFields(form);
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

// Talabnoma to'rt qadamda to'ldiriladi. Qadamlarning bari bir vaqtda
// chiziladi va joriysidan boshqasi yashiriladi -- shu sabab grafik jamisi
// kabi hisob-kitoblar va mijoz kartochkasini to'ldirish qaysi qadamda
// turganidan qat'i nazar ishlayveradi.
//
// Sarlavhalar va ilgaklar shu yerda: formani chizishda ham, hodisalarni
// bog'lashda ham aynan shu ro'yxat ishlatiladi, ikki joyda takrorlanmaydi.
const REQUEST_WIZARD_STEPS = [
  { title: "Korxona" },
  // Mahsulot manzildan oldin: nima jo'natilayotgani qayerga jo'natish
  // mumkinligini belgilaydi. Tuz vagonda keladi -- unga stansiya
  // tanlanadi, ABZ emas.
  { title: "Mahsulot va grafik" },
  { title: "Yetkazish va kontakt" },
  { title: "Tekshirish", onEnter: (form) => renderRequestSummary(form) },
];

function customerRequestForm(request, products, clients = "", points = "") {
  const isNew = !request.id;
  const backPath = isNew ? "/customer-requests" : `/customer-requests/${request.id}`;
  const bodies = [
    `${section("To'lov manbasi", `<div class="grid">${selectField("payment_source", "To'lov manbasi", paymentSources, request.payment_source || "treasury", { required: true })}</div>`)}
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
     ${section("Qo'shimcha ma'lumotlar", `<div class="grid">${textArea("activity_type", "Asosiy faoliyat turi", request.activity_type)}${textArea("function_description", "Funksiyasi va vazifalari", request.function_description)}${textField("privatization_project_name", "205 xususiylashtirish loyiha", request.privatization_project_name)}</div>`)}`,

    `${section("Mahsulot talabi", `<div class="grid">${selectField("product_id", "Mahsulot nomi", products, String(request.product?.id || request.product_id || ""), { required: true })}${textField("total_quantity", "Umumiy miqdor", request.total_quantity, "number", { required: true })}${textField("unit", "O'lchov birligi", request.unit || "t", "text", { required: true })}</div>`)}
     ${section("Kalendar grafik", customerRequestScheduleEditor(request.schedule || [], request.unit))}`,

    `${section("Yetkazish nuqtasi", `<div class="grid">${deliveryPointField("Yetkazish nuqtasi", request.delivery_point_id, points)}</div><div class="form-hint">Mahsulot qayerga yetkaziladi. Ro'yxat tanlangan mahsulotning yetkazish usuliga qarab filtrlanadi.</div><div data-request-method-hint></div>`)}
     ${section("Kontakt ma'lumotlari", `<div class="grid">${textField("phone", "Telefon raqami", request.phone, "text", { required: true })}${textField("contact_full_name", "Kontakt shaxs F.I.Sh.", request.contact_full_name)}${textField("contact_phone", "Kontakt telefon raqami", request.contact_phone)}</div>`)}`,

    `${section("Talabnoma xulosasi", `<div data-request-summary></div>`)}
     ${section("Ichki izoh", `<div class="grid">${textArea("internal_comment", "Izoh", request.internal_comment)}</div>`)}`,
  ];

  return wizardPage({
    formId: "customer-request-form",
    title: isNew ? "Yangi talabnoma" : "Talabnomani tahrirlash",
    subtitle: isNew
      ? "Telefon yoki xat orqali kelgan talabnomani kiriting."
      : [request.request_number, request.company_name].filter(Boolean).join(" · "),
    breadcrumb: [["Talabnomalar", "/customer-requests"], [isNew ? "Yangi talabnoma" : "Tahrirlash", ""]],
    closePath: backPath,
    steps: REQUEST_WIZARD_STEPS.map((step, index) => ({ ...step, body: bodies[index] })),
    submitLabel: isNew ? "Talabnoma yaratish" : "Saqlash",
    // Qoralama faqat yangi talabnomada: mavjudini tahrirlashda saqlanmagan
    // o'zgarish keyingi safar jimgina qaytib kelsa, chalkashlik chiqadi.
    withDraft: isNew,
  });
}

// Oxirgi qadamda xodim yaratishdan oldin hammasini bir ekranda ko'radi.
// Qiymatlar formadagi ko'rinishidan olinadi, shuning uchun ular allaqachon
// tarjima qilingan -- `data-noloc` ularni ikkinchi marta o'girilishdan saqlaydi.
function renderRequestSummary(form) {
  const holder = form.querySelector("[data-request-summary]");
  if (!holder) return;
  const text = (name) => (form.elements[name]?.value || "").trim();
  const choice = (name) => (form.elements[name]?.selectedOptions?.[0]?.textContent || "").trim();
  const unit = text("unit");
  const withUnit = (value) => (unit ? `${formatNumberInputValue(value)} ${unit}` : formatNumberInputValue(value));
  const total = numberValue(text("total_quantity"));
  const schedule = collectRequestSchedule();
  const scheduleTotal = schedule.reduce((sum, item) => sum + numberValue(item.quantity), 0);
  const row = (label, value) => `<div class="detail-item"><span>${label}</span><strong data-noloc>${esc(value || dash)}</strong></div>`;
  holder.innerHTML = `<div class="detail-list">
      ${row("To'lov manbasi", choice("payment_source"))}
      ${row("Korxona", choice("client_id"))}
      ${row("STIR", text("inn"))}
      ${row("Direktor F.I.Sh.", text("director_full_name"))}
      ${row("ABZ nuqtasi", choice("delivery_point_id"))}
      ${row("Telefon raqami", text("phone"))}
      ${row("Kontakt shaxs F.I.Sh.", text("contact_full_name"))}
      ${row("Mahsulot nomi", choice("product_id"))}
      ${row("Umumiy miqdor", withUnit(total))}
      ${row("Kalendar grafik jami", withUnit(scheduleTotal))}
    </div>
    ${scheduleTotal && scheduleTotal !== total ? `<div class="empty warning">Kalendar grafikdagi jami miqdor umumiy miqdorga teng bo'lishi kerak.</div>` : ""}`;
  localizeDom(holder);
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
  if (!form) return;
  form.elements.client_id?.addEventListener("change", () => applyRequestClient(form));
  form.elements.product_id?.addEventListener("change", () => refreshRequestPoints(form));
  // Yangi talabnomada mijoz oldindan tanlanmagan; tahrirlashda esa
  // maydonlar allaqachon to'ldirilgan va ularni qayta so'rash shart emas.
  if (!request?.id && form.elements.client_id?.value) applyRequestClient(form);
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
  form.addEventListener("input", refreshRequestScheduleTotals);

  const wizard = bindWizard("customer-request-form", {
    steps: REQUEST_WIZARD_STEPS,
    draftKey: request?.id ? "" : "customer-request",
    // Mavjud talabnomada barcha qadamlar ochiq: xodim bitta maydonni
    // to'g'rilash uchun to'rt qadamni qaytadan bosib chiqmaydi.
    unlocked: Boolean(request?.id),
    prepareDraft: async (values) => {
      const rows = (values.schedule_year || []).length;
      const holder = app.querySelector("#customer-request-schedule");
      if (holder && rows) {
        holder.innerHTML = Array.from({ length: rows }, () => customerRequestScheduleRow({ year: "", month: 1 })).join("");
        setupFormattedNumberInputs(app);
      }
      // Mijoz avval o'rnatiladi va kartochka maydonlari yuklab olinadi.
      // Aks holda so'rov qoralama tiklangandan keyin qaytib, qo'lda
      // to'g'rilangan qiymatlar ustidan yozib ketardi.
      const clientId = values.client_id?.[0];
      if (clientId && form.elements.client_id) {
        form.elements.client_id.value = clientId;
        await applyRequestClient(form);
      }
    },
    onSubmit: async (submitted) => {
      const payload = {
        client_id: Number(field(submitted, "client_id")),
        delivery_point_id: field(submitted, "delivery_point_id") ? Number(field(submitted, "delivery_point_id")) : null,
        payment_source: field(submitted, "payment_source"),
        company_name: field(submitted, "company_name"),
        inn: field(submitted, "inn"),
        region: field(submitted, "region"),
        oked: field(submitted, "oked"),
        director_full_name: field(submitted, "director_full_name"),
        legal_address: field(submitted, "legal_address"),
        activity_type: field(submitted, "activity_type"),
        function_description: field(submitted, "function_description"),
        privatization_project_name: field(submitted, "privatization_project_name"),
        bank_account: field(submitted, "bank_account"),
        bank_name: field(submitted, "bank_name"),
        mfo: field(submitted, "mfo"),
        phone: field(submitted, "phone"),
        contact_full_name: field(submitted, "contact_full_name"),
        contact_phone: field(submitted, "contact_phone"),
        product_id: Number(field(submitted, "product_id")),
        total_quantity: normalizeNumberInputValue(field(submitted, "total_quantity")),
        unit: field(submitted, "unit"),
        internal_comment: field(submitted, "internal_comment"),
        schedule: collectRequestSchedule(),
      };
      try {
        if (request.id) {
          await api(`/api/customer-requests/${request.id}`, { method: "PATCH", body: JSON.stringify(payload) });
          showToast("Talabnoma muvaffaqiyatli yangilandi.");
          navigate(`/customer-requests/${request.id}`);
        } else {
          const saved = await api("/api/customer-requests", { method: "POST", body: JSON.stringify(payload) });
          wizard?.clearDraft();
          showToast("Talabnoma yaratildi.");
          navigate(`/customer-requests/${saved.id}`);
        }
      } catch (error) {
        showToast(error.message, true);
      }
    },
  });
  if (!request?.id) wizard?.restoreDraft();
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

// Panel bo'laklari. Ular ro'yxat bilan bitta sahifada turadi: yuqorida
// umumiy manzara, pastda uni tashkil qilgan qatorlar. Ikkita alohida ekran
// bo'lsa, filtrni ikki marta qo'yish kerak bo'lardi va ular bir-biriga zid
// bo'lib qolishi mumkin edi.
function requestDashboardBlocks(board) {
  return `
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
    ${section("Javobsiz turgan talabnomalar", tableOrEmpty(
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
    ))}`;
}

// ---- Status paneli --------------------------------------------------------
//
// Status o'zgartirish ilgari kartochkaning eng pastida, to'qqizta bo'limdan
// sakkizinchisi bo'lib turardi: operator uni ko'rish uchun butun sahifani
// aylantirishi kerak edi, holbuki kartochka ochilishining asosiy sababi
// aynan shu. Endi u sarlavhadan keyin darhol keladi.
//
// Panel uch narsani aytadi: hozir qaysi holatda, bu nimani bildiradi va
// keyin nima qilish mumkin.

const REQUEST_STATUS_HELP = {
  new: "Talabnoma qabul qilindi. Uni ko'rib chiqishga oling.",
  reviewing: "Mijoz bilan ishlanmoqda: shartlar kelishiladi va hujjat yig'iladi.",
  contract_preparation: "Shartnoma matni tayyorlanmoqda.",
  contract_signed: "Shartnoma imzolangan. Endi buyurtmaga o'tkazish mumkin.",
  converted_to_order: "Buyurtma yaratilgan, talabnoma yopildi.",
  rejected: "Talabnoma rad etilgan.",
};

function requestStatusCard(request) {
  const editable = canEdit("sotuv");
  const help = REQUEST_STATUS_HELP[request.status] || "";
  // Xat yo'q bo'lsa, shartnoma tayyorlashga o'tish tugmasi ishlamaydi.
  // Buni tugma bosilgandan keyin xato bilan aytish o'rniga, oldindan
  // aytamiz -- va nima qilish kerakligini ham.
  const blocked = !request.has_letter
    && (request.available_transitions || []).some((move) => move.status === "contract_preparation" && move.direction === "forward");
  return `<section class="card request-status-card">
    <div class="request-status-now">
      <span class="eyebrow">Joriy status</span>
      <div class="request-status-badge">${requestStatusBadge(request)}</div>
      ${help ? `<p class="request-status-help">${help}</p>` : ""}
    </div>
    <div class="request-status-moves">
      ${blocked ? `<div class="request-status-block">
        <strong>Mijozning xati kerak</strong>
        <span>Shartnoma tayyorlashga o'tish uchun avval xatni biriktiring.</span>
      </div>` : ""}
      ${editable ? requestTransitionsHtml(request, { blocked }) : `<div class="empty compact">Statusni o'zgartirish uchun ruxsat yo'q.</div>`}
    </div>
  </section>`;
}

// ---- Hujjatlar ------------------------------------------------------------
//
// Shartnoma mijozning xati asosida tayyorlanadi. Ilgari xat pochtada yoki
// qog'oz papkada qolardi: talabnomani ochgan odam uni topa olmasdi.

const REQUEST_DOCUMENT_TYPES = [
  ["letter", "Mijoz xati"],
  ["specification", "Spetsifikatsiya"],
  ["other", "Boshqa"],
];

function requestDocumentsSection(request) {
  const editable = canEdit("sotuv");
  const rows = (request.documents || []).map((doc) => `<tr>
    <td>${fmt(optionLabel(REQUEST_DOCUMENT_TYPES, doc.document_type))}</td>
    <td>${doc.file_url ? `<a href="${esc(doc.file_url)}" target="_blank" rel="noopener">${fmt(doc.title)}</a>` : fmt(doc.title)}</td>
    <td data-noloc>${fmtDate(doc.uploaded_at)}</td>
    <td>${fmt(doc.uploaded_by)}</td>
    <td>${editable ? `<button class="link-btn danger" type="button" data-delete-request-doc="${doc.id}">O'chirish</button>` : ""}</td>
  </tr>`).join("");
  const upload = editable ? `<form id="request-document-form" class="grid inline-edit">
    ${selectField("document_type", "Hujjat turi", REQUEST_DOCUMENT_TYPES, "letter")}
    ${textField("title", "Nomi", "", "text", { required: true, placeholder: "Mijoz xati" })}
    <label><span class="field-label-text">Fayl <span class="required-mark">*</span></span><input type="file" name="file" required /></label>
    <button class="btn primary" type="submit">Yuklash</button>
  </form>` : "";
  return section("Hujjatlar", `${rows
    ? `<table class="ops-table"><thead><tr><th>Turi</th><th>Nomi</th><th>Sana</th><th>Yuklagan</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">Hujjat biriktirilmagan.</div>`}${upload}`);
}

function bindRequestDocuments(request, reload) {
  const form = app.querySelector("#request-document-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    if (!data.get("file")?.size) {
      showToast("Fayl tanlanmagan.", true);
      return;
    }
    try {
      await apiForm(`/api/customer-requests/${request.id}/documents`, data);
      showToast("Hujjat yuklandi.");
      await reload();
    } catch (error) {
      showToast(error.message, true);
    }
  });
  app.querySelectorAll("[data-delete-request-doc]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmMsg("Hujjat o'chiriladi. Davom etasizmi?")) return;
      try {
        await api(`/api/customer-requests/${request.id}/documents/${button.dataset.deleteRequestDoc}`, { method: "DELETE" });
        showToast("Hujjat o'chirildi.");
        await reload();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}


// Mahsulot almashganda yetkazish nuqtalari ro'yxati qayta yuklanadi: tuzga
// stansiyalar, bitumga ABZ nuqtalari. Tanlangani yangi ro'yxatda bo'lmasa
// tozalanadi -- aks holda forma «tuz, lekin ABZ ga» degan holatda
// saqlanib ketardi.
async function refreshRequestPoints(form) {
  const select = form.elements.delivery_point_id;
  const hint = form.querySelector("[data-request-method-hint]");
  if (!select) return;
  const method = requestProductMethods[form.elements.product_id?.value] || "";
  const current = select.value;
  try {
    select.innerHTML = `<option value="">Tanlanmagan</option>${await deliveryPointOptions(null, null, method)}`;
  } catch (error) {
    showToast(error.message, true);
    return;
  }
  const stillThere = [...select.options].some((option) => option.value === current);
  select.value = stillThere ? current : "";
  if (hint) {
    hint.innerHTML = method
      ? `<div class="form-hint"><span>Yetkazish usuli</span>: <strong>${esc(optionLabel(deliveryMethods, method))}</strong></div>`
      : "";
    localizeDom(hint);
  }
  if (!stillThere && current) showToast("Tanlangan nuqta bu mahsulotga to'g'ri kelmadi, qaytadan tanlang.", true);
  bindSelectSearch(app);
  markWizardFields(form);
}
