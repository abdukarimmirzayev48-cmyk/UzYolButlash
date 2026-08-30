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

// KPI kartochkasi: ikonka, yorliq, qiymat va o'tgan oyga nisbatan farq.
// Umumiy `summaryCards` faqat yorliq va qiymatni biladi, shuning uchun bu
// yerda alohida ko'rinish -- boshqa sahifalarga tegmasdan.
const KPI_ICONS = {
  plant: '<path d="M3 21h18"/><path d="M5 21V8l6 4V8l6 4V21"/><path d="M17 12V5h3v7"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  gauge: '<path d="M12 14 8.5 9.5"/><circle cx="12" cy="14" r="8"/><path d="M12 6V4"/><path d="m19 8 1.5-1.5"/><path d="M5 8 3.5 6.5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};

function kpiIcon(name) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${KPI_ICONS[name] || ""}</svg>`;
}

// Farq belgisi: musbat yuqoriga, manfiy pastga. Nol bo'lsa umuman
// ko'rsatilmaydi -- «+0» hech narsa demaydi va shovqin qiladi.
function kpiDelta(value, unit = "") {
  const number = Number(value || 0);
  if (!number) return "";
  const tone = number > 0 ? "up" : "down";
  const sign = number > 0 ? "+" : "";
  // Birlik `data-noloc` dan tashqarida turadi: raqam -- ma'lumot, birlik esa
  // tarjima qilinadigan so'z. Ichkarida qolsa «t/kun» lotin alifbosida
  // qolib ketardi.
  return `<span class="kpi-delta ${tone}"><span>O'tgan oyga nisbatan</span> <span data-noloc>${sign}${fmtQty(number)}</span>${unit ? ` <span>${esc(unit)}</span>` : ""}<span data-noloc>${number > 0 ? " ↑" : " ↓"}</span></span>`;
}

function kpiCard({ icon, tone, label, value, delta }) {
  return `<article class="kpi-card">
    <span class="kpi-icon ${tone}">${kpiIcon(icon)}</span>
    <div class="kpi-body">
      <span class="kpi-label">${label}</span>
      <strong class="kpi-value">${value}</strong>
      ${delta || ""}
    </div>
  </article>`;
}

function deliveryPointKpis(board) {
  return `<div class="kpi-grid">
    ${kpiCard({ icon: "plant", tone: "info", label: "Jami ABZ", value: `<span data-noloc>${fmt(board.total)}</span>`, delta: kpiDelta(board.total_delta) })}
    ${kpiCard({ icon: "check", tone: "success", label: "Faol ABZ", value: `<span data-noloc>${fmt(board.active)}</span>`, delta: kpiDelta(board.active_delta) })}
    ${kpiCard({ icon: "gauge", tone: "info", label: "Umumiy quvvat", value: `<span data-noloc>${fmtQty(board.daily_capacity)}</span> <span>t/kun</span>`, delta: kpiDelta(board.capacity_added, "t/kun") })}
    ${kpiCard({ icon: "alert", tone: "warning", label: "E'tibor talab qiladi", value: `<span data-noloc>${fmt(board.attention)}</span>`, delta: kpiDelta(board.attention_delta) })}
  </div>`;
}

// Holat bo'yicha taqsimot -- mockupdagi o'ng ustun.
function deliveryPointStatusPanel(board) {
  const rows = (board.by_status || []).map((row) => `<div class="status-share-row">
    <span class="status-share-icon ${row.key}">${kpiIcon(row.key === "active" ? "check" : row.key === "attention" ? "alert" : "plant")}</span>
    <span class="status-share-label">${fmt(row.label)}</span>
    <strong data-noloc>${fmt(row.count)}</strong>
    <span class="status-share-percent ${row.key}" data-noloc>${fmtQty(row.percent)}%</span>
  </div>`).join("");
  return section("Holat bo'yicha taqsimot", `<div class="status-share">${rows}
    <div class="status-share-total"><span>Jami ABZ</span><strong data-noloc>${fmt(board.total)}</strong></div>
  </div>`);
}

// Saralanadigan ustun sarlavhasi. Mijozlar sahifasidagi bilan bir xil
// shakl: kalit manzilda saqlanadi, ya'ni havolani yuborsangiz hamkasbingiz
// aynan shu tartibni ko'radi.
function pointSortHead(label, key, params) {
  const active = (params.get("sort") || "") === key;
  const order = params.get("order") === "desc" ? "desc" : "asc";
  const nextOrder = active && order === "asc" ? "desc" : "asc";
  const arrow = active ? (order === "asc" ? "\u2191" : "\u2193") : "\u21c5";
  return `<button type="button" class="ops-sort${active ? " active" : ""}" data-point-sort="${key}" data-point-order="${nextOrder}">
    <span>${label}</span><span class="ops-sort-arrow" data-noloc>${arrow}</span>
  </button>`;
}

