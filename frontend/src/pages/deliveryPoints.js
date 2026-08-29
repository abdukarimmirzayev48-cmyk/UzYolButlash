// ---- Sotuv: ABZ nuqtalari ----
//
// Yetkazish manzili har bosqichda qaytadan yozilardi: mijoz kartochkasida
// bir xil, talabnomada boshqacha, partiyada uchinchi xil. Endi u bitta
// joyda turadi va boshqa bo'limlar shu nuqtaga ishora qiladi.

// Mockupdagi to'rtta holat. Ilgari bu «faol / faol emas» edi: ishlayotgan,
// lekin e'tibor talab qiladigan ABZ ni ham, hali ochilmaganini ham «faol
// emas» deb belgilash ularni ro'yxatdan yashirib yuborardi.
const deliveryPointStatuses = [
  ["active", "Faol"],
  ["attention", "E'tibor talab qiladi"],
  ["inactive", "Faol emas"],
  ["planned", "Rejalashtirilgan"],
];

const DELIVERY_POINT_STATUS_TONES = { active: "success", attention: "warning", inactive: "danger", planned: "muted" };

function deliveryPointStatusChip(status) {
  return statusChip({ label: optionLabel(deliveryPointStatuses, status), tone: DELIVERY_POINT_STATUS_TONES[status] });
}

const deliveryPointTypes = [
  ["abz", "ABZ"],
  ["warehouse", "Ombor"],
  ["object_site", "Ob'ekt"],
  ["other", "Boshqa"],
];

