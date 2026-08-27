// Reysda / yuklashda / tushirishda -- bu ro'yxatda yo'q. Ularni logistika
// biladi va monitoring sahifasi reysdan hisoblab ko'rsatadi. Qo'lda yozilgan
// holat bilan reysdan chiqadigan holat bir maydonni tortishtirsa, ekranda
// «bo'sh» deb turgan mashina ayni paytda reysda bo'lib chiqadi.
const transportStatuses = [
  ["free", "Bo'sh"],
  ["repair", "Ta'mirda"],
  ["service", "Texnik xizmatda"],
  ["idle", "Bekor turibdi"],
  ["inactive", "Parkda emas"],
];

const transportRiskLevels = [
  ["expired", "Muddati o'tgan"],
  ["soon", "Muddati tugayapti"],
  ["unknown", "Kiritilmagan"],
  ["ok", "Joyida"],
];

const TRANSPORT_RISK_TONES = { expired: "danger", soon: "warning", unknown: "muted", ok: "success" };

function transportRiskChip(readiness) {
  if (!readiness) return dash;
  return statusChip({ label: optionLabel(transportRiskLevels, readiness.level), tone: TRANSPORT_RISK_TONES[readiness.level] });
}

// Hodisa turlari. «Quyildi» va «sarflandi» ilgari alohida yoqilg'i
// daftarida edi; jurnal bitta bo'lgach, ular ham shu ro'yxatga kirdi.
const transportEventTypes = [
  ["refuel", "Yoqilg'i quyildi"],
  ["consumption", "Yoqilg'i sarflandi"],
  ["fuel_drop", "Keskin tushish"],
  ["suspected_siphoning", "Slivga shubha"],
  ["sensor_jump", "Datchik sakradi"],
  ["idling", "Dvigatel ishlab turdi"],
  ["route_deviation", "Yo'nalishdan chetlashish"],
  ["unapproved_stop", "Kelishilmagan to'xtash"],
  ["other", "Boshqa"],
];

const transportEventCheckResults = [
  ["not_checked", "Tekshirilmagan"],
  ["normal", "Tekshirildi — normal"],
  ["needs_explanation", "Tushuntirish kerak"],
  ["violation_confirmed", "Buzilish tasdiqlandi"],
];

const transportEventStatuses = [
  ["open", "Ochiq"],
  ["in_review", "Tekshiruvda"],
  ["closed", "Yopilgan"],
  ["cancelled", "Bekor qilindi"],
];

const TRANSPORT_EVENT_TONES = {
  refuel: "success",
  consumption: "muted",
  fuel_drop: "warning",
  suspected_siphoning: "danger",
  sensor_jump: "warning",
  idling: "muted",
  route_deviation: "warning",
  unapproved_stop: "warning",
  other: "muted",
};

const TRANSPORT_CHECK_TONES = {
  not_checked: "warning",
  normal: "success",
  needs_explanation: "warning",
  violation_confirmed: "danger",
};

const transportCheckInKinds = [
  ["report", "Hisobot"],
  ["stopped", "To'xtadi"],
  ["resumed", "Davom etdi"],
];

const transportWorkStatusLabels = {
  moving_with_cargo: "Yuk bilan harakatda",
  moving_without_cargo: "Yuksiz harakatda",
  waiting: "Kutishda",
};

