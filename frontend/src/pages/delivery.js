// ---- Yetkazib berish: bo'lim ko'rinishi (module overview) ----

const OVERVIEW_ICONS = {
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4h4"/><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
};

function overviewIcon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${OVERVIEW_ICONS[name] || ""}</svg>`;
}

function overviewToolbar(params, options, range) {
  return `<div class="overview-toolbar">
    <div class="overview-toolbar-actions">
      <button class="btn primary" type="button" data-nav="/delivery-batches/new">${overviewIcon("plus", 16)}<span>Yangi partiya</span></button>
      <button class="btn" type="button" data-nav="/logistics">${overviewIcon("plus", 16)}<span>Reys yaratish</span></button>
    </div>
    <form class="overview-toolbar-filters" id="delivery-filter-form">
      <select name="client_id">
        <option value="">Barcha mijozlar</option>
        ${options.clients.map((c) => `<option value="${c.id}" ${params.get("client_id") === String(c.id) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
      <select name="route">
        <option value="">Barcha yo'nalishlar</option>
        ${options.routes.map((r) => `<option value="${esc(r)}" ${params.get("route") === r ? "selected" : ""}>${esc(r)}</option>`).join("")}
      </select>
      <input type="date" name="date_from" value="${esc(range.from || "")}" />
      <span class="overview-date-sep" data-noloc>–</span>
      <input type="date" name="date_to" value="${esc(range.to || "")}" />
      <button class="ops-tool-btn" type="submit">${overviewIcon("filter", 14)}<span>Qo'llash</span></button>
      <button class="ops-tool-btn" type="button" data-nav="/delivery">Tozalash</button>
    </form>
  </div>`;
}

// Top row: the headline figures. Each names its own scope underneath, so
// "right now" and "in the chosen range" can sit side by side without confusion.
function overviewHeadline(n, r) {
  const cards = [
    ["box", "Faol jarayonlar", fmt(n.active), "Faol partiyalar", "/delivery-batches"],
    ["check", "Yakunlangan partiyalar", fmt(r.delivered), "Tanlangan davrda", ""],
    ["download", "Qabul qilingan miqdor", fmtQty(r.accepted_quantity, "t"), "Tanlangan davrda", ""],
    ["wallet", "Logistika natijasi", fmtMoney(r.logistics_margin), "Daromad va xarajat farqi", ""],
    ["truck", "Faol transport", `${fmt(n.fleet_active)}/${fmt(n.fleet_total)}`, "Transport parki", "/transports"],
  ];
  return `<div class="headline-cards">${cards.map(([icon, label, value, note, path]) => `
    <div class="headline-card" ${path ? `data-nav="${path}"` : ""}>
      <span class="headline-icon">${overviewIcon(icon, 20)}</span>
      <span class="headline-copy">
        <span class="headline-label">${label}</span>
        <strong>${value}</strong>
        <span class="headline-note">${note}</span>
      </span>
    </div>`).join("")}</div>`;
}

// Always "now" -- the date range never touches this strip, which is why it is
// its own titled block instead of being mixed into the row above.
function overviewOperational(n) {
  const items = [
    ["truck", "", "Yo'lda", n.on_the_move, "/delivery-batches?group=moving"],
    ["clock", "warn", "Muddati o'tgan", n.late, "/delivery-batches?overdue_only=true"],
    ["alert", "warn", "Muammoli", n.problems, "/delivery-batches?group=problem"],
    ["hourglass", "", "Transport kutmoqda", n.trips_need_assignment, "/logistics"],
  ];
  return `<section class="card ops-monitor">
    <div class="card-header"><h2>Operatsion nazorat</h2></div>
    <div class="ops-monitor-row">
      ${items.map(([icon, tone, label, value, path]) => `
        <button type="button" class="ops-monitor-item ${value ? tone : ""}" data-nav="${path}">
          <span class="ops-monitor-icon">${overviewIcon(icon, 20)}</span>
          <span class="ops-monitor-copy"><span class="ops-monitor-label">${label}</span><strong>${fmt(value)}</strong></span>
        </button>`).join("")}
    </div>
  </section>`;
}

// Plain SVG: a gridded column chart reads better than a bare CSS bar strip and
// needs no charting library (the app has no build step).
function overviewTrendChart(months) {
  const width = 560;
  const height = 210;
  const padLeft = 34;
  const padBottom = 26;
  const padTop = 10;
  const peak = Math.max(1, ...months.map((m) => Math.max(m.created, m.delivered)));
  // Whole-number gridlines: 6/4 would label the axis 0, 2, 3, 5, 6.
  const ticks = Math.min(4, peak);
  const step = Math.ceil(peak / ticks);
  const max = step * ticks;
  const plotH = height - padBottom - padTop;
  const plotW = width - padLeft - 8;
  const slot = plotW / Math.max(1, months.length);
  const barW = Math.min(16, slot / 3);
  const y = (value) => padTop + plotH - (value / max) * plotH;

  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = step * i;
    return `<line x1="${padLeft}" y1="${y(value)}" x2="${width - 8}" y2="${y(value)}" class="chart-grid" />
      <text x="${padLeft - 8}" y="${y(value) + 4}" class="chart-tick" text-anchor="end">${Math.round(value)}</text>`;
  }).join("");

  const bars = months.map((m, index) => {
    const center = padLeft + slot * index + slot / 2;
    return `
      <rect x="${center - barW - 2}" y="${y(m.created)}" width="${barW}" height="${Math.max(1, plotH + padTop - y(m.created))}" class="chart-bar created" rx="2"><title>${m.created}</title></rect>
      <rect x="${center + 2}" y="${y(m.delivered)}" width="${barW}" height="${Math.max(1, plotH + padTop - y(m.delivered))}" class="chart-bar delivered" rx="2"><title>${m.delivered}</title></rect>
      <text x="${center}" y="${height - 8}" class="chart-tick" text-anchor="middle">${esc(m.month.slice(5))}.${esc(m.month.slice(2, 4))}</text>`;
  }).join("");

  return `<div class="chart-block">
    <div class="chart-legend"><span><i class="created"></i>Ochilgan</span><span><i class="delivered"></i>Yetkazilgan</span></div>
    <div class="chart-axis-title">Partiyalar soni</div>
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Yetkazib berish dinamikasi">${grid}${bars}</svg>
  </div>`;
}

const STATUS_MIX_LABELS = {
  delivered: "Yetkazilgan",
  unfinished: "Yakunlanmagan",
  problem: "Muammoli",
};

function overviewStatusRing(mix) {
  const size = 148;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = mix.items.filter((item) => item.count > 0).map((item) => {
    const length = (item.count / (mix.total || 1)) * circumference;
    const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="ring-arc ${item.key}"
      stroke-width="${stroke}" fill="none"
      stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" />`;
    offset += length;
    return arc;
  }).join("");

  return `<div class="ring-block">
    <div class="ring-chart">
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Partiyalar holati">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="ring-track" stroke-width="${stroke}" fill="none" />
        ${arcs}
      </svg>
      <div class="ring-center"><span>Jami</span><strong>${fmt(mix.total)}</strong></div>
    </div>
    <div class="ring-legend">
      ${mix.items.map((item) => `
        <div class="ring-legend-row">
          <span class="ring-dot ${item.key}"></span>
          <span class="ring-legend-label">${STATUS_MIX_LABELS[item.key] || item.key}</span>
          <strong>${fmt(item.count)}</strong>
          <span class="ring-percent" data-noloc>${item.percent}%</span>
        </div>`).join("")}
    </div>
  </div>`;
}

function overviewCardWithLink(title, body, linkPath) {
  return `<section class="card">
    <div class="card-header"><h2>${title}</h2></div>
    <div class="card-body">${body}</div>
    <div class="card-footer-link"><button type="button" class="link-btn" data-nav="${linkPath}">Barchasini ko'rish <span data-noloc>→</span></button></div>
  </section>`;
}

function overviewQuickActions() {
  const actions = [
    ["plus", "Yangi partiya yaratish", "/delivery-batches/new"],
    ["truck", "Reys yaratish", "/logistics"],
    ["link", "Transport biriktirish", "/transports"],
    ["userPlus", "Mijoz qo'shish", "/clients/new"],
    ["download", "Hisobotlarni yuklab olish", "/profit"],
  ];
  return `<section class="card">
    <div class="card-header"><h2>Tezkor amallar</h2></div>
    <div class="quick-actions">
      ${actions.map(([icon, label, path]) => `
        <button type="button" class="quick-action" data-nav="${path}">
          <span class="quick-action-icon">${overviewIcon(icon, 18)}</span><span>${label}</span>
        </button>`).join("")}
    </div>
  </section>`;
}

async function renderDeliveryOverview() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const query = new URLSearchParams();
  ["date_from", "date_to", "client_id", "route"].forEach((key) => { if (params.get(key)) query.set(key, params.get(key)); });
  const data = await api(`/api/delivery/overview?${query.toString()}`);
  const n = data.now;
  const r = data.result;

  app.innerHTML = `
    <div class="page ops-page module-overview">
      <div class="overview-head">
        <h1>Yetkazib berish</h1>
        <p>Partiyalar, reyslar va transport parkini bitta oynada boshqaring</p>
      </div>

      ${overviewToolbar(params, data.filter_options, data.range)}
      ${overviewHeadline(n, r)}
      ${overviewOperational(n)}

      <div class="panel-grid two">
        ${section("Yetkazib berish dinamikasi", overviewTrendChart(data.monthly))}
        ${section("Partiyalar holati", overviewStatusRing(data.status_mix))}
      </div>

      <div class="panel-grid two">
        ${overviewCardWithLink("Transport parki", tableOrEmpty(data.fleet.slice(0, 5), ["Transport", "Davlat raqami", "Haydovchi", "Yuk ko'tarish", "Holat"], (t) => `
          <tr>
            <td>${fmt(t.vehicle_type)}</td>
            <td>${fmt(t.vehicle_number)}</td>
            <td>${fmt(t.driver_name)}</td>
            <td>${fmt(t.capacity)}</td>
            <td>${statusBadge(t.status)}</td>
          </tr>`, "Transportlar qo'shilmagan."), "/transports")}

        ${overviewCardWithLink("Mijozlar kesimida", tableOrEmpty(data.top_clients.slice(0, 5), ["Mijoz", "Faol partiyalar", "Qabul qilingan miqdor", "Logistika daromadi"], (c) => `
          <tr>
            <td>${fmt(c.client_name)}</td>
            <td>${fmt(c.open)}</td>
            <td>${fmtQty(c.quantity, "t")}</td>
            <td>${fmtMoney(c.revenue)}</td>
          </tr>`, "Mijozlar bo'yicha ma'lumot yo'q."), "/delivery-batches")}
      </div>

      ${overviewQuickActions()}
    </div>
  `;

  bindOpsSearch("delivery-filter-form", "/delivery", ["client_id", "route", "date_from", "date_to"]);
}

const DETAIL_ICON_PATHS = {
  list: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  alertTriangle: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
};

