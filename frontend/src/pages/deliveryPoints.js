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
  ["railway_station", "Temiryo'l stansiyasi"],
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

function deliveryPointKpis(board, scope = POINT_SCOPES.abz) {
  // Kunlik quvvat stansiyaga tegishli emas -- vagon kelib tushadi, zavod
  // emas. Uning o'rniga koordinatasi belgilangan stansiyalar sanaladi:
  // koordinatasiz stansiyani haydovchi xaritada topa olmaydi.
  const third = scope.showCapacity
    ? kpiCard({ icon: "gauge", tone: "info", label: "Umumiy quvvat", value: `<span data-noloc>${fmtQty(board.daily_capacity)}</span> <span>t/kun</span>`, delta: kpiDelta(board.capacity_added, "t/kun") })
    : kpiCard({ icon: "gauge", tone: "info", label: "Koordinatasi belgilangan", value: `<span data-noloc>${fmt(board.with_coordinates)}</span> <span>/</span> <span data-noloc>${fmt(board.total)}</span>` });
  return `<div class="kpi-grid">
    ${kpiCard({ icon: "plant", tone: "info", label: scope.kpiTotal, value: `<span data-noloc>${fmt(board.total)}</span>`, delta: kpiDelta(board.total_delta) })}
    ${kpiCard({ icon: "check", tone: "success", label: scope.kpiActive, value: `<span data-noloc>${fmt(board.active)}</span>`, delta: kpiDelta(board.active_delta) })}
    ${third}
    ${kpiCard({ icon: "alert", tone: "warning", label: "E'tibor talab qiladi", value: `<span data-noloc>${fmt(board.attention)}</span>`, delta: kpiDelta(board.attention_delta) })}
  </div>`;
}

// Holat bo'yicha taqsimot -- mockupdagi o'ng ustun.
function deliveryPointStatusPanel(board, scope = POINT_SCOPES.abz) {
  const rows = (board.by_status || []).map((row) => `<div class="status-share-row">
    <span class="status-share-icon ${row.key}">${kpiIcon(row.key === "active" ? "check" : row.key === "attention" ? "alert" : "plant")}</span>
    <span class="status-share-label">${fmt(row.label)}</span>
    <strong data-noloc>${fmt(row.count)}</strong>
    <span class="status-share-percent ${row.key}" data-noloc>${fmtQty(row.percent)}%</span>
  </div>`).join("");
  return section("Holat bo'yicha taqsimot", `<div class="status-share">${rows}
    <div class="status-share-total"><span>${esc(scope.kpiTotal)}</span><strong data-noloc>${fmt(board.total)}</strong></div>
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
function pointRowMenu(id, editable, basePath = "/delivery-points") {
  if (!editable) return `<button class="link-btn" data-nav="${basePath}/${id}">Ochish</button>`;
  return `<div class="row-menu">
    <button class="row-menu-trigger" type="button" data-row-menu aria-label="Amallar" data-noloc>\u22ef</button>
    <div class="row-menu-panel" hidden>
      <button type="button" data-nav="${basePath}/${id}">Ochish</button>
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

// Belgilarni chizish uch joyda kerak: panel xaritasi, katta ko'rinish va
// to'liq ekran oynasi. Uchalasida bir xil ko'rinishi uchun bitta joyda.
function addPointMarkers(map, points, { full = true } = {}) {
  const markers = points
    .filter((point) => point.latitude && point.longitude)
    .map((point) => {
      const marker = L.marker([Number(point.latitude), Number(point.longitude)], { icon: mapPinIcon(point.status) });
      marker.bindPopup(`<div class="map-popup">
        <strong>${esc(point.name)}</strong>
        <span>${esc(point.full_address || "")}</span>
        ${full && point.daily_capacity_tons ? `<span>${esc(fmtQty(point.daily_capacity_tons))} ${esc(localizeText("t/kun"))}</span>` : ""}
        <span class="map-popup-status" style="color:${MAP_STATUS_COLORS[point.status] || ""}">${esc(localizeText(optionLabel(deliveryPointStatuses, point.status)))}</span>
        ${full && point.responsible_name ? `<span>${esc(point.responsible_name)}${point.responsible_phone ? ` · ${esc(point.responsible_phone)}` : ""}</span>` : ""}
      </div>`);
      marker.addTo(map);
      return marker;
    });
  if (markers.length > 1) {
    map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [30, 30] });
  } else if (markers.length === 1) {
    map.setView(markers[0].getLatLng(), 10);
  }
  return markers;
}

