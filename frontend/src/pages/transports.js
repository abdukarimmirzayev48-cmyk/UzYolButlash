const transportStatuses = [
  ["active", "Faol"],
  ["inactive", "Faol emas"],
  ["maintenance", "Ta'mirda"],
];

const transportWorkStatusLabels = {
  moving_with_cargo: "Yuk bilan harakatda",
  moving_without_cargo: "Yuksiz harakatda",
  waiting: "Kutishda",
};

function transportFormHtml(item = {}) {
  const title = item.id ? "Transportni tahrirlash" : "Yangi transport";
  return `<div class="page">
    <div class="page-header">
      <div class="page-title"><h1>${title}</h1><p>Tashuvchi, haydovchi va transport ma'lumotlari.</p></div>
      <div class="actions"><button class="btn" data-nav="/transports">Orqaga</button></div>
    </div>
    <form id="transport-form">
      ${section("Transport ma'lumotlari", `<div class="grid">
        ${textField("carrier_name", "Tashuvchi", item.carrier_name || "", "text", { required: true })}
        ${textField("driver_name", "Haydovchi", item.driver_name || "")}
        ${textField("driver_phone", "Haydovchi telefoni", item.driver_phone || "")}
        ${textField("vehicle_number", "Transport raqami", item.vehicle_number || "", "text", { required: true })}
        ${textField("trailer_number", "Tirkama raqami", item.trailer_number || "")}
        ${textField("vehicle_type", "Transport turi", item.vehicle_type || "")}
        ${textField("capacity", "Sig'imi", item.capacity || "")}
        ${selectField("status", "Status", transportStatuses, item.status || "active")}
        ${checkField("is_own", "O'z transportimiz", Boolean(item.is_own))}
        ${textField("current_location", "Hozirgi joylashuvi", item.current_location || "")}
        ${textArea("notes", "Izoh", item.notes || "")}
      </div>`)}
      <div class="form-footer"><button type="button" class="btn" data-nav="/transports">Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div>
    </form>
  </div>`;
}

function collectTransportPayload(form) {
  return {
    carrier_name: field(form, "carrier_name"),
    driver_name: field(form, "driver_name"),
    driver_phone: field(form, "driver_phone"),
    vehicle_number: field(form, "vehicle_number"),
    trailer_number: field(form, "trailer_number"),
    vehicle_type: field(form, "vehicle_type"),
    capacity: field(form, "capacity"),
    status: field(form, "status") || "active",
    is_own: field(form, "is_own"),
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
  app.innerHTML = opsListPage({
    className: "transports-ops-page",
    title: "Transportlar",
    tabs: [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", active: true }, { label: "Monitoring", path: "/transports/monitoring" }],
    clearPath: "/transports",
    counter: `${fmt(data.total)} ta transport · ${fmt(activeCount)} ta faol`,
    formId: "transport-search-form",
    filters: `<input name="search" placeholder="Tashuvchi, haydovchi, transport raqami" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${transportStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`,
    headers: ["Tashuvchi", "Haydovchi", "Telefon", "Transport", "Tirkama", "Turi", "Sig'im", "Status", ""],
    rows: data.items.map((item) => `<tr><td><button class="ops-primary-link" data-nav="/transports/${item.id}/edit">${fmt(item.carrier_name)}</button></td><td>${fmt(item.driver_name)}</td><td>${fmt(item.driver_phone)}</td><td>${fmt(item.vehicle_number)}</td><td>${fmt(item.trailer_number)}</td><td>${fmt(item.vehicle_type)}</td><td>${fmt(item.capacity)}</td><td>${statusBadge(item.status)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/transports/${item.id}/edit">Tahrirlash</button><button class="link-btn" data-delete-transport="${item.id}">O'chirish</button></div></td></tr>`).join(""),
    emptyText: "Transportlar topilmadi.",
    colspan: 9,
    footer: opsFooter(data, "transport"),
    createPath: "/transports/new",
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

async function renderNewTransport() {
  app.innerHTML = transportFormHtml();
  bindTransportForm();
}

async function renderEditTransport(id) {
  const item = await api(`/api/transports/${id}`);
  app.innerHTML = transportFormHtml(item);
  bindTransportForm(item);
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