function bindPointSort() {
  document.querySelectorAll("[data-point-sort]").forEach((button) => button.addEventListener("click", () => {
    const next = new URLSearchParams(location.search);
    next.set("sort", button.dataset.pointSort);
    next.set("order", button.dataset.pointOrder);
    next.delete("page");
    navigate(`/delivery-points?${next}`);
  }));
}

// Qatordagi amallar menyusi. Uchta havolani yonma-yon qo'yish jadvalni
// kengaytirib yuboradi va ular ma'lumotdan ko'ra ko'proq joy egallaydi.
function pointRowMenu(id, editable) {
  if (!editable) return `<button class="link-btn" data-nav="/delivery-points/${id}">Ochish</button>`;
  return `<div class="row-menu">
    <button class="row-menu-trigger" type="button" data-row-menu aria-label="Amallar" data-noloc>\u22ef</button>
    <div class="row-menu-panel" hidden>
      <button type="button" data-nav="/delivery-points/${id}">Ochish</button>
      <button type="button" data-point-map="${id}">Xaritada ochish</button>
      <button type="button" class="danger" data-delete-point="${id}">O'chirish</button>
    </div>
  </div>`;
}

function bindRowMenus() {
  document.querySelectorAll("[data-row-menu]").forEach((trigger) => {
    const panel = trigger.nextElementSibling;
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasHidden = panel.hidden;
      document.querySelectorAll(".row-menu-panel").forEach((item) => { item.hidden = true; });
      panel.hidden = !wasHidden;
    });
  });
  // Boshqa joyga bosilsa yopiladi -- ochiq menyu keyingi bosishni yutib
  // yuboradi va foydalanuvchi ikki marta bosishga majbur bo'ladi.
  document.addEventListener("click", () => {
    document.querySelectorAll(".row-menu-panel").forEach((item) => { item.hidden = true; });
  }, { once: true });
}

// Xarita Leaflet bilan chiziladi. Kutubxona loyihada tayyor fayl bo'lib
// turadi -- CDN dan olinmaydi, chunki ofis internetisiz qolganda ham
// sahifa ochilishi kerak. Plitkalar esa OpenStreetMap dan keladi va ular
// tashqi so'rov talab qiladi: internet bo'lmasa xarita bo'sh qoladi,
// sahifaning qolgan qismi ishlayveradi.
const MAP_STATUS_COLORS = { active: "#176b5b", attention: "#d68a12", inactive: "#b42318", planned: "#2c5cc5" };

// O'zbekiston markazi va butun mamlakat ko'rinadigan masshtab.
const MAP_CENTER = [41.3, 64.6];
const MAP_ZOOM = 6;

let pointsMap = null;