// To'liq ekranda orqa fon surilmaydi, shuning uchun oddiy g'ildirak ham
// yaqinlashtiraveradi -- Ctrl shart emas.
function openPointsMapModal(points, title = "ABZ nuqtalari xaritasi") {
  openMapModal(title, (holder) => {
    const map = L.map(holder).setView(MAP_CENTER, MAP_ZOOM);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    addPointMarkers(map, points);
    return map;
  });
}

function drawPointsMap(points, emptyText = "Koordinatasi kiritilgan ABZ yo'q.") {
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

  bindMapWheelZoom(pointsMap, holder);
  const located = points.filter((point) => point.latitude && point.longitude);
  addPointMarkers(pointsMap, points);
  if (!located.length) {
    holder.insertAdjacentHTML("beforeend", `<div class="map-empty">${esc(emptyText)}</div>`);
  }
}

function pointsViewToggle(view, basePath = "/delivery-points") {
  const link = (key, label) => {
    const next = new URLSearchParams(location.search);
    if (key === "table") next.delete("view");
    else next.set("view", key);
    return `<button type="button" class="view-toggle-btn ${view === key ? "active" : ""}" data-nav="${basePath}${next.toString() ? `?${next}` : ""}">${label}</button>`;
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

// ABZ va temiryo'l stansiyasi -- bitta jadval, chunki kartochka bir xil:
// manzil, koordinata, mas'ul shaxs, holat. Lekin ular bir ro'yxatda
// turmasligi kerak: bitum ABZ ga texnikada boradi, tuz esa stansiyaga
// vagonda keladi, va ularni birga ko'rsatish faqat chalkashtiradi.
//
// Shuning uchun jadval bitta, bo'lim ikkita. Farqi shu yerda yig'ilgan.
const POINT_SCOPES = {
  abz: {
    basePath: "/delivery-points",
    crumb: "ABZlar",
    title: "ABZ boshqaruvi",
    subtitle: "ABZlarni nazorat qilish, holatini tahlil qilish va samaradorlikni boshqarish.",
    createLabel: "Yangi ABZ",
    formTitle: "Yangi ABZ",
    formSubtitle: "Yangi asfalt-beton zavodi ma'lumotlarini kiriting",
    nameColumn: "ABZ",
    emptyText: "Nuqtalar topilmadi.",
    mapTitle: "ABZ nuqtalari xaritasi",
    defaultType: "abz",
    // Ro'yxat stansiyalarni ko'rsatmaydi.
    apiFilter: { exclude_type: "railway_station" },
    showCapacity: true,
    kpiTotal: "Jami ABZ",
    kpiActive: "Faol ABZ",
    showResponsible: true,
    mapEmpty: "Koordinatasi kiritilgan ABZ yo'q.",
  },
  station: {
    basePath: "/railway-stations",
    crumb: "Temiryo'l stansiyalari",
    title: "Temiryo'l stansiyalari",
    subtitle: "O'zbekiston yuk stansiyalari: ESR kodi, joylashuvi va koordinatasi.",
    createLabel: "Yangi stansiya",
    formTitle: "Yangi stansiya",
    formSubtitle: "Vagon keladigan temiryo'l stansiyasi ma'lumotlarini kiriting",
    nameColumn: "Stansiya",
    emptyText: "Stansiyalar topilmadi.",
    mapTitle: "Temiryo'l stansiyalari xaritasi",
    defaultType: "railway_station",
    apiFilter: { point_type: "railway_station" },
    showCapacity: false,
    kpiTotal: "Jami stansiya",
    kpiActive: "Faol stansiya",
    // Stansiyada mas'ul shaxs yo'q: vagon stansiyaga keladi, uni temir
    // yo'l qabul qiladi. Mas'ul shaxs mijoz korxonasida, stansiyada emas.
    showResponsible: false,
    mapEmpty: "Koordinatasi kiritilgan stansiya yo'q.",
  },
};

function pointScope(key = "abz") {
  return POINT_SCOPES[key] || POINT_SCOPES.abz;
}

async function renderDeliveryPointsList(scopeKey = "abz") {
  const scope = pointScope(scopeKey);
  const params = new URLSearchParams(location.search);
  const view = params.get("view") === "map" ? "map" : "table";
  const query = new URLSearchParams(params);
  query.delete("view");
  Object.entries(scope.apiFilter).forEach(([key, value]) => query.set(key, value));
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
  await loadGeoRegions();
  const selectedRegion = params.get("region") || "";
  const districts = (geoRegionsCache || []).find((item) => item.name === selectedRegion)?.districts || [];
  const exportQuery = query.toString();

  app.innerHTML = `<div class="page ops-page delivery-points-ops-page">
    ${detailBreadcrumb(["Sotuv", scope.crumb])}
    <div class="page-head-row">
      <div class="page-title">
        <h1>${esc(scope.title)}</h1>
        <p>${esc(scope.subtitle)}</p>
      </div>
      <div class="actions">
        <a class="btn" href="/api/delivery-points/export.xlsx?${esc(exportQuery)}${exportQuery ? "&" : ""}lang=${esc(currentLang())}">Eksport</a>
        ${editable ? `<button class="btn primary" type="button" data-nav="${scope.basePath}/new">${esc(scope.createLabel)}</button>` : ""}
      </div>
    </div>

    ${deliveryPointKpis(board, scope)}
    ${workflowWarningsPanel(board.warnings || [])}

    <div class="map-row">
      <section class="card map-card"><div id="points-map" class="points-map"></div>${mapExpandButton("points")}</section>
      ${deliveryPointStatusPanel(board, scope)}
    </div>

    <form class="ops-search points-filter" id="delivery-point-search-form">
      ${opsFilterField("Qidirish", `<input name="search" placeholder="Qidirish..." value="${esc(params.get("search") || "")}" />`)}
      ${opsFilterField("Viloyat", `<select name="region" data-filter-region><option value="">Barchasi</option>${(geoRegionsCache || []).map((region) => `<option value="${esc(region.name)}" ${selectedRegion === region.name ? "selected" : ""}>${esc(region.name)}</option>`).join("")}</select>`)}
      ${opsFilterField("Tuman", `<select name="district" data-filter-district ${selectedRegion ? "" : "disabled"}><option value="">Barchasi</option>${districts.map((district) => `<option value="${esc(district.name)}" ${params.get("district") === district.name ? "selected" : ""}>${esc(district.name)}</option>`).join("")}</select>`)}
      ${opsFilterField("Holat", `<select name="status"><option value="">Barchasi</option>${deliveryPointStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}
      ${opsFilterField("Mijoz", `<select name="client_id"><option value="">Barchasi</option>${clientOptions}</select>`)}
      <button class="ops-tool-btn primary" type="submit">Qidirish</button>
      <button class="btn" type="button" data-nav="${scope.basePath}">Tozalash</button>
      ${pointsViewToggle(view, scope.basePath)}
    </form>

    ${view === "map"
      ? `<section class="card map-card tall"><div id="points-map-large" class="points-map"></div>${mapExpandButton("points")}</section>`
      : `<section class="ops-table-card"><table class="ops-table"><thead><tr>
          <th>${pointSortHead(scope.nameColumn, "name", params)}</th>
          <th>${pointSortHead("Joylashuv", "region", params)}</th>
          <th>Mijoz</th>
          <th>${scope.showCapacity ? pointSortHead("Quvvati", "capacity", params) : "Stansiya kodi"}</th>
          ${scope.showResponsible ? `<th>${pointSortHead("Mas'ul shaxs", "responsible", params)}</th>` : ""}
          <th>${pointSortHead("Holati", "status", params)}</th>
          <th>${pointSortHead("Yangilangan", "updated", params)}</th>
          <th>Amallar</th>
        </tr></thead><tbody>${data.items.length ? data.items.map((point) => `<tr>
          <td><button class="ops-primary-link accent" data-nav="${scope.basePath}/${point.id}">${fmt(point.name)}</button></td>
          <td>${fmt(point.full_address)}</td>
          <td>${fmt(point.client?.name)}</td>
          <td class="${scope.showCapacity ? "ops-money" : ""}">${scope.showCapacity
            ? (point.daily_capacity_tons ? `<span data-noloc>${fmtQty(point.daily_capacity_tons)}</span> <span>t/kun</span>` : dash)
            : (point.station_code ? `<span data-noloc>${esc(point.station_code)}</span>` : dash)}</td>
          ${scope.showResponsible ? `<td><span class="person-cell">${personIcon()}${fmt(point.responsible_name)}</span></td>` : ""}
          <td>${deliveryPointStatusChip(point.status)}</td>
          <td data-noloc>${fmtDate(point.updated_at)}</td>
          <td>${pointRowMenu(point.id, editable, scope.basePath)}</td>
        </tr>`).join("") : `<tr><td colspan="${scope.showResponsible ? 8 : 7}"><div class="empty">${esc(scope.emptyText)}</div></td></tr>`}</tbody></table></section>`}

    <div class="ops-footer points-footer">
      <span><span>Jami</span> <span data-noloc>${fmt(data.total)}</span> <span>ta yozuv</span></span>
      ${paginationBlock(data, "deliverypoint")}
      ${pointsPageSize(pageSize)}
    </div>
  </div>`;

  bindOpsSearch("delivery-point-search-form", scope.basePath, ["search", "client_id", "region", "district", "status", "view", "page_size"]);
  app.querySelector("[data-filter-region]")?.addEventListener("change", () => {
    const next = new URLSearchParams(location.search);
    const value = app.querySelector("[data-filter-region]").value;
    if (value) next.set("region", value); else next.delete("region");
    next.delete("district");
    next.delete("page");
    navigate(`${scope.basePath}?${next}`);
  });
  bindOpsPagination("deliverypoint", scope.basePath);
  bindPointSort();
  bindRowMenus();
  drawPointsMap(data.items, scope.mapEmpty);
  if (view === "map") drawLargePointsMap(data.items);
  app.querySelectorAll('[data-map-expand="points"]').forEach((button) => {
    button.addEventListener("click", () => openPointsMapModal(data.items, scope.mapTitle));
  });

  document.querySelector("[data-point-page-size]")?.addEventListener("change", (event) => {
    const next = new URLSearchParams(location.search);
    next.set("page_size", event.target.value);
    next.delete("page");
    navigate(`${scope.basePath}?${next}`);
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
  largePointsMap = L.map(holder, { scrollWheelZoom: false }).setView(MAP_CENTER, MAP_ZOOM);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(largePointsMap);
  bindMapWheelZoom(largePointsMap, holder);
  addPointMarkers(largePointsMap, points);
}

// ABZ nuqtasi to'rt qadamda kiritiladi. Ikkinchi qadam -- joylashuv --
// xaritadan belgilanadi: koordinatani qo'lda ko'chirishda yo'l qo'yilgan
// xato faqat haydovchi nuqtani qidirayotganda bilinadi.
const POINT_WIZARD_STEPS = [
  { title: "Asosiy ma'lumotlar" },
  { title: "Joylashuv" },
  { title: "Mas'ul shaxs" },
  { title: "Tekshirish", onEnter: (form) => renderPointSummary(form) },
];

// Stansiyada mas'ul shaxs qadami yo'q -- uch qadam qoladi.
const STATION_WIZARD_STEPS = POINT_WIZARD_STEPS.filter((step) => step.title !== "Mas'ul shaxs");

function pointWizardSteps(scope) {
  return scope.showResponsible ? POINT_WIZARD_STEPS : STATION_WIZARD_STEPS;
}

let pointMapPicker = null;

async function renderDeliveryPointForm(id = null, scopeKey = "abz") {
  const scope = pointScope(scopeKey);
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const [point, clients] = await Promise.all([
    id ? api(`/api/delivery-points/${id}`) : Promise.resolve({}),
    fetchAllClients(),
  ]);
  await loadGeoRegions();
  const editable = canEdit("sotuv");
  const isNew = !id;
  const clientOptions = clients
    .map((client) => `<option value="${client.id}" ${Number(point.client_id) === client.id ? "selected" : ""}>${esc(client.name)}${client.inn ? ` - ${esc(client.inn)}` : ""}</option>`)
    .join("");

  const bodies = [
    `${section("Nuqta", `<div class="grid">
        ${textField("name", "Nuqta nomi", point.name || "", "text", { required: true, maxlength: 255 })}
        ${textField("code", "Kodi", point.code || "", "text", { maxlength: 64 })}
        ${selectField("point_type", "Turi", deliveryPointTypes, point.point_type || scope.defaultType)}
        <label class="form-field"><span class="field-label-text">Mijoz</span>${selectSearch("client_id", "Mijoz nomi yoki STIR bo'yicha qidiring")}<select name="client_id"><option value="">Bog'lanmagan</option>${clientOptions}</select></label>
        ${selectField("status", "Holati", deliveryPointStatuses, point.status || "active")}
        ${scope.showCapacity ? `${textField("daily_capacity_tons", "Kunlik quvvati, t/kun", point.daily_capacity_tons ?? "", "number")}
        ${textField("tank_capacity_tons", "Sisterna sig'imi, t", point.tank_capacity_tons ?? "", "number")}` : ""}
      </div>`)}`,

    `${section("Manzil", `<div class="grid">
        ${geoRegionField(point.region || "")}
        ${geoDistrictField(point.region || "", point.district || "")}
        ${textArea("address", "To'liq manzil", point.address || "")}
      </div>
      <div data-station-only ${(point.point_type || scope.defaultType) === "railway_station" ? "" : "hidden"}>
        <div class="grid">${textField("station_code", "Stansiya kodi", point.station_code || "", "text", { maxlength: 16, inputmode: "numeric", placeholder: "739401" })}</div>
        <div class="form-hint">Temiryo'l nakladnoyida stansiya aynan kod bilan yoziladi. Nomi bo'yicha izlash ishonchsiz: bir xil nomli stansiyalar bor.</div>
        <div data-station-lookup></div>
      </div>`)}
     ${section("Xaritadagi joyi", mapPickerField(point.latitude || "", point.longitude || "", {
       hint: "Nuqtani xaritadan belgilang yoki manzilni qidiring. Xaritadagi belgi to'liq manzilga mos bo'lishi kerak.",
     }))}`,

    ...(scope.showResponsible ? [`${section("Mas'ul shaxs", `<div class="grid">
        ${textField("responsible_name", "F.I.Sh.", point.responsible_name || "")}
        ${textField("responsible_position", "Lavozimi", point.responsible_position || "")}
        ${textField("responsible_phone", "Telefon", point.responsible_phone || "", "text", { maxlength: 64 })}
        ${textField("responsible_email", "Email", point.responsible_email || "", "email")}
        ${textField("working_hours", "Ish vaqti", point.working_hours || "", "text", { maxlength: 255 })}
      </div>`)}`] : []),

    `${section("Nuqta xulosasi", `<div data-point-summary></div>`)}
     ${section("Izoh", textArea("notes", "Izoh", point.notes || ""))}`,
  ];

  app.innerHTML = wizardPage({
    formId: "delivery-point-form",
    title: id ? point.name : scope.formTitle,
    subtitle: id
      ? [optionLabel(deliveryPointTypes, point.point_type || "abz"), point.full_address].filter(Boolean).join(" · ")
      : scope.formSubtitle,
    breadcrumb: [[scope.crumb, scope.basePath], [id ? "Tahrirlash" : scope.createLabel, ""]],
    // Tahrirlash yo'li ham `/delivery-points/{id}`, ya'ni nuqtaning alohida
    // kartochkasi yo'q. Shuning uchun «Yopish» har doim ro'yxatga qaytaradi.
    closePath: scope.basePath,
    steps: pointWizardSteps(scope).map((step, index) => ({ ...step, body: bodies[index] })),
    submitLabel: id ? "Saqlash" : scope.createLabel,
    canSubmit: editable,
    withDraft: isNew,
  });

  bindGeoFields(app);
  bindSelectSearch(app);
  pointMapPicker = bindMapPicker(app);
  // Stansiya kodi faqat stansiyaga tegishli: ABZ kartochkasida u
  // to'ldirilmaydigan ortiqcha maydon bo'lib turardi.
  const typeSelect = app.querySelector('#delivery-point-form [name="point_type"]');
  const stationBlock = app.querySelector("[data-station-only]");
  typeSelect?.addEventListener("change", () => {
    if (stationBlock) stationBlock.hidden = typeSelect.value !== "railway_station";
  });
  bindStationLookup(app);

  const wizard = bindWizard("delivery-point-form", {
    steps: pointWizardSteps(scope).map((step, index) => (index === 1
      // Xarita yashirin bo'lganda o'lchamini bilmaydi va kulrang bo'lib
      // qoladi. Shuning uchun u qadam ochilganda yaratiladi.
      ? { ...step, onEnter: () => pointMapPicker?.ensureMap() }
      : step)),
    draftKey: id ? "" : `delivery-point-${scopeKey}`,
    unlocked: Boolean(id),
    prepareDraft: async (values) => {
      // Tuman ro'yxati viloyatga bog'liq: viloyat oldin qo'yilmasa,
      // qoralamadagi tuman variantlar orasida bo'lmaydi va yo'qoladi.
      const region = values.region?.[0];
      const form = app.querySelector("#delivery-point-form");
      if (region && form?.elements.region) {
        form.elements.region.value = region;
        form.elements.region.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      }
    },
    onSubmit: async (form) => {
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
        station_code: field(form, "station_code"),
        notes: field(form, "notes"),
      };
      try {
        if (id) {
          await api(`/api/delivery-points/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
          showToast("Nuqta saqlandi.");
          await renderDeliveryPointForm(id, scopeKey);
        } else {
          const saved = await api("/api/delivery-points", { method: "POST", body: JSON.stringify(payload) });
          wizard?.clearDraft();
          showToast("Nuqta qo'shildi.");
          navigate(`${scope.basePath}/${saved.id}`);
        }
      } catch (error) {
        showToast(error.message, true);
      }
    },
  });
  if (!id) wizard?.restoreDraft();
}

