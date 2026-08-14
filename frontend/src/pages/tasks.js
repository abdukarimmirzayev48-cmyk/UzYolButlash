// ---- Ijro (Tasks) ----

const taskStatuses = [
  ["new", "Yangi"],
  ["accepted", "Qabul qilindi"],
  ["in_progress", "Bajarilmoqda"],
  ["done", "Bajarildi"],
  ["verified", "Tasdiqlandi"],
  ["rejected", "Rad etildi"],
];

const taskPriorities = [
  ["low", "Past"],
  ["medium", "O'rta"],
  ["high", "Yuqori"],
  ["urgent", "Shoshilinch"],
];

const TASK_COMMENT_REQUIRED = new Set(["in_progress>done", "done>rejected"]);

const TASK_CLOSED_STATUSES = new Set(["verified", "rejected"]);

const TASK_STATUS_ACTION_LABELS = {
  accepted: "Qabul qilish",
  in_progress: "Boshlash",
  done: "Bajarildi deb belgilash",
  verified: "Tasdiqlash",
  rejected: "Rad etish",
};

const TASK_HISTORY_ACTION_LABELS = {
  created: "Yaratildi",
  status_changed: "Holat o'zgardi",
  deadline_changed: "Muddat o'zgardi",
  assignees_changed: "Mas'ul xodimlar o'zgardi",
  files_added: "Fayl qo'shildi",
};

const TASK_MAX_FILE_MB = 10;

const TASK_ICON_PATHS = {
  list: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
};

