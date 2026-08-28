// ---- Yetkazib berish: TO va ta'mir arizalari ----
//
// Bu bo'lim umuman yo'q edi: mashina ta'mirda ekanini faqat bitta bayroq
// aytardi. Nima buzilgani, qancha turib qolgani, qancha pul ketgani va kim
// tuzatgani hech qayerda yozilmasdi.

const repairCategories = [
  ["engine", "Dvigatel"],
  ["transmission", "Transmissiya"],
  ["chassis", "Yurish qismi"],
  ["brakes", "Tormozlar"],
  ["electrics", "Elektr"],
  ["tyres", "Shinalar"],
  ["tank", "Sisterna"],
  ["service", "Rejali texnik xizmat"],
  ["other", "Boshqa"],
];

const repairSeverities = [
  ["low", "Past"],
  ["medium", "O'rtacha"],
  ["critical", "Kritik"],
];

const repairSources = [
  ["driver", "Haydovchi"],
  ["inspection", "Ko'rik"],
  ["dispatcher", "Dispetcher"],
  ["scheduled", "Reja bo'yicha"],
  ["other", "Boshqa"],
];

const repairStatuses = [
  ["new", "Yangi ariza"],
  ["diagnosis", "Diagnostika"],
  ["waiting_parts", "Ehtiyot qism kutilmoqda"],
  ["in_repair", "Ta'mirda"],
  ["done", "Tayyor"],
  ["closed", "Yopilgan"],
  ["cancelled", "Bekor qilingan"],
];

const REPAIR_SEVERITY_TONES = { low: "muted", medium: "warning", critical: "danger" };

const REPAIR_STATUS_TONES = {
  new: "warning",
  diagnosis: "warning",
  waiting_parts: "warning",
  in_repair: "warning",
  done: "success",
  closed: "muted",
  cancelled: "muted",
};

// `statusBadge` yorliqni butun ilova bo'ylab qidiradi va birinchi mos
// kelganini oladi: «new» topshiriqlar ro'yxatidan «Yangi» ni, «closed» esa
// boshqa moduldan «Yopildi» ni olib kelardi. Ta'mir holatlari o'z
// ro'yxatidan olinadi.
function repairStatusChip(status) {
  return statusChip({ label: optionLabel(repairStatuses, status), tone: REPAIR_STATUS_TONES[status] });
}

function repairHours(value) {
  if (value === null || value === undefined) return dash;
  return `<span data-noloc>${esc(fmtQty(value))}</span> <span>soat</span>`;
}

function repairSummaryCards(summary) {
  return summaryCards([
    ["Arizalar", `<span>${fmt(summary.total)}</span> <span>ta</span>`],
    ["Ochiq", `<span>${fmt(summary.open_count)}</span> <span>ta</span>`, summary.open_count ? "warning" : ""],
    ["Kritik", `<span>${fmt(summary.critical_open_count)}</span> <span>ta</span>`, summary.critical_open_count ? "danger" : ""],
    ["Turib qolish", repairHours(summary.downtime_hours)],
    ["Ehtiyot qismlar", fmtMoney(summary.parts_amount)],
    ["Jami xarajat", fmtMoney(summary.total_amount)],
  ]);
}