// Boshqa bo'limlardagi tanlash ro'yxati. Faqat faol nuqtalar ko'rsatiladi:
// yopilgan ABZ ga yangi yuk yuborilmaydi. Tanlangani ro'yxatda bo'lmasa ham
// qo'shiladi -- aks holda forma ochilishining o'zi uni o'chirib yuboradi.
// Kartochkalarda ko'rsatiladigan qisqa shakl. Oddiy matn qaytaradi:
// chaqiruvchilar uni `fmt()` orqali chiqaradi va u o'zi ekranlaydi.
function deliveryPointDetail(point) {
  if (!point) return null;
  const contact = [point.responsible_name, point.responsible_phone].filter(Boolean).join(", ");
  return [point.name, point.full_address, contact].filter(Boolean).join(" · ");
}

// Oxirgi qadam: yaratishdan oldin hammasi bir ekranda. Qiymatlar formadagi
// ko'rinishidan olinadi, ya'ni allaqachon tarjima qilingan -- `data-noloc`
// ularni ikkinchi marta o'girilishdan saqlaydi.
function renderPointSummary(form) {
  const holder = form.querySelector("[data-point-summary]");
  if (!holder) return;
  const text = (name) => (form.elements[name]?.value || "").trim();
  const choice = (name) => (form.elements[name]?.selectedOptions?.[0]?.textContent || "").trim();
  const row = (label, value) => `<div class="detail-item"><span>${label}</span><strong data-noloc>${esc(value || dash)}</strong></div>`;
  const address = [text("region"), text("district"), text("address")].filter(Boolean).join(", ");
  const point = text("latitude") && text("longitude") ? `${text("latitude")}, ${text("longitude")}` : "";
  holder.innerHTML = `<div class="detail-list">
      ${row("Nuqta nomi", text("name"))}
      ${row("Kodi", text("code"))}
      ${row("Turi", choice("point_type"))}
      ${row("Mijoz", choice("client_id"))}
      ${row("Holati", choice("status"))}
      ${row("To'liq manzil", address)}
      ${text("station_code") ? row("Stansiya kodi", text("station_code")) : ""}
      ${row("Koordinata", point)}
      ${row("Kunlik quvvati", text("daily_capacity_tons"))}
      ${form.elements.responsible_name ? row("Mas'ul shaxs", text("responsible_name")) : ""}
      ${form.elements.responsible_phone ? row("Telefon", text("responsible_phone")) : ""}
    </div>
    ${point ? "" : `<div class="empty warning">Koordinata belgilanmagan. Haydovchi nuqtani telefonida topa olmaydi.</div>`}`;
  localizeDom(holder);
}