function taskIcon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${TASK_ICON_PATHS[name] || ""}</svg>`;
}

function taskPriorityBadge(priority) {
  const label = taskPriorities.find(([key]) => key === priority)?.[1] || priority;
  return `<span class="status-badge priority-${esc(priority || "")}">${fmt(label)}</span>`;
}

function taskAssigneeNames(item) {
  const names = (item.assignees || []).map((a) => a.employee?.full_name).filter(Boolean);
  return names.length ? names.join(", ") : dash;
}

function taskHistoryActionLabel(action) {
  return TASK_HISTORY_ACTION_LABELS[action] || action;
}

function localDateValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "2026-08-20" -> "2026-08-20T23:59:59": deadlines are whole days, and a task
// due today must not be overdue for the whole of today.
function endOfDay(value) {
  if (!value) return value;
  return `${String(value).slice(0, 10)}T23:59:59`;
}

async function tasksFetchAllFiltered(params) {
  const qs = new URLSearchParams(params);
  qs.delete("page");
  qs.set("page_size", "200");
  let page = 1;
  let items = [];
  let total = 0;
  for (let i = 0; i < 5; i += 1) {
    qs.set("page", String(page));
    const data = await api(`/api/tasks?${qs.toString()}`);
    total = data.total;
    items = items.concat(data.items);
    if (items.length >= total || !data.items.length) break;
    page += 1;
  }
  return items;
}

function taskDepartmentOptions(departments) {
  return [["", "Bo'lim tanlanmagan"], ...departments.map((d) => [String(d.id), d.name])];
}

// Searchable, department-grouped assignee list. Filtering hides rows rather
// than re-rendering them, so ticks are never lost while you type.
function assigneePicker(employees, selectedIds) {
  const byDept = new Map();
  employees.forEach((e) => {
    const dept = e.department || "Bo'limsiz";
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept).push(e);
  });
  const groups = [...byDept.entries()].map(([dept, list]) => `
    <div class="assignee-group">
      <div class="assignee-group-title">${esc(dept)}</div>
      ${list.map((e) => {
        const haystack = `${e.full_name} ${e.position || ""} ${dept}`.toLowerCase();
        return `<label class="check-row assignee-row" data-search="${esc(haystack)}">
          <input type="checkbox" name="assignee_employee_ids" value="${e.id}" ${selectedIds.has(e.id) ? "checked" : ""} />
          <span class="assignee-name">${esc(e.full_name)}</span>
          ${e.position ? `<span class="assignee-position">${esc(e.position)}</span>` : ""}
        </label>`;
      }).join("")}
    </div>`).join("");

  return `
    <div class="field-group assignee-picker">
      <div class="assignee-head">
        <span class="field-label-text">Mas'ul xodimlar <span class="required-mark" aria-hidden="true">*</span></span>
        <span class="assignee-count" data-assignee-count>0 ta tanlandi</span>
      </div>
      <input type="search" class="assignee-search" data-assignee-search placeholder="Ism, lavozim yoki bo'lim bo'yicha qidirish" />
      <div class="assignee-list">${groups}</div>
      <div class="empty compact" data-assignee-empty hidden>Xodim topilmadi.</div>
    </div>`;
}

function bindAssigneePicker() {
  const picker = document.querySelector(".assignee-picker");
  if (!picker) return;
  const search = picker.querySelector("[data-assignee-search]");
  const counter = picker.querySelector("[data-assignee-count]");
  const emptyNote = picker.querySelector("[data-assignee-empty]");
  const rows = [...picker.querySelectorAll(".assignee-row")];

  const updateCount = () => {
    const n = rows.filter((r) => r.querySelector("input").checked).length;
    // Set imperatively, so the MutationObserver won't see it — localize here.
    counter.textContent = localizeText(`${n} ta tanlandi`);
    counter.classList.toggle("has-selection", n > 0);
  };

  const applyFilter = () => {
    const q = (search.value || "").trim().toLowerCase();
    let visible = 0;
    rows.forEach((row) => {
      // A ticked person always stays visible, so a filter can never hide a
      // selection you'd then lose track of.
      const show = !q || row.dataset.search.includes(q) || row.querySelector("input").checked;
      row.hidden = !show;
      if (show) visible += 1;
    });
    picker.querySelectorAll(".assignee-group").forEach((group) => {
      group.hidden = ![...group.querySelectorAll(".assignee-row")].some((r) => !r.hidden);
    });
    emptyNote.hidden = visible > 0;
  };

  search.addEventListener("input", applyFilter);
  picker.addEventListener("change", (e) => {
    if (e.target.matches('input[name="assignee_employee_ids"]')) updateCount();
  });
  updateCount();
}

async function taskFormHtml(item = {}) {
  const [allEmployees, departments] = await Promise.all([
    api("/api/attendance/employees"),
    api("/api/departments").catch(() => []),
  ]);
  // Deactivated staff can't take on work; keep anyone already assigned though,
  // so editing an old task doesn't silently drop them.
  const selectedIds = new Set((item.assignees || []).map((a) => a.employee.id));
  const employees = allEmployees.filter((e) => e.is_active || selectedIds.has(e.id));
  const isNew = !item.id;
  const title = item.id ? "Topshiriqni tahrirlash" : "Yangi topshiriq";
  // Date only. The stored deadline is the end of that day (see
  // collectTaskPayload) so a task due today isn't overdue from midnight on.
  const deadlineValue = item.deadline ? item.deadline.slice(0, 10) : "";
  const backPath = item.id ? `/tasks/${item.id}` : "/tasks";
  // Task-level files only; comment files belong to their comment.
  const existingFiles = (item.attachments || []).filter((a) => !a.comment_id);
  const deadlineField = isNew
    ? `<label class="form-field"><span class="field-label-text">Muddat <span class="required-mark" aria-hidden="true">*</span></span><input type="date" name="deadline" value="${esc(deadlineValue)}" min="${esc(localDateValue(new Date()))}" required /></label>`
    : textField("deadline", "Muddat", deadlineValue, "date", { required: true });
  return `<div class="page">
    <div class="page-header">
      <div class="page-title"><h1>${title}</h1><p>Topshiriqni xodim(lar)ga biriktiring, muddat va muhimlik darajasini belgilang.</p></div>
      <div class="actions"><button class="btn" data-nav="${backPath}">Orqaga</button></div>
    </div>
    <form id="task-form">
      ${section("Topshiriq ma'lumotlari", `
        <div class="grid">
          ${textField("title", "Sarlavha", item.title || "", "text", { required: true })}
          ${selectField("department_id", "Bo'lim", taskDepartmentOptions(departments), item.department?.id ? String(item.department.id) : "")}
          ${selectField("priority", "Muhimlik", taskPriorities, item.priority || "medium")}
          ${deadlineField}
          ${textField("created_by", "Kim tomonidan berilgan", item.created_by || "")}
          ${textArea("description", "Tavsif", item.description || "")}
        </div>
        ${assigneePicker(employees, selectedIds)}
      `)}
      ${section("Fayllar", `
        ${existingFiles.length ? attachmentGrid(existingFiles, "") : ""}
        ${fileDropZone("files", "Fayl biriktirish (ixtiyoriy)")}
      `)}
      <div class="form-footer"><button type="button" class="btn" data-nav="${backPath}">Bekor qilish</button><button class="btn primary" type="submit">Saqlash</button></div>
    </form>
  </div>`;
}

function collectTaskPayload(form) {
  const assigneeIds = [...form.querySelectorAll('input[name="assignee_employee_ids"]:checked')].map((el) => Number(el.value));
  const departmentId = field(form, "department_id");
  return {
    title: field(form, "title"),
    assignee_employee_ids: assigneeIds,
    department_id: departmentId ? Number(departmentId) : null,
    priority: field(form, "priority") || "medium",
    // The picker gives a bare date; store the end of that day so the task stays
    // on time for the whole day rather than going overdue at 00:00.
    deadline: endOfDay(field(form, "deadline")),
    created_by: field(form, "created_by"),
    description: field(form, "description"),
  };
}

async function uploadTaskFiles(taskId, files) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  await apiForm(`/api/tasks/${taskId}/attachments`, formData);
}

function bindTaskForm(item = null) {
  bindAssigneePicker();
  bindFileDropZone(document);
  if (item) bindAttachmentActions(item.id, () => renderEditTask(item.id));
  document.querySelector("#task-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = collectTaskPayload(form);
    if (!payload.assignee_employee_ids.length) {
      showToast("Kamida bitta mas'ul xodim tanlang.", true);
      return;
    }
    if (!item && payload.deadline && new Date(payload.deadline) < new Date()) {
      showToast("Muddat o'tgan sana bo'lishi mumkin emas. Kelajakdagi sanani tanlang.", true);
      return;
    }
    const files = collectFiles(form.elements.files);
    if (!files) return;
    let saved;
    try {
      saved = await api(item ? `/api/tasks/${item.id}` : "/api/tasks", {
        method: item ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      showToast(error.message, true);
      return;
    }
    // Files go up after the task exists, so a failed upload can't lose the task
    // itself -- the user lands on the Fayllar tab and simply retries there.
    if (files.length) {
      try {
        await uploadTaskFiles(saved.id, files);
      } catch (error) {
        showToast(`Topshiriq saqlandi, lekin fayl yuklanmadi: ${error.message}`, true);
        navigate(`/tasks/${saved.id}?tab=files`);
        return;
      }
    }
    showToast("Topshiriq saqlandi.");
    navigate(files.length ? `/tasks/${saved.id}?tab=files` : (item ? `/tasks/${item.id}` : "/tasks"));
  });
}

function taskBoardCardHtml(item) {
  const editable = canEdit("ijro");
  return `<div class="task-board-card task-priority-${esc(item.priority || "")}" ${editable ? 'draggable="true"' : ""} data-task-card="${item.id}">
    <div class="task-board-card-title">${fmt(item.title)}</div>
    <div class="task-board-card-meta">${taskAssigneeNames(item)}${item.department ? ` · ${esc(item.department.name)}` : ""}</div>
    <div class="task-board-card-footer">
      ${taskPriorityBadge(item.priority)}
      <span class="task-board-card-deadline ${item.is_overdue ? "ops-warning" : ""}">${fmtDayOnly(item.deadline)}${item.is_overdue ? " ⚠" : ""}</span>
    </div>
    <div class="task-board-card-actions">
      <button class="link-btn" data-nav="/tasks/${item.id}">Ko'rish</button>
      ${editable ? `<button class="link-btn" style="color:var(--danger)" data-delete-task="${item.id}">O'chirish</button>` : ""}
    </div>
  </div>`;
}

function taskBoardHtml(items) {
  const columns = taskStatuses.map(([key, label]) => ({ key, label, items: items.filter((t) => t.status === key) }));
  return `<div class="task-board">
    ${columns.map((col) => `
      <div class="task-board-column">
        <div class="task-board-column-header">
          <span>${esc(col.label)}</span>
          <span class="task-board-count">${col.items.length}</span>
        </div>
        <div class="task-board-column-body" data-drop-zone="${col.key}">
          ${col.items.length ? col.items.map(taskBoardCardHtml).join("") : `<div class="task-board-empty">Bo'sh</div>`}
        </div>
      </div>
    `).join("")}
  </div>`;
}

// What the current step means, in the words of the person doing the work.
const TASK_STATUS_HELP = {
  new: "Topshiriq sizga yuborildi. Ishni boshlash uchun avval uni qabul qiling.",
  accepted: "Siz mas'uliyatni o'z zimmangizga oldingiz. Ishga kirishganingizda «Boshlash» tugmasini bosing.",
  in_progress: "Ish davom etmoqda. Tugagach qisqacha hisobot yozib, «Bajarildi» deb belgilang.",
  done: "Ish yakunlandi va rahbar tasdig'ini kutmoqda.",
  verified: "Topshiriq tasdiqlandi va yopildi. Boshqa amal talab qilinmaydi.",
  rejected: "Topshiriq rad etildi. Sababini «Izohlar» bo'limida o'qing.",
};

// What each button will actually do -- shown in the dialog before it happens.
const TASK_ACTION_HELP = {
  accepted: "Topshiriqni qabul qilasiz va uning mas'uli bo'lasiz. Yaratuvchiga xabar boradi.",
  in_progress: "Ish boshlanganini belgilaysiz.",
  done: "Ishni yakunlangan deb belgilaysiz va rahbar tasdig'iga yuborasiz.",
  verified: "Ishni tasdiqlaysiz va topshiriq yopiladi. Bu amal yakuniy.",
  rejected: "Ishni qaytarasiz va topshiriq yopiladi. Bu amal yakuniy.",
};

const TASK_ACTION_COMMENT = {
  done: { label: "Qisqacha hisobot", placeholder: "Nima bajarildi? Natija qanday?" },
  rejected: { label: "Rad etish sababi", placeholder: "Nima to'g'ri kelmadi? Nimani tuzatish kerak?" },
};

// A dialog the app owns, instead of the browser's bare prompt()/confirm(): it
// can be styled, translated and can explain what is about to happen.
// Resolves {confirmed, comment}.
function taskDialog({ title, intro = "", subject = "", confirmLabel = "Tasdiqlash", tone = "primary", comment = null }) {
  return new Promise((resolve) => {
    document.querySelector("#task-dialog")?.remove();
    const backdrop = document.createElement("div");
    backdrop.id = "task-dialog";
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal-panel task-dialog-panel">
        <div class="modal-header">
          <h2>${esc(title)}</h2>
          <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
        </div>
        <form>
          <div class="modal-body">
            ${subject ? `<p class="task-dialog-subject" data-noloc>${esc(subject)}</p>` : ""}
            ${intro ? `<p class="task-dialog-intro">${esc(intro)}</p>` : ""}
            ${comment ? `<label class="task-dialog-field">
              <span class="field-label-text">${esc(comment.label)} <span class="required-mark" aria-hidden="true">*</span></span>
              <textarea name="comment" rows="4" placeholder="${esc(comment.placeholder || "")}"></textarea>
              <span class="task-dialog-error" data-dialog-error hidden>Bu maydonni to'ldiring.</span>
            </label>` : ""}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-dialog-cancel>Bekor qilish</button>
            <button type="submit" class="btn ${tone}">${esc(confirmLabel)}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    // Modals live outside #app, which is the only thing the language observer
    // watches -- so translate this subtree by hand.
    localizeDom(backdrop);

    const field = backdrop.querySelector("textarea");
    const error = backdrop.querySelector("[data-dialog-error]");
    const close = (result) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(result);
    };
    const onKey = (event) => { if (event.key === "Escape") close({ confirmed: false }); };
    document.addEventListener("keydown", onKey);
    backdrop.querySelector(".modal-close").addEventListener("click", () => close({ confirmed: false }));
    backdrop.querySelector("[data-dialog-cancel]").addEventListener("click", () => close({ confirmed: false }));
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close({ confirmed: false }); });
    field?.addEventListener("input", () => { if (field.value.trim()) error.hidden = true; });
    backdrop.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const text = field ? field.value.trim() : "";
      if (field && !text) {
        error.hidden = false;
        field.focus();
        return;
      }
      close({ confirmed: true, comment: text || null });
    });
    (field || backdrop.querySelector('button[type="submit"]'))?.focus();
  });
}