function detailIcon(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${DETAIL_ICON_PATHS[name] || ""}</svg>`;
}

function detailBreadcrumb(items) {
  return `<nav class="detail-breadcrumb">${items.map((label, i) => i < items.length - 1 ? `<span>${esc(label)}</span><span class="detail-breadcrumb-sep">›</span>` : `<span class="detail-breadcrumb-current">${esc(label)}</span>`).join("")}</nav>`;
}

function detailStatusPill(label, tone = "muted") {
  return `<span class="detail-status-pill ${tone}"><span class="detail-status-dot"></span>${esc(label)}</span>`;
}

function detailSummaryCard({ label, value, caption, icon }) {
  return `<div class="detail-summary-card">
    <div class="detail-summary-card-top"><span>${esc(label)}</span>${icon ? `<span class="detail-icon-badge sm ${icon.tone || "teal"}">${detailIcon(icon.name, 14)}</span>` : ""}</div>
    <strong>${value}</strong>
    ${caption ? `<small>${caption}</small>` : ""}
  </div>`;
}

function detailCard({ icon, tone = "teal", title, badge, headerActions = "", body }) {
  return `<section class="detail-card">
    <div class="detail-card-header" data-detail-toggle>
      <span class="detail-icon-badge ${tone}">${detailIcon(icon, 16)}</span>
      <h2>${esc(title)}</h2>
      ${badge != null ? `<span class="detail-card-count">${badge}</span>` : ""}
      <div class="detail-card-header-actions">${headerActions}</div>
      <button type="button" class="detail-chevron" aria-label="Yig'ish/yoyish">${detailIcon("chevronDown", 16)}</button>
    </div>
    <div class="detail-card-body">${body}</div>
  </section>`;
}

function detailFieldGrid(items) {
  return `<div class="detail-field-grid">${items.map(([label, value]) => `<div class="detail-field"><span>${esc(label)}</span><strong>${fmt(value)}</strong></div>`).join("")}</div>`;
}

function detailFieldGridIcons(items) {
  return `<div class="detail-field-grid">${items.map(([label, value, icon]) => `<div class="detail-field ${icon ? "has-icon" : ""}"><span>${esc(label)}</span><strong>${icon ? `<span class="detail-icon-badge sm teal">${detailIcon(icon, 13)}</span>` : ""}${fmt(value)}</strong></div>`).join("")}</div>`;
}

function detailTonePanel({ label, tone, icon, body }) {
  return `<div class="detail-tone-panel ${tone}">
    <div class="detail-tone-panel-header">${icon ? detailIcon(icon, 13) : ""}<span>${esc(label)}</span></div>
    ${body}
  </div>`;
}

function detailMiniField(label, value, icon) {
  return `<div class="detail-mini-field">
    ${icon ? `<span class="detail-icon-badge sm">${detailIcon(icon, 13)}</span>` : ""}
    <div><span>${esc(label)}</span><strong>${fmt(value)}</strong></div>
  </div>`;
}

// «9.17 soat» bitta matn tuguni bo'lsa, lug'at unga yeta olmaydi va «soat»
// lotin alifbosida qolib ketadi. Raqam ma'lumot, birlik esa tarjima
// qilinadigan so'z -- shuning uchun ular alohida tugunda.
function detailHoursField(label, value, icon = "clock") {
  return `<div class="detail-mini-field">
    ${icon ? `<span class="detail-icon-badge sm">${detailIcon(icon, 13)}</span>` : ""}
    <div><span>${esc(label)}</span><strong><span data-noloc>${esc(fmtQty(value))}</span> <span>soat</span></strong></div>
  </div>`;
}

function detailWarningBanner(message) {
  if (!message) return "";
  return `<div class="detail-warning-banner">${detailIcon("alertTriangle", 16)}<span>${esc(message)}</span></div>`;
}

function detailEmptyState({ icon, title, subtitle, action }) {
  return `<div class="detail-empty-state">
    <span class="detail-empty-icon">${detailIcon(icon, 22)}</span>
    <strong>${esc(title)}</strong>
    ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
    ${action || ""}
  </div>`;
}

function detailTimeline(steps) {
  return `<div class="detail-timeline-grid">${steps.map(([label, value, done]) => `<div class="detail-timeline-item ${done ? "done" : ""}">${detailIcon(done ? "checkCircle" : "circle", 16)}<div><span>${esc(label)}</span><strong>${fmt(value)}</strong></div></div>`).join("")}</div>`;
}

function detailProgressBar(done, total, caption) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return `<div class="detail-progress">
    <div class="detail-progress-top"><span>Jarayon holati</span><strong>${done}/${total} bosqich</strong></div>
    <div class="detail-progress-track"><div class="detail-progress-fill" style="width:${percent}%"></div></div>
    ${caption ? `<p class="detail-progress-caption">${esc(caption)}</p>` : ""}
  </div>`;
}

function bindDetailToggles() {
  document.querySelectorAll("[data-detail-toggle]").forEach((header) => {
    header.addEventListener("click", (event) => {
      if (event.target.closest("button:not(.detail-chevron)") || event.target.closest("a")) return;
      header.closest(".detail-card")?.classList.toggle("collapsed");
    });
  });
}

async function fetchOrdersForSelect(selectedId = null, filters = {}) {
  const query = new URLSearchParams({ page_size: "100" });
  if (filters.clientId) query.set("client_id", filters.clientId);
  if (filters.contractId) query.set("contract_id", filters.contractId);
  const data = await api(`/api/orders?${query.toString()}`);
  return data.items.map((order) => `<option value="${order.id}" ${Number(selectedId) === order.id ? "selected" : ""}>${esc(order.order_number)} - ${esc(order.client?.name || "")}</option>`).join("");
}

async function fetchBatchesForSelect(selectedId = null, filters = {}) {
  const query = new URLSearchParams({ page_size: "100" });
  if (filters.clientId) query.set("client_id", filters.clientId);
  if (filters.contractId) query.set("contract_id", filters.contractId);
  if (filters.orderId) query.set("order_id", filters.orderId);
  const data = await api(`/api/delivery-batches?${query.toString()}`);
  return data.items.map((batch) => `<option value="${batch.id}" ${Number(selectedId) === batch.id ? "selected" : ""}>${esc(batch.batch_number)} - ${esc(batch.order?.order_number || "")}</option>`).join("");
}

// Ilgari bu yerda `status=active` filtri turardi. Holatlar qayta nomlangach
// («active» -> «free») filtr hech nimani qaytarmay qo'yardi va ro'yxat bo'sh
// bo'lardi. Endi filtr yo'q: bo'sh bo'lmagan mashina ham ko'rinadi, lekin
// yonida sababi yozilib turadi -- ta'mirdagi mashinaga reys berish xato
// ekanini operator ko'rib tursin.
// Reys vaqt nuqtalari. Ilgari faqat to'rtta sana bor edi, shuning uchun
// «reys necha soat davom etdi» degan savolga javob yo'q edi.
const LOGISTICS_TIMELINE_FIELDS = [
  ["departed_at", "Yo'lga chiqdi"],
  ["loading_started_at", "Yuklash boshlandi"],
  ["loading_finished_at", "Yuklash tugadi"],
  ["arrived_at", "Ob'ektga yetdi"],
  ["unloading_started_at", "Tushirish boshlandi"],
  ["unloading_finished_at", "Tushirish tugadi"],
  ["returned_at", "Bazaga qaytdi"],
];

function timelineFields(logistics = {}) {
  return LOGISTICS_TIMELINE_FIELDS
    .map(([name, label]) => textField(name, label, isoToLocalInput(logistics[name]), "datetime-local"))
    .join("");
}

function collectTimelinePayload(form) {
  const payload = {};
  for (const [name] of LOGISTICS_TIMELINE_FIELDS) payload[name] = field(form, name);
  return payload;
}

// `datetime-local` maydoni `YYYY-MM-DDTHH:MM` kutadi; serverdan soniya va
// mintaqa bilan keladi.
function isoToLocalInput(value) {
  return value ? String(value).slice(0, 16) : "";
}

function hoursText(value) {
  if (value === null || value === undefined) return dash;
  return `<span>${fmtQty(value)}</span> <span>soat</span>`;
}

function logisticsTimelinePanel(logistics = {}) {
  const timeline = logistics.timeline;
  if (!timeline) return "";
  const rows = (timeline.points || []).map((point) => `<tr><td>${fmt(point.label)}</td><td>${point.at ? fmtDate(point.at) : dash}</td></tr>`).join("");
  return `${summaryCards([
    ["Reys davomiyligi", hoursText(timeline.total_hours)],
    ["Yuklash", hoursText(timeline.loading_hours)],
    ["Tushirish", hoursText(timeline.unloading_hours)],
    ["Harakatda", hoursText(timeline.driving_hours)],
  ])}${workflowWarningsPanel(timeline.warnings || [])}${section("Reys vaqtlari", timeline.filled_points ? `<table class="data-table"><thead><tr><th>Nuqta</th><th>Vaqt</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Reys vaqtlari kiritilmagan.</div>`)}`;
}

async function fetchTransportsForSelect(selectedId = null) {
  const data = await api("/api/transports?page_size=200").catch(() => ({ items: [] }));
  return data.items.map((item) => {
    // Variant matni -- ma'lumot: davlat raqami va haydovchi ismi. Unga jumla
    // qo'shib bo'lmaydi, chunki qo'shilgan matn lug'atga tushmaydi va lotin
    // alifbosida qolib ketadi. Shuning uchun belgi: ta'mir yoki texnik
    // xizmatda bo'lsa va hujjat muddati o'tgan bo'lsa, yonida ogohlantirish
    // belgisi turadi, sababini kartochkada ko'radi.
    const parts = [item.vehicle_number];
    if (item.driver_name) parts.push(item.driver_name);
    const flags = [];
    if (item.status !== "free") flags.push("\u26a0");
    if (item.readiness && item.readiness.level === "expired") flags.push("\u26d4");
    if (flags.length) parts.push(flags.join(""));
    return `<option value="${item.id}" data-driver="${esc(item.driver_name || "")}" data-phone="${esc(item.driver_phone || "")}" data-vehicle="${esc(item.vehicle_number)}" data-trailer="${esc(item.trailer_number || "")}" ${Number(selectedId) === item.id ? "selected" : ""}>${esc(parts.join(" · "))}</option>`;
  }).join("");
}

function applySelectedTransport(form) {
  const selected = form.elements.transport_id?.selectedOptions?.[0];
  if (!selected?.value) return;
  form.elements.carrier_id.value = selected.value;
  form.elements.driver_name.value = selected.dataset.driver || "";
  form.elements.driver_phone.value = selected.dataset.phone || "";
  form.elements.vehicle_number.value = selected.dataset.vehicle || "";
  form.elements.trailer_number.value = selected.dataset.trailer || "";
  calculateLogisticsForm(form);
}

function batchItemRow(orderItems = [], item = {}, index = 0, balances = []) {
  const selectedId = Number(item.order_item_id || orderItems[0]?.id || "");
  const balance = balances.find((row) => row.order_item_id === selectedId);
  return `
    <div class="item-row" data-batch-item-row>
      <label>Mahsulot<select name="order_item_id_${index}"><option value="">Mahsulotni tanlang</option>${orderItems.map((orderItem) => `<option value="${orderItem.id}" ${orderItem.id === selectedId ? "selected" : ""}>${esc(orderItem.product_name)} (${esc(orderItem.unit)})</option>`).join("")}</select></label>
      ${textField(`planned_quantity_${index}`, "Reja", item.planned_quantity ?? "", "number")}
      ${textField(`loaded_quantity_${index}`, "Yuklangan", item.loaded_quantity ?? "", "number")}
      ${textField(`accepted_quantity_${index}`, "Qabul qilingan", item.accepted_quantity ?? "", "number")}
      <div class="total-box"><span>Buyurtma qoldig'i</span><strong data-batch-row-balance>${balance ? `${fmtQty(balance.order_quantity, balance.unit)} / ${fmtQty(balance.remaining_quantity_for_planning, balance.unit)} qoldi` : dash}</strong></div>
      <div class="total-box"><span>Farq</span><strong data-batch-row-diff>${dash}</strong></div>
      <button type="button" class="btn danger" data-remove-batch-item>Olib tashlash</button>
    </div>
    ${textArea(`comment_${index}`, "Izoh", item.comment)}
  `;
}

function calculateBatchForm(form, orderItems = [], balances = []) {
  let planned = 0;
  let loaded = 0;
  let accepted = 0;
  [...form.querySelectorAll("[data-batch-item-row]")].forEach((row) => {
    const orderItemId = Number(row.querySelector("[name^='order_item_id_']").value);
    const balance = balances.find((item) => item.order_item_id === orderItemId);
    const rowPlanned = numberValue(row.querySelector("[name^='planned_quantity_']").value);
    const rowLoaded = numberValue(row.querySelector("[name^='loaded_quantity_']").value);
    const rowAccepted = numberValue(row.querySelector("[name^='accepted_quantity_']").value);
    planned += rowPlanned;
    loaded += rowLoaded;
    accepted += rowAccepted;
    row.querySelector("[data-batch-row-diff]").textContent = fmtQty(rowLoaded - rowAccepted);
    row.querySelector("[data-batch-row-balance]").textContent = balance ? `${fmtQty(balance.order_quantity, balance.unit)} / ${fmtQty(balance.planned_quantity_total, balance.unit)} reja / ${fmtQty(balance.accepted_quantity_total, balance.unit)} qabul / ${fmtQty(balance.remaining_quantity_for_planning, balance.unit)} qoldi` : dash;
  });
  form.querySelector("[data-batch-planned]").textContent = fmtQty(planned);
  form.querySelector("[data-batch-loaded]").textContent = fmtQty(loaded);
  form.querySelector("[data-batch-accepted]").textContent = fmtQty(accepted);
  form.querySelector("[data-batch-diff]").textContent = fmtQty(loaded - accepted);
}

function calculateLogisticsForm(form) {
  const loadedMileage = numberValue(field(form, "loaded_mileage_km"));
  const emptyMileage = numberValue(field(form, "empty_mileage_km"));
  const totalMileageTarget = form.querySelector("[data-logistics-total-mileage]");
  if (totalMileageTarget) totalMileageTarget.textContent = fmtQty(loadedMileage + emptyMileage, "km");

  const tonKmTarget = form.querySelector("[data-logistics-ton-km]");
  if (tonKmTarget) {
    const tonnage = numberValue(form.querySelector("[data-batch-accepted]")?.textContent)
      || numberValue(form.querySelector("[data-batch-loaded]")?.textContent)
      || numberValue(form.querySelector("[data-batch-planned]")?.textContent);
    const distance = numberValue(field(form, "distance_km"));
    tonKmTarget.textContent = tonnage && distance ? fmtQty(tonnage * distance, "t·km") : dash;
  }

  const fuelCost = numberValue(field(form, "fuel_cost_amount"));
  const wage = numberValue(field(form, "driver_wage_amount"));
  const espPercent = numberValue(field(form, "esp_tax_percent"));
  const otherExpenses = numberValue(field(form, "other_expenses_amount"));
  const businessTripExpenses = numberValue(field(form, "business_trip_expenses_amount"));
  if (form.elements.cost_amount && (fuelCost || wage || otherExpenses || businessTripExpenses)) {
    form.elements.cost_amount.value = String(fuelCost + wage + (wage * espPercent) / 100 + otherExpenses + businessTripExpenses);
  }

  const profitTarget = form.querySelector("[data-logistics-profit]");
  if (profitTarget) profitTarget.textContent = fmtMoney(numberValue(field(form, "customer_price")) - numberValue(field(form, "cost_amount")));
  const statusInput = form.elements.logistics_status;
  if (!statusInput || ["issue", "cancelled", "in_transit", "unloading", "completed"].includes(statusInput.value)) return;
  if (field(form, "logistics_actual_delivery_date")) {
    statusInput.value = "delivered";
  } else if (field(form, "logistics_actual_pickup_date")) {
    statusInput.value = "loaded";
  } else if (field(form, "vehicle_number")) {
    statusInput.value = "vehicle_assigned";
  } else if (field(form, "carrier_name") || field(form, "driver_name")) {
    statusInput.value = "carrier_assigned";
  } else {
    statusInput.value = "not_assigned";
  }
}

function logisticsTripDetailsList(logistics = {}, batch = {}) {
  const loadedMileage = numberValue(logistics.loaded_mileage_km);
  const emptyMileage = numberValue(logistics.empty_mileage_km);
  const totalMileage = loadedMileage + emptyMileage;
  const tonnage = numberValue(batch.summary?.total_accepted_quantity) || numberValue(batch.summary?.total_loaded_quantity) || numberValue(batch.summary?.total_planned_quantity);
  const distance = numberValue(logistics.distance_km);
  return detailList([
    ["Yo'nalish (Ob'ekt)", logistics.route_name],
    ["Masofa", logistics.distance_km != null ? fmtQty(logistics.distance_km, "km") : dash],
    ["Yuk bilan probeg", logistics.loaded_mileage_km != null ? fmtQty(logistics.loaded_mileage_km, "km") : dash],
    ["Bo'sh probeg", logistics.empty_mileage_km != null ? fmtQty(logistics.empty_mileage_km, "km") : dash],
    ["Umumiy probeg", loadedMileage || emptyMileage ? fmtQty(totalMileage, "km") : dash],
    ["Tonna-km", tonnage && distance ? fmtQty(tonnage * distance, "t·km") : dash],
    ["GSM sarfi", logistics.fuel_consumption_liters != null ? fmtQty(logistics.fuel_consumption_liters, "litr") : dash],
    ["GSM qiymati (QQSsiz)", fmtMoney(logistics.fuel_cost_amount)],
    ["Haydovchi ish haqi", fmtMoney(logistics.driver_wage_amount)],
    ["ESP foizi", logistics.esp_tax_percent != null ? fmtPercent(logistics.esp_tax_percent) : dash],
    ["Boshqa xarajatlar", fmtMoney(logistics.other_expenses_amount)],
    ["Komandirovka xarajatlari", fmtMoney(logistics.business_trip_expenses_amount)],
  ]);
}

async function fetchBatchWizardOrders(selectedId = null) {
  const data = await api("/api/orders?page_size=100");
  const options = await Promise.all(data.items.map(async (order) => {
    const balances = await api(`/api/delivery-batches/order/${order.id}/balances`);
    const remaining = balances.reduce((sum, item) => sum + numberValue(item.remaining_quantity_for_planning), 0);
    if (remaining <= 0 && Number(selectedId) !== order.id) return "";
    return `<option value="${order.id}" ${Number(selectedId) === order.id ? "selected" : ""}>${esc(order.order_number)} - ${esc(order.client?.name || "")} - ${fmtQty(remaining)}</option>`;
  }));
  return options.join("");
}

function wizardOrderTotals(state) {
  const balances = state.balances || [];
  return {
    order: balances.reduce((sum, item) => sum + numberValue(item.order_quantity), 0),
    planned: balances.reduce((sum, item) => sum + numberValue(item.planned_quantity_total), 0),
    remaining: balances.reduce((sum, item) => sum + numberValue(item.remaining_quantity_for_planning), 0),
    selected: balances.reduce((sum, item) => sum + numberValue(state.quantities?.[item.order_item_id] ?? item.remaining_quantity_for_planning), 0),
  };
}

function wizardProductList(items = []) {
  return items.map((item) => `${fmt(item.product_name)} (${fmtQty(item.quantity, item.unit)})`).join(", ") || dash;
}

function addressText(address = {}) {
  return [address.region, address.district, address.address].filter(Boolean).join(", ");
}

async function enrichBatchWizardState(state, orderId) {
  state.order = await api(`/api/orders/${orderId}`);
  state.balances = await api(`/api/delivery-batches/order/${orderId}/balances`);
  state.quantities = {};
  state.balances.forEach((balance) => {
    state.quantities[balance.order_item_id] = numberValue(balance.remaining_quantity_for_planning) > 0 ? balance.remaining_quantity_for_planning : "";
  });
  state.plannedLoadingDate ||= todayIso();
  state.plannedDeliveryDate ||= state.order.required_date || state.plannedLoadingDate;
  state.supplierName = state.order.supplier_name || "";
  state.supplierId = state.order.supplier_id || null;
  try {
    const client = await api(`/api/clients/${state.order.client_id}`);
    const deliveryAddress = (client.addresses || []).find((item) => item.address_type === "delivery") || (client.addresses || [])[0];
    state.deliveryAddress ||= addressText(deliveryAddress);
  } catch {
    state.deliveryAddress ||= "";
  }
  if (state.order.supplier_id) {
    try {
      const supplier = await api(`/api/suppliers/${state.order.supplier_id}`);
      const loadingAddress = (supplier.addresses || []).find((item) => item.address_type === "loading") || (supplier.addresses || []).find((item) => item.address_type === "warehouse") || (supplier.addresses || []).find((item) => item.address_type === "factory") || (supplier.addresses || [])[0];
      state.loadingAddress ||= addressText(loadingAddress);
      state.supplierName ||= supplier.name || "";
    } catch {
      state.loadingAddress ||= "";
    }
  }
}

function batchWizardStepper(step) {
  const steps = ["Buyurtma", "Miqdor", "Manba", "Reja", "Tasdiqlash"];
  if (window.BitumFrontend?.components?.stepper) return window.BitumFrontend.components.stepper(steps, step);
  return `<div class="batch-wizard-stepper">${steps.map((label, index) => {
    const key = index + 1;
    const cls = key < step ? "completed" : key === step ? "current" : "upcoming";
    return `<div class="batch-wizard-step ${cls}"><span>${key}</span><strong>${label}</strong></div>`;
  }).join("")}</div>`;
}

function batchWizardOrderSummary(state) {
  if (!state.order) return `<div class="empty">Avval buyurtmani tanlang.</div>`;
  const totals = wizardOrderTotals(state);
  const noRemaining = totals.remaining <= 0;
  return `${noRemaining ? `<div class="workflow-warning"><strong>Qoldiq yo'q</strong><ul><li>Ushbu buyurtma bo'yicha qoldiq miqdor mavjud emas.</li></ul></div>` : ""}${summaryCards([
    ["Buyurtma raqami", fmt(state.order.order_number)],
    ["Mijoz", fmt(state.order.client?.name)],
    ["Shartnoma", fmt(state.order.contract?.contract_number)],
    ["Mahsulotlar", wizardProductList(state.order.items)],
    ["Buyurtma miqdori", fmtQty(totals.order, state.order.items?.[0]?.unit)],
    ["Oldin partiya qilingan", fmtQty(totals.planned, state.order.items?.[0]?.unit)],
    ["Qoldiq miqdor", fmtQty(totals.remaining, state.order.items?.[0]?.unit)],
    ["Manba", fmt(optionLabel(sourceTypes, state.order.source_type))],
    ["Yetkazib berish modeli", fmt(optionLabel(fulfillmentTypes, state.order.fulfillment_type))],
    ["Ta'minotchi", fmt(state.supplierName || state.order.supplier_name)],
    ["Buyurtma holati", statusBadge(state.order.status)],
  ])}`;
}

function batchWizardQuantityTable(state) {
  if (!state.order) return `<div class="empty">Miqdor kiritish uchun avval buyurtmani tanlang.</div>`;
  return `${tableOrEmpty(state.balances || [], ["Mahsulot", "Buyurtma miqdori", "Oldin partiya qilingan", "Qoldiq", "Ushbu partiya"], (balance) => {
    const value = state.quantities?.[balance.order_item_id] ?? balance.remaining_quantity_for_planning;
    return `<tr><td>${fmt(balance.product_name)}</td><td>${fmtQty(balance.order_quantity, balance.unit)}</td><td>${fmtQty(balance.planned_quantity_total, balance.unit)}</td><td>${fmtQty(balance.remaining_quantity_for_planning, balance.unit)}</td><td><input data-wizard-qty="${balance.order_item_id}" type="number" step="any" min="0" max="${esc(balance.remaining_quantity_for_planning)}" value="${esc(value)}" /></td></tr>`;
  }, "Buyurtma mahsulotlari topilmadi.")}<p class="helper-text">Qabul qilingan miqdor keyinchalik, mahsulot mijoz tomonidan qabul qilingandan so'ng kiritiladi.</p>`;
}

