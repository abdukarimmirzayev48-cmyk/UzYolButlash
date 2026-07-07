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
      <button class="btn" type="button" data-attendance-import>Turniketdan import qilish</button>
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
  document.querySelector("[data-attendance-import]").addEventListener("click", () => {
    attendanceImportModal(state, () => renderAttendanceList());
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
  document.querySelectorAll("[data-attendance-cell]").forEach((cell) => {
    cell.addEventListener("click", () => {
      attendanceCellModal(
        {
          employeeId: Number(cell.dataset.employeeId),
          employeeName: cell.dataset.employeeName,
          day: Number(cell.dataset.day),
        },
        state,
        () => renderAttendanceList()
      );
    });
  });
}

function attendanceEmployeeModal(employee, onSaved) {
  document.querySelector("#attendance-modal-backdrop")?.remove();
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
          ${textField("department", "Bo'lim", employee?.department ?? "")}
          ${textField("badge_number", "Tabel raqami", employee?.badge_number ?? "")}
          ${textField("scheduled_check_in", "Ishga kelish vaqti", attendanceTimeShort(employee?.scheduled_check_in) || "09:00", "time", { required: true })}
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

  backdrop.querySelector("#attendance-employee-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      full_name: field(form, "full_name"),
      position: field(form, "position"),
      department: field(form, "department"),
      badge_number: field(form, "badge_number"),
      scheduled_check_in: field(form, "scheduled_check_in") ? `${field(form, "scheduled_check_in")}:00` : "09:00:00",
      is_active: form.elements.is_active.checked,
    };
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

function attendanceCellModal({ employeeId, employeeName, day }, state, onSaved) {
  document.querySelector("#attendance-modal-backdrop")?.remove();
  const workDate = `${state.year}-${attendancePad2(state.month)}-${attendancePad2(day)}`;
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
          ${textField("check_in_time", "Kelish vaqti", "", "time")}
          ${selectField("status", "Holat (avtomatik hisoblash uchun bo'sh qoldiring)", [["", "Avtomatik"], ...attendanceStatusOptions], "")}
          ${checkField("early_leave", "Ishni erta tark etdi", false)}
          ${checkField("disciplinary_violation", "Intizomiy buzilish", false)}
          ${textField("absence_hours", "Sababsiz kelmagan soat", "0", "number")}
          ${textArea("note", "Izoh", "")}
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
