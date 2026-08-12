// ---- Davomat (Attendance) ----

const attendanceMonthNames = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
];

const attendanceStatusOptions = [
  ["on_time", "Vaqtida"],
  ["late", "Kechikkan"],
  ["absent", "Ishda bo'lmagan (НБ)"],
  ["day_off", "Dam olish kuni"],
  ["no_data", "Ma'lumot yo'q"],
];

function attendancePad2(value) {
  return String(value).padStart(2, "0");
}

function attendanceTimeShort(value) {
  return value ? value.slice(0, 5) : "";
}

function attendanceCellLabel(cell) {
  if (cell.status === "absent") return "НБ";
  if (cell.check_in_time) return attendanceTimeShort(cell.check_in_time);
  return dash;
}

function attendanceQueryState() {
  const params = new URLSearchParams(location.search);
  const today = new Date();
  return {
    year: Number(params.get("year")) || today.getFullYear(),
    month: Number(params.get("month")) || today.getMonth() + 1,
    department: params.get("department") || "",
  };
}

function attendanceNavigate(state) {
  const params = new URLSearchParams();
  params.set("year", state.year);
  params.set("month", state.month);
  if (state.department) params.set("department", state.department);
  navigate(`/attendance?${params.toString()}`);
}

function attendanceYearOptions(current) {
  const years = [current - 1, current, current + 1];
  return years.map((year) => [String(year), String(year)]);
}

function attendanceDepartmentOptions(employees, selected) {
  const names = [...new Set(employees.map((e) => e.department).filter(Boolean))];
  return [["", "Barcha bo'limlar"], ...names.map((name) => [name, name])].map(([value, label]) => [
    value,
    label,
    value === selected,
  ]);
}

function attendanceToolbar(state, employees) {
  const yearOptions = attendanceYearOptions(state.year);
  const monthOptions = attendanceMonthNames.map((name, idx) => [String(idx + 1), name]);
  const deptOptions = [...new Set(employees.map((e) => e.department).filter(Boolean))];
  return `
    <div class="attendance-toolbar">
      <label>Oy
        <select data-attendance-month>${monthOptions.map(([value, label]) => `<option value="${value}" ${Number(value) === state.month ? "selected" : ""}>${label}</option>`).join("")}</select>
      </label>
      <label>Yil
        <select data-attendance-year>${yearOptions.map(([value, label]) => `<option value="${value}" ${Number(value) === state.year ? "selected" : ""}>${label}</option>`).join("")}</select>
      </label>
      <label>Bo'lim
        <select data-attendance-department>
          <option value="">Barcha bo'limlar</option>
          ${deptOptions.map((name) => `<option value="${esc(name)}" ${name === state.department ? "selected" : ""}>${esc(name)}</option>`).join("")}
        </select>
      </label>
      <div class="attendance-toolbar-spacer"></div>
      ${canEdit("davomat") ? `<button class="btn" type="button" data-attendance-csv-import>CSV import</button>` : ""}
      ${canEdit("davomat") ? `<button class="btn primary" type="button" data-attendance-hikvision>Turniketdan sinxronlash</button>` : ""}
      <button class="btn primary" type="button" data-attendance-add-employee>Xodim qo'shish</button>
    </div>
  `;
}