function batchWizardSourcePanel(state) {
  if (!state.order) return `<div class="empty">Avval buyurtmani tanlang.</div>`;
  const companyManaged = state.order.fulfillment_type === "company_managed_delivery";
  const missingSupplier = companyManaged && !state.supplierName;
  return `${missingSupplier ? `<div class="workflow-warning"><strong>Ta'minotchi kerak</strong><ul><li>Partiya yaratish uchun avval ta'minotchini tanlang.</li></ul></div>` : ""}${summaryCards([
    ["Manba", fmt(optionLabel(sourceTypes, state.order.source_type))],
    ["Yetkazib berish modeli", fmt(optionLabel(fulfillmentTypes, state.order.fulfillment_type))],
    ["Yetkazish usuli", "Avto"],
    ["Ta'minotchi", fmt(state.supplierName)],
    ["Ta'minotchi holati", fmt(optionLabel(supplierStatuses, state.order.supplier_status))],
  ])}<div class="empty compact">${companyManaged ? "Bu partiya kompaniya tomonidan boshqariladigan logistika orqali yetkaziladi. Partiya yaratilgandan so'ng logistika yozuvi avtomatik ochiladi." : "Bu partiya ta'minotchidan mijozga to'g'ridan-to'g'ri yetkaziladi. Logistika ma'lumotlari minimal ko'rinishda yuritiladi."}</div>`;
}

function batchWizardPlanPanel(state) {
  return `<div class="grid">
    ${textField("planned_loading_date", "Reja yuklash sanasi", state.plannedLoadingDate || "", "date", { required: true })}
    ${textField("planned_delivery_date", "Reja yetkazish sanasi", state.plannedDeliveryDate || "", "date", { required: true })}
    ${textArea("loading_address", "Yuklash manzili", state.loadingAddress || "", { required: true })}
    ${textArea("delivery_address", "Yetkazish manzili", state.deliveryAddress || "", { required: true })}
    ${textArea("notes", "Izoh", state.notes || "")}
  </div><p class="helper-text">Haydovchi, transport raqami va haqiqiy sanalar partiya yaratilgandan keyin logistika bosqichida kiritiladi.</p>`;
}

function batchWizardConfirmPanel(state) {
  if (!state.order) return `<div class="empty">Tasdiqlash uchun avval buyurtmani tanlang.</div>`;
  const totals = wizardOrderTotals(state);
  const afterRemaining = totals.remaining - totals.selected;
  const selectedProducts = (state.balances || [])
    .filter((balance) => numberValue(state.quantities?.[balance.order_item_id]) > 0)
    .map((balance) => `${balance.product_name} - ${fmtQty(state.quantities[balance.order_item_id], balance.unit)}`)
    .join(", ");
  return `<div class="confirm-grid">
    ${section("Buyurtma", detailList([["Buyurtma raqami", state.order.order_number], ["Mijoz", state.order.client?.name], ["Shartnoma", state.order.contract?.contract_number]]))}
    ${section("Mahsulot va miqdor", detailList([["Mahsulot", selectedProducts || dash], ["Reja miqdor", fmtQty(totals.selected, state.order.items?.[0]?.unit)], ["Buyurtma qoldig'i", fmtQty(totals.remaining, state.order.items?.[0]?.unit)], ["Saqlangandan keyingi qoldiq", fmtQty(afterRemaining, state.order.items?.[0]?.unit)]]))}
    ${section("Manba va model", detailList([["Manba", optionLabel(sourceTypes, state.order.source_type)], ["Yetkazib berish modeli", optionLabel(fulfillmentTypes, state.order.fulfillment_type)], ["Yetkazish usuli", "Avto"], ["Ta'minotchi", state.supplierName]]))}
    ${section("Reja", detailList([["Reja yuklash sanasi", state.plannedLoadingDate], ["Reja yetkazish sanasi", state.plannedDeliveryDate], ["Yuklash manzili", state.loadingAddress], ["Yetkazish manzili", state.deliveryAddress]]))}
  </div>`;
}

function batchWizardBody(state) {
  if (state.step === 1) return section("Buyurtma tanlash", `${selectField("wizard_order_id", "Buyurtma", [["", "Buyurtmani tanlang"]], "", { required: true }).replace("</select>", `${state.ordersHtml || ""}</select>`)}${batchWizardOrderSummary(state)}`);
  if (state.step === 2) return section("Mahsulot va miqdor", batchWizardQuantityTable(state));
  if (state.step === 3) return section("Manba va yetkazib berish modeli", batchWizardSourcePanel(state));
  if (state.step === 4) return section("Reja sanalar va manzillar", batchWizardPlanPanel(state));
  return section("Tekshirish va yaratish", batchWizardConfirmPanel(state));
}

function batchWizardHtml(state) {
  return `<div class="page batch-wizard-page">
    <div class="page-header">
      <div class="page-title"><h1>Yangi partiya yaratish</h1><p>Buyurtma bo'yicha rejalashtirilgan yetkazib berish partiyasini yarating.</p></div>
      <div class="actions"><button class="btn" type="button" data-wizard-cancel>Bekor qilish</button></div>
    </div>
    ${batchWizardStepper(state.step)}
    <form id="batch-wizard-form">${batchWizardBody(state)}
      <div class="form-footer">
        <button type="button" class="btn" data-wizard-back ${state.step <= 1 ? "disabled" : ""}>Ortga</button>
        ${state.step < 5 ? `<button type="button" class="btn primary" data-wizard-next>Keyingi</button>` : `<button type="submit" class="btn primary">Partiyani yaratish</button>`}
      </div>
    </form>
  </div>`;
}

function selectedWizardItems(state) {
  return (state.balances || []).map((balance) => ({
    order_item_id: balance.order_item_id,
    planned_quantity: state.quantities?.[balance.order_item_id],
    remaining: balance.remaining_quantity_for_planning,
    unit: balance.unit,
  })).filter((item) => numberValue(item.planned_quantity) > 0);
}

function validateBatchWizardStep(state, targetStep = state.step) {
  if (targetStep >= 1 && !state.order) return "Buyurtmani tanlang.";
  const totals = wizardOrderTotals(state);
  if (targetStep >= 1 && totals.remaining <= 0) return "Ushbu buyurtma bo'yicha qoldiq miqdor mavjud emas.";
  const items = selectedWizardItems(state);
  if (targetStep >= 2 && !items.length) return "Kamida bitta mahsulot uchun partiya miqdorini kiriting.";
  if (targetStep >= 2 && items.some((item) => numberValue(item.planned_quantity) > numberValue(item.remaining))) return "Partiya miqdori buyurtma qoldig'idan oshmasligi kerak.";
  if (targetStep >= 3 && state.order?.fulfillment_type === "company_managed_delivery" && !state.supplierName) return "Partiya yaratish uchun avval ta'minotchini tanlang.";
  if (targetStep >= 4 && (!state.plannedLoadingDate || !state.plannedDeliveryDate)) return "Reja yuklash va yetkazish sanalari majburiy.";
  if (targetStep >= 4 && state.plannedDeliveryDate < state.plannedLoadingDate) return "Reja yetkazish sanasi reja yuklash sanasidan oldin bo'lishi mumkin emas.";
  if (targetStep >= 4 && state.order?.fulfillment_type === "company_managed_delivery" && !state.loadingAddress) return "Yuklash manzilini kiriting.";
  if (targetStep >= 4 && !state.deliveryAddress) return "Yetkazish manzilini kiriting.";
  return null;
}

function collectBatchWizardPayload(state) {
  const today = todayIso();
  return {
    order_id: state.order.id,
    batch_number: generatedBatchNumber(state.order.order_number),
    batch_date: today,
    planned_loading_date: state.plannedLoadingDate,
    planned_delivery_date: state.plannedDeliveryDate,
    status: "planned",
    supplier_id: state.order.supplier_id || null,
    supplier_name: state.supplierName || null,
    notes: state.notes || null,
    items: selectedWizardItems(state).map((item) => ({
      order_item_id: item.order_item_id,
      planned_quantity: normalizeNumberInputValue(item.planned_quantity),
      loaded_quantity: null,
      accepted_quantity: null,
      comment: null,
    })),
    logistics: {
      status: "not_assigned",
      loading_address: state.loadingAddress || null,
      delivery_address: state.deliveryAddress || null,
      planned_pickup_date: state.plannedLoadingDate,
      planned_delivery_date: state.plannedDeliveryDate,
      cost_amount: "0",
      customer_price: "0",
      paid_by: "company",
    },
  };
}

function syncBatchWizardInputs(state) {
  const form = document.querySelector("#batch-wizard-form");
  if (!form) return;
  form.querySelectorAll("[data-wizard-qty]").forEach((input) => {
    state.quantities[Number(input.dataset.wizardQty)] = input.value;
  });
  if (form.elements.planned_loading_date) state.plannedLoadingDate = form.elements.planned_loading_date.value;
  if (form.elements.planned_delivery_date) state.plannedDeliveryDate = form.elements.planned_delivery_date.value;
  if (form.elements.loading_address) state.loadingAddress = form.elements.loading_address.value.trim();
  if (form.elements.delivery_address) state.deliveryAddress = form.elements.delivery_address.value.trim();
  if (form.elements.notes) state.notes = form.elements.notes.value.trim();
}

function renderBatchWizard(state) {
  app.innerHTML = batchWizardHtml(state);
  bindBatchWizard(state);
}