// Mashina bo'yicha reyslar. Bu bo'lim ilgari mumkin emas edi: reys mashinaga
// bog'lanmagan, davlat raqami esa matn bo'lgani uchun bitta raqamdagi uchta
// yozuvdan qaysi biri ekanini aytib bo'lmasdi.
function transportUsagePanel(usage, trips = []) {
  if (!usage) return "";
  const cards = [
    ["Reyslar", `<span>${fmt(usage.trip_count)}</span> <span>ta</span>`],
    ["Tashilgan", fmtQty(usage.delivered_tons, "t")],
    ["Bosib o'tilgan", fmtQty(usage.distance_km, "km")],
    ["Yoqilg'i", usage.fuel_liters > 0 ? fmtQty(usage.fuel_liters, "l") : dash],
    ["Norma bo'yicha", usage.norm_liters !== null && usage.norm_liters !== undefined ? fmtQty(usage.norm_liters, "l") : dash],
    ["Normadan farq", usage.fuel_difference_liters !== null && usage.fuel_difference_liters !== undefined
      ? fmtQty(usage.fuel_difference_liters, "l")
      : dash, usage.fuel_difference_liters > 0 ? "warning" : ""],
  ];
  const rows = trips.map((trip) => `<tr>
    <td><button class="ops-primary-link" data-nav="/logistics/${trip.id}">${fmt(trip.logistics_number)}</button></td>
    <td>${fmt(trip.trip_date)}</td>
    <td>${fmt(trip.client_name)}</td>
    <td>${fmt(trip.route_name)}</td>
    <td class="ops-money">${trip.tons ? fmtQty(trip.tons, "t") : dash}</td>
    <td class="ops-money">${trip.distance_km ? fmtQty(trip.distance_km, "km") : dash}</td>
    <td class="ops-money">${trip.total_hours !== null && trip.total_hours !== undefined ? `${fmtQty(trip.total_hours)} <span>soat</span>` : dash}</td>
    <td>${statusBadge(trip.status)}</td>
  </tr>`).join("");
  return `${section("Mashina bo'yicha xulosa", `${summaryCards(cards)}${usage.liters_per_100km ? `<div class="form-hint"><span>Haqiqiy sarf</span>: <span data-noloc>${fmtQty(usage.liters_per_100km)} l/100 km</span></div>` : ""}`)}
    ${section("Reyslar", trips.length
      ? `<table class="data-table"><thead><tr><th>Reys</th><th>Sana</th><th>Mijoz</th><th>Yo'nalish</th><th>Tonna</th><th>Masofa</th><th>Davomiylik</th><th>Holat</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty">Bu mashinaga biriktirilgan reys yo'q.</div>`)}`;
}

// Kartochka tepasidagi holat chizig'i. Ilgari bu yerda alohida jadval bor
// edi, lekin uning sarlavhalari quyidagi kiritish bo'limlari bilan bir xil
// bo'lib chiqdi -- «Hujjat muddatlari» sahifada ikki marta turardi. Endi
// tepada faqat holat, pastda esa kiritish.
function transportReadinessCard(label, until, daysLeft, level) {
  const value = until
    ? `<span>${esc(until)}</span> · ${daysLeft < 0 ? `<span>${Math.abs(daysLeft)}</span> <span>kun o'tdi</span>` : `<span>${daysLeft}</span> <span>kun qoldi</span>`}`
    : `<span>Kiritilmagan</span>`;
  return [label, value, TRANSPORT_RISK_TONES[level] === "success" ? "" : TRANSPORT_RISK_TONES[level]];
}

function transportReadinessPanel(readiness) {
  if (!readiness) return "";
  const service = readiness.service || {};
  const serviceValue = service.remaining_km === null || service.remaining_km === undefined
    ? `<span>Kiritilmagan</span>`
    : service.remaining_km < 0
      ? `<span>${fmtQty(Math.abs(service.remaining_km), "km")}</span> <span>o'tib ketdi</span>`
      : `<span>${fmtQty(service.remaining_km, "km")}</span> <span>qoldi</span>`;
  const cards = readiness.documents.map((row) => transportReadinessCard(row.label, row.until, row.days_left, row.level));
  cards.push(["Texnik xizmatgacha", serviceValue, TRANSPORT_RISK_TONES[service.level] === "success" ? "" : TRANSPORT_RISK_TONES[service.level]]);
  return `${summaryCards(cards)}${workflowWarningsPanel(readiness.warnings || [])}`;
}