function attendanceTable(grid) {
  const headerDays = grid.days.map((day, idx) => `<th>${day}<br><small>${grid.day_labels[idx]}</small></th>`).join("");
  const rows = grid.departments.map((dept) => {
    const deptRow = `<tr class="attendance-dept-row"><td colspan="${5 + grid.days.length}">${esc(dept.name)}</td></tr>`;
    const employeeRows = dept.employees.map((employee) => {
      const dayCells = grid.days.map((day) => {
        const cell = employee.days[String(day)];
        return `<td class="attendance-day-cell ${cell.band}" data-attendance-cell data-employee-id="${employee.id}" data-day="${day}" data-employee-name="${esc(employee.full_name)}">${attendanceCellLabel(cell)}</td>`;
      }).join("");
      const summary = employee.summary;
      return `<tr>
        <td class="attendance-col-name">${esc(employee.full_name)}</td>
        <td class="attendance-col-position">${fmt(employee.position)}</td>
        <td>${attendanceTimeShort(employee.scheduled_check_in)}</td>
        ${dayCells}
        <td>${fmt(summary.late_days)}</td>
        <td>${fmt(summary.total_late_minutes)}</td>
        <td>${fmt(summary.absence_days)}</td>
        <td>${summary.score}</td>
        <td><span class="attendance-grade grade-${summary.grade}">${summary.grade}</span></td>
        <td>
          <button class="link-btn" data-attendance-edit-employee="${employee.id}">Tahrirlash</button>
          <button class="link-btn" style="color:var(--danger)" data-attendance-delete-employee="${employee.id}">O'chirish</button>
        </td>
      </tr>`;
    }).join("");
    return deptRow + employeeRows;
  }).join("");

  return `
    <div class="attendance-table-wrap">
      <table class="attendance-table">
        <thead>
          <tr>
            <th class="attendance-col-name">Ф.И.Ш.</th>
            <th class="attendance-col-position">Lavozimi</th>
            <th>Ishga kelish vaqti</th>
            ${headerDays}
            <th>Kechikish (marta)</th>
            <th>Kechikish (daq.)</th>
            <th>Sababsiz kun</th>
            <th>Ball</th>
            <th>Baho</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="${8 + grid.days.length}"><div class="empty">Xodimlar topilmadi. Avval xodim qo'shing.</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function attendanceLegendPanel() {
  return `
    <div class="attendance-panel">
      <h3>Shartli belgilar</h3>
      <ul>
        <li><span class="attendance-legend-dot" style="background:#e8f7ef"></span>09:00 — vaqtida kelgan</li>
        <li><span class="attendance-legend-dot" style="background:#fff8e1"></span>09:01–09:15 — kichik kechikish</li>
        <li><span class="attendance-legend-dot" style="background:#ffe9d1"></span>09:16–09:30 — o'rtacha kechikish</li>
        <li><span class="attendance-legend-dot" style="background:#fdeceb"></span>09:31 dan ortiq — katta kechikish</li>
        <li><strong>НБ</strong> — ishda bo'lmagan (sababsiz)</li>
        <li><strong>—</strong> — ma'lumot yo'q</li>
      </ul>
    </div>
  `;
}

function attendanceFormulaPanel() {
  return `
    <div class="attendance-panel">
      <h3>Kechikish balli hisobi (100 balldan)</h3>
      <ul>
        <li>Har bir kechikish (marta) — −2 ball</li>
        <li>Har 1 daqiqa kechikish — −0,5 ball</li>
        <li>Sababsiz ishda bo'lmaslik (soat) — −10 ball</li>
        <li>Sababsiz ishda bo'lmaslik (kun) — −20 ball</li>
        <li>Ishni erta tark etish (marta) — −5 ball</li>
        <li>Intizomiy buzilish (marta) — −10 ball</li>
        <li>Minimal ball: 0 | Maksimal ball: 100</li>
      </ul>
    </div>
  `;
}

function attendanceScalePanel() {
  const rows = [
    ["95–100", "A", "A'lo", "Intizomli, namunali xodim"],
    ["85–94", "B", "Yaxshi", "Yaxshi, mayda kamchiliklar bor"],
    ["70–84", "C", "Qoniqarli", "E'tibor talab, o'rtacha"],
    ["50–69", "D", "Past", "Intizom past, ko'p kamchiliklar"],
    ["0–49", "E", "Juda past", "Intizom juda past, chora ko'rish lozim"],
  ];
  return `
    <div class="attendance-panel">
      <h3>Kechikish balli shkalasi</h3>
      <table>
        <thead><tr><th>Ball</th><th>Baho</th><th>Tavsif</th></tr></thead>
        <tbody>
          ${rows.map(([range, grade, label, desc]) => `<tr><td>${range}</td><td><span class="attendance-grade grade-${grade}">${grade}</span> (${label})</td><td>${desc}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function attendanceAnalysisPanel(analysis) {
  const list = (items) => items.length
    ? `<ul>${items.map((item) => `<li>${esc(item.full_name)} — ${item.value}</li>`).join("")}</ul>`
    : `<div class="empty compact">Ma'lumot yo'q.</div>`;
  return `
    <div class="attendance-panel">
      <h3>Oylik avtomatik tahlil</h3>
      <p><strong>Jami xodimlar:</strong> ${fmt(analysis.total_employees)}</p>
      <p><strong>Jami kechikish holatlari:</strong> ${fmt(analysis.total_late_events)}</p>
      <p><strong>Sababsiz kelmagan kunlar:</strong> ${fmt(analysis.total_absence_days)}</p>
      <p><strong>Eng ko'p kechikkanlar:</strong></p>
      ${list(analysis.most_late_employees)}
      <p><strong>Eng yaxshi 5 xodim:</strong></p>
      ${list(analysis.best_employees)}
      <p><strong>Eng past natija 5 xodim:</strong></p>
      ${list(analysis.worst_employees)}
    </div>
  `;
}

async function renderAttendanceList() {
  const state = attendanceQueryState();
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  const [grid, employees] = await Promise.all([
    api(`/api/attendance/grid?year=${state.year}&month=${state.month}${state.department ? `&department=${encodeURIComponent(state.department)}` : ""}`),
    api("/api/attendance/employees"),
  ]);

  app.innerHTML = `
    <div class="page ops-page attendance-page">
      <div class="page-header">
        <div class="page-title">
          <h1>Davomat</h1>
          <p>Xodimlarning turniket asosida kelish vaqti, intizom va ish samaradorligi baholash jadvali.</p>
        </div>
      </div>
      ${attendanceToolbar(state, employees)}
      ${attendanceTable(grid)}
      <div class="attendance-panels">
        ${attendanceLegendPanel()}
        ${attendanceFormulaPanel()}
        ${attendanceScalePanel()}
        ${attendanceAnalysisPanel(grid.analysis)}
      </div>
    </div>
  `;

  document.querySelector("[data-attendance-month]").addEventListener("change", (e) => {
    attendanceNavigate({ ...state, month: Number(e.target.value) });
  });
  document.querySelector("[data-attendance-year]").addEventListener("change", (e) => {
    attendanceNavigate({ ...state, year: Number(e.target.value) });
  });
  document.querySelector("[data-attendance-department]").addEventListener("change", (e) => {
    attendanceNavigate({ ...state, department: e.target.value });
  });
  document.querySelector("[data-attendance-add-employee]").addEventListener("click", () => {
    attendanceEmployeeModal(null, () => renderAttendanceList());
  });
  document.querySelector("[data-attendance-csv-import]")?.addEventListener("click", () => {
    attendanceImportModal(state, () => renderAttendanceList());
  });
  document.querySelector("[data-attendance-hikvision]")?.addEventListener("click", () => {
    attendanceHikvisionModal(state, () => renderAttendanceList());
  });
  document.querySelectorAll("[data-attendance-edit-employee]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const employee = employees.find((e) => e.id === Number(btn.dataset.attendanceEditEmployee));
      attendanceEmployeeModal(employee, () => renderAttendanceList());
    });
  });
  document.querySelectorAll("[data-attendance-delete-employee]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Bu xodimni va uning barcha davomat yozuvlarini o'chirishni tasdiqlaysizmi?")) return;
      try {
        await api(`/api/attendance/employees/${btn.dataset.attendanceDeleteEmployee}`, { method: "DELETE" });
        showToast("Xodim o'chirildi.");
        await renderAttendanceList();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
  const cellsByEmployeeDay = {};
  grid.departments.forEach((dept) => {
    dept.employees.forEach((employee) => {
      cellsByEmployeeDay[employee.id] = employee.days;
    });
  });
  document.querySelectorAll("[data-attendance-cell]").forEach((cell) => {
    if (!canEdit("davomat")) return;
    cell.addEventListener("click", () => {
      const employeeId = Number(cell.dataset.employeeId);
      const day = Number(cell.dataset.day);
      attendanceCellModal(
        {
          employeeId,
          employeeName: cell.dataset.employeeName,
          day,
          existing: cellsByEmployeeDay[employeeId]?.[String(day)] || null,
        },
        state,
        () => renderAttendanceList()
      );
    });
  });
}

function telegramPairingSectionHtml(employee) {
  if (!employee) return "";
  if (employee.telegram_chat_id) {
    return `<div class="field-group">
      <span class="field-label-text">Telegram (haydovchilar boti)</span>
      <p>✅ Ulangan</p>
      <button type="button" class="btn" id="telegram-unpair-btn">Bog'lanishni bekor qilish</button>
    </div>`;
  }
  return `<div class="field-group">
    <span class="field-label-text">Telegram (haydovchilar boti)</span>
    <div id="telegram-pairing-result"></div>
    <button type="button" class="btn" id="telegram-pair-btn">Bog'lash havolasini olish</button>
  </div>`;
}

async function attendanceEmployeeModal(employee, onSaved) {
  document.querySelector("#attendance-modal-backdrop")?.remove();
  const [departments, users] = await Promise.all([
    api("/api/departments").catch(() => []),
    api("/api/users").catch(() => []),
  ]);
  const departmentOptions = [["", "Bo'lim tanlanmagan"], ...departments.map((d) => [String(d.id), d.name])];
  const userOptions = [["", "Tizim foydalanuvchisi bog'lanmagan"], ...users.map((u) => [String(u.id), `${u.full_name} (${u.username})`])];
  const backdrop = document.createElement("div");
  backdrop.id = "attendance-modal-backdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:480px">
      <div class="modal-header">
        <h2>${employee ? "Xodimni tahrirlash" : "Yangi xodim"}</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="attendance-employee-form">
        <div class="modal-body">
          ${textField("full_name", "F.I.Sh.", employee?.full_name ?? "", "text", { required: true })}
          ${textField("position", "Lavozimi", employee?.position ?? "")}
          ${selectField("department_id", "Bo'lim", departmentOptions, employee?.department_id ? String(employee.department_id) : "")}
          ${textField("badge_number", "Tabel raqami", employee?.badge_number ?? "")}
          ${textField("scheduled_check_in", "Ishga kelish vaqti", attendanceTimeShort(employee?.scheduled_check_in) || "09:00", "time", { required: true })}
          ${users.length ? selectField("user_id", "Tizim foydalanuvchisi (Ijro uchun)", userOptions, employee?.user_id ? String(employee.user_id) : "") : ""}
          ${telegramPairingSectionHtml(employee)}
          ${checkField("is_active", "Faol", employee?.is_active ?? true)}
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

  backdrop.querySelector("#telegram-pair-btn")?.addEventListener("click", async () => {
    try {
      const result = await api(`/api/attendance/employees/${employee.id}/telegram-pairing-code`, { method: "POST" });
      const resultEl = backdrop.querySelector("#telegram-pairing-result");
      if (resultEl) {
        resultEl.innerHTML = `<p>Haydovchiga quyidagi havolani yuboring (15 daqiqa amal qiladi):</p><input type="text" readonly value="${esc(result.deep_link)}" onclick="this.select()" />`;
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });
  backdrop.querySelector("#telegram-unpair-btn")?.addEventListener("click", async () => {
    if (!confirm("Telegram bog'lanishini bekor qilasizmi?")) return;
    try {
      await api(`/api/attendance/employees/${employee.id}/telegram-unpair`, { method: "POST" });
      showToast("Telegram bog'lanishi bekor qilindi.");
      close();
      await onSaved();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  backdrop.querySelector("#attendance-employee-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const departmentId = field(form, "department_id");
    const payload = {
      full_name: field(form, "full_name"),
      position: field(form, "position"),
      department_id: departmentId ? Number(departmentId) : null,
      badge_number: field(form, "badge_number"),
      scheduled_check_in: field(form, "scheduled_check_in") ? `${field(form, "scheduled_check_in")}:00` : "09:00:00",
      is_active: form.elements.is_active.checked,
    };
    if (form.elements.user_id) {
      const userId = field(form, "user_id");
      payload.user_id = userId ? Number(userId) : null;
    }
    if (!payload.full_name) { showToast("F.I.Sh. kiritilishi shart.", true); return; }
    try {
      if (employee) {
        await api(`/api/attendance/employees/${employee.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Xodim yangilandi.");
      } else {
        await api("/api/attendance/employees", { method: "POST", body: JSON.stringify(payload) });
        showToast("Xodim qo'shildi.");
      }
      close();
      await onSaved();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function attendanceCellModal({ employeeId, employeeName, day, existing }, state, onSaved) {
  document.querySelector("#attendance-modal-backdrop")?.remove();
  const workDate = `${state.year}-${attendancePad2(state.month)}-${attendancePad2(day)}`;
  const current = existing || {};
  const backdrop = document.createElement("div");
  backdrop.id = "attendance-modal-backdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:480px">
      <div class="modal-header">
        <h2>${esc(employeeName)} — ${workDate}</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="attendance-cell-form">
        <div class="modal-body">
          ${textField("check_in_time", "Kelish vaqti", attendanceTimeShort(current.check_in_time) || "", "time")}
          ${selectField("status", "Holat (avtomatik hisoblash uchun bo'sh qoldiring)", [["", "Avtomatik"], ...attendanceStatusOptions], current.status && current.status !== "no_data" ? current.status : "")}
          ${checkField("early_leave", "Ishni erta tark etdi", current.early_leave || false)}
          ${checkField("disciplinary_violation", "Intizomiy buzilish", current.disciplinary_violation || false)}
          ${textField("absence_hours", "Sababsiz kelmagan soat", current.absence_hours ?? "0", "number")}
          ${textArea("note", "Izoh", current.note || "")}
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

  backdrop.querySelector("#attendance-cell-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const checkInTime = field(form, "check_in_time");
    const payload = {
      employee_id: employeeId,
      work_date: workDate,
      check_in_time: checkInTime ? `${checkInTime}:00` : null,
      check_out_time: current.check_out_time || null,
      status: field(form, "status") || null,
      early_leave: form.elements.early_leave.checked,
      disciplinary_violation: form.elements.disciplinary_violation.checked,
      absence_hours: numberValue(field(form, "absence_hours") || "0"),
      note: field(form, "note"),
    };
    try {
      await api("/api/attendance/records", { method: "PUT", body: JSON.stringify(payload) });
      showToast("Davomat yozuvi saqlandi.");
      close();
      await onSaved();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function attendanceHikvisionModal(state, onSynced) {
  document.querySelector("#attendance-modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.id = "attendance-modal-backdrop";
  backdrop.className = "modal-backdrop";

  const daysInMonth = new Date(state.year, state.month, 0).getDate();
  const monthStart = `${state.year}-${attendancePad2(state.month)}-01`;
  const monthEnd = `${state.year}-${attendancePad2(state.month)}-${attendancePad2(daysInMonth)}`;

  let statusInfo = { configured: false, devices: [] };
  try {
    statusInfo = await api("/api/attendance/hikvision/status");
  } catch (error) {
    statusInfo = { configured: false, devices: [], error: error.message };
  }

  const anyReachable = statusInfo.devices?.some((d) => d.reachable);
  const statusLine = !statusInfo.configured
    ? `<div class="empty compact error">Qurilma sozlanmagan. Loyiha ildizida .env faylida HIKVISION_HOSTS, HIKVISION_USERNAME, HIKVISION_PASSWORD ni kiriting.</div>`
    : (statusInfo.devices || [])
        .map((d) =>
          d.reachable
            ? `<div class="empty compact">Qurilma: <strong>${esc(d.host)}</strong> — ulanish bor, ${fmt(d.device_user_count)} ta xodim ro'yxatda.</div>`
            : `<div class="empty compact error">Qurilma <strong>${esc(d.host)}</strong>ga ulanib bo'lmadi: ${esc(d.error || "")}</div>`
        )
        .join("");
  const lastSync = statusInfo.last_sync;
  const lastSyncLine = lastSync
    ? `<div class="empty compact">Oxirgi avtomatik sinxronlash (LAN agenti): <strong>${fmtDate(lastSync.synced_at)}</strong> — ${fmt(lastSync.employees_created)} ta yangi xodim, ${fmt(lastSync.events_fetched)} ta hodisa, ${fmt(lastSync.days_updated)} ta kun yangilandi.</div>`
    : `<div class="empty compact">Avtomatik sinxronlash agenti hali ishlamagan. Qarang: scripts/HIKVISION_AGENT_SETUP.md</div>`;

  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:560px">
      <div class="modal-header">
        <h2>Turniketdan sinxronlash (Hikvision)</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="attendance-hikvision-form">
        <div class="modal-body">
          ${statusLine}
          ${lastSyncLine}
          <div class="actions" style="margin:10px 0">
            <button type="button" class="btn" data-hikvision-sync-employees ${anyReachable ? "" : "disabled"}>Xodimlarni qurilmadan sinxronlash</button>
          </div>
          <label>Sana oralig'i (dan)<input type="date" name="date_from" value="${monthStart}" required /></label>
          <label>Sana oralig'i (gacha)<input type="date" name="date_to" value="${monthEnd}" required /></label>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn modal-cancel">Yopish</button>
          <button type="submit" class="btn primary" ${anyReachable ? "" : "disabled"}>Davomatni yuklab olish</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector(".modal-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector("[data-hikvision-sync-employees]").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await api("/api/attendance/hikvision/sync-employees", { method: "POST" });
      const warningSuffix = result.warnings?.length ? ` (${result.warnings.length} qurilmaga ulanib bo'lmadi)` : "";
      showToast(`Xodimlar sinxronlandi: ${result.created} ta yangi, ${result.already_existing} ta mavjud edi.${warningSuffix}`, result.warnings?.length > 0);
      await onSynced();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  backdrop.querySelector("#attendance-hikvision-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const dateFrom = field(form, "date_from");
    const dateTo = field(form, "date_to");
    if (!dateFrom || !dateTo) { showToast("Sana oralig'ini kiriting.", true); return; }
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Yuklanmoqda...";
    try {
      const result = await api(`/api/attendance/hikvision/sync-events?date_from=${dateFrom}&date_to=${dateTo}`, { method: "POST" });
      showToast(`Davomat sinxronlandi: ${result.events_fetched} ta hodisa, ${result.days_updated} ta kun, ${result.matched_employees} ta xodim uchun.${result.warnings.length ? ` (${result.warnings.length} ogohlantirish)` : ""}`, result.warnings.length > 0);
      close();
      await onSynced();
    } catch (error) {
      showToast(error.message, true);
      submitButton.disabled = false;
      submitButton.textContent = "Davomatni yuklab olish";
    }
  });
}

function attendanceImportModal(state, onImported) {
  document.querySelector("#attendance-modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.id = "attendance-modal-backdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:520px">
      <div class="modal-header">
        <h2>Turniketdan import qilish</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="attendance-import-form">
        <div class="modal-body">
          <div class="empty compact">
            CSV fayl ustunlari: <strong>badge_number</strong> (yoki <strong>full_name</strong>), <strong>date</strong> (YYYY-MM-DD), <strong>check_in_time</strong> (HH:MM).
            Har bir xodim-kun uchun eng erta vaqt olinadi.
          </div>
          <label>CSV fayl <span class="required-mark">*</span><input type="file" name="file" accept=".csv,text/csv" required /></label>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn modal-cancel">Bekor qilish</button>
          <button type="submit" class="btn primary">Import qilish</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector(".modal-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector("#attendance-import-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const file = form.elements.file.files[0];
    if (!file) { showToast("CSV fayl tanlanmagan.", true); return; }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await apiForm("/api/attendance/import", formData);
      showToast(`Import: ${result.rows_matched} ta qator qabul qilindi, ${result.rows_skipped} ta o'tkazib yuborildi.`, result.rows_skipped > 0);
      close();
      await onImported();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// ---- Xodimlar (Staff roster) — shared master data used by Davomat, Ijro, and any future module. ----

async function renderEmployeesList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const employees = await api("/api/attendance/employees");

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean))].sort();
  const search = (params.get("search") || "").trim().toLowerCase();
  const departmentFilter = params.get("department") || "";
  const statusFilter = params.get("status") || "";

  const filtered = employees.filter((e) => {
    if (search && !`${e.full_name} ${e.position || ""} ${e.badge_number || ""}`.toLowerCase().includes(search)) return false;
    if (departmentFilter && e.department !== departmentFilter) return false;
    if (statusFilter === "active" && !e.is_active) return false;
    if (statusFilter === "inactive" && e.is_active) return false;
    return true;
  });
  const activeCount = employees.filter((e) => e.is_active).length;

  app.innerHTML = opsListPage({
    className: "employees-ops-page",
    title: "Xodimlar",
    tabs: [{ label: "Xodimlar", active: true }, { label: "Bo'limlar", path: "/departments" }, { label: "Davomat", path: "/attendance" }, { label: "Ijro", path: "/tasks" }],
    clearPath: "/employees",
    counter: `${fmt(employees.length)} ta xodim · ${fmt(activeCount)} ta faol`,
    formId: "employees-search-form",
    filters: `<input name="search" placeholder="F.I.Sh, lavozim, tabel raqami" value="${esc(params.get("search") || "")}" />
      <select name="department"><option value="">Barcha bo'limlar</option>${departments.map((d) => `<option value="${esc(d)}" ${departmentFilter === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      <select name="status"><option value="">Holat</option><option value="active" ${statusFilter === "active" ? "selected" : ""}>Faol</option><option value="inactive" ${statusFilter === "inactive" ? "selected" : ""}>Faol emas</option></select>`,
    headers: ["F.I.Sh.", "Lavozimi", "Bo'lim", "Tabel raqami", "Ishga kelish vaqti", "Holat", ""],
    rows: filtered.map((e) => `<tr>
      <td>${canEdit("xodimlar") ? `<button class="ops-primary-link" data-edit-employee="${e.id}">${fmt(e.full_name)}</button>` : fmt(e.full_name)}</td>
      <td>${fmt(e.position)}</td>
      <td>${fmt(e.department)}</td>
      <td>${fmt(e.badge_number)}</td>
      <td>${attendanceTimeShort(e.scheduled_check_in) || dash}</td>
      <td><span class="status-badge ${e.is_active ? "success" : "muted"}">${e.is_active ? "Faol" : "Faol emas"}</span></td>
      <td><div class="ops-row-actions">
        ${canEdit("xodimlar") ? `<button class="link-btn" data-edit-employee="${e.id}">Tahrirlash</button>
        <button class="link-btn" style="color:var(--danger)" data-delete-employee="${e.id}">O'chirish</button>` : ""}
      </div></td>
    </tr>`).join(""),
    emptyText: "Xodimlar topilmadi.",
    colspan: 7,
  });

  if (canEdit("xodimlar")) {
    const addButton = document.createElement("button");
    addButton.className = "btn primary";
    addButton.type = "button";
    addButton.textContent = "Xodim qo'shish";
    addButton.addEventListener("click", () => attendanceEmployeeModal(null, () => renderEmployeesList()));
    document.querySelector(".ops-command-left")?.prepend(addButton);
  }

  bindOpsSearch("employees-search-form", "/employees", ["search", "department", "status"]);
  document.querySelectorAll("[data-edit-employee]").forEach((btn) => btn.addEventListener("click", () => {
    const employee = employees.find((e) => e.id === Number(btn.dataset.editEmployee));
    attendanceEmployeeModal(employee, () => renderEmployeesList());
  }));
  document.querySelectorAll("[data-delete-employee]").forEach((btn) => btn.addEventListener("click", async () => {
    const employee = employees.find((e) => e.id === Number(btn.dataset.deleteEmployee));
    if (!confirm(`"${employee?.full_name || ""}" xodimini va uning barcha davomat yozuvlarini o'chirishni tasdiqlaysizmi?`)) return;
    try {
      await api(`/api/attendance/employees/${btn.dataset.deleteEmployee}`, { method: "DELETE" });
      showToast("Xodim o'chirildi.");
      renderEmployeesList();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

// ---- Bo'limlar (Departments) — master list employees are connected to. ----

function departmentModal(department, onSaved) {
  document.querySelector("#attendance-modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.id = "attendance-modal-backdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:480px">
      <div class="modal-header">
        <h2>${department ? "Bo'limni tahrirlash" : "Yangi bo'lim"}</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="department-form">
        <div class="modal-body">
          ${textField("name", "Bo'lim nomi", department?.name ?? "", "text", { required: true })}
          ${textArea("description", "Tavsif", department?.description ?? "")}
          ${checkField("is_active", "Faol", department?.is_active ?? true)}
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

  backdrop.querySelector("#department-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      name: field(form, "name"),
      description: field(form, "description"),
      is_active: form.elements.is_active.checked,
    };
    if (!payload.name) { showToast("Bo'lim nomi kiritilishi shart.", true); return; }
    try {
      if (department) {
        await api(`/api/departments/${department.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Bo'lim yangilandi.");
      } else {
        await api("/api/departments", { method: "POST", body: JSON.stringify(payload) });
        showToast("Bo'lim qo'shildi.");
      }
      close();
      await onSaved();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderDepartmentsList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  const departments = await api("/api/departments");

  app.innerHTML = opsListPage({
    className: "departments-ops-page",
    title: "Bo'limlar",
    tabs: [{ label: "Xodimlar", path: "/employees" }, { label: "Bo'limlar", active: true }, { label: "Davomat", path: "/attendance" }, { label: "Ijro", path: "/tasks" }],
    counter: `${fmt(departments.length)} ta bo'lim`,
    headers: ["Nomi", "Tavsif", "Xodimlar soni", "Holat", ""],
    rows: departments.map((d) => `<tr>
      <td>${canEdit("xodimlar") ? `<button class="ops-primary-link" data-edit-department="${d.id}">${fmt(d.name)}</button>` : fmt(d.name)}</td>
      <td>${fmt(d.description)}</td>
      <td>${fmt(d.employee_count)}</td>
      <td><span class="status-badge ${d.is_active ? "success" : "muted"}">${d.is_active ? "Faol" : "Faol emas"}</span></td>
      <td><div class="ops-row-actions">
        ${canEdit("xodimlar") ? `<button class="link-btn" data-edit-department="${d.id}">Tahrirlash</button>
        <button class="link-btn" style="color:var(--danger)" data-delete-department="${d.id}">O'chirish</button>` : ""}
      </div></td>
    </tr>`).join(""),
    emptyText: "Bo'limlar topilmadi.",
    colspan: 5,
  });

  if (canEdit("xodimlar")) {
    const addButton = document.createElement("button");
    addButton.className = "btn primary";
    addButton.type = "button";
    addButton.textContent = "Bo'lim qo'shish";
    addButton.addEventListener("click", () => departmentModal(null, () => renderDepartmentsList()));
    document.querySelector(".ops-command-left")?.prepend(addButton);
  }

  document.querySelectorAll("[data-edit-department]").forEach((btn) => btn.addEventListener("click", () => {
    const department = departments.find((d) => d.id === Number(btn.dataset.editDepartment));
    departmentModal(department, () => renderDepartmentsList());
  }));
  document.querySelectorAll("[data-delete-department]").forEach((btn) => btn.addEventListener("click", async () => {
    const department = departments.find((d) => d.id === Number(btn.dataset.deleteDepartment));
    if (!confirm(`"${department?.name || ""}" bo'limini o'chirishni tasdiqlaysizmi?`)) return;
    try {
      await api(`/api/departments/${btn.dataset.deleteDepartment}`, { method: "DELETE" });
      showToast("Bo'lim o'chirildi.");
      renderDepartmentsList();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}