function bindBatchWizard(state) {
  const form = document.querySelector("#batch-wizard-form");
  document.querySelector("[data-wizard-cancel]")?.addEventListener("click", () => navigate("/delivery-batches"));
  form?.elements.wizard_order_id?.addEventListener("change", async (event) => {
    const orderId = Number(event.target.value);
    state.order = null;
    state.balances = [];
    state.quantities = {};
    if (orderId) await enrichBatchWizardState(state, orderId);
    renderBatchWizard(state);
  });
  form?.addEventListener("input", () => syncBatchWizardInputs(state));
  document.querySelector("[data-wizard-back]")?.addEventListener("click", () => {
    syncBatchWizardInputs(state);
    state.step = Math.max(1, state.step - 1);
    renderBatchWizard(state);
  });
  document.querySelector("[data-wizard-next]")?.addEventListener("click", () => {
    syncBatchWizardInputs(state);
    const error = validateBatchWizardStep(state, state.step);
    if (error) return showToast(error, true);
    state.step = Math.min(5, state.step + 1);
    renderBatchWizard(state);
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncBatchWizardInputs(state);
    const error = validateBatchWizardStep(state, 5);
    if (error) return showToast(error, true);
    try {
      const saved = await api("/api/delivery-batches", { method: "POST", body: JSON.stringify(collectBatchWizardPayload(state)) });
      showToast("Partiya yaratildi.");
      navigate(`/delivery-batches/${saved.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function batchWizardForm() {
  const params = new URLSearchParams(location.search);
  const prefillOrderId = Number(params.get("order_id") || 0) || null;
  const state = {
    step: 1,
    ordersHtml: await fetchBatchWizardOrders(prefillOrderId),
    order: null,
    balances: [],
    quantities: {},
    plannedLoadingDate: "",
    plannedDeliveryDate: "",
    loadingAddress: "",
    deliveryAddress: "",
    notes: "",
    supplierName: "",
    supplierId: null,
  };
  if (prefillOrderId) await enrichBatchWizardState(state, prefillOrderId);
  return state;
}

function collectBatchItems(form) {
  const rows = [...form.querySelectorAll("[data-batch-item-row]")];
  return rows.map((row, index) => {
    const orderItemId = row.querySelector("[name^='order_item_id_']").value;
    return {
      order_item_id: orderItemId ? Number(orderItemId) : null,
      planned_quantity: normalizeNumberInputValue(row.querySelector("[name^='planned_quantity_']").value),
      loaded_quantity: normalizeNumberInputValue(row.querySelector("[name^='loaded_quantity_']").value) || null,
      accepted_quantity: normalizeNumberInputValue(row.querySelector("[name^='accepted_quantity_']").value) || null,
      comment: form.elements[`comment_${index}`]?.value.trim() || null,
    };
  }).filter((item) => item.order_item_id && item.planned_quantity);
}

function collectBatchPayload(form) {
  return {
    order_id: Number(field(form, "order_id")),
    batch_number: field(form, "batch_number"),
    batch_date: field(form, "batch_date"),
    planned_loading_date: field(form, "planned_loading_date"),
    planned_delivery_date: field(form, "planned_delivery_date"),
    actual_loading_date: field(form, "actual_loading_date"),
    actual_delivery_date: field(form, "actual_delivery_date"),
    accepted_date: field(form, "accepted_date"),
    status: field(form, "status") || "planned",
    supplier_id: field(form, "supplier_id") ? Number(field(form, "supplier_id")) : null,
    supplier_name: field(form, "supplier_name"),
    notes: field(form, "notes"),
    created_by: field(form, "created_by"),
    items: collectBatchItems(form),
    logistics: {
      status: field(form, "logistics_status") || "not_assigned",
      carrier_id: field(form, "carrier_id") ? Number(field(form, "carrier_id")) : null,
      carrier_name: field(form, "carrier_name"),
      driver_name: field(form, "driver_name"),
      driver_phone: field(form, "driver_phone"),
      vehicle_number: field(form, "vehicle_number"),
      trailer_number: field(form, "trailer_number"),
      loading_address: field(form, "loading_address"),
      delivery_address: field(form, "delivery_address"),
      planned_pickup_date: field(form, "logistics_planned_pickup_date"),
      planned_delivery_date: field(form, "logistics_planned_delivery_date"),
      actual_pickup_date: field(form, "logistics_actual_pickup_date"),
      actual_delivery_date: field(form, "logistics_actual_delivery_date"),
      // Mashina identifikatori yuboriladi -- raqam va haydovchini server
      // uning kartochkasidan to'ldiradi.
      transport_id: field(form, "transport_id") ? Number(field(form, "transport_id")) : null,
      ...collectTimelinePayload(form),
      cost_amount: field(form, "cost_amount"),
      customer_price: field(form, "customer_price"),
      paid_by: field(form, "paid_by"),
      route_name: field(form, "route_name"),
      distance_km: field(form, "distance_km"),
      loaded_mileage_km: field(form, "loaded_mileage_km"),
      empty_mileage_km: field(form, "empty_mileage_km"),
      fuel_consumption_liters: field(form, "fuel_consumption_liters"),
      fuel_cost_amount: field(form, "fuel_cost_amount"),
      driver_wage_amount: field(form, "driver_wage_amount"),
      esp_tax_percent: field(form, "esp_tax_percent"),
      other_expenses_amount: field(form, "other_expenses_amount"),
      business_trip_expenses_amount: field(form, "business_trip_expenses_amount"),
      notes: field(form, "logistics_notes"),
    },
  };
}

function generatedBatchNumber(orderNumber = "") {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `BAT-${orderNumber || date}-${time}`;
}

function batchRowsFromBalances(balances = []) {
  const rows = balances
    .filter((balance) => numberValue(balance.remaining_quantity_for_planning) > 0)
    .map((balance) => ({
      order_item_id: balance.order_item_id,
      planned_quantity: balance.remaining_quantity_for_planning,
    }));
  return rows.length ? rows : [{}];
}

async function batchForm(batch = null) {
  const params = new URLSearchParams(location.search);
  const prefillOrderId = batch?.order_id || Number(params.get("order_id") || 0) || null;
  const orders = await fetchOrdersForSelect(prefillOrderId);
  const order = prefillOrderId ? await api(`/api/orders/${prefillOrderId}`) : null;
  const balances = batch ? batch.order_item_balances : prefillOrderId ? await api(`/api/delivery-batches/order/${prefillOrderId}/balances`) : [];
  const today = todayIso();
  const rows = batch?.items?.length ? batch.items : batchRowsFromBalances(balances);
  const logistics = batch?.logistics || {};
  const transportOptions = await fetchTransportsForSelect(logistics.transport_id || logistics.carrier_id);
  const batchNumber = batch?.batch_number || generatedBatchNumber(order?.order_number);
  const summaryProduct = rows.map((item) => item.product_name || order?.items?.find((orderItem) => orderItem.id === Number(item.order_item_id))?.product_name).filter(Boolean).join(", ");
  const summaryQuantity = rows.reduce((sum, item) => sum + numberValue(item.planned_quantity), 0);
  const logisticsSummary = summaryCards([
    ["Logistika", fmt(logisticsNumber(logistics, { batch_number: batchNumber }))],
    ["Partiya", fmt(batchNumber)],
    ["Buyurtma", fmt(order?.order_number || batch?.order?.order_number)],
    ["Mijoz", fmt(order?.client?.name || batch?.client?.name)],
    ["Mahsulot", fmt(summaryProduct)],
    ["Miqdor", fmtQty(summaryQuantity)],
    ["Manba", fmt(optionLabel(sourceTypes, batch?.source_type || order?.source_type))],
    ["Model", fmt(optionLabel(fulfillmentTypes, batch?.fulfillment_type || order?.fulfillment_type))],
    ["Holat", statusBadge(logistics.status || "not_assigned")],
  ]);
  const backPath = batch ? `/delivery-batches/${batch.id}` : "/delivery-batches";
  return `
    <div class="page">
      <div class="detail-page">
        ${detailBreadcrumb(["Yetkazib berish", "Partiyalar", batchNumber, "Tahrirlash"])}
        <div class="detail-header">
          <div>
            <h1 style="margin:0;font-size:24px;font-weight:750">${batch ? "Partiyani tahrirlash" : "Yangi partiya"}</h1>
            <p class="detail-subtitle">Mavjud buyurtma bo'yicha qisman yetkazib berish.</p>
          </div>
          <div class="detail-header-actions">
            <button type="button" class="btn" data-nav="${backPath}">${detailIcon("arrowLeft", 14)} Orqaga</button>
            <button type="submit" form="batch-form" class="btn primary">${detailIcon("save", 14)} Saqlash</button>
          </div>
        </div>
      <form id="batch-form">
        ${detailCard({ icon: "list", title: "Asosiy ma'lumotlar", body: `<div class="grid">
          <label>Buyurtma<select name="order_id"><option value="">Buyurtmani tanlang</option>${orders}</select></label>
          <label>Mijoz<input name="client_name" value="${esc(batch?.client?.name || order?.client?.name || "")}" disabled /></label>
          <label>Shartnoma<input name="contract_number" value="${esc(batch?.contract?.contract_number || order?.contract?.contract_number || "")}" disabled /></label>
          ${readonlyField("batch_number", "Partiya raqami", batchNumber)}
          ${textField("batch_date", "Partiya sanasi", batch?.batch_date || today, "date")}
          ${textField("planned_loading_date", "Reja yuklash sanasi", batch?.planned_loading_date || "", "date")}
          ${textField("planned_delivery_date", "Reja yetkazish sanasi", batch?.planned_delivery_date || "", "date")}
          ${textField("actual_loading_date", "Haqiqiy yuklash sanasi", batch?.actual_loading_date || "", "date")}
          ${textField("actual_delivery_date", "Haqiqiy yetkazish sanasi", batch?.actual_delivery_date || "", "date")}
          ${textField("accepted_date", "Qabul sanasi", batch?.accepted_date || "", "date")}
          ${selectField("status", "Status", batchStatuses, batch?.status || "planned")}
          ${textField("created_by", "Yaratgan", batch?.created_by)}
          ${textArea("notes", "Izohlar", batch?.notes)}
        </div>` })}
        ${detailCard({ icon: "box", title: "Mahsulotlar", body: `<div id="batch-items">${order ? rows.map((item, index) => batchItemRow(order.items, item, index, balances)).join("") : `<div class="empty">Avval buyurtmani tanlang.</div>`}</div><button type="button" class="btn" id="add-batch-item" ${order ? "" : "disabled"}>Mahsulot qo'shish</button><div class="totals-bar"><div class="total-box"><span>Reja</span><strong data-batch-planned>${dash}</strong></div><div class="total-box"><span>Yuklangan</span><strong data-batch-loaded>${dash}</strong></div><div class="total-box"><span>Qabul qilingan</span><strong data-batch-accepted>${dash}</strong></div><div class="total-box"><span>Farq</span><strong data-batch-diff>${dash}</strong></div></div>` })}
        ${detailCard({ icon: "truck", title: "Manba va yetkazib berish modeli", body: `<div class="grid">
          <label>Yetkazib berish modeli<input value="${esc(optionLabel(fulfillmentTypes, batch?.fulfillment_type || order?.fulfillment_type))}" disabled /></label>
          <label>Manba<input value="${esc(optionLabel(sourceTypes, batch?.source_type || order?.source_type))}" disabled /></label>
          <label>Yetkazish usuli<input value="auto" disabled /></label>
          <input type="hidden" name="supplier_id" value="${esc(batch?.supplier_id || order?.supplier_id || "")}" />
          <input type="hidden" name="supplier_name" value="${esc(batch?.supplier_name || order?.supplier_name || "")}" />
          ${readonlyField("supplier_name_display", "Ta'minotchi", batch?.supplier_name || order?.supplier_name || "")}
        </div>` })}
        ${detailCard({ icon: "list", title: "Logistika ma'lumotlari", body: `
          <h3>Logistika xulosasi</h3>
          ${logisticsSummary}
          <h3>Transport biriktirish</h3>
          <div class="grid">
          <label>Transport<select name="transport_id"><option value="">Transportni tanlang</option>${transportOptions}</select></label>
          <input type="hidden" name="carrier_id" value="${esc(logistics.carrier_id || "")}" />
          ${textField("carrier_name", "Tashuvchi", logistics.carrier_name)}
          ${textField("driver_name", "Haydovchi", logistics.driver_name)}
          ${textField("driver_phone", "Haydovchi telefoni", logistics.driver_phone)}
          ${textField("vehicle_number", "Transport raqami", logistics.vehicle_number)}
          ${textField("trailer_number", "Tirkama raqami", logistics.trailer_number)}
          ${selectField("logistics_status", "Logistika statusi", logisticsStatuses, logistics.status || "not_assigned")}
          </div>
          <h3>Sanalar</h3>
          <div class="grid">
          ${textField("logistics_planned_pickup_date", "Reja yuklash sanasi", logistics.planned_pickup_date || batch?.planned_loading_date || "", "date")}
          ${textField("logistics_planned_delivery_date", "Reja yetkazish sanasi", logistics.planned_delivery_date || batch?.planned_delivery_date || "", "date")}
          ${textField("logistics_actual_pickup_date", "Haqiqiy yuklash sanasi", logistics.actual_pickup_date || batch?.actual_loading_date || "", "date")}
          ${textField("logistics_actual_delivery_date", "Haqiqiy yetkazish sanasi", logistics.actual_delivery_date || batch?.actual_delivery_date || "", "date")}
          </div>
          <h3>Reys vaqtlari</h3>
          <div class="grid">${timelineFields(logistics)}</div>
          <p class="form-hint">Aniq vaqt kiritilsa, haqiqiy sanalar shundan to'ldiriladi.</p>
          <h3>Manzillar</h3>
          <div class="grid">
          ${textArea("loading_address", "Yuklash manzili", logistics.loading_address)}
          ${textArea("delivery_address", "Yetkazish manzili", logistics.delivery_address)}
          </div>
          <h3>Reys tafsilotlari</h3>
          <div class="grid">
          ${textField("route_name", "Yo'nalish (Ob'ekt)", logistics.route_name || "")}
          ${textField("distance_km", "Masofa (km)", logistics.distance_km || "", "number")}
          ${textField("loaded_mileage_km", "Yuk bilan probeg (km)", logistics.loaded_mileage_km || "", "number")}
          ${textField("empty_mileage_km", "Bo'sh probeg (km)", logistics.empty_mileage_km || "", "number")}
          <div class="total-box"><span>Umumiy probeg</span><strong data-logistics-total-mileage>${fmtQty(numberValue(logistics.loaded_mileage_km) + numberValue(logistics.empty_mileage_km), "km")}</strong></div>
          <div class="total-box"><span>Tonna-km</span><strong data-logistics-ton-km>${dash}</strong></div>
          ${textField("fuel_consumption_liters", "GSM sarfi (litr)", logistics.fuel_consumption_liters || "", "number")}
          ${textField("fuel_cost_amount", "GSM qiymati (QQSsiz)", logistics.fuel_cost_amount || "", "number")}
          ${textField("driver_wage_amount", "Haydovchi ish haqi", logistics.driver_wage_amount || "", "number")}
          ${textField("esp_tax_percent", "ESP foizi (%)", logistics.esp_tax_percent ?? "12", "number")}
          ${textField("other_expenses_amount", "Boshqa xarajatlar", logistics.other_expenses_amount || "", "number")}
          ${textField("business_trip_expenses_amount", "Komandirovka xarajatlari", logistics.business_trip_expenses_amount || "", "number")}
          </div>
          <h3>Xarajatlar</h3>
          <div class="grid">
          ${textField("cost_amount", "Xarajat summasi", logistics.cost_amount || "", "number")}
          ${textField("customer_price", "Mijozga transport narxi", logistics.customer_price || "", "number")}
          ${selectField("paid_by", "Kim to'laydi", paidByTypes, logistics.paid_by || "company")}
          <div class="total-box"><span>Transport foydasi</span><strong data-logistics-profit>${transportProfit(logistics)}</strong></div>
          </div>
          <p class="helper-text">GSM, ish haqi, ESP foizi, boshqa va komandirovka xarajatlari kiritilsa, xarajat summasi avtomatik hisoblanadi. Aks holda qo'lda kiriting.</p>
          <h3>Izohlar</h3>
          <div class="grid">
          ${textArea("logistics_notes", "Logistika izohlari", logistics.notes)}
          </div>
          <h3>Jarayon tarixi</h3>
          ${logisticsTimeline(logistics, batch || {})}
          ${logisticsWarnings(logistics, batch || {})}
          <div class="empty">Hujjatlarni logistika detail sahifasidan qo'shish mumkin.</div>
        ` })}
        ${detailCard({ icon: "paperclip", title: "Hujjatlar", body: `<div class="empty">Partiya hujjatlarini saqlagandan keyin Hujjatlar tabidan qo'shish mumkin.</div>` })}
        <div class="form-footer"><button type="button" class="btn" data-nav="${backPath}">Bekor qilish</button><button type="submit" class="btn primary">${detailIcon("save", 14)} Saqlash</button></div>
      </form>
      </div>
    </div>
  `;
}

async function bindBatchForm(batch = null) {
  const form = document.querySelector("#batch-form");
  let order = batch ? await api(`/api/orders/${batch.order_id}`) : null;
  let balances = batch ? batch.order_item_balances : [];
  async function reloadOrder() {
    const orderId = Number(form.elements.order_id.value);
    if (!orderId) return;
    order = await api(`/api/orders/${orderId}`);
    balances = await api(`/api/delivery-batches/order/${orderId}/balances`);
    form.elements.client_name.value = order.client?.name || "";
    form.elements.contract_number.value = order.contract?.contract_number || "";
    form.elements.supplier_id.value = order.supplier_id || "";
    form.elements.supplier_name.value = order.supplier_name || "";
    form.elements.supplier_name_display.value = order.supplier_name || "";
    if (!batch) form.elements.batch_number.value = generatedBatchNumber(order.order_number);
    document.querySelector("#batch-items").innerHTML = batchRowsFromBalances(balances).map((item, index) => batchItemRow(order.items, item, index, balances)).join("");
    document.querySelector("#add-batch-item").disabled = false;
    calculateBatchForm(form, order.items, balances);
    calculateLogisticsForm(form);
  }
  form.elements.order_id.addEventListener("change", reloadOrder);
  form.elements.transport_id?.addEventListener("change", () => applySelectedTransport(form));
  form.addEventListener("input", () => {
    calculateBatchForm(form, order?.items || [], balances);
    calculateLogisticsForm(form);
  });
  document.querySelector("#add-batch-item").addEventListener("click", () => {
    if (!order) return;
    const index = form.querySelectorAll("[data-batch-item-row]").length;
    document.querySelector("#batch-items").insertAdjacentHTML("beforeend", batchItemRow(order.items, {}, index, balances));
    calculateBatchForm(form, order.items, balances);
    calculateLogisticsForm(form);
  });
  form.addEventListener("click", (event) => {
    if (!event.target.matches("[data-remove-batch-item]")) return;
    if (form.querySelectorAll("[data-batch-item-row]").length <= 1) return showToast("Partiyada kamida bitta mahsulot bo'lishi kerak.", true);
    event.target.closest("[data-batch-item-row]").nextElementSibling?.remove();
    event.target.closest("[data-batch-item-row]").remove();
    calculateBatchForm(form, order?.items || [], balances);
    calculateLogisticsForm(form);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectBatchPayload(form);
    if (!payload.order_id || !payload.batch_number || !payload.batch_date) return showToast("Buyurtma, partiya raqami va partiya sanasi majburiy.", true);
    if (!payload.items.length) return showToast("Kamida bitta buyurtma mahsulotini qo'shing.", true);
    try {
      const saved = await api(batch ? `/api/delivery-batches/${batch.id}` : "/api/delivery-batches", { method: batch ? "PATCH" : "POST", body: JSON.stringify(payload) });
      showToast("Partiya saqlandi.");
      navigate(`/delivery-batches/${saved.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  if (order) {
    calculateBatchForm(form, order.items, balances);
    calculateLogisticsForm(form);
  }
}

async function renderDeliveryBatchesList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Partiyalar yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/delivery-batches?${params.toString()}`);
  const editable = canEdit("yetkazib_berish");
  app.innerHTML = opsListPage({
    className: "batches-ops-page",
    title: "Partiyalar",
    tabs: [{ label: "Buyurtmalar", path: "/orders" }, { label: "Partiyalar", active: true }, { label: "Logistika", path: "/logistics" }, { label: "Transportlar", path: "/transports" }],
    createPath: editable ? "/delivery-batches/new" : undefined,
    clearPath: "/delivery-batches",
    counter: `${fmt(data.total)} ta partiya`,
    formId: "batch-search-form",
    filters: `<input name="search" placeholder="Partiya, buyurtma, mijoz, mahsulot" value="${esc(params.get("search") || "")}" /><select name="status"><option value="">Status</option>${batchStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`,
    headers: ["Partiya raqami", "Sana", "Buyurtma", "Shartnoma", "Mijoz", "Mahsulot", "Reja", "Yuklangan", "Qabul qilingan", "Farq", "Ta'minotchi", "Status", "Logistika", ""],
    rows: data.items.map((batch) => `<tr><td><button class="ops-primary-link" data-nav="/delivery-batches/${batch.id}">${fmt(batch.batch_number)}</button></td><td>${fmt(batch.batch_date)}</td><td>${fmt(batch.order?.order_number)}</td><td>${fmt(batch.contract?.contract_number)}</td><td>${fmt(batch.client?.name)}</td><td>${fmt(batch.product)}</td><td>${fmtQty(batch.total_planned_quantity)}</td><td>${fmtQty(batch.total_loaded_quantity)}</td><td>${fmtQty(batch.total_accepted_quantity)}</td><td class="${numberValue(batch.total_difference_quantity) !== 0 ? "ops-warning" : ""}">${fmtQty(batch.total_difference_quantity)}</td><td>${fmt(batch.supplier_name)}</td><td>${statusBadge(batch.status)}</td><td>${fmt(optionLabel(logisticsStatuses, batch.logistics_status))}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/delivery-batches/${batch.id}">Ochish</button>${editable ? `<button class="link-btn" data-nav="/delivery-batches/${batch.id}/edit">Tahrirlash</button>` : ""}<button class="link-btn" data-nav="/delivery-batches/${batch.id}?tab=logistics">Logistika</button><button class="link-btn" data-nav="/delivery-batches/${batch.id}?tab=documents">Hujjatlar</button></div></td></tr>`).join(""),
    emptyText: "Partiyalar topilmadi.",
    colspan: 14,
    footer: opsFooter(data, "batch"),
  });
  bindOpsSearch("batch-search-form", "/delivery-batches", ["search", "status"]);
  bindOpsPagination("batch", "/delivery-batches");
}

async function renderNewBatch() {
  const state = await batchWizardForm();
  renderBatchWizard(state);
}

async function renderEditBatch(id) {
  const batch = await api(`/api/delivery-batches/${id}`);
  app.innerHTML = await batchForm(batch);
  await bindBatchForm(batch);
  bindDetailToggles();
}

function batchHeader(batch) {
  const logistics = batch.logistics || {};
  const quantity = batch.summary?.total_planned_quantity || batch.items?.[0]?.planned_quantity;
  const editable = canEdit("yetkazib_berish");
  return `<div class="workflow-header">
    <div class="page-title">
      <h1><span>Partiya</span><span data-noloc>: ${esc(fmt(batch.batch_number))}</span></h1>
      <p>${subtitleLine([
        { label: "Buyurtma", value: batch.order?.order_number, raw: true },
        { label: "Mijoz", value: batch.client?.name, raw: true },
        { label: "Mahsulot", value: batchPrimaryProduct(batch), raw: true },
        // fmtQty birlikni o'zi tarjima qiladi, shuning uchun raw.
        { label: "Miqdor", value: fmtQty(quantity, batch.items?.[0]?.unit), raw: true },
      ])}</p>
    </div>
    <div class="actions workflow-actions">
      <button class="btn" data-nav="/delivery-batches">Orqaga</button>
      <details class="action-menu">
        <summary>Amallar</summary>
        <div>
          <button type="button" data-nav="/delivery-batches/${batch.id}?tab=quantity">Qabul miqdorini kiritish</button>
          ${editable ? `<button type="button" data-transport-assignment>Transport biriktirish</button>` : ""}
          <button type="button" data-nav="/delivery-batches/${batch.id}?tab=logistics">Logistika</button>
          ${editable ? `<button type="button" data-nav="/delivery-batches/${batch.id}/edit">To'liq tahrirlash</button>` : ""}
          ${canEdit("moliya") ? `<button type="button" data-nav="/customer-invoices/new?client_id=${batch.client_id}&contract_id=${batch.contract_id}&order_id=${batch.order_id}&delivery_batch_id=${batch.id}">Mijoz hisobi yaratish</button>
          <button type="button" data-nav="/supplier-invoices/new?delivery_batch_id=${batch.id}">Ta'minotchi hisobi yaratish</button>` : ""}
        </div>
      </details>
      ${editable ? `<button class="btn" data-nav="/delivery-batches/${batch.id}?tab=documents">Hujjat yuklash</button>` : ""}
    </div>
  </div>${batchStatusCards(batch)}${batchWarningsPanel(batch)}${batchNextActionPanel(batch)}${batchWorkflowStepper(batch)}`;
}

function batchTabs(active) {
  return `<div class="tabs workflow-tabs">${[["general", "Umumiy"], ["quantity", "Miqdor"], ["logistics", "Logistika"], ["finance", "Moliya"], ["documents", "Hujjatlar"], ["history", "Tarix"]].map(([key, label]) => `<button class="tab ${active === key ? "active" : ""}" data-batch-tab="${key}">${label}</button>`).join("")}</div>`;
}

function batchActiveTab(batch, active) {
  const editable = canEdit("yetkazib_berish");
  if (active === "quantity") return section("Miqdor", `${editable ? `<div class="actions"><button class="btn primary" data-focus-acceptance>Qabul miqdorini kiritish</button></div>` : ""}<p class="helper-text">Farq faqat qabul miqdori kiritilgandan keyin hisoblanadi.</p><form id="batch-quantity-form">${tableOrEmpty(batch.items, ["Mahsulot", "Birlik", "Reja", "Yuklangan", "Qabul qilingan", "Farq", "Miqdor holati", "Izoh"], (item) => {
    const status = item.accepted_quantity === null || item.accepted_quantity === undefined ? { label: "Qabul kutilmoqda", tone: "warning" } : numberValue(item.difference_quantity) === 0 ? { label: "Mos", tone: "success" } : { label: "Miqdor farqi bor", tone: "warning" };
    return `<tr data-batch-item-row="${item.id}"><td>${fmt(item.product_name)}</td><td>${fmt(item.unit)}</td><td>${fmtQty(item.planned_quantity, item.unit)}</td><td>${editable ? `<input name="loaded_quantity_${item.id}" type="number" step="any" value="${esc(item.loaded_quantity ?? "")}" />` : fmtQty(item.loaded_quantity, item.unit)}</td><td>${editable ? `<input name="accepted_quantity_${item.id}" type="number" step="any" value="${esc(item.accepted_quantity ?? "")}" placeholder="Qabul kutilmoqda" />` : quantityDisplay(item.accepted_quantity, item.unit)}</td><td>${quantityDisplay(item.difference_quantity, item.unit)}</td><td>${statusChip(status)}</td><td>${editable ? `<input name="comment_${item.id}" value="${esc(item.comment ?? "")}" />` : fmt(item.comment)}</td></tr>`;
  }, "Mahsulotlar hali yo'q.")}${editable ? `<div class="form-footer"><button class="btn primary" type="submit">Miqdorlarni saqlash</button></div>` : ""}</form>`);
  if (active === "logistics") {
    const logistics = batch.logistics || {};
    return `${section("Logistika xulosasi", `<div class="actions">${editable ? `<button class="btn primary" type="button" data-transport-assignment>Transportni biriktirish</button>` : ""}${logistics.id ? `<button class="btn" data-nav="/logistics/${logistics.id}">Logistika sahifasi</button>` : ""}</div>${summaryCards([["Logistika raqami", fmt(logisticsNumber(logistics, batch))], ["Partiya", fmt(batch.batch_number)], ["Buyurtma", fmt(batch.order?.order_number)], ["Mijoz", fmt(batch.client?.name)], ["Mahsulot", fmt(batchPrimaryProduct(batch))], ["Miqdor", fmtQty(batch.summary?.total_planned_quantity, batch.items?.[0]?.unit)], ["Manba", fmt(optionLabel(sourceTypes, batch.source_type))], ["Model", fmt(optionLabel(fulfillmentTypes, batch.fulfillment_type))], ["Logistika holati", statusBadge(logistics.status || "not_assigned")]])}${logisticsWarnings(logistics, batch)}`)}${section("Shartnoma transport shartlari", detailList([
      ["Yetkazib berish usuli", optionLabel(deliveryMethods, batch.transport_check?.delivery_method)],
      ["Transport to'lovi turi", optionLabel(transportPaymentTypes, batch.transport_check?.transport_payment_type)],
      ["Mijozga transport narxi", fmtMoney(batch.transport_check?.customer_price)],
    ]))}${logisticsTimelinePanel(logistics)}${section("Transport biriktirish", detailList([["Parkdagi mashina", logistics.transport ? `${logistics.transport.vehicle_number}${logistics.transport.driver_name ? ` · ${logistics.transport.driver_name}` : ""}` : null], ["Tashuvchi", logistics.carrier_name], ["Haydovchi", logistics.driver_name], ["Haydovchi telefoni", logistics.driver_phone], ["Transport raqami", logistics.vehicle_number], ["Tirkama raqami", logistics.trailer_number]]))}${section("Sanalar", detailList([["Reja yuklash sanasi", logistics.planned_pickup_date], ["Reja yetkazish sanasi", logistics.planned_delivery_date], ["Haqiqiy yuklash sanasi", logistics.actual_pickup_date], ["Haqiqiy yetkazish sanasi", logistics.actual_delivery_date]]))}${section("Manzillar", detailList([["Yuklash manzili", logistics.loading_address], ["Yetkazish manzili", logistics.delivery_address]]))}${section("Reys tafsilotlari", logisticsTripDetailsList(logistics, batch))}${section("Xarajatlar", detailList([["Transport xarajati", fmtMoney(logistics.cost_amount)], ["Mijozga transport narxi", fmtMoney(logistics.customer_price)], ["Kim to'laydi", optionLabel(paidByTypes, logistics.paid_by)], ["Transport foydasi", transportProfit(logistics)]]))}${section("Logistika izohlari", detailList([["Izoh", logistics.notes]]))}`;
  }
  if (active === "finance") {
    const logistics = batch.logistics || {};
    return `${section("Moliya xulosasi", `${summaryCards([["Mijoz hisobi", "Hisoblar modulida"], ["Mijozdan to'lov", "To'lovlar modulida"], ["Ta'minotchi hisobi", "Ta'minotchi hisoblari modulida"], ["Ta'minotchi to'lovi", "Ta'minotchi to'lovlari modulida"], ["Transport xarajati", fmtMoney(logistics.cost_amount)], ["Mijozga transport narxi", fmtMoney(logistics.customer_price)], ["Transport foydasi", transportProfit(logistics)]])}<div class="actions">${canEdit("moliya") ? `<button class="btn primary" data-nav="/customer-invoices/new?client_id=${batch.client_id}&contract_id=${batch.contract_id}&order_id=${batch.order_id}&delivery_batch_id=${batch.id}">Mijoz hisob-fakturasi yaratish</button><button class="btn" data-nav="/supplier-invoices/new?delivery_batch_id=${batch.id}">Ta'minotchi hisobi yaratish</button>` : ""}<button class="btn" data-nav="/customer-payments?client_id=${batch.client_id}">To'lovlarni ko'rish</button></div>`)}`;
  }
  if (active === "documents") {
    const docStatus = batchDocumentStatus(batch);
    return section("Hujjatlar", `<div class="workflow-doc-head"><div>${statusChip(docStatus)}${docStatus.key !== "complete" ? `<p class="helper-text">TTN va qabul dalolatnomasi majburiy hujjatlar.</p>` : ""}</div></div>${editable ? `<form id="batch-document-form" class="toolbar"><select name="document_type">${batchDocumentTypes.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select><input name="title" placeholder="Hujjat nomi" required /><input name="file" type="file" required /><button class="btn primary" type="submit">Hujjat yuklash</button></form>` : ""}${tableOrEmpty(batch.documents, ["Hujjat nomi", "Turi", "Yuklangan sana", "Yuklagan", "Amal"], (item) => `<tr><td>${fmt(item.title)}</td><td>${fmt(optionLabel(batchDocumentTypes, item.document_type))}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td><td>${item.file_url ? `<a class="link-btn" target="_blank" href="${esc(item.file_url)}">Ko'rish</a>` : dash}</td></tr>`, "Hujjatlar hali yo'q.")}`);
  }
  if (active === "history") return `${section("Jarayon tarixi", `<div class="workflow-timeline">${[
    ["Partiya yaratildi", fmtDate(batch.created_at)],
    ["Reja yuklash", batch.planned_loading_date],
    ["Haqiqiy yuklash", batch.logistics?.actual_pickup_date || batch.actual_loading_date],
    ["Yo'lga chiqdi", ["in_transit", "arrived", "unloading", "delivered", "accepted", "completed"].includes(batch.logistics?.status) ? optionLabel(logisticsStatuses, batch.logistics?.status) : ""],
    ["Haqiqiy yetkazish", batch.logistics?.actual_delivery_date || batch.actual_delivery_date],
    ["Qabul", batch.accepted_date || (batchHasAcceptedInput(batch) ? "Qabul miqdori kiritilgan" : "")],
    ["Hujjatlar", batch.documents?.length ? `${batch.documents.length} ta hujjat` : ""],
    ["Yakunlandi", batch.status === "completed" ? fmtDate(batch.updated_at) : ""],
  ].map(([label, value]) => `<div class="timeline-row"><span></span><strong>${label}</strong><em>${fmt(value)}</em></div>`).join("")}</div>`)}${section("Izohlar", `${tableOrEmpty(batch.notes_history, ["Sana", "Foydalanuvchi", "Izoh"], (item) => `<tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td></tr>`, "Izohlar hali yo'q.")}`)}`;
  const logistics = batch.logistics || {};
  return `${section("Asosiy ma'lumotlar", detailList([["Partiya sanasi", batch.batch_date], ["Reja yuklash sanasi", batch.planned_loading_date], ["Reja yetkazish sanasi", batch.planned_delivery_date], ["Manba", optionLabel(sourceTypes, batch.source_type)], ["Yetkazib berish modeli", optionLabel(fulfillmentTypes, batch.fulfillment_type)], ["Buyurtma", batch.order?.order_number], ["Shartnoma", batch.contract?.contract_number], ["Mijoz", batch.client?.name]]))}${section("Miqdor xulosasi", `${summaryCards([["Reja", fmtQty(batch.summary?.total_planned_quantity, batch.items?.[0]?.unit)], ["Yuklangan", fmtQty(batch.summary?.total_loaded_quantity, batch.items?.[0]?.unit)], ["Qabul qilingan", quantityDisplay(batch.summary?.total_accepted_quantity, batch.items?.[0]?.unit)], ["Farq", quantityDisplay(batch.summary?.total_difference_quantity, batch.items?.[0]?.unit)]])}<p class="helper-text">Farq faqat qabul miqdori kiritilgandan keyin hisoblanadi.</p>`)}${section("Logistika xulosasi", detailList([["Tashuvchi", logistics.carrier_name], ["Haydovchi", logistics.driver_name], ["Haydovchi telefoni", logistics.driver_phone], ["Transport raqami", logistics.vehicle_number], ["Tirkama raqami", logistics.trailer_number], ["Yuklash manzili", logistics.loading_address], ["Yetkazish manzili", logistics.delivery_address], ["Logistika holati", optionLabel(logisticsStatuses, logistics.status)]]))}${section("Moliya va hujjatlar", summaryCards([["Mijoz hisobi", "Hisoblar modulida"], ["Ta'minotchi hisobi", "Ta'minotchi hisoblari modulida"], ["Transport xarajati", fmtMoney(logistics.cost_amount)], ["Mijozga transport narxi", fmtMoney(logistics.customer_price)], ["TTN", batch.documents?.some((doc) => doc.document_type === "ttn") ? "Yuklangan" : "Yuklanmagan"], ["Qabul dalolatnomasi", batch.documents?.some((doc) => doc.document_type === "acceptance_act") ? "Yuklangan" : "Yuklanmagan"], ["Sifat sertifikati", batch.documents?.some((doc) => doc.document_type === "quality_certificate") ? "Yuklangan" : "Yuklanmagan"]]))}`;
}

async function transportAssignmentModal(batch) {
  const logistics = batch.logistics || {};
  const transportOptions = await fetchTransportsForSelect(logistics.transport_id || logistics.carrier_id);
  const quantity = batch.summary?.total_planned_quantity || batch.items?.[0]?.planned_quantity;
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="transport-modal-title">
      <div class="modal-header">
        <h2 id="transport-modal-title">Transportni biriktirish</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="transport-assignment-form">
        <div class="modal-body">
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Mahsulot", batchPrimaryProduct(batch)],
            ["Miqdor", fmtQty(quantity, batch.items?.[0]?.unit)],
            ["Yuklash manzili", logistics.loading_address],
            ["Yetkazish manzili", logistics.delivery_address],
            ["Reja yuklash sanasi", logistics.planned_pickup_date || batch.planned_loading_date],
            ["Reja yetkazish sanasi", logistics.planned_delivery_date || batch.planned_delivery_date],
          ])}</div>
          <div class="grid">
            <label><span class="field-label-text">Transport</span><select name="transport_id"><option value="">Transportni tanlang</option>${transportOptions}</select></label>
            <input type="hidden" name="carrier_id" value="${esc(logistics.carrier_id || "")}" />
            ${textField("carrier_name", "Tashuvchi", logistics.carrier_name, "text", { required: true })}
            ${textField("driver_name", "Haydovchi", logistics.driver_name, "text", { required: true })}
            ${textField("driver_phone", "Haydovchi telefoni", logistics.driver_phone)}
            ${textField("vehicle_number", "Transport raqami", logistics.vehicle_number, "text", { required: true })}
            ${textField("trailer_number", "Tirkama raqami", logistics.trailer_number)}
            ${textField("departed_at", "Yo'lga chiqdi", isoToLocalInput(logistics.departed_at), "datetime-local")}
            ${textField("returned_at", "Bazaga qaytdi", isoToLocalInput(logistics.returned_at), "datetime-local")}
            ${textField("cost_amount", "Transport xarajati", logistics.cost_amount || "", "number")}
            ${textField("customer_price", "Mijozga transport narxi", logistics.customer_price || "", "number")}
            ${selectField("paid_by", "Kim to'laydi", paidByTypes, logistics.paid_by || "company")}
            ${textArea("notes", "Izoh", logistics.notes)}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit">Saqlash</button>
        </div>
      </form>
    </section>
  </div>`;
}

async function openTransportAssignmentModal(batch) {
  const logistics = batch.logistics || {};
  if (!logistics.id) return showToast("Logistika yozuvi topilmadi.", true);
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", await transportAssignmentModal(batch));
  const backdrop = document.querySelector(".modal-backdrop");
  const form = document.querySelector("#transport-assignment-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.elements.transport_id?.addEventListener("change", () => applySelectedTransport(form));
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const carrier = field(form, "carrier_name");
    const driver = field(form, "driver_name");
    const vehicle = field(form, "vehicle_number");
    const status = vehicle ? "vehicle_assigned" : carrier || driver ? "carrier_assigned" : "not_assigned";
    try {
      await api(`/api/logistics/${logistics.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          carrier_id: field(form, "carrier_id") ? Number(field(form, "carrier_id")) : null,
          carrier_name: carrier,
          driver_name: driver,
          driver_phone: field(form, "driver_phone"),
          vehicle_number: vehicle,
          trailer_number: field(form, "trailer_number"),
          transport_id: field(form, "transport_id") ? Number(field(form, "transport_id")) : null,
          departed_at: field(form, "departed_at"),
          returned_at: field(form, "returned_at"),
          cost_amount: field(form, "cost_amount") || "0",
          customer_price: field(form, "customer_price") || "0",
          paid_by: field(form, "paid_by") || "company",
          notes: field(form, "notes"),
        }),
      });
      showToast("Transport ma'lumotlari saqlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.carrier_name?.focus();
}