function deliveryPointRow(point, editable) {
  return `<tr class="${point.is_active ? "" : "ops-row-muted"}">
    <td><button class="ops-primary-link" data-nav="/delivery-points/${point.id}">${fmt(point.name)}</button></td>
    <td>${fmt(point.code)}</td>
    <td>${fmt(optionLabel(deliveryPointTypes, point.point_type))}</td>
    <td>${fmt(point.client?.name)}</td>
    <td>${fmt(point.full_address)}</td>
    <td class="ops-money">${point.daily_capacity_tons ? `${fmtQty(point.daily_capacity_tons)} <span>t/kun</span>` : dash}</td>
    <td>${fmt(point.responsible_name)}</td>
    <td>${fmt(point.responsible_phone)}</td>
    <td>${point.map_url ? `<a class="link-btn" target="_blank" rel="noopener" href="${esc(point.map_url)}">Xaritada</a>` : dash}</td>
    <td>${deliveryPointStatusChip(point.status)}</td>
    ${editable ? `<td><div class="ops-row-actions"><button class="link-btn" data-nav="/delivery-points/${point.id}">Ochish</button><button class="link-btn" data-delete-point="${point.id}">O'chirish</button></div></td>` : ""}
  </tr>`;
}

async function renderDeliveryPointsList() {
  const params = new URLSearchParams(location.search);
  const [data, clients] = await Promise.all([
    api(`/api/delivery-points?${params.toString()}`),
    fetchAllClients(),
  ]);
  const editable = canEdit("sotuv");
  const clientOptions = clients
    .map((client) => `<option value="${client.id}" ${params.get("client_id") === String(client.id) ? "selected" : ""}>${esc(client.name)}</option>`)
    .join("");

  app.innerHTML = opsListPage({
    className: "delivery-points-ops-page",
    title: "ABZ nuqtalari",
    tabs: [
      { label: "Mijozlar", path: "/clients" },
      { label: "Talabnomalar", path: "/customer-requests" },
      { label: "Shartnomalar", path: "/contracts" },
      { label: "ABZ nuqtalari", active: true },
    ],
    createPath: editable ? "/delivery-points/new" : undefined,
    createLabel: "Nuqta qo'shish",
    clearPath: "/delivery-points",
    counter: `${fmt(data.total)} ta nuqta`,
    formId: "delivery-point-search-form",
    filters: `${opsFilterField("Qidirish", `<input name="search" placeholder="Nomi, kodi, manzili, mas'ul" value="${esc(params.get("search") || "")}" />`)}${
      opsFilterField("Mijoz", `<select name="client_id"><option value="">Barchasi</option>${clientOptions}</select>`)}${
      opsFilterField("Turi", `<select name="point_type"><option value="">Barchasi</option>${deliveryPointTypes.map(([key, label]) => `<option value="${key}" ${params.get("point_type") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}${
      opsFilterField("Holati", `<select name="status"><option value="">Barchasi</option>${deliveryPointStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}`,
    headers: ["Nomi", "Kodi", "Turi", "Mijoz", "Manzil", "Quvvati", "Mas'ul", "Telefon", "Xarita", "Holati", editable ? "Amallar" : ""],
    rows: data.items.map((point) => deliveryPointRow(point, editable)).join(""),
    emptyText: "Nuqtalar topilmadi.",
    colspan: editable ? 11 : 10,
    footer: opsFooter(data, "deliverypoint"),
  });
  bindOpsSearch("delivery-point-search-form", "/delivery-points", ["search", "client_id", "point_type", "status"]);
  bindOpsPagination("deliverypoint", "/delivery-points");
  document.querySelectorAll("[data-delete-point]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirmMsg("Ushbu nuqtani o'chirishni tasdiqlaysizmi?")) return;
    try {
      await api(`/api/delivery-points/${button.dataset.deletePoint}`, { method: "DELETE" });
      showToast("Nuqta o'chirildi.");
      renderDeliveryPointsList();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

async function renderDeliveryPointForm(id = null) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const [point, clients] = await Promise.all([
    id ? api(`/api/delivery-points/${id}`) : Promise.resolve({}),
    fetchAllClients(),
  ]);
  await loadGeoRegions();
  const editable = canEdit("sotuv");
  const clientOptions = clients
    .map((client) => `<option value="${client.id}" ${Number(point.client_id) === client.id ? "selected" : ""}>${esc(client.name)}${client.inn ? ` - ${esc(client.inn)}` : ""}</option>`)
    .join("");

  app.innerHTML = `<div class="page">
    ${workflowHeader({
      title: id ? point.name : "Yangi nuqta",
      subtitle: subtitleLine([
        { value: optionLabel(deliveryPointTypes, point.point_type || "abz") },
        { value: optionLabel(deliveryPointStatuses, point.status || "active") },
        { value: point.full_address, raw: true },
      ]),
      backPath: "/delivery-points",
    })}
    ${id && point.map_url ? `<div class="toolbar"><a class="btn" target="_blank" rel="noopener" href="${esc(point.map_url)}">Xaritada ochish</a></div>` : ""}
    <form id="delivery-point-form">
      ${section("Nuqta", `<div class="grid">
        ${textField("name", "Nuqta nomi", point.name || "", "text", { required: true, maxlength: 255 })}
        ${textField("code", "Kodi", point.code || "", "text", { maxlength: 64 })}
        ${selectField("point_type", "Turi", deliveryPointTypes, point.point_type || "abz")}
        <label class="form-field"><span class="field-label-text">Mijoz</span>${selectSearch("client_id", "Mijoz nomi yoki STIR bo'yicha qidiring")}<select name="client_id"><option value="">Bog'lanmagan</option>${clientOptions}</select></label>
        ${selectField("status", "Holati", deliveryPointStatuses, point.status || "active")}
        ${textField("daily_capacity_tons", "Kunlik quvvati, t/kun", point.daily_capacity_tons ?? "", "number")}
        ${textField("tank_capacity_tons", "Sisterna sig'imi, t", point.tank_capacity_tons ?? "", "number")}
      </div>`)}
      ${section("Manzil", `<div class="grid">
        ${geoRegionField(point.region || "")}
        ${geoDistrictField(point.region || "", point.district || "")}
        ${textArea("address", "To'liq manzil", point.address || "")}
      </div>`)}
      ${section("GPS koordinatasi", `<div class="grid">
        ${textField("latitude", "Kenglik", point.latitude || "", "text", { maxlength: 64, inputmode: "decimal", placeholder: "41.311081", title: "Masalan: 41.311081" })}
        ${textField("longitude", "Uzunlik", point.longitude || "", "text", { maxlength: 64, inputmode: "decimal", placeholder: "69.240562", title: "Masalan: 69.240562" })}
      </div><div class="form-hint">Koordinatani xaritadan nusxalab qo'ying. Haydovchi uni telefonida ochadi.</div>`)}
      ${section("Mas'ul shaxs", `<div class="grid">
        ${textField("responsible_name", "F.I.Sh.", point.responsible_name || "")}
        ${textField("responsible_position", "Lavozimi", point.responsible_position || "")}
        ${textField("responsible_phone", "Telefon", point.responsible_phone || "", "text", { maxlength: 64 })}
        ${textField("responsible_email", "Email", point.responsible_email || "", "email")}
        ${textField("working_hours", "Ish vaqti", point.working_hours || "", "text", { maxlength: 255 })}
      </div>`)}
      ${section("Izoh", textArea("notes", "Izoh", point.notes || ""))}
      <div class="form-footer">
        <button type="button" class="btn" data-nav="/delivery-points">Bekor qilish</button>
        ${editable ? `<button class="btn primary" type="submit">${id ? "Saqlash" : "Nuqta qo'shish"}</button>` : ""}
      </div>
    </form>
  </div>`;

  bindGeoFields(app);
  bindSelectSearch(app);
  document.querySelector("#delivery-point-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const clientId = field(form, "client_id");
    const payload = {
      name: field(form, "name"),
      code: field(form, "code"),
      point_type: field(form, "point_type"),
      client_id: clientId ? Number(clientId) : null,
      status: field(form, "status") || "active",
      daily_capacity_tons: field(form, "daily_capacity_tons"),
      tank_capacity_tons: field(form, "tank_capacity_tons"),
      region: field(form, "region"),
      district: field(form, "district"),
      address: field(form, "address"),
      latitude: field(form, "latitude"),
      longitude: field(form, "longitude"),
      responsible_name: field(form, "responsible_name"),
      responsible_position: field(form, "responsible_position"),
      responsible_phone: field(form, "responsible_phone"),
      responsible_email: field(form, "responsible_email"),
      working_hours: field(form, "working_hours"),
      notes: field(form, "notes"),
    };
    try {
      if (id) {
        await api(`/api/delivery-points/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Nuqta saqlandi.");
        await renderDeliveryPointForm(id);
      } else {
        const saved = await api("/api/delivery-points", { method: "POST", body: JSON.stringify(payload) });
        showToast("Nuqta qo'shildi.");
        navigate(`/delivery-points/${saved.id}`);
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// Boshqa bo'limlardagi tanlash ro'yxati. Faqat faol nuqtalar ko'rsatiladi:
// yopilgan ABZ ga yangi yuk yuborilmaydi. Tanlangani ro'yxatda bo'lmasa ham
// qo'shiladi -- aks holda forma ochilishining o'zi uni o'chirib yuboradi.
async function deliveryPointOptions(selectedId = null, clientId = null) {
  const query = new URLSearchParams({ page_size: "200", active_only: "true" });
  if (clientId) query.set("client_id", String(clientId));
  const data = await api(`/api/delivery-points?${query.toString()}`);
  const items = [...data.items];
  if (selectedId && !items.some((item) => item.id === Number(selectedId))) {
    const missing = await api(`/api/delivery-points/${selectedId}`).catch(() => null);
    if (missing) items.unshift(missing);
  }
  return items
    .map((item) => `<option value="${item.id}" ${Number(selectedId) === item.id ? "selected" : ""}>${esc(item.name)}${item.full_address ? ` — ${esc(item.full_address)}` : ""}</option>`)
    .join("");
}

function deliveryPointField(label, selectedId, options) {
  return `<label class="form-field"><span class="field-label-text">${esc(label)}</span>${selectSearch("delivery_point_id", "Nuqta nomi yoki manzili bo'yicha qidiring")}<select name="delivery_point_id"><option value="">Tanlanmagan</option>${options}</select></label>`;
}

// Kartochkalarda ko'rsatiladigan qisqa shakl. Oddiy matn qaytaradi:
// chaqiruvchilar uni `fmt()` orqali chiqaradi va u o'zi ekranlaydi.
function deliveryPointDetail(point) {
  if (!point) return null;
  const contact = [point.responsible_name, point.responsible_phone].filter(Boolean).join(", ");
  return [point.name, point.full_address, contact].filter(Boolean).join(" · ");
}
