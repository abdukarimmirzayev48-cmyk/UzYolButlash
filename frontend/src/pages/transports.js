const transportStatuses = [
  ["active", "Faol"],
  ["inactive", "Faol emas"],
  ["maintenance", "Ta'mirda"],
];

const fuelEntryTypes = [
  ["added", "Quyildi"],
  ["consumed", "Sarflandi"],
];

const transportWorkStatusLabels = {
  moving_with_cargo: "Yuk bilan harakatda",
  moving_without_cargo: "Yuksiz harakatda",
  waiting: "Kutishda",
};

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
    <form id="transport-form">
      ${section("Transport ma'lumotlari", `<div class="grid">
        ${selectField("driver_employee_id", "Haydovchi", employeeOptions, item.driver_employee_id != null ? String(item.driver_employee_id) : "")}
        ${textField("driver_phone", "Haydovchi telefoni", item.driver_phone || "")}
        ${textField("vehicle_number", "Transport raqami", item.vehicle_number || "", "text", { required: true })}
        ${textField("trailer_number", "Tirkama raqami", item.trailer_number || "")}
        ${textField("vehicle_type", "Transport turi", item.vehicle_type || "")}
        ${textField("capacity", "Sig'imi", item.capacity || "")}
        ${selectField("status", "Status", transportStatuses, item.status || "active")}
        ${textField("current_location", "Hozirgi joylashuvi", item.current_location || "")}
        ${textArea("notes", "Izoh", item.notes || "")}
      </div>`)}
      <div class="form-footer"><button type="button" class="btn" data-nav="/transports">Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div>
    </form>
  </div>`;
}

function collectTransportPayload(form) {
  const driverEmployeeId = field(form, "driver_employee_id");
  return {
    driver_employee_id: driverEmployeeId ? Number(driverEmployeeId) : null,
    driver_phone: field(form, "driver_phone"),
    vehicle_number: field(form, "vehicle_number"),
    trailer_number: field(form, "trailer_number"),
    vehicle_type: field(form, "vehicle_type"),
    capacity: field(form, "capacity"),
    status: field(form, "status") || "active",
    current_location: field(form, "current_location"),
    notes: field(form, "notes"),
  };
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
  const activeCount = data.items.filter((item) => item.status === "active").length;
  const editable = canEdit("yetkazib_berish");
  app.innerHTML = opsListPage({
    className: "transports-ops-page",
    title: "Transportlar",
    tabs: [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", active: true }, { label: "Monitoring", path: "/transports/monitoring" }],
    clearPath: "/transports",
    counter: `${fmt(data.total)} ta transport · ${fmt(activeCount)} ta faol`,
    formId: "transport-search-form",
    filters: `<input name="search" placeholder="Haydovchi, transport raqami" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${transportStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`,
    headers: ["Transport", "Haydovchi", "Telefon", "Tirkama", "Turi", "Sig'im", "Status", ""],
    rows: data.items.map((item) => `<tr><td>${editable ? `<button class="ops-primary-link" data-nav="/transports/${item.id}/edit">${fmt(item.vehicle_number)}</button>` : fmt(item.vehicle_number)}</td><td>${fmt(item.driver_name)}</td><td>${fmt(item.driver_phone)}</td><td>${fmt(item.trailer_number)}</td><td>${fmt(item.vehicle_type)}</td><td>${fmt(item.capacity)}</td><td>${statusBadge(item.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/transports/${item.id}/fuel">Yoqilg'i</button>${editable ? `<button class="link-btn" data-nav="/transports/${item.id}/edit">Tahrirlash</button><button class="link-btn" data-delete-transport="${item.id}">O'chirish</button>` : ""}</div></td></tr>`).join(""),
    emptyText: "Transportlar topilmadi.",
    colspan: 8,
    footer: opsFooter(data, "transport"),
    createPath: editable ? "/transports/new" : undefined,
    createLabel: "Transport qo'shish",
  });
  bindOpsSearch("transport-search-form", "/transports", ["search", "status"]);
  bindOpsPagination("transport", "/transports");
  document.querySelectorAll("[data-delete-transport]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Transportni o'chirasizmi?")) return;
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
          ${textField("entry_date", "Sana", log?.entry_date || new Date().toISOString().slice(0, 10), "date", { required: true })}
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

async function renderTransportFuelLog(id) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const [transport, summary] = await Promise.all([
    api(`/api/transports/${id}`),
    api(`/api/transports/${id}/fuel-logs`),
  ]);
  const editable = canEdit("yetkazib_berish");

  app.innerHTML = `<div class="page">
    ${workflowHeader({
      title: `${transport.vehicle_number} — Yoqilg'i nazorati`,
      subtitle: fmt(transport.driver_name),
      backPath: `/transports/${id}/edit`,
      actions: editable ? [{ label: "Yozuv qo'shish", modal: "add-fuel-log", primary: true }] : [],
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
  </div>`;

  const rerender = () => renderTransportFuelLog(id);

  document.querySelector("[data-add-fuel-log]")?.addEventListener("click", () => fuelLogModal(id, null, rerender));
  document.querySelectorAll("[data-edit-fuel-log]").forEach((button) => button.addEventListener("click", () => {
    const log = summary.logs.find((item) => item.id === Number(button.dataset.editFuelLog));
    fuelLogModal(id, log, rerender);
  }));
  document.querySelectorAll("[data-delete-fuel-log]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Ushbu yoqilg'i yozuvini o'chirishni tasdiqlaysizmi?")) return;
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