function loadingConfirmationModal(batch) {
  const logistics = batch.logistics || {};
  const quantity = batch.summary?.total_planned_quantity || batch.items?.[0]?.planned_quantity;
  const unit = batch.items?.[0]?.unit || "";
  const today = todayIso();
  const canLoad = ["carrier_assigned", "vehicle_assigned", "loading"].includes(logistics.status) || batch.status === "ready_for_loading";
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="loading-modal-title">
      <div class="modal-header">
        <h2 id="loading-modal-title">Yuklashni tasdiqlash</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="loading-confirmation-form">
        <div class="modal-body">
          ${!canLoad ? `<div class="workflow-warning"><strong>E'tibor kerak</strong><ul><li>Yuklandi deb belgilash uchun avval transportni biriktiring.</li></ul></div>` : ""}
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Mahsulot", batchPrimaryProduct(batch)],
            ["Reja miqdor", fmtQty(quantity, unit)],
            ["Tashuvchi", logistics.carrier_name],
            ["Haydovchi", logistics.driver_name],
            ["Transport raqami", logistics.vehicle_number],
            ["Yuklash manzili", logistics.loading_address],
            ["Reja yuklash sanasi", logistics.planned_pickup_date || batch.planned_loading_date],
          ])}</div>
          <div class="grid">
            ${textField("actual_loading_date", "Haqiqiy yuklash sanasi", today, "date", { required: true })}
            ${textField("loaded_quantity", "Yuklangan miqdor", quantity || "", "number", { required: true })}
            ${textArea("notes", "Izoh", "")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit" ${!canLoad ? "disabled" : ""}>Yuklandi</button>
        </div>
      </form>
    </section>
  </div>`;
}

// Qabul farqi bo'yicha qaror turlari. Serverdagi ro'yxat bilan bir xil
// bo'lishi shart -- backend/app/services/batch_difference.py.
const BATCH_DIFFERENCE_RESOLUTIONS = [
  ["return_to_supplier", "Ta'minotchiga qaytariladi", "Kamomad ta'minotchiga qaytariladi va undan talab qilinadi."],
  ["reship", "Qayta jo'natiladi", "Yetmagan miqdor yangi partiyada jo'natiladi."],
  ["credit_note", "Kredit-nota chiqariladi", "Mijozga qo'yilgan hisob kamaytiriladi."],
  ["write_off", "Hisobdan chiqariladi", "Yo'l yo'qotishi sifatida hisobdan chiqariladi."],
];

function acceptanceRows(batch) {
  return (batch.items || []).map((item) => {
    const accepted = item.accepted_quantity ?? "";
    return `<tr data-acceptance-row="${item.id}">
      <td>${fmt(item.product_name)}</td>
      <td>${fmtQty(item.planned_quantity, item.unit)}</td>
      <td data-acceptance-loaded>${fmtQty(item.loaded_quantity, item.unit)}</td>
      <td><input data-acceptance-input="${item.id}" data-loaded="${esc(item.loaded_quantity ?? 0)}" data-price="${esc(item.unit_price ?? 0)}" data-vat="${esc(item.vat_rate ?? 0)}" data-unit="${esc(item.unit || "")}" type="number" step="any" min="0" required value="${esc(accepted)}" /></td>
      <td class="number-cell" data-noloc data-acceptance-diff="${item.id}">${dash}</td>
    </tr>`;
  }).join("");
}

function acceptanceDifferencePanel() {
  return `<div class="workflow-warning" data-acceptance-decision hidden>
    <strong>Qabul farqi bor</strong>
    <p><span>Yetmagan miqdor</span><span data-noloc>: </span><strong data-noloc data-acceptance-total>—</strong></p>
    <p><span>Mijozga qo'yilgan hisobdagi qiymati</span><span data-noloc>: </span><strong data-noloc data-acceptance-amount>—</strong></p>
    <p class="helper-text">Farq bilan nima qilinishini tanlang. Tanlanmasa, miqdor buyurtmada ochiq qolib ketadi.</p>
    <div class="acceptance-choices">${BATCH_DIFFERENCE_RESOLUTIONS.map(([key, label, hint]) => `
      <label class="acceptance-choice"><input type="radio" name="difference_resolution" value="${key}" />
        <span><strong>${label}</strong><small>${hint}</small></span>
      </label>`).join("")}</div>
    ${textArea("difference_note", "Qaror izohi", "")}
  </div>`;
}

function acceptanceConfirmationModal(batch) {
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel wide" role="dialog" aria-modal="true" aria-labelledby="acceptance-modal-title">
      <div class="modal-header">
        <h2 id="acceptance-modal-title">Qabul miqdorini kiritish</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="acceptance-confirmation-form">
        <div class="modal-body">
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Haqiqiy yetkazish sanasi", batch.logistics?.actual_delivery_date || batch.actual_delivery_date],
          ])}</div>
          <div class="table-scroll"><table>
            <thead><tr><th>Mahsulot</th><th>Reja</th><th>Yuklangan</th><th>Qabul qilingan <span class="required-mark">*</span></th><th>Farq</th></tr></thead>
            <tbody>${acceptanceRows(batch)}</tbody>
          </table></div>
          ${acceptanceDifferencePanel()}
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit">Qabulni saqlash</button>
        </div>
      </form>
    </section>
  </div>`;
}

