const transportStatuses = [
  ["active", "Faol"],
  ["inactive", "Faol emas"],
  ["maintenance", "Ta'mirda"],
];

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
    tabs: [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", active: true }],
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
