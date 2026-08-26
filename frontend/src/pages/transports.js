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

const fuelEntryTypes = [
  ["added", "Quyildi"],
  ["consumed", "Sarflandi"],
];

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
    tabs: [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", active: true }, { label: "Monitoring", path: "/transports/monitoring" }],
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

function fuelLogModal(transportId, log, onSaved) {
  document.querySelector("#fuel-log-modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.id = "fuel-log-modal-backdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:480px">
      <div class="modal-header">
        <h2>${log ? "Yozuvni tahrirlash" : "Yoqilg'i yozuvi qo'shish"}</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="fuel-log-form">
        <div class="modal-body">
          ${textField("entry_date", "Sana", log?.entry_date || todayIso(), "date", { required: true })}
          ${selectField("entry_type", "Turi", fuelEntryTypes, log?.entry_type || "added")}
          ${textField("amount_liters", "Miqdori (litr)", log?.amount_liters ?? "", "number", { required: true, step: "0.01", min: "0.01" })}
          ${textField("cost_amount", "Narxi (so'm)", log?.cost_amount ?? "", "number", { step: "0.01", min: "0" })}
          ${textArea("note", "Izoh", log?.note ?? "")}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn modal-cancel">Bekor qilish</button>
          <button type="submit" class="btn primary">Saqlash</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector(".modal-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector("#fuel-log-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      entry_date: field(form, "entry_date"),
      entry_type: field(form, "entry_type"),
      amount_liters: field(form, "amount_liters"),
      cost_amount: field(form, "cost_amount") || null,
      note: field(form, "note"),
    };
    if (!payload.entry_date || !payload.amount_liters) { showToast("Sana va miqdor kiritilishi shart.", true); return; }
    try {
      if (log) {
        await api(`/api/transports/${transportId}/fuel-logs/${log.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Yozuv yangilandi.");
      } else {
        await api(`/api/transports/${transportId}/fuel-logs`, { method: "POST", body: JSON.stringify(payload) });
        showToast("Yozuv qo'shildi.");
      }
      close();
      await onSaved();
    } catch (error) {
      showToast(error.message, true);
    }
  });
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
  const [transport, summary, checkins] = await Promise.all([
    api(`/api/transports/${id}`),
    api(`/api/transports/${id}/fuel-logs`),
    api(`/api/transports/${id}/checkins?page_size=50`),
  ]);
  const editable = canEdit("yetkazib_berish");
  const headerActions = editable ? [{ label: "Yozuv qo'shish", modal: "add-fuel-log", primary: true }] : [];
  if (editable && transport.driver_employee_id) headerActions.push({ label: "Hisobot so'rash", modal: "request-checkin" });

  app.innerHTML = `<div class="page">
    ${workflowHeader({
      title: `${transport.vehicle_number} — Yoqilg'i nazorati`,
      subtitle: fmt(transport.driver_name),
      backPath: `/transports/${id}/edit`,
      actions: headerActions,
    })}
    ${summaryCards([
      ["Jami quyilgan", `${fmtQty(summary.total_added_liters)} litr`],
      ["Jami sarflangan", `${fmtQty(summary.total_consumed_liters)} litr`],
      ["Qoldiq", `${fmtQty(summary.balance_liters)} litr`, numberValue(summary.balance_liters) < 0 ? "danger" : ""],
      ["Jami xarajat", fmtMoney(summary.total_cost_amount)],
    ])}
    ${section("Yoqilg'i yozuvlari", opsTableOrEmpty(
      summary.logs,
      ["Sana", "Turi", "Miqdori (litr)", "Narxi", "Izoh", editable ? "Amallar" : ""],
      (log) => `<tr>
        <td>${fmt(log.entry_date)}</td>
        <td>${statusChip({ label: optionLabel(fuelEntryTypes, log.entry_type), tone: log.entry_type === "added" ? "success" : "warning" })}</td>
        <td>${fmtQty(log.amount_liters)}</td>
        <td>${log.cost_amount != null ? fmtMoney(log.cost_amount) : dash}</td>
        <td>${fmt(log.note)}</td>
        <td>${editable ? `<div class="table-actions"><button class="link-btn" data-edit-fuel-log="${log.id}">Tahrirlash</button><button class="link-btn" data-delete-fuel-log="${log.id}">O'chirish</button></div>` : ""}</td>
      </tr>`,
      "Yoqilg'i yozuvlari hali yo'q."
    ))}
    ${section("Telegram hisobotlari (haydovchi)", opsTableOrEmpty(
      checkins.items,
      ["Sana", "Turi", "Haydovchi", "Spidometr", "Yoqilg'i", "Fayllar", "Izoh"],
      transportCheckInRowHtml,
      "Haydovchidan hisobotlar hali yo'q."
    ))}
  </div>`;

  const rerender = () => renderTransportFuelLog(id);

  document.querySelector("[data-add-fuel-log]")?.addEventListener("click", () => fuelLogModal(id, null, rerender));
  document.querySelector("[data-request-checkin]")?.addEventListener("click", async () => {
    try {
      await api(`/api/transports/${id}/checkin-request`, { method: "POST" });
      showToast("So'rov haydovchiga yuborildi.");
    } catch (error) {
      showToast(error.message, true);
    }
  });
  document.querySelectorAll("[data-edit-fuel-log]").forEach((button) => button.addEventListener("click", () => {
    const log = summary.logs.find((item) => item.id === Number(button.dataset.editFuelLog));
    fuelLogModal(id, log, rerender);
  }));
  document.querySelectorAll("[data-delete-fuel-log]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirmMsg("Ushbu yoqilg'i yozuvini o'chirishni tasdiqlaysizmi?")) return;
    try {
      await api(`/api/transports/${id}/fuel-logs/${button.dataset.deleteFuelLog}`, { method: "DELETE" });
      showToast("Yozuv o'chirildi.");
      rerender();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

async function renderTransportMonitoring() {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const data = await api("/api/transports/monitoring");
  const s = data.summary;
  app.innerHTML = opsPageShell(
    "Transport monitoring",
    [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", path: "/transports" }, { label: "Monitoring", active: true }],
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