function mapPinIcon(status) {
  const color = MAP_STATUS_COLORS[status] || MAP_STATUS_COLORS.planned;
  return L.divIcon({
    className: "map-pin",
    // Rasm fayli emas, ichki SVG: qo'shimcha yuklanadigan narsa qolmaydi
    // va rang holatga qarab o'zgaradi.
    html: `<svg viewBox="0 0 24 24" width="26" height="26" fill="${color}" stroke="#ffffff" stroke-width="1.4">
      <path d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/>
      <circle cx="12" cy="9" r="2.6" fill="#ffffff" stroke="none"/>
    </svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

function drawPointsMap(points) {
  const holder = document.querySelector("#points-map");
  if (!holder) return;
  if (typeof L === "undefined") {
    holder.innerHTML = `<div class="empty">Xarita kutubxonasi yuklanmadi.</div>`;
    return;
  }
  // Sahifa qayta chizilganda eski xarita DOM dan ketadi, lekin Leaflet
  // uni hali ham eslab turadi -- shuning uchun avval yopiladi.
  if (pointsMap) {
    pointsMap.remove();
    pointsMap = null;
  }
  pointsMap = L.map(holder, { scrollWheelZoom: false, attributionControl: true }).setView(MAP_CENTER, MAP_ZOOM);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(pointsMap);

  const located = points.filter((point) => point.latitude && point.longitude);
  const markers = located.map((point) => {
    const marker = L.marker([Number(point.latitude), Number(point.longitude)], { icon: mapPinIcon(point.status) });
    marker.bindPopup(`<div class="map-popup">
      <strong>${esc(point.name)}</strong>
      <span>${esc(point.full_address || "")}</span>
      <span>${point.daily_capacity_tons ? `${esc(fmtQty(point.daily_capacity_tons))} ${esc(localizeText("t/kun"))}` : ""}</span>
      <span class="map-popup-status" style="color:${MAP_STATUS_COLORS[point.status] || ""}">${esc(localizeText(optionLabel(deliveryPointStatuses, point.status)))}</span>
      ${point.responsible_name ? `<span>${esc(point.responsible_name)}${point.responsible_phone ? ` · ${esc(point.responsible_phone)}` : ""}</span>` : ""}
    </div>`);
    marker.addTo(pointsMap);
    return marker;
  });
  // Nuqtalar bir viloyatda to'planib qolsa, butun mamlakatni ko'rsatish
  // ma'nosiz -- ko'rinishni ularning o'ziga moslaymiz.
  if (markers.length > 1) {
    pointsMap.fitBounds(L.featureGroup(markers).getBounds(), { padding: [30, 30] });
  } else if (markers.length === 1) {
    pointsMap.setView(markers[0].getLatLng(), 10);
  }
  if (!located.length) {
    holder.insertAdjacentHTML("beforeend", `<div class="map-empty">Koordinatasi kiritilgan ABZ yo'q.</div>`);
  }
}

function pointsViewToggle(view) {
  const link = (key, label) => {
    const next = new URLSearchParams(location.search);
    if (key === "table") next.delete("view");
    else next.set("view", key);
    return `<button type="button" class="view-toggle-btn ${view === key ? "active" : ""}" data-nav="/delivery-points${next.toString() ? `?${next}` : ""}">${label}</button>`;
  };
  return `<div class="view-toggle">${link("table", "Jadval")}${link("map", "Xarita")}</div>`;
}

function pointsPageSize(current) {
  const options = [10, 25, 50, 100]
    .map((size) => `<option value="${size}" ${current === size ? "selected" : ""}>${size}</option>`)
    .join("");
  // Yorliq bosh harf bilan: generator bitta kichik harfli so'zni enum
  // kaliti deb rad etadi, qiyalik bilan boshlanganini esa yo'l deb --
  // «/ sahifa» ikkala qoidaga ham tushib, lug'atga umuman kirmasdi.
  return `<label class="page-size"><select name="page_size" data-point-page-size>${options}</select><span data-noloc>/</span><span>Sahifada</span></label>`;
}

async function renderDeliveryPointsList() {
  const params = new URLSearchParams(location.search);
  const view = params.get("view") === "map" ? "map" : "table";
  const query = new URLSearchParams(params);
  query.delete("view");
  const [data, board, clients] = await Promise.all([
    api(`/api/delivery-points?${query.toString()}`),
    api(`/api/delivery-points/dashboard?${query.toString()}`),
    fetchAllClients(),
  ]);
  const editable = canEdit("sotuv");
  const pageSize = Number(data.page_size || 50);
  const clientOptions = clients
    .map((client) => `<option value="${client.id}" ${params.get("client_id") === String(client.id) ? "selected" : ""}>${esc(client.name)}</option>`)
    .join("");
  const regions = [...new Set(data.items.map((item) => item.region).filter(Boolean))].sort();
  const exportQuery = query.toString();

  app.innerHTML = `<div class="page ops-page delivery-points-ops-page">
    ${detailBreadcrumb(["Sotuv", "ABZlar"])}
    <div class="page-head-row">
      <div class="page-title">
        <h1>ABZ boshqaruvi</h1>
        <p>ABZlarni nazorat qilish, holatini tahlil qilish va samaradorlikni boshqarish.</p>
      </div>
      <div class="actions">
        <a class="btn" href="/api/delivery-points/export.xlsx?${esc(exportQuery)}${exportQuery ? "&" : ""}lang=${esc(currentLang())}">Eksport</a>
        ${editable ? `<button class="btn primary" type="button" data-nav="/delivery-points/new">Yangi ABZ</button>` : ""}
      </div>
    </div>

    ${deliveryPointKpis(board)}
    ${workflowWarningsPanel(board.warnings || [])}

    <div class="map-row">
      <section class="card map-card"><div id="points-map" class="points-map"></div></section>
      ${deliveryPointStatusPanel(board)}
    </div>

    <form class="ops-search points-filter" id="delivery-point-search-form">
      ${opsFilterField("Qidirish", `<input name="search" placeholder="Qidirish..." value="${esc(params.get("search") || "")}" />`)}
      ${opsFilterField("Viloyat", `<select name="region"><option value="">Barchasi</option>${regions.map((region) => `<option value="${esc(region)}" ${params.get("region") === region ? "selected" : ""}>${esc(region)}</option>`).join("")}</select>`)}
      ${opsFilterField("Holat", `<select name="status"><option value="">Barchasi</option>${deliveryPointStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}
      ${opsFilterField("Mijoz", `<select name="client_id"><option value="">Barchasi</option>${clientOptions}</select>`)}
      <button class="ops-tool-btn primary" type="submit">Qidirish</button>
      <button class="btn" type="button" data-nav="/delivery-points">Tozalash</button>
      ${pointsViewToggle(view)}
    </form>

    ${view === "map"
      ? `<section class="card map-card tall"><div id="points-map-large" class="points-map"></div></section>`
      : `<section class="ops-table-card"><table class="ops-table"><thead><tr>
          <th>${pointSortHead("ABZ", "name", params)}</th>
          <th>${pointSortHead("Joylashuv", "region", params)}</th>
          <th>Mijoz</th>
          <th>${pointSortHead("Quvvati", "capacity", params)}</th>
          <th>${pointSortHead("Mas'ul shaxs", "responsible", params)}</th>
          <th>${pointSortHead("Holati", "status", params)}</th>
          <th>${pointSortHead("Yangilangan", "updated", params)}</th>
          <th>Amallar</th>
        </tr></thead><tbody>${data.items.length ? data.items.map((point) => `<tr>
          <td><button class="ops-primary-link accent" data-nav="/delivery-points/${point.id}">${fmt(point.name)}</button></td>
          <td>${fmt(point.full_address)}</td>
          <td>${fmt(point.client?.name)}</td>
          <td class="ops-money">${point.daily_capacity_tons ? `<span data-noloc>${fmtQty(point.daily_capacity_tons)}</span> <span>t/kun</span>` : dash}</td>
          <td><span class="person-cell">${personIcon()}${fmt(point.responsible_name)}</span></td>
          <td>${deliveryPointStatusChip(point.status)}</td>
          <td data-noloc>${fmtDate(point.updated_at)}</td>
          <td>${pointRowMenu(point.id, editable)}</td>
        </tr>`).join("") : `<tr><td colspan="8"><div class="empty">Nuqtalar topilmadi.</div></td></tr>`}</tbody></table></section>`}

    <div class="ops-footer points-footer">
      <span><span>Jami</span> <span data-noloc>${fmt(data.total)}</span> <span>ta yozuv</span></span>
      ${paginationBlock(data, "deliverypoint")}
      ${pointsPageSize(pageSize)}
    </div>
  </div>`;

  bindOpsSearch("delivery-point-search-form", "/delivery-points", ["search", "client_id", "region", "status", "view", "page_size"]);
  bindOpsPagination("deliverypoint", "/delivery-points");
  bindPointSort();
  bindRowMenus();
  drawPointsMap(data.items);
  if (view === "map") drawLargePointsMap(data.items);

  document.querySelector("[data-point-page-size]")?.addEventListener("change", (event) => {
    const next = new URLSearchParams(location.search);
    next.set("page_size", event.target.value);
    next.delete("page");
    navigate(`/delivery-points?${next}`);
  });
  document.querySelectorAll("[data-point-map]").forEach((button) => button.addEventListener("click", () => {
    const point = data.items.find((item) => item.id === Number(button.dataset.pointMap));
    if (point?.map_url) window.open(point.map_url, "_blank", "noopener");
    else showToast("Bu nuqtaning koordinatasi kiritilmagan.", true);
  }));
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

function personIcon() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="person-icon"><circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>`;
}

let largePointsMap = null;

function drawLargePointsMap(points) {
  const holder = document.querySelector("#points-map-large");
  if (!holder || typeof L === "undefined") return;
  if (largePointsMap) {
    largePointsMap.remove();
    largePointsMap = null;
  }
  largePointsMap = L.map(holder).setView(MAP_CENTER, MAP_ZOOM);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap" }).addTo(largePointsMap);
  const markers = points
    .filter((point) => point.latitude && point.longitude)
    .map((point) => L.marker([Number(point.latitude), Number(point.longitude)], { icon: mapPinIcon(point.status) })
      .bindPopup(`<div class="map-popup"><strong>${esc(point.name)}</strong><span>${esc(point.full_address || "")}</span></div>`)
      .addTo(largePointsMap));
  if (markers.length > 1) largePointsMap.fitBounds(L.featureGroup(markers).getBounds(), { padding: [40, 40] });
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
