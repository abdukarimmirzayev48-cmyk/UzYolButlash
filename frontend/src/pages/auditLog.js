// ---- Amallar tarixi (audit log) ----

const AUDIT_ACTION_LABELS = {
  created: "Yaratdi",
  updated: "O'zgartirdi",
  deleted: "O'chirdi",
  status_changed: "Holatni o'zgartirdi",
  cancelled: "Bekor qildi",
  completed: "Yakunladi",
  loading_confirmed: "Yuklashni tasdiqladi",
  delivery_confirmed: "Yetkazishni tasdiqladi",
  converted: "Buyurtmaga o'tkazdi",
  document_added: "Hujjat yukladi",
  note_added: "Izoh qo'shdi",
  comment_added: "Izoh yozdi",
  file_added: "Fayl biriktirdi",
  logged_out: "Tizimdan chiqdi",
};

function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] || action;
}

const AUDIT_FILTER_KEYS = ["user_id", "module", "action", "search", "date_from", "date_to", "failed_only"];

function auditFilterParams(params) {
  const next = new URLSearchParams();
  AUDIT_FILTER_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) next.set(key, value);
  });
  return next;
}

function auditStatusCell(row) {
  if (row.succeeded) return `<span class="status-badge verified">${fmt(row.status_code)}</span>`;
  const reason = row.status_code === 403 ? "Ruxsat yo'q" : row.status_code === 404 ? "Topilmadi" : "Bajarilmadi";
  return `<span class="status-badge rejected" title="${esc(reason)}">${fmt(row.status_code)}</span>`;
}

// The path is the only place the affected record is named, so it stays visible
// -- but the module and id are pulled out in front of it to be readable.
function auditTargetCell(row) {
  return `<div class="audit-target">
    <strong>${fmt(row.module)}${row.record_id ? ` <span data-noloc>#${esc(row.record_id)}</span>` : ""}</strong>
    <span data-noloc>${esc(row.method)} ${esc(row.path)}</span>
  </div>`;
}

async function renderAuditLog() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const query = auditFilterParams(params);
  const page = params.get("page") || "1";
  const [data, filters, summary] = await Promise.all([
    api(`/api/audit-log?page=${page}&page_size=50&${query.toString()}`),
    api("/api/audit-log/filters"),
    api("/api/audit-log/summary?days=30"),
  ]);

  app.innerHTML = `
    <div class="page ops-page">
      <div class="page-header">
        <div class="page-title">
          <h1>Amallar tarixi</h1>
          <p>Saytda qaysi amal qaysi profildan bajarilgani. Faqat o'zgartirishlar yoziladi, ko'rish emas.</p>
        </div>
      </div>

      <div class="kpi-cards">
        <div class="kpi-card"><span>So'nggi 30 kun</span><strong>${fmt(summary.total)}</strong></div>
        <div class="kpi-card ${summary.failed ? "warn" : ""}"><span>Bajarilmagan urinishlar</span><strong>${fmt(summary.failed)}</strong></div>
        <div class="kpi-card"><span>Eng faol xodim</span><strong>${fmt(summary.by_user[0]?.name || dash)}</strong></div>
        <div class="kpi-card"><span>Eng ko'p o'zgargan bo'lim</span><strong>${fmt(summary.by_module[0]?.module || dash)}</strong></div>
      </div>

      <div class="ops-commandbar">
        <form class="ops-search" id="audit-search-form">
          <input name="search" placeholder="Foydalanuvchi yoki manzil" value="${esc(params.get("search") || "")}" />
          <select name="user_id"><option value="">Barcha foydalanuvchilar</option>${filters.users.map((u) => `<option value="${u.id}" ${params.get("user_id") === String(u.id) ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select>
          <select name="module"><option value="">Barcha bo'limlar</option>${filters.modules.map((m) => `<option value="${esc(m)}" ${params.get("module") === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
          <select name="action"><option value="">Barcha amallar</option>${filters.actions.map((a) => `<option value="${esc(a)}" ${params.get("action") === a ? "selected" : ""}>${auditActionLabel(a)}</option>`).join("")}</select>
          <label class="ops-date-filter">Sana (dan)<input type="date" name="date_from" value="${esc(params.get("date_from") || "")}" /></label>
          <label class="ops-date-filter">Sana (gacha)<input type="date" name="date_to" value="${esc(params.get("date_to") || "")}" /></label>
          <label class="inline-check"><input type="checkbox" name="failed_only" value="true" ${params.get("failed_only") === "true" ? "checked" : ""} /> Faqat bajarilmaganlar</label>
          <button class="ops-tool-btn primary" type="submit">Qidirish</button>
          <button class="ops-tool-btn" type="button" data-nav="/audit-log">Tozalash</button>
        </form>
      </div>

      <section class="ops-table-card">
        <table class="ops-table">
          <thead><tr><th>Vaqt</th><th>Kim</th><th>Amal</th><th>Nima ustida</th><th>Holat</th><th>IP</th></tr></thead>
          <tbody>${data.items.length ? data.items.map((row) => `
            <tr class="${row.succeeded ? "" : "audit-failed"}">
              <td data-noloc>${fmtDate(row.created_at)}</td>
              <td>${fmt(row.full_name || row.username || "—")}</td>
              <td>${auditActionLabel(row.action)}</td>
              <td>${auditTargetCell(row)}</td>
              <td>${auditStatusCell(row)}</td>
              <td data-noloc>${esc(row.ip_address || "")}</td>
            </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Yozuvlar topilmadi.</div></td></tr>`}</tbody>
        </table>
      </section>
      ${opsFooter(data, "audit")}
    </div>
  `;

  bindOpsSearch("audit-search-form", "/audit-log", AUDIT_FILTER_KEYS);
  bindOpsPagination("audit", "/audit-log");
}