function repairRow(repair, { showVehicle = false, editable = false } = {}) {
  return `<tr>
    <td><button class="ops-primary-link" data-nav="/transport-repairs/${repair.id}">${fmt(repair.repair_number)}</button></td>
    <td>${fmtDate(repair.opened_at)}</td>
    ${showVehicle ? `<td>${fmt(repair.transport?.vehicle_number)}</td>` : ""}
    <td>${fmt(optionLabel(repairCategories, repair.category))}</td>
    <td>${statusChip({ label: optionLabel(repairSeverities, repair.severity), tone: REPAIR_SEVERITY_TONES[repair.severity] })}</td>
    <td>${fmt(repair.description)}</td>
    <td>${repair.can_move ? "" : statusChip({ label: "Yura olmaydi", tone: "danger" })}</td>
    <td class="ops-money">${repairHours(repair.downtime_hours)}</td>
    <td class="ops-money">${fmtMoney(repair.total_amount)}</td>
    <td>${repairStatusChip(repair.status)}</td>
    ${editable ? `<td><div class="ops-row-actions"><button class="link-btn" data-nav="/transport-repairs/${repair.id}">Ochish</button><button class="link-btn" data-delete-repair="${repair.id}">O'chirish</button></div></td>` : ""}
  </tr>`;
}

async function renderRepairsList() {
  const params = new URLSearchParams(location.search);
  const [data, summary, transports] = await Promise.all([
    api(`/api/transports/repairs?${params.toString()}`),
    api(`/api/transports/repairs/summary?${params.toString()}`),
    api("/api/transports?page_size=200"),
  ]);
  const editable = canEdit("yetkazib_berish");
  const vehicleOptions = transports.items
    .map((item) => `<option value="${item.id}" ${params.get("transport_id") === String(item.id) ? "selected" : ""}>${esc(item.vehicle_number)}</option>`)
    .join("");

  app.innerHTML = opsListPage({
    className: "repairs-ops-page",
    title: "TO va ta'mir",
    tabs: [
      { label: "Partiyalar", path: "/delivery-batches" },
      { label: "Logistika", path: "/logistics" },
      { label: "Transportlar", path: "/transports" },
      { label: "Hodisalar", path: "/transport-events" },
      { label: "TO va ta'mir", active: true },
      { label: "Xulosa", path: "/fleet-summary" },
    ],
    createPath: editable ? "/transport-repairs/new" : undefined,
    createLabel: "Ariza ochish",
    clearPath: "/transport-repairs",
    counter: `${fmt(data.total)} ta ariza · ${fmt(summary.open_count)} tasi ochiq`,
    formId: "repair-search-form",
    filters: `${opsFilterField("Qidirish", `<input name="search" placeholder="Ariza, mashina, nosozlik, pudratchi" value="${esc(params.get("search") || "")}" />`)}${
      opsFilterField("Mashina", `<select name="transport_id"><option value="">Barchasi</option>${vehicleOptions}</select>`)}${
      opsFilterField("Kategoriya", `<select name="category"><option value="">Barchasi</option>${repairCategories.map(([key, label]) => `<option value="${key}" ${params.get("category") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}${
      opsFilterField("Kritiklik", `<select name="severity"><option value="">Barchasi</option>${repairSeverities.map(([key, label]) => `<option value="${key}" ${params.get("severity") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}${
      opsFilterField("Holati", `<select name="status"><option value="">Barchasi</option>${repairStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}`,
    headers: ["Ariza", "Ochilgan", "Mashina", "Kategoriya", "Kritiklik", "Nosozlik", "", "Turib qolish", "Xarajat", "Holati", editable ? "Amallar" : ""],
    rows: data.items.map((repair) => repairRow(repair, { showVehicle: true, editable })).join(""),
    emptyText: "Ta'mir arizalari topilmadi.",
    colspan: editable ? 11 : 10,
    footer: opsFooter(data, "repair"),
  });
  app.querySelector(".page")?.insertAdjacentHTML("afterbegin", `${repairSummaryCards(summary)}${workflowWarningsPanel(summary.warnings || [])}`);
  bindOpsSearch("repair-search-form", "/transport-repairs", ["search", "transport_id", "category", "severity", "status"]);
  bindOpsPagination("repair", "/transport-repairs");
  document.querySelectorAll("[data-delete-repair]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirmMsg("Ushbu arizani o'chirishni tasdiqlaysizmi?")) return;
    try {
      await api(`/api/transports/repairs/${button.dataset.deleteRepair}`, { method: "DELETE" });
      showToast("Ariza o'chirildi.");
      renderRepairsList();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

function repairPartRow(part = {}, index = 0) {
  return `<div class="item-row" data-repair-part-row>
    ${textField(`part_name_${index}`, "Ehtiyot qism / material", part.name || "")}
    ${textField(`part_unit_${index}`, "Birlik", part.unit || "")}
    ${textField(`part_quantity_${index}`, "Miqdori", part.quantity ?? "1", "number")}
    ${textField(`part_price_${index}`, "Birlik narxi", part.unit_price ?? "", "number")}
    <button class="link-btn" type="button" data-remove-part>O'chirish</button>
  </div>`;
}

function collectRepairParts(form) {
  const parts = [];
  form.querySelectorAll("[data-repair-part-row]").forEach((row, index) => {
    const nameInput = row.querySelector(`[name^="part_name_"]`);
    const name = (nameInput?.value || "").trim();
    if (!name) return;
    const quantity = normalizeNumberInputValue(row.querySelector(`[name^="part_quantity_"]`)?.value || "1");
    const price = normalizeNumberInputValue(row.querySelector(`[name^="part_price_"]`)?.value || "");
    parts.push({
      name,
      unit: (row.querySelector(`[name^="part_unit_"]`)?.value || "").trim() || null,
      quantity: quantity || "1",
      unit_price: price === "" ? null : price,
    });
  });
  return parts;
}

// Tugmalar serverdan kelgan o'tishlardan chiziladi -- ekrandagi tugma bilan
// serverdagi qoida bir-biridan uzilib qololmaydi.
function repairTransitionsHtml(repair) {
  if (!repair.transitions?.length) return "";
  const buttons = repair.transitions.map((move) => {
    const cls = move.direction === "forward" ? "btn primary" : "btn";
    const prefix = move.direction === "backward" ? `<span>Orqaga qaytarish</span><span data-noloc> ← </span>` : "";
    return `<button class="${cls}" type="button" data-repair-status="${esc(move.status)}" data-repair-direction="${esc(move.direction)}">${prefix}<span>${esc(optionLabel(repairStatuses, move.status))}</span></button>`;
  }).join("");
  return section("Holatni o'zgartirish", `<div class="toolbar">${buttons}</div>`);
}

function bindRepairStatusActions(repair, rerender) {
  document.querySelectorAll("[data-repair-status]").forEach((button) => button.addEventListener("click", async () => {
    const direction = button.dataset.repairDirection;
    let comment = "";
    if (direction === "backward" || direction === "cancel") {
      comment = (window.prompt(localizeMessage("Sababini yozing"), "") || "").trim();
      if (!comment) return;
    }
    try {
      await api(`/api/transports/repairs/${repair.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.repairStatus, comment: comment || null }),
      });
      showToast("Holat o'zgartirildi.");
      await rerender();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

async function renderRepairForm(id = null) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const [repair, transports] = await Promise.all([
    id ? api(`/api/transports/repairs/${id}`) : Promise.resolve(null),
    api("/api/transports?page_size=200"),
  ]);
  const editable = canEdit("yetkazib_berish");
  const selectedTransport = String(repair?.transport_id || params.get("transport_id") || "");
  const vehicleOptions = transports.items
    .map((item) => `<option value="${item.id}" ${selectedTransport === String(item.id) ? "selected" : ""}>${esc(item.vehicle_number)}${item.driver_name ? ` · ${esc(item.driver_name)}` : ""}</option>`)
    .join("");
  const parts = repair?.parts?.length ? repair.parts : [{}];
  const localInput = (value) => (value ? String(value).slice(0, 16) : "");

  app.innerHTML = `<div class="page">
    ${workflowHeader({
      title: repair ? repair.repair_number : "Yangi ariza",
      subtitle: subtitleLine([
        { value: repair?.transport?.vehicle_number, raw: true },
        { value: optionLabel(repairCategories, repair?.category) },
        { value: optionLabel(repairStatuses, repair?.status) },
      ]),
      backPath: "/transport-repairs",
    })}
    ${repair ? summaryCards([
      ["Turib qolish", repairHours(repair.downtime_hours)],
      ["Ehtiyot qismlar", fmtMoney(repair.parts_amount)],
      ["Ish haqi", fmtMoney(repair.labour_cost)],
      ["Jami xarajat", fmtMoney(repair.total_amount)],
    ]) : ""}
    ${repair && editable ? repairTransitionsHtml(repair) : ""}
    <form id="repair-form">
      ${section("Nosozlik", `<div class="grid">
        <label><span class="field-label-text">Mashina</span><select name="transport_id" required ${repair ? "disabled" : ""}><option value="">Mashinani tanlang</option>${vehicleOptions}</select></label>
        ${textField("opened_at", "Ochilgan vaqti", localInput(repair?.opened_at) || new Date().toISOString().slice(0, 16), "datetime-local", { required: true })}
        ${selectField("category", "Kategoriya", repairCategories, repair?.category || "other")}
        ${selectField("severity", "Kritikligi", repairSeverities, repair?.severity || "medium")}
        ${selectField("source", "Ariza manbasi", repairSources, repair?.source || "driver")}
        ${textField("breakdown_location", "Nosozlik joyi", repair?.breakdown_location || "")}
        ${selectField("can_move", "Mashina yura oladimi", [["1", "Ha"], ["0", "Yo'q"]], repair && repair.can_move === false ? "0" : "1")}
        ${textField("odometer_km", "Odometr (km)", repair?.odometer_km ?? "", "number")}
      </div>${textArea("description", "Nosozlik tavsifi", repair?.description || "")}
      <p class="form-hint">Mashina yura olmasa, uning holati «Ta'mirda» ga o'tadi va unga reys berib bo'lmaydi.</p>`)}
      ${section("Turib qolish", `<div class="grid">
        ${textField("downtime_started_at", "Turib qolish boshlandi", localInput(repair?.downtime_started_at), "datetime-local")}
        ${textField("downtime_finished_at", "Turib qolish tugadi", localInput(repair?.downtime_finished_at), "datetime-local")}
      </div><p class="form-hint">Tugagani yozilmasa, soat hozirgacha hisoblanadi. Ariza yopilganda u avtomatik yopiladi.</p>`)}
      ${section("Bajarilgan ish", `<div class="grid">
        ${textField("repair_place", "Ta'mir joyi", repair?.repair_place || "")}
        ${textField("contractor", "Pudratchi / usta", repair?.contractor || "")}
        ${textField("act_number", "Akt / zakaz-naryad", repair?.act_number || "")}
        ${textField("document_url", "Hujjat havolasi", repair?.document_url || "")}
        ${textField("labour_cost", "Ish haqi va boshqa xarajat", repair?.labour_cost ?? "", "number")}
        ${textField("responsible_name", "Mas'ul", repair?.responsible_name || "")}
        ${textField("delay_reason", "Kechikish sababi", repair?.delay_reason || "")}
      </div>${textArea("work_done", "Bajarilgan ishlar", repair?.work_done || "")}${textArea("result", "Natija", repair?.result || "")}
      <p class="form-hint">Natija yozilmaguncha ariza yopilmaydi.</p>`)}
      ${section("Ehtiyot qismlar va materiallar", `<div id="repair-parts">${parts.map((part, index) => repairPartRow(part, index)).join("")}</div>
      <button class="btn" type="button" id="repair-add-part">Qator qo'shish</button>`)}
      ${section("Izoh", textArea("note", "Izoh", repair?.note || ""))}
      <div class="form-footer">
        <button class="btn" type="button" data-nav="/transport-repairs">Bekor qilish</button>
        ${editable ? `<button class="btn primary" type="submit">Saqlash</button>` : ""}
      </div>
    </form>
  </div>`;

  const rerender = () => renderRepairForm(id);
  if (repair && editable) bindRepairStatusActions(repair, rerender);

  const partsHolder = document.querySelector("#repair-parts");
  document.querySelector("#repair-add-part")?.addEventListener("click", () => {
    partsHolder.insertAdjacentHTML("beforeend", repairPartRow({}, partsHolder.children.length));
    localizeDom(partsHolder);
  });
  partsHolder?.addEventListener("click", (event) => {
    if (!event.target.matches("[data-remove-part]")) return;
    if (partsHolder.children.length > 1) event.target.closest("[data-repair-part-row]").remove();
  });

  document.querySelector("#repair-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      opened_at: field(form, "opened_at"),
      category: field(form, "category"),
      severity: field(form, "severity"),
      source: field(form, "source"),
      breakdown_location: field(form, "breakdown_location"),
      can_move: field(form, "can_move") !== "0",
      odometer_km: field(form, "odometer_km"),
      description: field(form, "description"),
      downtime_started_at: field(form, "downtime_started_at"),
      downtime_finished_at: field(form, "downtime_finished_at"),
      repair_place: field(form, "repair_place"),
      contractor: field(form, "contractor"),
      act_number: field(form, "act_number"),
      document_url: field(form, "document_url"),
      labour_cost: field(form, "labour_cost"),
      responsible_name: field(form, "responsible_name"),
      delay_reason: field(form, "delay_reason"),
      work_done: field(form, "work_done"),
      result: field(form, "result"),
      note: field(form, "note"),
      parts: collectRepairParts(form),
    };
    try {
      if (repair) {
        await api(`/api/transports/repairs/${repair.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Ariza saqlandi.");
        await renderRepairForm(repair.id);
      } else {
        const transportId = field(form, "transport_id");
        if (!transportId) return showToast("Mashinani tanlang.", true);
        const saved = await api("/api/transports/repairs", {
          method: "POST",
          body: JSON.stringify({ ...payload, transport_id: Number(transportId) }),
        });
        showToast("Ariza ochildi.");
        navigate(`/transport-repairs/${saved.id}`);
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// ---- Park bo'yicha davr xulosasi ----
//
// Bitumovozlarni nazorat qiladigan jadvalning bosh varag'i shu edi: davrni
// tanlaysiz va har bir mashina bo'yicha reyslar, tonna, kilometr, yoqilg'i,
// normadan chetlanish, slivga shubha, ta'mir turib qolishi va TO gacha
// qolgan masofa bitta jadvalda chiqadi.

const FLEET_DOCUMENT_TONES = { ok: "success", soon: "warning", expired: "danger", unknown: "muted" };

function fleetLiters(value) {
  return value === null || value === undefined ? dash : fmtQty(value, "litr");
}

function fleetSummaryRow(row) {
  const risky = numberValue(row.suspected_liters) > 0 || row.document_level === "expired";
  return `<tr class="${risky ? "ops-row-flagged" : ""}">
    <td><button class="ops-primary-link" data-nav="/transports/${row.transport_id}/edit">${fmt(row.vehicle_number)}</button></td>
    <td>${fmt(row.driver_name)}</td>
    <td>${statusBadge(row.status)}</td>
    <td class="ops-money">${fmt(row.trip_count)}</td>
    <td class="ops-money">${fmtQty(row.delivered_tons, "t")}</td>
    <td class="ops-money">${fmtQty(row.distance_km, "km")}</td>
    <td class="ops-money">${fleetLiters(row.fuel_liters)}</td>
    <td class="ops-money">${fleetLiters(row.norm_liters)}</td>
    <td class="ops-money ${numberValue(row.difference_liters) > 0 ? "ops-warning" : ""}">${fleetLiters(row.difference_liters)}</td>
    <td class="ops-money">${row.difference_percent === null || row.difference_percent === undefined ? dash : `<span data-noloc>${fmtQty(row.difference_percent)}%</span>`}</td>
    <td class="ops-money ${numberValue(row.suspected_liters) > 0 ? "ops-warning" : ""}">${numberValue(row.suspected_liters) > 0 ? fleetLiters(row.suspected_liters) : dash}</td>
    <td class="ops-money">${row.unchecked_event_count ? `${fmt(row.event_count)} / ${fmt(row.unchecked_event_count)}` : fmt(row.event_count)}</td>
    <td class="ops-money">${row.repair_downtime_hours ? `<span data-noloc>${fmtQty(row.repair_downtime_hours)}</span> <span>soat</span>` : dash}</td>
    <td class="ops-money">${fmtMoney(row.repair_amount)}</td>
    <td class="ops-money">${row.remaining_to_service_km === null || row.remaining_to_service_km === undefined ? dash : fmtQty(row.remaining_to_service_km, "km")}</td>
    <td>${statusChip({ label: optionLabel(transportRiskLevels, row.document_level), tone: FLEET_DOCUMENT_TONES[row.document_level] })}</td>
  </tr>`;
}

async function renderFleetSummary() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/transports/fleet-summary?${params.toString()}`);
  const totals = data.totals;
  const exportQuery = params.toString();

  app.innerHTML = opsListPage({
    className: "fleet-summary-ops-page",
    title: "Park xulosasi",
    tabs: [
      { label: "Transportlar", path: "/transports" },
      { label: "Hodisalar", path: "/transport-events" },
      { label: "TO va ta'mir", path: "/transport-repairs" },
      { label: "Xulosa", active: true },
      { label: "Monitoring", path: "/transports/monitoring" },
    ],
    clearPath: "/fleet-summary",
    counter: `${fmt(totals.vehicle_count)} ta mashina · ${fmt(totals.trip_count)} ta reys`,
    formId: "fleet-summary-form",
    filters: `${opsFilterField("Sanadan", `<input name="date_from" type="date" value="${esc(params.get("date_from") || "")}" />`)}${
      opsFilterField("Sanagacha", `<input name="date_to" type="date" value="${esc(params.get("date_to") || "")}" />`)}`,
    headers: ["Mashina", "Haydovchi", "Holati", "Reyslar", "Tashilgan", "Masofa", "Yoqilg'i", "Norma", "Chetlanish", "%", "Slivga shubha", "Hodisalar", "Turib qolish", "Ta'mir xarajati", "TO gacha", "Hujjatlar"],
    rows: data.rows.map(fleetSummaryRow).join(""),
    emptyText: "Mashinalar topilmadi.",
    colspan: 16,
  });
  app.querySelector(".page")?.insertAdjacentHTML("afterbegin", `${summaryCards([
    ["Reyslar", `<span>${fmt(totals.trip_count)}</span> <span>ta</span>`],
    ["Tashilgan", fmtQty(totals.delivered_tons, "t")],
    ["Masofa", fmtQty(totals.distance_km, "km")],
    ["Yoqilg'i", fleetLiters(totals.fuel_liters)],
    ["Normadan ortiq", fleetLiters(totals.difference_liters), numberValue(totals.difference_liters) > 0 ? "warning" : ""],
    ["Slivga shubha", fleetLiters(totals.suspected_liters), numberValue(totals.suspected_liters) > 0 ? "danger" : ""],
  ])}${summaryCards([
    ["Hodisalar", `<span>${fmt(totals.event_count)}</span> <span>ta</span>`],
    ["Tekshirilmagan", `<span>${fmt(totals.unchecked_event_count)}</span> <span>ta</span>`, totals.unchecked_event_count ? "warning" : ""],
    ["Undirilgan zarar", fmtMoney(totals.damage_amount)],
    ["Ta'mir turib qolishi", totals.repair_downtime_hours ? `<span data-noloc>${fmtQty(totals.repair_downtime_hours)}</span> <span>soat</span>` : dash],
    ["Ta'mir xarajati", fmtMoney(totals.repair_amount)],
    ["Hujjat muddati", `<span>${fmt(totals.document_risk_count)}</span> <span>ta mashinada</span>`, totals.document_risk_count ? "warning" : ""],
  ])}<div class="toolbar"><a class="btn" href="/api/transports/fleet-summary.xlsx?${esc(exportQuery)}${exportQuery ? "&" : ""}lang=${esc(currentLang())}">Excel eksport</a></div>`);
  bindOpsSearch("fleet-summary-form", "/fleet-summary", ["date_from", "date_to"]);
}