// subject is live data (a task title), so it is shown as-is and never
// translated -- only the surrounding explanation goes through the dictionary.
function taskConfirm(title, intro, subject = "") {
  return taskDialog({ title, intro, subject, confirmLabel: "O'chirish", tone: "danger" });
}

async function applyTaskStatusChange(taskId, oldStatus, newStatus, onChanged) {
  const spec = TASK_COMMENT_REQUIRED.has(`${oldStatus}>${newStatus}`) ? TASK_ACTION_COMMENT[newStatus] : null;
  const label = TASK_STATUS_ACTION_LABELS[newStatus] || newStatus;
  const { confirmed, comment } = await taskDialog({
    title: label,
    intro: TASK_ACTION_HELP[newStatus] || "",
    confirmLabel: label,
    tone: newStatus === "rejected" ? "danger" : "primary",
    comment: spec,
  });
  if (!confirmed) return;
  try {
    await api(`/api/tasks/${taskId}/status`, { method: "POST", body: JSON.stringify({ status: newStatus, comment }) });
    showToast(`Holat yangilandi: ${statusLabel(newStatus)}`);
    onChanged();
  } catch (error) {
    showToast(error.message, true);
  }
}

function bindTaskBoardEvents(items, onChanged) {
  document.querySelectorAll("[data-task-card]").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.taskCard);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  document.querySelectorAll("[data-drop-zone]").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      const taskId = event.dataTransfer.getData("text/plain");
      const newStatus = zone.dataset.dropZone;
      const task = items.find((t) => t.id === Number(taskId));
      if (!task || task.status === newStatus) return;
      if (!(task.available_actions || []).includes(newStatus)) {
        showToast("Bu holatga o'tish uchun ruxsat yo'q yoki bu amal joriy holatdan mumkin emas.", true);
        return;
      }
      await applyTaskStatusChange(taskId, task.status, newStatus, onChanged);
    });
  });
  bindTaskDeleteButtons(items, onChanged);
}