function acceptanceTotals(form) {
  let quantity = 0;
  let amount = 0;
  let filled = 0;
  form.querySelectorAll("[data-acceptance-input]").forEach((input) => {
    const cell = form.querySelector(`[data-acceptance-diff="${input.dataset.acceptanceInput}"]`);
    if (input.value === "") {
      if (cell) cell.textContent = dash;
      return;
    }
    filled += 1;
    const shortfall = numberValue(input.dataset.loaded) - numberValue(input.value);
    if (cell) cell.textContent = fmtQty(shortfall, input.dataset.unit);
    if (shortfall <= 0) return;
    quantity += shortfall;
    amount += shortfall * numberValue(input.dataset.price) * (1 + numberValue(input.dataset.vat) / 100);
  });
  const first = form.querySelector("[data-acceptance-input]");
  return { quantity, amount, filled, unit: first?.dataset.unit || "" };
}

function refreshAcceptanceDecision(form) {
  const totals = acceptanceTotals(form);
  const panel = form.querySelector("[data-acceptance-decision]");
  if (!panel) return totals;
  panel.hidden = totals.quantity <= 0;
  if (!panel.hidden) {
    panel.querySelector("[data-acceptance-total]").textContent = fmtQty(totals.quantity, totals.unit);
    panel.querySelector("[data-acceptance-amount]").textContent = fmtMoney(amountRounded(totals.amount));
  }
  return totals;
}

// Tiyinlar partiyalar orasidagi yaxlitlashdan chiqadi; hisob-fakturada
// baribir yaxlitlangan summa turadi.
function amountRounded(value) {
  return Math.round(value * 100) / 100;
}