function transportFormHtml(item = {}, employees = []) {
  const title = item.id ? "Transportni tahrirlash" : "Yangi transport";
  const employeeOptions = [["", "Tanlanmagan"], ...employees.map((e) => [String(e.id), e.full_name])];
  return `<div class="page">
    <div class="page-header">
      <div class="page-title"><h1>${title}</h1><p>Transport va haydovchi ma'lumotlari.</p></div>
      <div class="actions">
        <button class="btn" data-nav="/transports">Orqaga</button>
        ${item.id ? `<button class="btn" data-nav="/transports/${item.id}/fuel">Yoqilg'i nazorati</button>` : ""}
      </div>
    </div>
    ${item.id ? transportReadinessPanel(item.readiness) : ""}
    ${item.id ? transportUsagePanel(item.usage, item.trips) : ""}
    <form id="transport-form">
      ${section("Transport ma'lumotlari", `<div class="grid">
        ${textField("vehicle_number", "Transport raqami", item.vehicle_number || "", "text", { required: true })}
        ${textField("trailer_number", "Tirkama raqami", item.trailer_number || "")}
        ${textField("brand_model", "Marka va model", item.brand_model || "")}
        ${textField("production_year", "Ishlab chiqarilgan yil", item.production_year || "", "text", { pattern: "(19|20)[0-9]{2}", maxlength: 4, inputmode: "numeric", title: "To'rt xonali yil kiriting" })}
        ${textField("vehicle_type", "Transport turi", item.vehicle_type || "")}
        ${textField("capacity_tons", "Sisterna sig'imi, t", item.capacity_tons || "", "number")}
        ${textField("base_location", "Baza / bo'linma", item.base_location || "")}
        ${textField("tracker_id", "GPS trekeri ID", item.tracker_id || "")}
      </div>`)}
      ${section("Haydovchi va mas'ul", `<div class="grid">
        ${selectField("driver_employee_id", "Biriktirilgan haydovchi", employeeOptions, item.driver_employee_id != null ? String(item.driver_employee_id) : "")}
        ${textField("driver_phone", "Haydovchi telefoni", item.driver_phone || "")}
        ${textField("responsible_name", "Mas'ul xodim", item.responsible_name || "")}
        ${selectField("status", "Parkdagi holati", transportStatuses, item.status || "free")}
        ${textField("unavailable_reason", "Ishlamayotgan bo'lsa, sababi", item.unavailable_reason || "")}
        ${textField("current_location", "Hozirgi joylashuvi", item.current_location || "")}
      </div>`)}
      ${section("Hujjat muddatlari", `<div class="grid">
        ${textField("tech_inspection_until", "Texnik ko'rik amal qiladi", item.tech_inspection_until || "", "date")}
        ${textField("insurance_until", "Sug'urta amal qiladi", item.insurance_until || "", "date")}
        ${textField("adr_until", "ADR ruxsatnomasi amal qiladi", item.adr_until || "", "date")}
      </div><div class="form-hint">Muddat tugashiga bir oy qolganda yetkazib berish bo'limiga xabar boradi.</div>`)}
      ${section("Texnik xizmat", `<div class="grid">
        ${textField("service_interval_km", "TO oralig'i, km", item.service_interval_km || "", "number")}
        ${textField("last_service_km", "Oxirgi TO qaysi kilometrda", item.last_service_km || "", "number")}
        ${textField("last_service_date", "Oxirgi TO sanasi", item.last_service_date || "", "date")}
      </div><div class="form-hint">Keyingi TO shu uch qiymatdan hisoblanadi, alohida yozilmaydi.</div>${item.readiness ? `<div class="service-position">` + detailList([
        ["Joriy odometr", item.readiness.service.current_km ? fmtQty(item.readiness.service.current_km, "km") : null],
        ["Keyingi TO, km", item.readiness.service.next_km ? fmtQty(item.readiness.service.next_km, "km") : null],
      ]) + `</div>` : ""}`)}
      ${section("Yoqilg'i", `<div class="grid">
        ${textField("fuel_tank_liters", "Bak hajmi, l", item.fuel_tank_liters || "", "number")}
        ${textField("fuel_norm_loaded", "Norma: yuk bilan, l/100 km", item.fuel_norm_loaded || "", "number")}
        ${textField("fuel_norm_empty", "Norma: bo'sh, l/100 km", item.fuel_norm_empty || "", "number")}
      </div><div class="form-hint">Norma kiritilmasa, ortiqcha sarfni hisoblab bo'lmaydi.</div>`)}
      ${section("Qo'shimcha", `<div class="grid">
        ${textField("capacity", "Sig'imi haqida izoh", item.capacity || "")}
        ${textArea("notes", "Izoh", item.notes || "")}
      </div>`)}
      <div class="form-footer"><button type="button" class="btn" data-nav="/transports">Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div>
    </form>
  </div>`;
}

const TRANSPORT_NUMERIC_FIELDS = ["capacity_tons", "fuel_tank_liters", "fuel_norm_loaded", "fuel_norm_empty", "service_interval_km", "last_service_km"];
const TRANSPORT_TEXT_FIELDS = [
  "driver_phone", "vehicle_number", "trailer_number", "vehicle_type", "capacity",
  "current_location", "notes", "brand_model", "base_location", "tracker_id",
  "responsible_name", "unavailable_reason",
  "last_service_date", "tech_inspection_until", "insurance_until", "adr_until",
];

function collectTransportPayload(form) {
  const driverEmployeeId = field(form, "driver_employee_id");
  const productionYear = field(form, "production_year");
  const payload = {
    driver_employee_id: driverEmployeeId ? Number(driverEmployeeId) : null,
    production_year: productionYear ? Number(productionYear) : null,
    status: field(form, "status") || "free",
  };
  for (const name of TRANSPORT_TEXT_FIELDS) payload[name] = field(form, name);
  for (const name of TRANSPORT_NUMERIC_FIELDS) payload[name] = field(form, name);
  return payload;
}

function bindTransportForm(item = null) {
  document.querySelector("#transport-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const saved = await api(item ? `/api/transports/${item.id}` : "/api/transports", {
        method: item ? "PATCH" : "POST",
        body: JSON.stringify(collectTransportPayload(event.currentTarget)),
      });
      showToast("Transport saqlandi.");
      navigate(`/transports/${saved.id}/edit`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderTransportsList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/transports?${params.toString()}`);
  const freeCount = data.items.filter((item) => item.status === "free").length;
  const riskCount = data.items.filter((item) => item.readiness && (item.readiness.level === "expired" || item.readiness.level === "soon")).length;
  const editable = canEdit("yetkazib_berish");
  app.innerHTML = opsListPage({
    className: "transports-ops-page",
    title: "Transportlar",
    tabs: [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", active: true }, { label: "Hodisalar", path: "/transport-events" }, { label: "Monitoring", path: "/transports/monitoring" }],
    clearPath: "/transports",
    counter: `${fmt(data.total)} ta transport · ${fmt(freeCount)} ta bo'sh · ${fmt(riskCount)} tasida hujjat muddati`,
    formId: "transport-search-form",
    filters: `${opsFilterField("Qidirish", `<input name="search" placeholder="Haydovchi, transport raqami" value="${esc(params.get("search") || "")}" />`)}${opsFilterField("Parkdagi holati", `<select name="status"><option value="">Barchasi</option>${transportStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}${opsFilterField("Hujjatlar", `<select name="risk"><option value="">Barchasi</option>${transportRiskLevels.map(([key, label]) => `<option value="${key}" ${params.get("risk") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}`,
    headers: ["Transport", "Haydovchi", "Tirkama", "Sig'im", "Hujjatlar", "TO gacha", "Parkdagi holati", ""],
    rows: data.items.map((item) => `<tr><td>${editable ? `<button class="ops-primary-link" data-nav="/transports/${item.id}/edit">${fmt(item.vehicle_number)}</button>` : fmt(item.vehicle_number)}</td><td>${fmt(item.driver_name)}</td><td>${fmt(item.trailer_number)}</td><td>${item.capacity_tons ? fmtQty(item.capacity_tons, "t") : fmt(item.capacity)}</td><td>${transportRiskChip(item.readiness)}</td><td class="ops-money">${item.readiness?.service?.remaining_km !== null && item.readiness?.service?.remaining_km !== undefined ? fmtQty(item.readiness.service.remaining_km, "km") : dash}</td><td>${statusBadge(item.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/transports/${item.id}/fuel">Yoqilg'i</button>${editable ? `<button class="link-btn" data-nav="/transports/${item.id}/edit">Tahrirlash</button><button class="link-btn" data-delete-transport="${item.id}">O'chirish</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Transportlar topilmadi.",
    colspan: 8,
    footer: opsFooter(data, "transport"),
    createPath: editable ? "/transports/new" : undefined,
    createLabel: "Transport qo'shish",
  });
  bindOpsSearch("transport-search-form", "/transports", ["search", "status", "risk"]);
  bindOpsPagination("transport", "/transports");
  document.querySelectorAll("[data-delete-transport]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirmMsg("Transportni o'chirasizmi?")) return;
    try {
      await api(`/api/transports/${button.dataset.deleteTransport}`, { method: "DELETE" });
      showToast("Transport o'chirildi.");
      renderTransportsList();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

async function activeEmployeesForDriverSelect() {
  const employees = await api("/api/attendance/employees");
  return employees.filter((e) => e.is_active);
}

async function renderNewTransport() {
  const employees = await activeEmployeesForDriverSelect();
  app.innerHTML = transportFormHtml({}, employees);
  bindTransportForm();
}

async function renderEditTransport(id) {
  const [item, employees] = await Promise.all([
    api(`/api/transports/${id}`),
    activeEmployeesForDriverSelect(),
  ]);
  app.innerHTML = transportFormHtml(item, employees);
  bindTransportForm(item);
}

// Hodisa oynasi ikki qismga bo'lingan: yuqorisi -- nima bo'lgani, pastki
// qismi -- tekshiruv izi. Ikkovi bir uyumda tursa, yozuvni kim va qachon
// yopganini ko'rish qiyin bo'ladi.
function transportEventModal(event, defaults, onSaved) {
  document.querySelector("#event-modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.id = "event-modal-backdrop";
  backdrop.className = "modal-backdrop";
  const value = (name, fallback = "") => event?.[name] ?? defaults?.[name] ?? fallback;
  backdrop.innerHTML = `
    <div class="modal-panel wide">
      <div class="modal-header">
        <h2>${event ? "Hodisani tahrirlash" : "Hodisa qo'shish"}</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="transport-event-form">
        <div class="modal-body">
          <h3>Hodisa</h3>
          <div class="grid">
            ${textField("occurred_at", "Sana va vaqt", String(value("occurred_at", "")).slice(0, 16), "datetime-local", { required: true })}
            ${selectField("event_type", "Turi", transportEventTypes, value("event_type", "refuel"))}
            ${textField("source", "Sabab / signal manbasi", value("source"))}
            ${textField("location", "Joyi", value("location"))}
            ${textField("gps_coordinates", "GPS koordinatasi", value("gps_coordinates"))}
            ${textField("odometer_km", "Odometr (km)", value("odometer_km"), "number")}
            ${textField("speed_kmh", "Tezlik (km/soat)", value("speed_kmh"), "number")}
            ${selectField("engine_running", "Dvigatel", [["", "Noma'lum"], ["1", "Ishlayapti"], ["0", "O'chirilgan"]], value("engine_running") === true ? "1" : value("engine_running") === false ? "0" : "")}
          </div>
          <h3>Yoqilg'i</h3>
          <div class="grid">
            ${textField("fuel_before_liters", "Bakda: oldin (l)", value("fuel_before_liters"), "number")}
            ${textField("fuel_after_liters", "Bakda: keyin (l)", value("fuel_after_liters"), "number")}
            ${textField("amount_liters", "Miqdori (l)", value("amount_liters"), "number")}
            ${textField("possible_loss_liters", "Ehtimoliy yo'qotish (l)", value("possible_loss_liters"), "number")}
            ${textField("confirmed_consumption_liters", "Tasdiqlangan sarf (l)", value("confirmed_consumption_liters"), "number")}
            ${textField("cost_amount", "Narxi", value("cost_amount"), "number")}
            ${textField("document_reference", "Hujjat / chek", value("document_reference"))}
          </div>
          <p class="form-hint">Bak ko'rsatkichlari kiritilsa, miqdor shulardan hisoblanadi.</p>
          <h3>Tekshiruv</h3>
          <div class="grid">
            ${selectField("check_result", "Tekshiruv natijasi", transportEventCheckResults, value("check_result", "not_checked"))}
            ${textField("checked_by", "Kim tekshirdi", value("checked_by"))}
            ${selectField("status", "Holati", transportEventStatuses, value("status", "open"))}
            ${textField("approved_by", "Kim kelishdi", value("approved_by"))}
            ${textField("damage_amount", "Zarar / undirish summasi", value("damage_amount"), "number")}
            ${textField("evidence_url", "Dalil havolasi", value("evidence_url"))}
          </div>
          ${textArea("driver_explanation", "Haydovchi tushuntirishi", value("driver_explanation"))}
          ${textArea("decision", "Qaror", value("decision"))}
          ${textArea("note", "Izoh", value("note"))}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn modal-cancel">Bekor qilish</button>
          <button type="submit" class="btn primary">Saqlash</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(backdrop);
  // Oyna `document.body` ga qo'shiladi, kuzatuvchi esa faqat `#app` ni
  // kuzatadi -- shuning uchun tarjima qo'lda chaqiriladi.
  localizeDom(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector(".modal-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector("#transport-event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const engine = field(form, "engine_running");
    const payload = {
      occurred_at: field(form, "occurred_at"),
      event_type: field(form, "event_type"),
      source: field(form, "source"),
      location: field(form, "location"),
      gps_coordinates: field(form, "gps_coordinates"),
      odometer_km: field(form, "odometer_km"),
      speed_kmh: field(form, "speed_kmh"),
      engine_running: engine === null ? null : engine === "1",
      fuel_before_liters: field(form, "fuel_before_liters"),
      fuel_after_liters: field(form, "fuel_after_liters"),
      amount_liters: field(form, "amount_liters"),
      possible_loss_liters: field(form, "possible_loss_liters"),
      confirmed_consumption_liters: field(form, "confirmed_consumption_liters"),
      cost_amount: field(form, "cost_amount"),
      document_reference: field(form, "document_reference"),
      evidence_url: field(form, "evidence_url"),
      approved_by: field(form, "approved_by"),
      driver_explanation: field(form, "driver_explanation"),
      check_result: field(form, "check_result"),
      checked_by: field(form, "checked_by"),
      decision: field(form, "decision"),
      damage_amount: field(form, "damage_amount"),
      status: field(form, "status"),
      note: field(form, "note"),
    };
    try {
      if (event) {
        await api(`/api/transports/events/${event.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/transports/events", { method: "POST", body: JSON.stringify({ ...payload, transport_id: Number(defaults.transport_id) }) });
      }
      showToast("Hodisa saqlandi.");
      close();
      await onSaved();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function transportEventRow(event, { showVehicle = false, editable = false } = {}) {
  const liters = event.fuel_before_liters != null && event.fuel_after_liters != null
    ? Math.abs(numberValue(event.fuel_after_liters) - numberValue(event.fuel_before_liters))
    : event.amount_liters;
  return `<tr>
    <td><button class="ops-primary-link" data-open-event="${event.id}">${fmt(event.event_number)}</button></td>
    <td>${fmtDate(event.occurred_at)}</td>
    ${showVehicle ? `<td>${fmt(event.transport?.vehicle_number)}</td>` : ""}
    <td>${statusChip({ label: optionLabel(transportEventTypes, event.event_type), tone: TRANSPORT_EVENT_TONES[event.event_type] })}</td>
    <td>${fmt(event.source || event.location)}</td>
    <td class="ops-money">${liters != null ? fmtQty(liters, "litr") : dash}</td>
    <td class="ops-money">${event.possible_loss_liters != null ? fmtQty(event.possible_loss_liters, "litr") : dash}</td>
    <td>${fmt(event.logistics_number)}</td>
    <td>${statusChip({ label: optionLabel(transportEventCheckResults, event.check_result), tone: TRANSPORT_CHECK_TONES[event.check_result] })}</td>
    <td class="ops-money">${event.damage_amount != null ? fmtMoney(event.damage_amount) : dash}</td>
    <td>${statusBadge(event.status)}</td>
    ${editable ? `<td><div class="ops-row-actions"><button class="link-btn" data-open-event="${event.id}">Ochish</button><button class="link-btn" data-delete-event="${event.id}">O'chirish</button></div></td>` : ""}
  </tr>`;
}

function transportEventSummaryCards(summary) {
  return summaryCards([
    ["Hodisalar", `<span>${fmt(summary.total)}</span> <span>ta</span>`],
    ["Ochiq", `<span>${fmt(summary.open_count)}</span> <span>ta</span>`, summary.open_count ? "warning" : ""],
    ["Tekshirilmagan", `<span>${fmt(summary.not_checked_count)}</span> <span>ta</span>`, summary.not_checked_count ? "warning" : ""],
    ["Quyilgan", fmtQty(summary.refuelled_liters, "litr")],
    ["Ehtimoliy yo'qotish", fmtQty(summary.possible_loss_liters, "litr"), numberValue(summary.possible_loss_liters) > 0 ? "danger" : ""],
    ["Undirilgan zarar", fmtMoney(summary.damage_amount)],
  ]);
}

function bindTransportEventActions(events, rerender, editable) {
  document.querySelectorAll("[data-open-event]").forEach((button) => button.addEventListener("click", () => {
    const event = events.find((item) => item.id === Number(button.dataset.openEvent));
    if (event) transportEventModal(event, null, rerender);
  }));
  if (!editable) return;
  document.querySelectorAll("[data-delete-event]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirmMsg("Ushbu hodisani o'chirishni tasdiqlaysizmi?")) return;
    try {
      await api(`/api/transports/events/${button.dataset.deleteEvent}`, { method: "DELETE" });
      showToast("Hodisa o'chirildi.");
      rerender();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

function transportCheckInRowHtml(checkin) {
  const kindLabel = optionLabel(transportCheckInKinds, checkin.kind);
  const kindTone = checkin.kind === "stopped" ? "warning" : checkin.kind === "resumed" ? "success" : "muted";
  const photos = [
    checkin.odometer_photo_url ? `<a href="${esc(checkin.odometer_photo_url)}" target="_blank" rel="noopener">Spidometr rasmi</a>` : "",
    checkin.fuel_photo_url ? `<a href="${esc(checkin.fuel_photo_url)}" target="_blank" rel="noopener">Yoqilg'i rasmi</a>` : "",
  ].filter(Boolean).join(", ") || dash;
  return `<tr>
    <td>${fmtDate(checkin.created_at)}</td>
    <td>${statusChip({ label: kindLabel, tone: kindTone })}</td>
    <td>${fmt(checkin.employee?.full_name)}</td>
    <td>${checkin.odometer_km != null ? `${fmtQty(checkin.odometer_km)} km` : dash}</td>
    <td>${checkin.fuel_liters != null ? `${fmtQty(checkin.fuel_liters)} L` : dash}</td>
    <td>${photos}</td>
    <td>${fmt(checkin.note)}</td>
  </tr>`;
}

async function renderTransportFuelLog(id) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const [transport, events, summary, checkins] = await Promise.all([
    api(`/api/transports/${id}`),
    api(`/api/transports/events?transport_id=${id}&page_size=200`),
    api(`/api/transports/events/summary?transport_id=${id}`),
    api(`/api/transports/${id}/checkins?page_size=50`),
  ]);
  const editable = canEdit("yetkazib_berish");
  const headerActions = editable ? [{ label: "Hodisa qo'shish", modal: "add-event", primary: true }] : [];
  if (editable && transport.driver_employee_id) headerActions.push({ label: "Hisobot so'rash", modal: "request-checkin" });
  const rerender = () => renderTransportFuelLog(id);

  app.innerHTML = `<div class="page">
    ${workflowHeader({
      // Sarlavha -- ma'lumot, ya'ni davlat raqami. Unga jumla qo'shilsa,
      // butun matn lug'atga tushmaydigan yangi satr bo'lib qoladi.
      title: transport.vehicle_number,
      subtitle: subtitleLine([{ value: "Yoqilg'i va hodisalar" }, { value: transport.driver_name, raw: true }]),
      backPath: `/transports/${id}/edit`,
      actions: headerActions,
    })}
    ${transportEventSummaryCards(summary)}
    ${workflowWarningsPanel(summary.warnings || [])}
    ${section("Hodisalar jurnali", opsTableOrEmpty(
      events.items,
      ["Hodisa", "Sana", "Turi", "Sabab / joyi", "Miqdor", "Yo'qotish", "Reys", "Tekshiruv", "Zarar", "Holati", editable ? "Amallar" : ""],
      (event) => transportEventRow(event, { editable }),
      "Hodisalar hali yozilmagan."
    ))}
    ${section("Haydovchi hisobotlari", opsTableOrEmpty(
      checkins.items,
      ["Sana", "Turi", "Haydovchi", "Spidometr", "Yoqilg'i", "Fayllar", "Izoh"],
      transportCheckInRowHtml,
      "Haydovchidan hisobotlar hali yo'q."
    ))}
  </div>`;

  document.querySelector("[data-add-event]")?.addEventListener("click", () =>
    transportEventModal(null, { transport_id: id, occurred_at: new Date().toISOString().slice(0, 16) }, rerender));
  document.querySelector("[data-request-checkin]")?.addEventListener("click", async () => {
    try {
      await api(`/api/transports/${id}/checkin-request`, { method: "POST" });
      showToast("So'rov haydovchiga yuborildi.");
    } catch (error) {
      showToast(error.message, true);
    }
  });
  bindTransportEventActions(events.items, rerender, editable);
}

// Butun park bo'yicha jurnal. Nazorat aynan shu ro'yxatdan boshlanadi:
// tekshirilmagan hodisa qaysi mashinada ekani emas, umuman qanchasi
// qolgani muhim.
async function renderTransportEvents() {
  const params = new URLSearchParams(location.search);
  const [data, summary, transports] = await Promise.all([
    api(`/api/transports/events?${params.toString()}`),
    // Xulosa ro'yxat bilan bir xil filtrlanadi -- bir sahifada ikki xil
    // raqam turmasin.
    api(`/api/transports/events/summary?${params.toString()}`),
    api("/api/transports?page_size=200"),
  ]);
  const editable = canEdit("yetkazib_berish");
  const rerender = () => renderTransportEvents();
  const vehicleOptions = transports.items
    .map((item) => `<option value="${item.id}" ${params.get("transport_id") === String(item.id) ? "selected" : ""}>${esc(item.vehicle_number)}</option>`)
    .join("");

  app.innerHTML = opsListPage({
    className: "transport-events-ops-page",
    title: "Yoqilg'i va hodisalar",
    tabs: [
      { label: "Partiyalar", path: "/delivery-batches" },
      { label: "Logistika", path: "/logistics" },
      { label: "Transportlar", path: "/transports" },
      { label: "Hodisalar", active: true },
      { label: "Monitoring", path: "/transports/monitoring" },
    ],
    clearPath: "/transport-events",
    counter: `${fmt(data.total)} ta hodisa · ${fmt(summary.not_checked_count)} tasi tekshirilmagan`,
    formId: "transport-event-search-form",
    filters: `${opsFilterField("Qidirish", `<input name="search" placeholder="Hodisa, mashina, joy" value="${esc(params.get("search") || "")}" />`)}${
      opsFilterField("Mashina", `<select name="transport_id"><option value="">Barchasi</option>${vehicleOptions}</select>`)}${
      opsFilterField("Turi", `<select name="event_type"><option value="">Barchasi</option>${transportEventTypes.map(([key, label]) => `<option value="${key}" ${params.get("event_type") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}${
      opsFilterField("Tekshiruv", `<select name="check_result"><option value="">Barchasi</option>${transportEventCheckResults.map(([key, label]) => `<option value="${key}" ${params.get("check_result") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}${
      opsFilterField("Holati", `<select name="status"><option value="">Barchasi</option>${transportEventStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}`,
    headers: ["Hodisa", "Sana", "Mashina", "Turi", "Sabab / joyi", "Miqdor", "Yo'qotish", "Reys", "Tekshiruv", "Zarar", "Holati", editable ? "Amallar" : ""],
    rows: data.items.map((event) => transportEventRow(event, { showVehicle: true, editable })).join(""),
    emptyText: "Hodisalar topilmadi.",
    colspan: editable ? 12 : 11,
    footer: opsFooter(data, "transportevent"),
  });
  app.querySelector(".page")?.insertAdjacentHTML("afterbegin", `${transportEventSummaryCards(summary)}${workflowWarningsPanel(summary.warnings || [])}`);
  bindOpsSearch("transport-event-search-form", "/transport-events", ["search", "transport_id", "event_type", "check_result", "status"]);
  bindOpsPagination("transportevent", "/transport-events");
  bindTransportEventActions(data.items, rerender, editable);
}

async function renderTransportMonitoring() {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const data = await api("/api/transports/monitoring");
  const s = data.summary;
  app.innerHTML = opsPageShell(
    "Transport monitoring",
    [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", path: "/transports" }, { label: "Hodisalar", path: "/transport-events" }, { label: "Monitoring", active: true }],
    `${summaryCards([
      ["Jami avtomashina", `${fmt(s.total)}ta`],
      ["Ish holatida", `${fmt(s.working)}ta`],
      ["Ishsiz", `${fmt(s.idle)}ta`],
      ["Ta'mirda", `${fmt(s.maintenance)}ta`],
      ["Yuk bilan harakatda", `${fmt(s.moving_with_cargo)}ta`],
      ["Yuksiz harakatda", `${fmt(s.moving_without_cargo)}ta`],
      ["Kutishda", `${fmt(s.waiting)}ta`],
      ["Jami reyslar (bu oy)", `${fmt(s.total_trips)}ta`],
    ])}
    ${section("Ish holatidagi avtomashinalar", opsTableOrEmpty(
      data.working,
      ["Transport", "Haydovchi", "Holati", "Yuk (t)", "Jo'nash nuqtasi", "Hozirgi joylashuvi", "Borish manzili", "Masofa (km)", "GSM (litr)", "Tashkilotlar soni"],
      (row) => `<tr><td>${fmt(row.vehicle_number)}</td><td>${fmt(row.driver_name)}</td><td>${fmt(transportWorkStatusLabels[row.work_status] || row.work_status)}</td><td>${fmtQty(row.cargo_tonnage)}</td><td>${fmt(row.departure_point)}</td><td>${fmt(row.current_location)}</td><td>${fmt(row.destination)}</td><td>${row.distance_km != null ? fmtQty(row.distance_km, "km") : dash}</td><td>${row.fuel_liters != null ? fmtQty(row.fuel_liters, "litr") : dash}</td><td>${fmt(row.assigned_orgs_count)}</td></tr>`,
      "Hozircha ish holatidagi avtomashina yo'q."
    ))}
    ${section("Ishsiz / ta'mirdagi avtomashinalar", opsTableOrEmpty(
      data.idle,
      ["Transport", "Haydovchi", "Holati", "Oxirgi buyurtma", "Oxirgi reys holati", "Izoh"],
      (row) => `<tr><td>${fmt(row.vehicle_number)}</td><td>${fmt(row.driver_name)}</td><td>${statusBadge(row.status)}</td><td>${fmt(row.last_order_number)}</td><td>${row.last_logistics_status ? fmt(optionLabel(logisticsStatuses, row.last_logistics_status)) : dash}</td><td>${fmt(row.notes)}</td></tr>`,
      "Hozircha ishsiz avtomashina yo'q."
    ))}
    ${section("Yo'nalishlar bo'yicha", opsTableOrEmpty(
      data.routes,
      ["Yo'nalish", "Biriktirilgan avto", "Reyslar soni"],
      (row) => `<tr><td>${fmt(row.route_name)}</td><td>${fmt(row.vehicle_count)}</td><td>${fmt(row.trip_count)}</td></tr>`,
      "Hozircha yo'nalish ma'lumotlari yo'q."
    ))}`
  );
}