function bindTaskDeleteButtons(items, onChanged) {
  document.querySelectorAll("[data-delete-task]").forEach((button) => button.addEventListener("click", async () => {
    const item = items.find((t) => t.id === Number(button.dataset.deleteTask));
    const { confirmed } = await taskConfirm(
      "Topshiriqni o'chirish",
      "Topshiriq barcha izohlari va fayllari bilan butunlay o'chiriladi. Bu amalni bekor qilib bo'lmaydi.",
      item?.title || "",
    );
    if (!confirmed) return;
    try {
      await api(`/api/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
      showToast("Topshiriq o'chirildi.");
      onChanged();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

// Every view (panel, board, table) and the Excel export read the selection from
// the URL, so a link you share reproduces exactly what you were looking at.
const TASK_FILTER_KEYS = [
  "search", "status", "priority", "assigned_employee_id", "department_id",
  "overdue_only", "state", "mine", "deadline_from", "deadline_to", "sort", "order",
];

const TASK_QUICK_FILTERS = [
  ["", "Barchasi", {}],
  ["mine", "Menga biriktirilgan", { mine: "assigned" }],
  ["created", "Men yaratganman", { mine: "created" }],
  ["overdue", "Muddati o'tgan", { overdue_only: "true" }],
  ["today", "Muddati bugun", {}],
  ["week", "Shu hafta", {}],
  ["open", "Ochiq", { state: "open" }],
  ["closed", "Yopilgan", { state: "closed" }],
];

const TASK_SORT_COLUMNS = {
  title: "Vazifa",
  priority: "Muhimlik",
  deadline: "Muddat",
  status: "Holat",
  created_at: "Yaratilgan",
};

function taskFilterParams(params) {
  const next = new URLSearchParams();
  TASK_FILTER_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) next.set(key, value);
  });
  return next;
}

// Quick filters that need "today"/"this week" are date ranges, not flags, so
// they are resolved here against the browser's clock.
function taskQuickFilterParams(key) {
  const today = localDateValue(new Date());
  if (key === "today") return { deadline_from: today, deadline_to: today, state: "open" };
  if (key === "week") {
    const end = new Date();
    end.setDate(end.getDate() + 6);
    return { deadline_from: today, deadline_to: localDateValue(end), state: "open" };
  }
  return TASK_QUICK_FILTERS.find(([k]) => k === key)?.[2] || {};
}

function activeTaskQuickFilter(params) {
  const today = localDateValue(new Date());
  if (params.get("overdue_only") === "true") return "overdue";
  if (params.get("mine") === "assigned") return "mine";
  if (params.get("mine") === "created") return "created";
  if (params.get("deadline_from") === today && params.get("deadline_to") === today) return "today";
  if (params.get("deadline_from") === today && params.get("deadline_to")) return "week";
  if (params.get("state") === "open") return "open";
  if (params.get("state") === "closed") return "closed";
  return "";
}

// Human-readable summary of the current selection, stamped into the Excel file
// so a downloaded report says what it is months later.
function taskFilterNote(params, employees, departments) {
  const parts = [];
  // Labels go through the dictionary so the note matches the language of the
  // workbook; values stay exactly as they are (names, dates, typed search text).
  const add = (label, value) => { if (value) parts.push(`${localizeText(label)}: ${value}`); };
  const flag = (label) => parts.push(localizeText(label));
  add("Qidiruv", params.get("search"));
  add("Holat", params.get("status") && statusLabel(params.get("status")));
  add("Muhimlik", params.get("priority") && localizeText(taskPriorities.find(([k]) => k === params.get("priority"))?.[1]));
  add("Xodim", employees.find((e) => String(e.id) === params.get("assigned_employee_id"))?.full_name);
  add("Bo'lim", departments.find((d) => String(d.id) === params.get("department_id"))?.name);
  add("Muddat (dan)", params.get("deadline_from"));
  add("Muddat (gacha)", params.get("deadline_to"));
  if (params.get("overdue_only") === "true") flag("Faqat muddati o'tganlar");
  if (params.get("state") === "open") flag("Faqat ochiqlar");
  if (params.get("state") === "closed") flag("Faqat yopilganlar");
  if (params.get("mine") === "assigned") flag("Menga biriktirilgan");
  if (params.get("mine") === "created") flag("Men yaratganman");
  return parts.join("; ");
}

function downloadTasksExport(params, employees, departments) {
  const query = taskFilterParams(params);
  query.set("lang", currentLang() === "lat" ? "lat" : "cyr");
  const note = taskFilterNote(params, employees, departments);
  if (note) query.set("filter_note", note);
  const link = document.createElement("a");
  link.href = `/api/tasks/export.xlsx?${query.toString()}`;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("Excel fayl yuklab olinmoqda...");
}

function taskQuickFilterBar(params, isManager) {
  const active = activeTaskQuickFilter(params);
  // "Menga biriktirilgan" / "Men yaratganman" say nothing to someone who only
  // ever sees their own tasks, so they are managers-only.
  const chips = TASK_QUICK_FILTERS.filter(([key]) => isManager || !["mine", "created"].includes(key));
  return `<div class="task-quick-filters">${chips.map(([key, label]) => `
    <button type="button" class="task-chip ${active === key ? "active" : ""}" data-quick-filter="${key}">${label}</button>
  `).join("")}</div>`;
}

function bindTaskQuickFilters(view) {
  document.querySelectorAll("[data-quick-filter]").forEach((button) => button.addEventListener("click", () => {
    const next = new URLSearchParams();
    next.set("view", view);
    Object.entries(taskQuickFilterParams(button.dataset.quickFilter)).forEach(([k, v]) => next.set(k, v));
    const params = new URLSearchParams(location.search);
    ["search", "status", "priority", "assigned_employee_id", "department_id", "sort", "order"].forEach((key) => {
      if (params.get(key)) next.set(key, params.get(key));
    });
    navigate(`/tasks?${next.toString()}`);
  }));
}

function taskSortableHeader(key, params) {
  const currentSort = params.get("sort") || "deadline";
  const currentOrder = params.get("order") || "asc";
  const isActive = currentSort === key;
  // The arrow lives in its own element: glued onto the label it would form a
  // string the Cyrillic dictionary has no key for, and the header would stay Latin.
  const arrow = isActive ? `<span class="task-sort-arrow" data-noloc>${currentOrder === "desc" ? "↓" : "↑"}</span>` : "";
  return `<th><button type="button" class="task-sort-btn ${isActive ? "active" : ""}" data-sort-key="${key}">${TASK_SORT_COLUMNS[key]}${arrow}</button></th>`;
}

function bindTaskSorting() {
  document.querySelectorAll("[data-sort-key]").forEach((button) => button.addEventListener("click", () => {
    const params = new URLSearchParams(location.search);
    const key = button.dataset.sortKey;
    const sameColumn = (params.get("sort") || "deadline") === key;
    params.set("sort", key);
    params.set("order", sameColumn && (params.get("order") || "asc") === "asc" ? "desc" : "asc");
    params.set("view", "table");
    navigate(`/tasks?${params.toString()}`);
  }));
}

// ---- Boshqaruv paneli (dashboard) ----

function taskBarList(rows, { colorFor } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return `<div class="task-bars">${rows.map((row) => `
    <div class="task-bar-row">
      <span class="task-bar-label">${esc(row.label)}</span>
      <span class="task-bar-track"><span class="task-bar-fill ${colorFor ? colorFor(row) : ""}" style="width:${Math.round((row.count / max) * 100)}%"></span></span>
      <span class="task-bar-value">${fmt(row.count)}</span>
    </div>`).join("")}</div>`;
}

function taskTrendChart(months) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.created, m.completed)));
  return `<div class="task-trend">${months.map((m) => `
    <div class="task-trend-col">
      <div class="task-trend-bars">
        <span class="task-trend-bar created" style="height:${Math.round((m.created / max) * 100)}%" title="${m.created}"></span>
        <span class="task-trend-bar completed" style="height:${Math.round((m.completed / max) * 100)}%" title="${m.completed}"></span>
      </div>
      <span class="task-trend-label">${esc(m.month.slice(5))}.${esc(m.month.slice(2, 4))}</span>
    </div>`).join("")}
    <div class="task-trend-legend"><span><i class="created"></i>Yaratilgan</span><span><i class="completed"></i>Bajarilgan</span></div>
  </div>`;
}

function taskKpiCards(summary) {
  const rate = summary.on_time_rate === null ? dash : `${fmt(summary.on_time_rate)}%`;
  const avg = summary.avg_completion_days === null ? dash : `${fmt(summary.avg_completion_days)} kun`;
  const cards = [
    ["list", "teal", "Jami topshiriqlar", fmt(summary.total)],
    ["clock", "amber", "Ochiq", fmt(summary.open)],
    ["alert", "red", "Muddati o'tgan", fmt(summary.overdue)],
    ["clock", "amber", "Muddati bugun", fmt(summary.due_today)],
    ["list", "teal", "Shu hafta", fmt(summary.due_week)],
    ["alert", "amber", "Qabul qilinmagan", fmt(summary.unaccepted)],
    ["check", "green", "Bajarilgan", fmt(summary.completed)],
    ["check", "green", "O'z vaqtida", rate],
    ["clock", "teal", "O'rtacha bajarish", avg],
  ];
  return `<div class="tasks-summary-cards kpi">${cards.map(([icon, tone, label, value]) => `
    <div class="tasks-summary-card">
      <span class="tasks-summary-icon ${tone}">${taskIcon(icon)}</span>
      <span class="tasks-summary-copy"><span>${label}</span><strong>${value}</strong></span>
    </div>`).join("")}</div>`;
}

function taskMiniList(rows, emptyText) {
  if (!rows.length) return `<div class="empty">${emptyText}</div>`;
  return `<div class="task-mini-list">${rows.map((row) => {
    const late = row.days_left !== null && row.days_left < 0;
    const daysLabel = row.days_left === null
      ? dash
      : late ? `${Math.abs(row.days_left)} kun kechikdi` : row.days_left === 0 ? "Bugun" : `${row.days_left} kun qoldi`;
    return `<button type="button" class="task-mini-row" data-nav="/tasks/${row.id}">
      <span class="task-mini-main">
        <strong>${esc(row.title)}</strong>
        <span>${esc(row.assignees || "")}${row.department ? ` · ${esc(row.department)}` : ""}</span>
      </span>
      <span class="task-mini-meta">
        ${taskPriorityBadge(row.priority)}
        <span class="task-mini-days ${late ? "late" : ""}">${daysLabel}</span>
      </span>
    </button>`;
  }).join("")}</div>`;
}

function taskDashboardHtml(data) {
  const statusRows = data.by_status.map((r) => ({ label: statusLabel(r.status), count: r.count, key: r.status }));
  const priorityRows = data.by_priority.map((r) => ({
    label: taskPriorities.find(([k]) => k === r.priority)?.[1] || r.priority,
    count: r.count,
    key: r.priority,
  }));
  return `
    ${taskKpiCards(data.summary)}
    <div class="task-panel-grid">
      ${section("Holat bo'yicha", taskBarList(statusRows, { colorFor: (r) => `status-${r.key}` }))}
      ${section("Muhimlik bo'yicha", taskBarList(priorityRows, { colorFor: (r) => `priority-${r.key}` }))}
      ${section("Oylik dinamika", taskTrendChart(data.monthly))}
    </div>
    <div class="task-panel-grid two">
      ${section("Muddati o'tgan topshiriqlar", taskMiniList(data.overdue_tasks, "Muddati o'tgan topshiriq yo'q."))}
      ${section("Yaqin muddatlar (7 kun)", taskMiniList(data.upcoming_tasks, "Yaqin kunlarda muddat yo'q."))}
    </div>
    ${section("Bo'limlar kesimida", tableOrEmpty(data.by_department, ["Bo'lim", "Jami", "Ochiq", "Muddati o'tgan", "Bajarilgan"], (r) => `
      <tr>
        <td>${fmt(r.department)}</td>
        <td>${fmt(r.total)}</td>
        <td>${fmt(r.open)}</td>
        <td class="${r.overdue ? "ops-warning" : ""}">${fmt(r.overdue)}</td>
        <td>${fmt(r.completed)}</td>
      </tr>`, "Ma'lumot yo'q."))}
    ${section("Xodimlar yuklamasi", tableOrEmpty(data.by_employee, ["Xodim", "Bo'lim", "Jami", "Ochiq", "Muddati o'tgan", "Bajarilgan", "O'z vaqtida"], (r) => `
      <tr>
        <td><button class="ops-primary-link" data-nav="/tasks?view=table&assigned_employee_id=${r.employee_id}">${fmt(r.full_name)}</button></td>
        <td>${fmt(r.department)}</td>
        <td>${fmt(r.total)}</td>
        <td>${fmt(r.open)}</td>
        <td class="${r.overdue ? "ops-warning" : ""}">${fmt(r.overdue)}</td>
        <td>${fmt(r.completed)}</td>
        <td>${fmt(r.on_time)}</td>
      </tr>`, "Xodimlarga biriktirilgan topshiriq yo'q."))}
  `;
}

async function renderTasksList() {
  const params = new URLSearchParams(location.search);
  const isManager = canEdit("ijro");
  const requested = params.get("view");
  // The panel reports across everyone's work, so it is a managers-only view;
  // an employee asking for it lands on their board instead.
  const view = requested === "table" ? "table" : requested === "board" ? "board" : isManager ? "panel" : "board";
  const filters = taskFilterParams(params);
  const [employees, departments] = await Promise.all([
    api("/api/attendance/employees"),
    api("/api/departments").catch(() => []),
  ]);

  let bodyHtml;
  let boardItems = [];
  let tableData = null;
  if (view === "panel") {
    bodyHtml = taskDashboardHtml(await api(`/api/tasks/dashboard?${filters.toString()}`));
  } else if (view === "table") {
    const query = new URLSearchParams(filters);
    if (params.get("page")) query.set("page", params.get("page"));
    tableData = await api(`/api/tasks?${query.toString()}`);
    bodyHtml = `
      <section class="ops-table-card">
        <table class="ops-table">
          <thead><tr>
            ${taskSortableHeader("title", params)}
            <th>Mas'ul xodimlar</th>
            <th>Bo'lim</th>
            ${taskSortableHeader("priority", params)}
            ${taskSortableHeader("deadline", params)}
            ${taskSortableHeader("status", params)}
            <th>Yaratgan</th>
            <th></th>
          </tr></thead>
          <tbody>${tableData.items.length ? tableData.items.map((item) => `<tr class="task-priority-${esc(item.priority || "")}">
            <td><button class="ops-primary-link" data-nav="/tasks/${item.id}">${fmt(item.title)}</button></td>
            <td>${taskAssigneeNames(item)}</td>
            <td>${fmt(item.department?.name)}</td>
            <td>${taskPriorityBadge(item.priority)}</td>
            <td class="${item.is_overdue ? "ops-warning" : ""}">${fmtDayOnly(item.deadline)}${item.is_overdue ? " ⚠" : ""}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${fmt(item.created_by)}</td>
            <td><div class="ops-row-actions">
              <button class="link-btn" data-nav="/tasks/${item.id}">Ko'rish</button>
              ${canEdit("ijro") ? `<button class="link-btn" data-nav="/tasks/${item.id}/edit">Tahrirlash</button>` : ""}
              ${canEdit("ijro") ? `<button class="link-btn" style="color:var(--danger)" data-delete-task="${item.id}">O'chirish</button>` : ""}
            </div></td>
          </tr>`).join("") : `<tr><td colspan="8"><div class="empty">Topshiriqlar topilmadi.</div></td></tr>`}</tbody>
        </table>
      </section>
      ${opsFooter(tableData, "task")}
    `;
  } else {
    boardItems = await tasksFetchAllFiltered(filters);
    bodyHtml = taskBoardHtml(boardItems);
  }

  app.innerHTML = `
    <div class="page ops-page tasks-ops-page">
      <div class="page-header">
        <div class="page-title">
          <h1>Ijro</h1>
          <p>${isManager
            ? "Xodimlarga topshiriqlar biriktiring, muddat va bajarilishini kuzating. Doskada kartani boshqa ustunga tashlab holatini o'zgartiring."
            : "Sizga biriktirilgan topshiriqlar. Har bir topshiriqni ochib, bosqichma-bosqich bajaring."}</p>
        </div>
      </div>
      <div class="ops-commandbar">
        <div class="ops-command-left">
          ${canEdit("ijro") ? `<button class="btn primary" data-nav="/tasks/new">Topshiriq qo'shish</button>` : ""}
          <button class="btn" type="button" data-nav="/tasks?view=${view}">Tozalash</button>
          ${isManager ? `<button class="btn" type="button" data-export-tasks>Excel (XLSX)</button>` : ""}
          <div class="tasks-view-toggle">
            ${isManager ? `<button type="button" class="${view === "panel" ? "active" : ""}" data-view-toggle="panel">Panel</button>` : ""}
            <button type="button" class="${view === "board" ? "active" : ""}" data-view-toggle="board">Doska</button>
            <button type="button" class="${view === "table" ? "active" : ""}" data-view-toggle="table">Jadval</button>
          </div>
        </div>
        <form class="ops-search tasks-search" id="task-search-form">
          <input type="hidden" name="view" value="${esc(view)}" />
          <input name="search" placeholder="Sarlavha, tavsif" value="${esc(params.get("search") || "")}" />
          <select name="status"><option value="">Holat</option>${taskStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>
          <select name="priority"><option value="">Muhimlik</option>${taskPriorities.map(([key, label]) => `<option value="${key}" ${params.get("priority") === key ? "selected" : ""}>${label}</option>`).join("")}</select>
          ${isManager ? `<select name="assigned_employee_id"><option value="">Mas'ul xodim</option>${employees.map((e) => `<option value="${e.id}" ${params.get("assigned_employee_id") === String(e.id) ? "selected" : ""}>${esc(e.full_name)}</option>`).join("")}</select>` : ""}
          <select name="department_id"><option value="">Bo'lim</option>${departments.map((d) => `<option value="${d.id}" ${params.get("department_id") === String(d.id) ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select>
          <label class="ops-date-filter">Muddat (dan)<input type="date" name="deadline_from" value="${esc(params.get("deadline_from") || "")}" /></label>
          <label class="ops-date-filter">Muddat (gacha)<input type="date" name="deadline_to" value="${esc(params.get("deadline_to") || "")}" /></label>
          <input type="hidden" name="sort" value="${esc(params.get("sort") || "")}" />
          <input type="hidden" name="order" value="${esc(params.get("order") || "")}" />
          <button class="ops-tool-btn" type="submit">Saralash</button>
        </form>
      </div>
      ${taskQuickFilterBar(params, isManager)}
      ${bodyHtml}
    </div>
  `;

  document.querySelectorAll("[data-view-toggle]").forEach((button) => button.addEventListener("click", () => {
    const next = new URLSearchParams(location.search);
    next.set("view", button.dataset.viewToggle);
    next.delete("page");
    navigate(`/tasks?${next.toString()}`);
  }));

  document.querySelector("[data-export-tasks]")?.addEventListener("click", () => {
    downloadTasksExport(params, employees, departments);
  });

  bindOpsSearch("task-search-form", "/tasks", [
    "view", "search", "status", "priority", "assigned_employee_id", "department_id",
    "deadline_from", "deadline_to", "sort", "order",
  ]);
  bindTaskQuickFilters(view);

  if (view === "table") {
    bindTaskSorting();
    bindOpsPagination("task", "/tasks");
    bindTaskDeleteButtons(tableData.items, () => renderTasksList());
  } else if (view === "board") {
    bindTaskBoardEvents(boardItems, () => renderTasksList());
  }
}

// ---- Fayllar (attachments) ----

function fileSizeLabel(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileDropZone(inputName, hint = "Fayllarni tanlang yoki shu yerga tashlang") {
  return `<div class="file-drop" data-file-drop>
    <label class="file-drop-label">
      <span class="file-drop-hint">${hint}</span>
      <span class="file-drop-note">Har bir fayl ${TASK_MAX_FILE_MB} MB gacha</span>
      <input type="file" name="${inputName}" multiple />
    </label>
    <div class="file-chips" data-file-list></div>
  </div>`;
}

function bindFileDropZone(scope) {
  const zone = (scope || document).querySelector("[data-file-drop]");
  if (!zone) return;
  const input = zone.querySelector("input[type=file]");
  const list = zone.querySelector("[data-file-list]");
  const render = () => {
    const files = Array.from(input.files || []);
    zone.classList.toggle("has-files", files.length > 0);
    list.innerHTML = files.map((f) => `<span class="file-chip">${esc(f.name)}<em>${fileSizeLabel(f.size)}</em></span>`).join("");
  };
  input.addEventListener("change", render);
  ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    zone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, () => zone.classList.remove("dragover")));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    // Assigning to .files keeps the normal form submit path working.
    input.files = event.dataTransfer.files;
    render();
  });
}

// Returns the picked files, or null when one of them is over the limit —
// checked here so a slow upload isn't wasted on a file the server will refuse.
function collectFiles(input) {
  const files = Array.from(input?.files || []);
  const tooBig = files.find((f) => f.size > TASK_MAX_FILE_MB * 1024 * 1024);
  if (tooBig) {
    showToast(`Fayl juda katta: ${tooBig.name}. Har bir fayl ${TASK_MAX_FILE_MB} MB dan oshmasligi kerak.`, true);
    return null;
  }
  return files;
}

function attachmentCard(att, deletable) {
  const name = esc(att.file_name || "");
  const url = esc(att.file_url || "");
  const preview = att.is_image
    ? `<button type="button" class="attachment-thumb" data-lightbox="${url}" data-lightbox-name="${name}"><img src="${url}" alt="${name}" loading="lazy" /></button>`
    : `<a class="attachment-thumb is-file" href="${url}" target="_blank" rel="noopener">${taskIcon("file", 24)}</a>`;
  return `<figure class="attachment-card">
    ${preview}
    <figcaption>
      <a href="${url}" target="_blank" rel="noopener" title="${name}">${name}</a>
      <span>${esc(fileSizeLabel(att.size_bytes))}${att.uploaded_by?.full_name ? ` · ${esc(att.uploaded_by.full_name)}` : ""}</span>
    </figcaption>
    ${deletable ? `<button type="button" class="attachment-remove" data-delete-attachment="${att.id}" title="O'chirish">&times;</button>` : ""}
  </figure>`;
}

function attachmentGrid(attachments, emptyText) {
  const items = attachments || [];
  if (!items.length) return `<div class="empty">${emptyText}</div>`;
  return `<div class="attachment-grid">${items.map((a) => attachmentCard(a, canEdit("ijro"))).join("")}</div>`;
}

function openLightbox(url, name) {
  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.innerHTML = `<figure><img src="${esc(url)}" alt="${esc(name || "")}" /><figcaption>${esc(name || "")}</figcaption></figure>
    <button type="button" class="lightbox-close" aria-label="Yopish">&times;</button>`;
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => { if (event.key === "Escape") close(); };
  overlay.addEventListener("click", (event) => { if (event.target.closest("figure img")) return; close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

function bindAttachmentActions(taskId, onChanged) {
  document.querySelectorAll("[data-lightbox]").forEach((button) => button.addEventListener("click", () => {
    openLightbox(button.dataset.lightbox, button.dataset.lightboxName);
  }));
  document.querySelectorAll("[data-delete-attachment]").forEach((button) => button.addEventListener("click", async () => {
    const { confirmed } = await taskConfirm("Faylni o'chirish", "Fayl butunlay o'chiriladi. Bu amalni bekor qilib bo'lmaydi.");
    if (!confirmed) return;
    try {
      await api(`/api/tasks/${taskId}/attachments/${button.dataset.deleteAttachment}`, { method: "DELETE" });
      showToast("Fayl o'chirildi.");
      onChanged();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

function taskFilesTab(task) {
  const taskFiles = (task.attachments || []).filter((a) => !a.comment_id);
  return `
    ${canEdit("ijro") ? section("Fayl yuklash", `
      <form id="task-files-form" class="grid">
        ${fileDropZone("files")}
        <div class="form-footer"><button class="btn primary" type="submit">Yuklash</button></div>
      </form>
    `) : ""}
    ${section(`Fayllar (${taskFiles.length})`, attachmentGrid(taskFiles, "Fayllar hali yo'q."))}
  `;
}

// The workflow's happy path. Rejected tasks leave it, so they get their own
// closing step rather than being forced onto a line they never finished.
const TASK_PIPELINE = ["new", "accepted", "in_progress", "done", "verified"];

function taskStatusPipeline(task) {
  const rejected = task.status === "rejected";
  const steps = rejected ? [...TASK_PIPELINE.slice(0, 4), "rejected"] : TASK_PIPELINE;
  const activeIndex = steps.indexOf(task.status);
  return `<div class="task-pipeline ${rejected ? "rejected" : ""}">${steps.map((key, index) => {
    const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "upcoming";
    return `<div class="task-pipeline-step ${state} step-${key}">
      <span class="task-pipeline-dot"></span>
      <span class="task-pipeline-label">${fmt(statusLabel(key))}</span>
    </div>`;
  }).join("")}</div>`;
}

function taskActionsPanel(task) {
  const actions = task.available_actions || [];
  const help = TASK_STATUS_HELP[task.status] || "";
  const closed = TASK_CLOSED_STATUSES.has(task.status);
  return `<section class="task-action-panel ${actions.length ? "" : closed ? "closed" : "waiting"}">
    <div class="task-action-copy">
      <span class="task-action-eyebrow">Joriy holat</span>
      <strong>${fmt(statusLabel(task.status))}</strong>
      ${help ? `<p>${help}</p>` : ""}
      ${!actions.length && !closed ? `<p class="task-action-note">Hozircha sizdan amal talab qilinmaydi.</p>` : ""}
    </div>
    ${actions.length ? `<div class="task-action-buttons">
      ${actions.map((s) => `<button class="btn ${s === "rejected" ? "danger" : "primary"}" type="button" data-task-status-action="${s}" title="${esc(TASK_ACTION_HELP[s] || "")}">${TASK_STATUS_ACTION_LABELS[s] || s}</button>`).join("")}
    </div>` : ""}
  </section>`;
}

function taskGeneralTab(task) {
  return `
    ${section("Mas'ul xodimlar", tableOrEmpty(task.assignees, ["Xodim", "Bo'lim", "Qabul qilindi"], (a) => `
      <tr><td>${fmt(a.employee?.full_name)}</td><td>${fmt(a.employee?.department)}</td><td>${a.accepted_at ? fmtDate(a.accepted_at) : "Kutilmoqda"}</td></tr>
    `, "Mas'ul xodimlar yo'q."))}
    ${section("Tafsilotlar", detailList([
      ["Bo'lim", task.department?.name],
      ["Kim tomonidan berilgan", task.created_by],
      ["Yaratuvchi", task.created_by_user?.full_name],
      ["Tavsif", task.description],
      ["Muddat", fmtDayOnly(task.deadline)],
      ["Bajarilgan sana", task.completed_at ? fmtDate(task.completed_at) : dash],
      ["Yopilgan sana", task.closed_at ? fmtDate(task.closed_at) : dash],
    ]))}
  `;
}

function taskCommentFiles(comment) {
  // attachment_url is the pre-multi-file column, kept so old comments still show.
  const files = comment.attachments || [];
  if (!files.length && comment.attachment_url) {
    return `<a href="${esc(comment.attachment_url)}" target="_blank" rel="noopener">Yuklab olish</a>`;
  }
  if (!files.length) return dash;
  return `<div class="attachment-grid compact">${files.map((a) => attachmentCard(a, canEdit("ijro"))).join("")}</div>`;
}

function taskCommentsTab(task) {
  return section("Izohlar", `
    <form id="task-comment-form" class="grid" style="margin-bottom:16px;">
      <textarea name="text" placeholder="Izoh yozing..."></textarea>
      ${fileDropZone("files", "Fayl biriktirish (ixtiyoriy)")}
      <div class="form-footer"><button class="btn primary" type="submit">Izoh qo'shish</button></div>
    </form>
    ${tableOrEmpty(task.comments, ["Sana", "Foydalanuvchi", "Izoh", "Fayllar", ""], (c) => `
      <tr>
        <td>${fmtDate(c.created_at)}</td>
        <td>${fmt(c.author?.full_name)}</td>
        <td>${fmt(c.text)}</td>
        <td>${taskCommentFiles(c)}</td>
        <td>${canEdit("ijro") ? `<button class="link-btn" style="color:var(--danger)" data-delete-comment="${c.id}">O'chirish</button>` : ""}</td>
      </tr>
    `, "Izohlar hali yo'q.")}
  `);
}

function taskHistoryValueLabel(action, value) {
  if (!value) return value;
  if (action === "status_changed" || action === "created") return statusLabel(value);
  return value;
}

function taskHistoryTab(task) {
  return section("Tarix", tableOrEmpty(task.history, ["Sana", "Foydalanuvchi", "Amal", "Eski qiymat", "Yangi qiymat"], (h) => `
    <tr><td>${fmtDate(h.created_at)}</td><td>${fmt(h.user?.full_name)}</td><td>${fmt(taskHistoryActionLabel(h.action))}</td><td>${fmt(taskHistoryValueLabel(h.action, h.old_value))}</td><td>${fmt(taskHistoryValueLabel(h.action, h.new_value))}</td></tr>
  `, "Tarix hali yo'q."));
}

function bindTaskStatusActions(task, onChanged) {
  document.querySelectorAll("[data-task-status-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const newStatus = button.dataset.taskStatusAction;
      await applyTaskStatusChange(task.id, task.status, newStatus, onChanged);
    });
  });
}

async function renderTaskDetail(id) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const task = await api(`/api/tasks/${id}`);
  const active = new URLSearchParams(location.search).get("tab") || "general";
  const tabContent = active === "files"
    ? taskFilesTab(task)
    : active === "comments"
      ? taskCommentsTab(task)
      : active === "history"
        ? taskHistoryTab(task)
        : taskGeneralTab(task);
  const fileCount = task.attachment_count || 0;

  app.innerHTML = `<div class="page">
    ${workflowHeader({
      title: task.title,
      subtitle: `${statusBadge(task.status)} ${taskPriorityBadge(task.priority)}`,
      backPath: "/tasks",
      fullEditPath: canEdit("ijro") ? `/tasks/${task.id}/edit` : "",
    })}
    ${taskStatusPipeline(task)}
    ${task.is_overdue ? workflowWarningsPanel(["Bu topshiriqning muddati o'tib ketgan."]) : ""}
    ${taskActionsPanel(task)}
    ${workflowTabs(active, [["general", "Umumiy"], ["files", fileCount ? `Fayllar (${fileCount})` : "Fayllar"], ["comments", "Izohlar"], ["history", "Tarix"]], "task-tab")}
    ${tabContent}
  </div>`;

  document.querySelectorAll("[data-task-tab]").forEach((button) => button.addEventListener("click", () => {
    navigate(`/tasks/${id}?tab=${button.dataset.taskTab}`);
  }));

  bindTaskStatusActions(task, () => renderTaskDetail(id));

  bindAttachmentActions(id, () => renderTaskDetail(id));

  if (active === "files") {
    bindFileDropZone(document);
    document.querySelector("#task-files-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const files = collectFiles(form.elements.files);
      if (!files) return;
      if (!files.length) {
        showToast("Fayl tanlanmadi.", true);
        return;
      }
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      try {
        await apiForm(`/api/tasks/${id}/attachments`, formData);
        showToast(files.length > 1 ? `${files.length} ta fayl yuklandi.` : "Fayl yuklandi.");
        renderTaskDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  if (active === "comments") {
    bindFileDropZone(document);
    document.querySelector("#task-comment-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const files = collectFiles(form.elements.files);
      if (!files) return;
      const formData = new FormData();
      const text = field(form, "text");
      if (text) formData.append("text", text);
      files.forEach((file) => formData.append("files", file));
      try {
        await apiForm(`/api/tasks/${id}/comments`, formData);
        showToast("Izoh qo'shildi.");
        renderTaskDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
    document.querySelectorAll("[data-delete-comment]").forEach((button) => button.addEventListener("click", async () => {
      const { confirmed } = await taskConfirm("Izohni o'chirish", "Izoh va unga biriktirilgan fayllar o'chiriladi.");
      if (!confirmed) return;
      try {
        await api(`/api/tasks/${id}/comments/${button.dataset.deleteComment}`, { method: "DELETE" });
        showToast("Izoh o'chirildi.");
        renderTaskDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    }));
  }
}

async function renderNewTask() {
  app.innerHTML = await taskFormHtml();
  bindTaskForm();
}

async function renderEditTask(id) {
  const item = await api(`/api/tasks/${id}`);
  app.innerHTML = await taskFormHtml(item);
  bindTaskForm(item);
}