function openAcceptanceModal(batch) {
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", acceptanceConfirmationModal(batch));
  const backdrop = document.querySelector(".modal-backdrop");
  localizeDom(backdrop);
  const form = document.querySelector("#acceptance-confirmation-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.addEventListener("input", () => refreshAcceptanceDecision(form));
  refreshAcceptanceDecision(form);
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const totals = refreshAcceptanceDecision(form);
    const inputs = [...form.querySelectorAll("[data-acceptance-input]")];
    if (totals.filled !== inputs.length) {
      return modalFormError(form, "Har bir mahsulot uchun qabul qilingan miqdorni kiriting.", "");
    }
    const resolution = form.elements.difference_resolution
      ? [...form.querySelectorAll("[name=difference_resolution]")].find((radio) => radio.checked)?.value
      : null;
    if (totals.quantity > 0 && !resolution) {
      return modalFormError(form, "Qabul farqi bor: nima qilinishini tanlang.");
    }
    try {
      await api(`/api/delivery-batches/${batch.id}/confirm-acceptance`, {
        method: "POST",
        body: JSON.stringify({
          items: inputs.map((input) => ({
            id: Number(input.dataset.acceptanceInput),
            accepted_quantity: normalizeNumberInputValue(input.value),
          })),
          difference_resolution: resolution || null,
          difference_note: field(form, "difference_note") || null,
        }),
      });
      showToast("Qabul miqdori saqlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.querySelector("[data-acceptance-input]")?.focus();
}

function openLoadingConfirmationModal(batch) {
  const logistics = batch.logistics || {};
  if (!logistics.id) return showToast("Yuklandi deb belgilash uchun avval transportni biriktiring.", true);
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", loadingConfirmationModal(batch));
  const backdrop = document.querySelector(".modal-backdrop");
  const form = document.querySelector("#loading-confirmation-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const planned = numberValue(batch.summary?.total_planned_quantity || batch.items?.[0]?.planned_quantity);
    const loaded = numberValue(field(form, "loaded_quantity"));
    if (!field(form, "actual_loading_date")) return modalFormError(form, "Haqiqiy yuklash sanasi majburiy.", "actual_loading_date");
    if (!field(form, "loaded_quantity") || loaded <= 0) return modalFormError(form, "Yuklangan miqdor 0 dan katta bo'lishi kerak.", "loaded_quantity");
    let allowOverPlanned = false;
    if (planned && loaded > planned) {
      allowOverPlanned = confirmMsg("Yuklangan miqdor reja miqdoridan oshgan. Davom etasizmi?");
      if (!allowOverPlanned) return;
    }
    try {
      await api(`/api/delivery-batches/${batch.id}/confirm-loading`, {
        method: "POST",
        body: JSON.stringify({
          actual_loading_date: field(form, "actual_loading_date"),
          loaded_quantity: field(form, "loaded_quantity"),
          notes: field(form, "notes"),
          allow_over_planned: allowOverPlanned,
        }),
      });
      showToast("Yuklash tasdiqlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.actual_loading_date?.focus();
}

function deliveryConfirmationModal(batch) {
  const logistics = batch.logistics || {};
  const loadedQuantity = batch.summary?.total_loaded_quantity || batch.items?.[0]?.loaded_quantity;
  const unit = batch.items?.[0]?.unit || "";
  const today = todayIso();
  const actualLoadingDate = logistics.actual_pickup_date || batch.actual_loading_date;
  const canDeliver = Boolean(logistics.id) && Boolean(actualLoadingDate) && ["loaded", "in_transit", "arrived", "unloading"].includes(logistics.status);
  const warning = !logistics.id || (!logistics.vehicle_number && !logistics.carrier_name && !logistics.driver_name)
    ? "Yetkazildi deb belgilash uchun avval transportni biriktiring."
    : !actualLoadingDate
      ? "Yetkazildi deb belgilash uchun avval yuklashni tasdiqlang."
      : !canDeliver
        ? "Yetkazildi deb belgilash uchun partiya avval yuklangan yoki yo'lda bo'lishi kerak."
        : "";
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="delivery-modal-title">
      <div class="modal-header">
        <h2 id="delivery-modal-title">Yetkazishni tasdiqlash</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="delivery-confirmation-form">
        <div class="modal-body">
          ${warning ? `<div class="workflow-warning"><strong>E'tibor kerak</strong><ul><li>${esc(warning)}</li></ul></div>` : ""}
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Mahsulot", batchPrimaryProduct(batch)],
            ["Yuklangan miqdor", fmtQty(loadedQuantity, unit)],
            ["Tashuvchi", logistics.carrier_name],
            ["Haydovchi", logistics.driver_name],
            ["Transport raqami", logistics.vehicle_number],
            ["Yuklash manzili", logistics.loading_address],
            ["Yetkazish manzili", logistics.delivery_address],
            ["Reja yetkazish sanasi", logistics.planned_delivery_date || batch.planned_delivery_date],
            // Taqqoslash aynan shu sana bilan boradi -- ko'rinib tursin.
            ["Haqiqiy yuklash sanasi", actualLoadingDate],
          ])}</div>
          <div class="grid">
            ${textField("actual_delivery_date", "Haqiqiy yetkazish sanasi", today, "date", {
              required: true,
              min: actualLoadingDate || undefined,
              title: "Haqiqiy yetkazish sanasi haqiqiy yuklash sanasidan oldin bo'lishi mumkin emas.",
            })}
            ${textArea("notes", "Izoh", "")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit" ${warning ? "disabled" : ""}>Yetkazildi</button>
        </div>
      </form>
    </section>
  </div>`;
}

function openDeliveryConfirmationModal(batch) {
  const logistics = batch.logistics || {};
  if (!logistics.id) return showToast("Yetkazildi deb belgilash uchun avval transportni biriktiring.", true);
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", deliveryConfirmationModal(batch));
  const backdrop = document.querySelector(".modal-backdrop");
  const form = document.querySelector("#delivery-confirmation-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const actualLoadingDate = logistics.actual_pickup_date || batch.actual_loading_date;
    const actualDeliveryDate = field(form, "actual_delivery_date");
    if (!actualLoadingDate) return modalFormError(form, "Yetkazildi deb belgilash uchun avval yuklashni tasdiqlang.");
    if (!actualDeliveryDate) return modalFormError(form, "Haqiqiy yetkazish sanasi majburiy.", "actual_delivery_date");
    if (actualDeliveryDate < actualLoadingDate) {
      return modalFormError(form, "Haqiqiy yetkazish sanasi haqiqiy yuklash sanasidan oldin bo'lishi mumkin emas.", "actual_delivery_date");
    }
    try {
      await api(`/api/delivery-batches/${batch.id}/confirm-delivery`, {
        method: "POST",
        body: JSON.stringify({
          actual_delivery_date: actualDeliveryDate,
          notes: field(form, "notes"),
        }),
      });
      showToast("Yetkazish tasdiqlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.actual_delivery_date?.focus();
}

async function batchFinancePresence(batch) {
  const result = { customerInvoices: [], supplierInvoices: [], checked: false };
  try {
    const [customer, supplier] = await Promise.all([
      api(`/api/customer-invoices?delivery_batch_id=${batch.id}&page_size=100`),
      api(`/api/supplier-invoices?delivery_batch_id=${batch.id}&page_size=100`),
    ]);
    result.customerInvoices = customer.items || [];
    result.supplierInvoices = supplier.items || [];
    result.checked = true;
  } catch (error) {
    showToast(error.message, true);
  }
  return result;
}

function completionValidation(batch, finance = {}) {
  const logistics = batch.logistics || {};
  const docStatus = batchDocumentStatus(batch);
  const blockers = [];
  const warnings = [];
  if (!batchHasAcceptedInput(batch)) blockers.push("Partiyani yakunlash uchun avval qabul qilingan miqdorni kiriting.");
  if (!["delivered", "accepted", "completed"].includes(logistics.status)) blockers.push("Partiyani yakunlash uchun logistika jarayoni yakunlangan bo'lishi kerak.");
  if (docStatus.key !== "complete") warnings.push("Majburiy hujjatlar hali to'liq yuklanmagan.");
  if ((batch.items || []).some((item) => item.difference_quantity !== null && numberValue(item.difference_quantity) !== 0)) warnings.push("Yuklangan va qabul qilingan miqdor farq qiladi.");
  if (finance.checked && !(finance.customerInvoices || []).length) warnings.push("Mijoz hisob-fakturasi hali yaratilmagan.");
  if (finance.checked && !(finance.supplierInvoices || []).length) warnings.push("Ta'minotchi hisobi hali yaratilmagan.");
  return { blockers, warnings, docStatus };
}

function completionConfirmationModal(batch, finance = {}) {
  const logistics = batch.logistics || {};
  const unit = batch.items?.[0]?.unit || "";
  const today = todayIso();
  const validation = completionValidation(batch, finance);
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="completion-modal-title">
      <div class="modal-header">
        <h2 id="completion-modal-title">Partiyani yakunlash</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="completion-confirmation-form">
        <div class="modal-body">
          ${validation.blockers.length ? workflowWarningsPanel(validation.blockers, "Yakunlab bo'lmaydi") : ""}
          ${validation.warnings.length ? workflowWarningsPanel(validation.warnings, "Tasdiqlashdan oldin tekshiring") : ""}
          <div class="modal-summary">${detailList([
            ["Partiya raqami", batch.batch_number],
            ["Buyurtma", batch.order?.order_number],
            ["Mijoz", batch.client?.name],
            ["Mahsulot", batchPrimaryProduct(batch)],
            ["Reja miqdor", fmtQty(batch.summary?.total_planned_quantity, unit)],
            ["Yuklangan miqdor", fmtQty(batch.summary?.total_loaded_quantity, unit)],
            ["Qabul qilingan miqdor", quantityDisplay(batch.summary?.total_accepted_quantity, unit)],
            ["Farq", quantityDisplay(batch.summary?.total_difference_quantity, unit)],
            ["Logistika holati", statusLabel(logistics.status)],
            ["Hujjatlar holati", validation.docStatus.label],
            ["Moliya holati", `${(finance.customerInvoices || []).length ? "Mijoz hisobi bor" : "Mijoz hisobi yo'q"} · ${(finance.supplierInvoices || []).length ? "Ta'minotchi hisobi bor" : "Ta'minotchi hisobi yo'q"}`],
          ])}</div>
          <div class="grid">
            ${textField("completed_date", "Yakunlash sanasi", today, "date", { required: true })}
            ${textArea("notes", "Yakunlash izohi", "")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit" ${validation.blockers.length ? "disabled" : ""}>Yakunlash</button>
        </div>
      </form>
    </section>
  </div>`;
}

async function openCompletionConfirmationModal(batch) {
  const finance = await batchFinancePresence(batch);
  document.querySelector(".modal-backdrop")?.remove();
  document.body.insertAdjacentHTML("beforeend", completionConfirmationModal(batch, finance));
  const backdrop = document.querySelector(".modal-backdrop");
  const form = document.querySelector("#completion-confirmation-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const validation = completionValidation(batch, finance);
    const missingDocs = validation.warnings.some((warning) => warning.includes("hujjat"));
    const quantityDiff = validation.warnings.some((warning) => warning.includes("farq"));
    if (!field(form, "completed_date")) return showToast("Yakunlash sanasi majburiy.", true);
    if (missingDocs && !confirmMsg("Hujjatlar to'liq emas. Baribir yakunlashni xohlaysizmi?")) return;
    if (quantityDiff && !confirmMsg("Yuklangan va qabul qilingan miqdor farq qiladi. Baribir yakunlashni xohlaysizmi?")) return;
    try {
      await api(`/api/delivery-batches/${batch.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          completed_date: field(form, "completed_date"),
          notes: field(form, "notes"),
          allow_missing_documents: missingDocs,
          allow_quantity_difference: quantityDiff,
        }),
      });
      showToast("Partiya yakunlandi.");
      close();
      renderBatchDetail(batch.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.completed_date?.focus();
}

async function markBatchInTransit(batch) {
  const logistics = batch.logistics || {};
  if (!logistics.id) return showToast("Logistika yozuvi topilmadi.", true);
  try {
    await api(`/api/logistics/${logistics.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_transit" }),
    });
    showToast("Partiya yo'lga chiqdi deb belgilandi.");
    renderBatchDetail(batch.id);
  } catch (error) {
    showToast(error.message, true);
  }
}

function bindBatchDetailActions(batch) {
  const editable = canEdit("yetkazib_berish");

  // Some workflow-progression buttons (e.g. the "next action" panel) are rendered
  // from a shared helper outside this file, so gate them here by disabling instead
  // of not rendering them.
  if (!editable) {
    document.querySelectorAll("[data-transport-assignment], [data-loading-confirmation], [data-delivery-confirmation], [data-completion-confirmation], [data-acceptance-confirmation], [data-focus-acceptance], [data-mark-in-transit]").forEach((button) => {
      button.disabled = true;
      button.title = "Bu amal uchun ruxsatingiz yo'q.";
    });
    return;
  }

  document.querySelectorAll("[data-transport-assignment]").forEach((button) => {
    button.addEventListener("click", () => openTransportAssignmentModal(batch).catch((error) => showToast(error.message, true)));
  });

  document.querySelectorAll("[data-loading-confirmation]").forEach((button) => {
    button.addEventListener("click", () => openLoadingConfirmationModal(batch));
  });

  document.querySelectorAll("[data-delivery-confirmation]").forEach((button) => {
    button.addEventListener("click", () => openDeliveryConfirmationModal(batch));
  });

  document.querySelectorAll("[data-completion-confirmation]").forEach((button) => {
    button.addEventListener("click", () => openCompletionConfirmationModal(batch));
  });

  document.querySelectorAll("[data-mark-in-transit]").forEach((button) => {
    button.addEventListener("click", () => markBatchInTransit(batch));
  });

  // Ilgari bu tugma shunchaki maydonga fokus qo'yardi -- ekranda hech narsa
  // o'zgarmaydi va tugma o'lik ko'rinadi. Endi u qolgan bosqichlar kabi
  // oyna ochadi.
  document.querySelectorAll("[data-focus-acceptance], [data-acceptance-confirmation]").forEach((button) => {
    button.addEventListener("click", () => openAcceptanceModal(batch));
  });

  document.querySelector("#batch-quantity-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const updates = (batch.items || []).map((item) => {
        const row = document.querySelector(`[data-batch-item-row="${item.id}"]`);
        return api(`/api/delivery-batches/${batch.id}/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            loaded_quantity: normalizeNumberInputValue(row.querySelector(`[name="loaded_quantity_${item.id}"]`)?.value) || null,
            accepted_quantity: normalizeNumberInputValue(row.querySelector(`[name="accepted_quantity_${item.id}"]`)?.value) || null,
            comment: row.querySelector(`[name="comment_${item.id}"]`)?.value || null,
          }),
        });
      });
      await Promise.all(updates);
      showToast("Miqdorlar saqlandi.");
      render();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.querySelector("#batch-document-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await apiForm(`/api/delivery-batches/${batch.id}/documents/upload`, new FormData(form));
      showToast("Hujjat yuklandi.");
      render();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderBatchDetail(id) {
  const batch = await api(`/api/delivery-batches/${id}`);
  const tab = new URLSearchParams(location.search).get("tab") || "general";
  const active = tab === "products" ? "quantity" : tab === "notes" ? "history" : tab;
  app.innerHTML = `<div class="page">${batchHeader(batch)}${batchTabs(active)}${batchActiveTab(batch, active)}</div>`;
  document.querySelectorAll("[data-batch-tab]").forEach((button) => button.addEventListener("click", () => navigate(`/delivery-batches/${id}?tab=${button.dataset.batchTab}`)));
  bindBatchDetailActions(batch);
}

async function renderLogisticsList() {
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/logistics?${params.toString()}`);
  // Bog'lanmagan reyslar ko'rinib tursin: ular hech qaysi mashinaning
  // xulosasiga tushmaydi, ya'ni jimgina hisobdan chiqib ketadi.
  const unlinkedCount = data.items.filter((row) => !row.transport_id).length;
  app.innerHTML = opsListPage({
    className: "logistics-ops-page",
    title: "Logistika",
    tabs: [{ label: "Partiyalar", path: "/delivery-batches" }, { label: "Logistika", active: true }, { label: "Transportlar", path: "/transports" }],
    clearPath: "/logistics",
    counter: `${fmt(data.total)} ta logistika yozuvi · ${fmt(unlinkedCount)} tasiga mashina biriktirilmagan`,
    formId: "logistics-search-form",
    filters: `${opsFilterField("Qidirish", `<input name="search" placeholder="Partiya, tashuvchi, haydovchi, mashina, mijoz" value="${esc(params.get("search") || "")}" />`)}${opsFilterField("Status", `<select name="status"><option value="">Barchasi</option>${logisticsStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`)}${opsFilterField("Mashina", `<select name="linked"><option value="">Barchasi</option><option value="no" ${params.get("linked") === "no" ? "selected" : ""}>Biriktirilmagan</option><option value="yes" ${params.get("linked") === "yes" ? "selected" : ""}>Biriktirilgan</option></select>`)}`,
    headers: ["Logistika", "Partiya", "Buyurtma", "Mijoz", "Model", "Tashuvchi", "Haydovchi", "Transport", "Status", "Reja yetkazish", "Haqiqiy yetkazish", "Km", "Xarajat", "Mijoz narxi", "Foyda", ""],
    rows: data.items.map((row) => `<tr><td><button class="ops-primary-link" data-nav="/logistics/${row.id}">${fmt(logisticsNumber(row, row.batch))}</button></td><td>${fmt(row.batch?.batch_number)}</td><td>${fmt(row.order?.order_number)}</td><td>${fmt(row.client?.name)}</td><td>${fmt(optionLabel(fulfillmentTypes, row.fulfillment_type))}</td><td>${fmt(row.carrier_name)}</td><td>${fmt(row.driver_name)}</td><td>${row.transport_id ? fmt(row.vehicle_number) : `${fmt(row.vehicle_number)} ${statusChip({ label: "Biriktirilmagan", tone: "warning" })}`}</td><td>${statusBadge(row.status)}</td><td>${fmt(row.planned_delivery_date)}</td><td>${fmt(row.actual_delivery_date)}</td><td>${row.distance_km != null ? fmtQty(row.distance_km, "km") : dash}</td><td class="ops-money">${fmtMoney(row.cost_amount)}</td><td class="ops-money">${fmtMoney(row.customer_price)}</td><td class="ops-money">${transportProfit(row)}</td><td><button class="link-btn" data-nav="/logistics/${row.id}">Ochish</button></td></tr>`).join(""),
    emptyText: "Logistika yozuvlari topilmadi.",
    colspan: 16,
    footer: opsFooter(data, "logistics"),
  });
  bindOpsSearch("logistics-search-form", "/logistics", ["search", "status", "linked"]);
  bindOpsPagination("logistics", "/logistics");
}

function logisticsStatusTone(status) {
  if (["completed", "delivered", "accepted"].includes(status)) return "success";
  if (["cancelled", "issue"].includes(status)) return "danger";
  if (status === "not_assigned") return "muted";
  return "warning";
}

// Logistika kartochkasi o'z uslubida chiziladi, shuning uchun vaqt chizig'i
// uchun alohida ko'rinish.
function logisticsTimelineBody(row) {
  const timeline = row.timeline;
  if (!timeline) return `<div class="empty">Reys vaqtlari kiritilmagan.</div>`;
  const points = (timeline.points || []).map((point) => detailMiniField(point.label, point.at ? fmtDate(point.at) : "", "clock")).join("");
  const measures = [
    ["Reys davomiyligi", timeline.total_hours],
    ["Yuklash", timeline.loading_hours],
    ["Tushirish", timeline.unloading_hours],
    ["Harakatda", timeline.driving_hours],
  ].filter(([, value]) => value !== null && value !== undefined);
  return `${timeline.filled_points
    ? `<div class="detail-field-grid">${points}</div>`
    : `<div class="empty">Reys vaqtlari kiritilmagan.</div>`}
    ${measures.length ? `<div class="detail-two-col">${detailTonePanel({ label: "Hisoblangan", tone: "muted", icon: "clock", body: measures.map(([label, value]) => detailHoursField(label, value)).join("") })}</div>` : ""}
    ${workflowWarningsPanel(timeline.warnings || [])}`;
}

async function renderLogisticsDetail(id) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const row = await api(`/api/logistics/${id}`);
  const batch = row.batch || {};
  const number = logisticsNumber(row, batch);
  const tone = logisticsStatusTone(row.status);
  const statusLabel = optionLabel(logisticsStatuses, row.status);
  const editable = canEdit("yetkazib_berish");

  const costCaption = numberValue(row.cost_amount) ? "Haqiqiy transport xarajati" : "— Hisob-kitob qilinmagan";
  const priceCaption = numberValue(row.customer_price) ? "Mijozga taqdim etilgan narx" : "— Belgilanmagan";
  const profitCaption = numberValue(row.cost_amount) || numberValue(row.customer_price) ? "Narx va xarajat farqi" : "— Hisob-kitob qilinmagan";

  const tripFilled = [row.route_name, row.distance_km, row.loaded_mileage_km, row.fuel_consumption_liters, row.fuel_cost_amount, row.driver_wage_amount].some((v) => v != null && v !== "");

  const timelineSteps = [
    ["Yaratildi", row.created_at ? fmtDate(row.created_at) : dash],
    ["Reja yuklash", row.planned_pickup_date],
    ["Haqiqiy yuklash", row.actual_pickup_date],
    ["Reja yetkazish", row.planned_delivery_date],
    ["Haqiqiy yetkazish", row.actual_delivery_date],
    ["Qabul", batch.accepted_date],
    ["Holat", statusLabel],
  ].map(([label, value]) => [label, value, Boolean(value) && value !== dash]);
  const doneSteps = timelineSteps.filter(([, , done]) => done).length;

  app.innerHTML = `<div class="page">
    <div class="detail-page">
      ${detailBreadcrumb(["Yetkazib berish", "Logistika buyurtmalari", number])}

      <div class="detail-header">
        <div>
          <div class="detail-title-row">
            <h1>${fmt(number)}</h1>
            <button type="button" class="detail-chip" data-copy-logistics-number="${esc(number)}">${detailIcon("copy", 13)} Nusxalash</button>
            ${detailStatusPill(statusLabel, tone)}
          </div>
          <p class="detail-subtitle">${fmt(row.client?.name)} <span class="detail-subtitle-badge">${fmt(row.order?.order_number)}</span> ${fmt(statusLabel)}</p>
        </div>
        <div class="detail-header-actions">
          <button class="btn" data-nav="/logistics">${detailIcon("arrowLeft", 14)} Orqaga</button>
          <button class="btn primary" data-nav="/delivery-batches/${batch.id}?tab=logistics">Partiyani ochish</button>
          ${editable ? `<button class="btn" data-nav="/delivery-batches/${batch.id}/edit">${detailIcon("edit", 14)} Tahrirlash</button>` : ""}
        </div>
      </div>

      ${logisticsWarnings(row, batch)}

      <div class="detail-summary-cards">
        ${detailSummaryCard({ label: "Transport xarajati", value: fmtMoney(row.cost_amount), caption: costCaption })}
        ${detailSummaryCard({ label: "Mijoz transport narxi", value: fmtMoney(row.customer_price), caption: priceCaption })}
        ${detailSummaryCard({ label: "Transport foydasi", value: transportProfit(row), caption: profitCaption })}
      </div>

      ${detailCard({
        icon: "list", title: "Logistika xulosasi",
        body: detailFieldGrid([
          ["Logistika raqami", number],
          ["Partiya raqami", batch.batch_number],
          ["Buyurtma raqami", row.order?.order_number],
          ["Mijoz", row.client?.name],
          ["Yetkazib berish modeli", optionLabel(fulfillmentTypes, batch.fulfillment_type)],
          ["Yetkazish usuli", row.delivery_method === "auto" ? "Auto" : row.delivery_method],
        ]),
      })}

      ${detailCard({
        icon: "truck", title: "Transport biriktirish",
        body: `<div class="detail-field-grid">
          <div class="detail-field"><span>Parkdagi mashina</span><strong>${row.transport
            ? `<button class="ops-primary-link" data-nav="/transports/${row.transport.id}/edit" data-noloc>${esc(row.transport.vehicle_number)}</button>`
            : statusChip({ label: "Biriktirilmagan", tone: "warning" })}</strong></div>
          <div class="detail-field"><span>Tashuvchi</span><strong>${detailIcon("truck", 14)} ${fmt(row.carrier_name)}</strong></div>
          <div class="detail-field"><span>Haydovchi</span><strong><span class="detail-icon-badge sm">${esc((row.driver_name || "?").trim().charAt(0).toUpperCase())}</span> ${fmt(row.driver_name)}</strong></div>
          <div class="detail-field"><span>Haydovchi telefoni</span><strong>${row.driver_phone ? detailIcon("phone", 14) : ""} ${fmt(row.driver_phone)}</strong></div>
          <div class="detail-field"><span>Transport raqami</span><strong>${row.vehicle_number ? `<span class="detail-chip" style="cursor:default">${detailIcon("hash", 12)} ${esc(row.vehicle_number)}</span>` : dash}</strong></div>
          <div class="detail-field"><span>Tirkama raqami</span><strong>${fmt(row.trailer_number)}</strong></div>
        </div>`,
      })}

      ${detailCard({
        icon: "clock", title: "Reys vaqtlari",
        body: logisticsTimelineBody(row),
      })}

      ${detailCard({
        icon: "calendar", title: "Sanalar",
        body: `<div class="detail-two-col">
          ${detailTonePanel({ label: "Rejalashtirilgan", tone: "muted", icon: "circle", body: `
            ${detailMiniField("Reja yuklash sanasi", row.planned_pickup_date, "calendar")}
            ${detailMiniField("Reja yetkazish sanasi", row.planned_delivery_date, "calendar")}
          `})}
          ${detailTonePanel({ label: "Haqiqiy", tone: "success", icon: "checkCircle", body: `
            ${detailMiniField("Haqiqiy yuklash sanasi", row.actual_pickup_date, "checkCircle")}
            ${detailMiniField("Haqiqiy yetkazish sanasi", row.actual_delivery_date, "checkCircle")}
          `})}
        </div>`,
      })}

      ${detailCard({
        icon: "mapPin", title: "Manzillar",
        body: `<div class="detail-two-col with-arrow">
          ${detailTonePanel({ label: "Yuklash manzili", tone: "success", icon: "mapPin", body: `<p style="margin:0;font-size:13px;font-weight:600">${fmt(row.loading_address)}</p>` })}
          <div class="detail-address-arrow">${detailIcon("arrowRight", 18)}</div>
          ${detailTonePanel({ label: "Yetkazish manzili", tone: "success", icon: "mapPin", body: `<p style="margin:0;font-size:13px;font-weight:600">${fmt(row.delivery_address)}</p>` })}
        </div>`,
      })}

      ${detailCard({
        icon: "flag", title: "Reys tafsilotlari",
        body: detailFieldGrid([
          ["Yo'nalish (Ob'ekt)", row.route_name],
          ["Masofa", row.distance_km != null ? fmtQty(row.distance_km, "km") : dash],
          ["Yuk bilan probeg", row.loaded_mileage_km != null ? fmtQty(row.loaded_mileage_km, "km") : dash],
          ["Bo'sh probeg", row.empty_mileage_km != null ? fmtQty(row.empty_mileage_km, "km") : dash],
          ["Umumiy probeg", row.loaded_mileage_km != null || row.empty_mileage_km != null ? fmtQty(numberValue(row.loaded_mileage_km) + numberValue(row.empty_mileage_km), "km") : dash],
          ["Tonna-km", dash],
          ["GSM sarfi", row.fuel_consumption_liters != null ? fmtQty(row.fuel_consumption_liters, "litr") : dash],
          ["GSM qiymati (QQSsiz)", fmtMoney(row.fuel_cost_amount)],
          ["Haydovchi ish haqi", fmtMoney(row.driver_wage_amount)],
          ["ESP foizi", row.esp_tax_percent != null ? fmtPercent(row.esp_tax_percent) : dash],
          ["Boshqa xarajatlar", fmtMoney(row.other_expenses_amount)],
          ["Komandirovka xarajatlari", fmtMoney(row.business_trip_expenses_amount)],
        ]) + (tripFilled ? "" : detailWarningBanner("Reys tafsilotlari to'liq kiritilmagan. Ma'lumotlarni to'ldirish uchun tahrirlash tugmasini bosing.")),
      })}

      ${detailCard({
        icon: "dollar", title: "Xarajatlar",
        body: `<div class="detail-summary-cards">
          ${detailSummaryCard({ label: "Transport xarajati", value: fmtMoney(row.cost_amount), caption: "Haqiqiy xarajat" })}
          ${detailSummaryCard({ label: "Mijozga transport narxi", value: fmtMoney(row.customer_price), caption: "Mijozga taqdim etilgan" })}
          ${detailSummaryCard({ label: "Transport foydasi", value: transportProfit(row), caption: "Narx – xarajat" })}
          ${detailSummaryCard({ label: "Kim to'laydi", value: fmt(optionLabel(paidByTypes, row.paid_by)), caption: "To'lov mas'uli" })}
        </div>`,
      })}

      ${detailCard({
        icon: "paperclip", title: "Hujjatlar", badge: row.documents?.length || 0,
        headerActions: editable ? `<button type="button" class="btn sm">${detailIcon("upload", 13)} Fayl yuklash</button>` : "",
        body: (row.documents || []).length
          ? tableOrEmpty(row.documents, ["Nomi", "Turi", "Yuklangan sana", "Yuklagan"], (item) => `<tr><td>${fmt(item.title)}</td><td>${fmt(item.document_type)}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td></tr>`, "")
          : detailEmptyState({ icon: "file", title: "Hujjatlar hali yo'q", subtitle: "Bu bo'limda logistika buyurtmasiga tegishli barcha hujjatlar saqlanadi.", action: editable ? `<button type="button" class="btn primary sm">${detailIcon("upload", 13)} Hujjat yuklash</button>` : "" }),
      })}

      ${detailCard({
        icon: "message", title: "Izohlar / Tarix", badge: row.notes_history?.length || 0,
        headerActions: editable ? `<button type="button" class="btn sm">${detailIcon("plus", 13)} Izoh qo'shish</button>` : "",
        body: (row.notes_history || []).length
          ? tableOrEmpty(row.notes_history, ["Sana", "Foydalanuvchi", "Izoh"], (item) => `<tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td></tr>`, "")
          : detailEmptyState({ icon: "message", title: "Izohlar hali yo'q", subtitle: "Bu buyurtmaga doir birinchi izohni qo'shing." }),
      })}

      ${detailCard({
        icon: "list", title: "Jarayon tarixi",
        body: detailTimeline(timelineSteps) + detailProgressBar(doneSteps, timelineSteps.length, doneSteps === timelineSteps.length ? "Barcha asosiy bosqichlar muvaffaqiyatli yakunlandi." : `${number} · ${statusLabel}`),
      })}
    </div>
  </div>`;

  bindDetailToggles();
  document.querySelector("[data-copy-logistics-number]")?.addEventListener("click", async (event) => {
    const value = event.currentTarget.dataset.copyLogisticsNumber;
    try {
      await navigator.clipboard.writeText(value);
      showToast("Nusxalandi.");
    } catch (error) {
      showToast("Nusxalab bo'lmadi.", true);
    }
  });
}