// Stansiya kodi kiritilganda ma'lumotnomadan nomi va koordinatasi olinadi.
// Kod nakladnoydan ko'chiriladi, koordinatani esa qo'lda yozish -- xato
// manbai: u faqat yo'lda, haydovchi nuqtani qidirayotganda bilinadi.
//
// To'ldirilgan maydon ustidan yozilmaydi: xodim ataylab o'zgartirgan
// bo'lishi mumkin.
async function bindStationLookup(root = app) {
  const form = root.querySelector("#delivery-point-form");
  const codeInput = form?.elements.station_code;
  const holder = root.querySelector("[data-station-lookup]");
  if (!codeInput || !holder) return;

  async function lookup() {
    const code = codeInput.value.trim();
    if (code.length < 3) {
      holder.innerHTML = "";
      return;
    }
    let rows = [];
    try {
      rows = await api(`/api/delivery-points/station-reference?q=${encodeURIComponent(code)}&limit=1`);
    } catch (error) {
      holder.innerHTML = "";
      return;
    }
    const station = rows[0];
    if (!station || station.code !== code) {
      holder.innerHTML = `<div class="form-hint warning">Bu kod ma'lumotnomada yo'q. Kodni tekshiring yoki nuqtani xaritadan belgilang.</div>`;
      localizeDom(holder);
      return;
    }
    const nameInput = form.elements.name;
    if (nameInput && !nameInput.value.trim()) {
      nameInput.value = `${station.name} stansiyasi`;
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const lat = form.elements.latitude;
    const lng = form.elements.longitude;
    if (lat && lng && !(lat.value.trim() && lng.value.trim())) {
      lat.value = station.latitude;
      lng.value = station.longitude;
      lng.dispatchEvent(new Event("change", { bubbles: true }));
    }
    holder.innerHTML = `<div class="form-hint"><span>Ma'lumotnomadan</span>: <strong data-noloc>${esc(station.name)}</strong><span data-noloc>, ${esc(station.nearby)}</span></div>`;
    localizeDom(holder);
    markWizardFields(form);
  }

  codeInput.addEventListener("change", lookup);
  codeInput.addEventListener("blur", lookup);
  if (codeInput.value.trim()) lookup();
}

// ---- Kaskadli tanlash: viloyat -> tuman -> nuqta --------------------------
//
// Stansiyalar 220 ta bo'lgach bitta ro'yxatdan tanlash ishlamay qoldi:
// kerakli stansiyani topish uchun nomini oldindan bilish kerak edi. Endi
// avval viloyat, keyin tuman tanlanadi va nuqtalar shunga qarab qisqaradi.
//
// Butun filtr brauzerda: nuqtalar bir marta yuklanadi (usul bo'yicha
// filtrlangan holda), keyin har bir tanlov qo'shimcha so'rovsiz ishlaydi.
//
// Viloyat «Barchasi» dan boshlanadi -- kaskad toraytiradi, lekin hech
// narsani yashirmaydi. Viloyati ko'rsatilmagan nuqta ham yo'qolib qolmaydi.

let deliveryPickerItems = [];

async function deliveryPointList(selectedId = null, clientId = null, method = null) {
  await loadGeoRegions();
  const query = new URLSearchParams({ page_size: "500", active_only: "true" });
  if (clientId) query.set("client_id", String(clientId));
  if (method) query.set("method", method);
  const data = await api(`/api/delivery-points?${query.toString()}`);
  const items = [...data.items];
  // Tanlangani ro'yxatda bo'lmasa ham qo'shiladi: formani ochishning o'zi
  // uni o'chirib yuborishi mumkin emas.
  if (selectedId && !items.some((item) => item.id === Number(selectedId))) {
    const missing = await api(`/api/delivery-points/${selectedId}`).catch(() => null);
    if (missing) items.unshift(missing);
  }
  return items;
}

function pointOptionLabel(item) {
  return `${item.name}${item.full_address ? ` — ${item.full_address}` : ""}`;
}

function deliveryPointPicker(label, selectedId, items, { required = false } = {}) {
  deliveryPickerItems = items || [];
  const selected = deliveryPickerItems.find((item) => item.id === Number(selectedId)) || null;
  const option = (value, text, active) => `<option value="${esc(value)}" ${active ? "selected" : ""}>${esc(text)}</option>`;
  return `<div class="point-picker" data-point-picker>
    <label><span class="field-label-text">Viloyat</span>
      <select data-point-region>${option("", "Barchasi", !selected?.region)}${pickerRegionOptions(selected?.region)}</select>
    </label>
    <label><span class="field-label-text">Tuman</span>
      <select data-point-district>${option("", "Barchasi", true)}</select>
    </label>
    <label class="form-field"><span class="field-label-text">${esc(label)}${required ? ' <span class="required-mark">*</span>' : ""}</span>
      ${selectSearch("delivery_point_id", "Nuqta nomi yoki manzili bo'yicha qidiring")}
      <select name="delivery_point_id" data-selected="${esc(selectedId ?? "")}" ${required ? "required" : ""}><option value="">Tanlanmagan</option></select>
    </label>
  </div>`;
}

// Ro'yxat ma'lumotnomadan quriladi, nuqtalardan emas: Andijonda 16 ta
// tuman bor, nuqtasi esa faqat 6 tasida. Ilgari qolgan 10 tasi umuman
// ko'rinmasdi va ro'yxat chala bo'lib tuyulardi.
//
// Yonidagi son -- shu yerda nechta nuqta borligi. U bo'lmasa, xodim bo'sh
// tumanni tanlab, nima uchun ro'yxat bo'shligini tushunmasdi.
function pickerCount(items) {
  return `<span data-noloc> (${items})</span>`;
}

function pickerRegionOptions(current) {
  return (geoRegionsCache || [])
    .map((region) => {
      const count = deliveryPickerItems.filter((item) => item.region === region.name).length;
      return `<option value="${esc(region.name)}" ${region.name === current ? "selected" : ""}>${esc(region.name)} (${count})</option>`;
    })
    .join("");
}

function pickerDistrictOptions(regionName, current) {
  const region = (geoRegionsCache || []).find((item) => item.name === regionName);
  if (!region) return "";
  return region.districts
    .map((district) => {
      const count = deliveryPickerItems.filter((item) => item.region === regionName && item.district === district.name).length;
      return `<option value="${esc(district.name)}" ${district.name === current ? "selected" : ""}>${esc(district.name)} (${count})</option>`;
    })
    .join("");
}

function bindDeliveryPointPicker(root = app) {
  const holder = root.querySelector("[data-point-picker]");
  if (!holder) return;
  const regionSelect = holder.querySelector("[data-point-region]");
  const districtSelect = holder.querySelector("[data-point-district]");
  const pointSelect = holder.querySelector('[name="delivery_point_id"]');
  const wanted = Number(pointSelect.getAttribute("data-selected") || 0)
    || Number(deliveryPickerItems.find((item) => item.id === Number(pointSelect.value))?.id || 0);

  function visible() {
    const region = regionSelect.value;
    const district = districtSelect.value;
    return deliveryPickerItems.filter((item) => (!region || item.region === region) && (!district || item.district === district));
  }

  function paintPoints(keepId) {
    const rows = visible();
    const current = rows.some((item) => item.id === Number(keepId)) ? Number(keepId) : "";
    pointSelect.innerHTML = `<option value="">Tanlanmagan</option>${rows
      .map((item) => `<option value="${item.id}" ${item.id === current ? "selected" : ""}>${esc(pointOptionLabel(item))}</option>`)
      .join("")}`;
    pointSelect.value = current ? String(current) : "";
    // Birinchi marta kombo qurilади, keyingilarida esa faqat xabar
    // beriladi: kombo variantlarni o'zi qaytadan o'qiydi.
    bindSelectSearch(root);
    pointSelect.dispatchEvent(new Event("change", { bubbles: true }));
    localizeDom(holder);
  }

  function paintDistricts(keepDistrict, keepId) {
    const region = regionSelect.value;
    districtSelect.innerHTML = `<option value="">Barchasi</option>${region ? pickerDistrictOptions(region, keepDistrict) : ""}`;
    // Viloyat tanlanmaganda tuman ham tanlanmaydi: 209 ta tumanni bitta
    // ro'yxatda ko'rsatish foydasiz.
    districtSelect.disabled = !region;
    paintPoints(keepId);
  }

  regionSelect.addEventListener("change", () => paintDistricts("", ""));
  districtSelect.addEventListener("change", () => paintPoints(""));

  const start = deliveryPickerItems.find((item) => item.id === wanted);
  paintDistricts(start?.district || "", wanted);
}
