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
};

const TASK_ICON_PATHS = {
  list: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
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

function localDateTimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function tasksAggregateStats() {
  const pageSize = 100;
  let page = 1;
  let items = [];
  let total = 0;
  for (let i = 0; i < 10; i += 1) {
    const data = await api(`/api/tasks?page=${page}&page_size=${pageSize}`);
    total = data.total;
    items = items.concat(data.items);
    if (items.length >= total || !data.items.length) break;
    page += 1;
  }
  return {
    total,
    overdue: items.filter((t) => t.is_overdue).length,
    inProgress: items.filter((t) => t.status === "in_progress").length,
    done: items.filter((t) => t.status === "done" || t.status === "verified").length,
  };
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

async function taskFormHtml(item = {}) {
  const [employees, departments] = await Promise.all([
    api("/api/attendance/employees"),
    api("/api/departments").catch(() => []),
  ]);
  const isNew = !item.id;
  const title = item.id ? "Topshiriqni tahrirlash" : "Yangi topshiriq";
  const selectedEmployeeIds = new Set((item.assignees || []).map((a) => a.employee.id));
  const deadlineValue = item.deadline ? item.deadline.slice(0, 16) : "";
  const backPath = item.id ? `/tasks/${item.id}` : "/tasks";
  const deadlineField = isNew
    ? `<label class="form-field"><span class="field-label-text">Muddat <span class="required-mark" aria-hidden="true">*</span></span><input type="datetime-local" name="deadline" value="${esc(deadlineValue)}" min="${esc(localDateTimeValue(new Date()))}" required /></label>`
    : textField("deadline", "Muddat", deadlineValue, "datetime-local", { required: true });
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
        <div class="field-group field-group-scroll">
          <span class="field-label-text">Mas'ul xodimlar <span class="required-mark" aria-hidden="true">*</span></span>
          ${employees.map((e) => `<label class="check-row"><input type="checkbox" name="assignee_employee_ids" value="${e.id}" ${selectedEmployeeIds.has(e.id) ? "checked" : ""} /> ${esc(e.full_name)}${e.department ? ` — ${esc(e.department)}` : ""}</label>`).join("")}
        </div>
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
    deadline: field(form, "deadline"),
    created_by: field(form, "created_by"),
    description: field(form, "description"),
  };
}

function bindTaskForm(item = null) {
  document.querySelector("#task-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = collectTaskPayload(form);
    if (!payload.assignee_employee_ids.length) {
      showToast("Kamida bitta mas'ul xodim tanlang.", true);
      return;
    }
    if (!item && payload.deadline && new Date(payload.deadline) < new Date()) {
      showToast("Muddat o'tgan sana bo'lishi mumkin emas. Kelajakdagi sana va vaqtni tanlang.", true);
      return;
    }
    try {
      await api(item ? `/api/tasks/${item.id}` : "/api/tasks", {
        method: item ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      showToast("Topshiriq saqlandi.");
      navigate(item ? `/tasks/${item.id}` : "/tasks");
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function taskBoardCardHtml(item) {
  const editable = canEdit("ijro");
  return `<div class="task-board-card task-priority-${esc(item.priority || "")}" ${editable ? 'draggable="true"' : ""} data-task-card="${item.id}">
    <div class="task-board-card-title">${fmt(item.title)}</div>
    <div class="task-board-card-meta">${taskAssigneeNames(item)}${item.department ? ` · ${esc(item.department.name)}` : ""}</div>
    <div class="task-board-card-footer">
      ${taskPriorityBadge(item.priority)}
      <span class="task-board-card-deadline ${item.is_overdue ? "ops-warning" : ""}">${fmtDate(item.deadline)}${item.is_overdue ? " ⚠" : ""}</span>
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

async function promptTaskStatusComment(newStatus) {
  const message = newStatus === "rejected" ? "Rad etish sababini kiriting:" : "Bajarilishi haqida qisqacha izoh kiriting:";
  const comment = prompt(message);
  return comment && comment.trim() ? comment.trim() : null;
}

async function applyTaskStatusChange(taskId, oldStatus, newStatus, onChanged) {
  let comment = null;
  if (TASK_COMMENT_REQUIRED.has(`${oldStatus}>${newStatus}`)) {
    comment = await promptTaskStatusComment(newStatus);
    if (!comment) {
      showToast("Bu amal uchun izoh/sabab kiritilishi shart.", true);
      return;
    }
  }
  try {
    await api(`/api/tasks/${taskId}/status`, { method: "POST", body: JSON.stringify({ status: newStatus, comment }) });
    const label = taskStatuses.find(([key]) => key === newStatus)?.[1] || newStatus;
    showToast(`Holat yangilandi: ${label}`);
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
    if (!confirm(`Ushbu topshiriqni butunlay o'chirasizmi: "${item?.title || ""}"? Bu amalni bekor qilib bo'lmaydi.`)) return;
    try {
      await api(`/api/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
      showToast("Topshiriq o'chirildi.");
      onChanged();
    } catch (error) {
      showToast(error.message, true);
    }
  }));
}

async function renderTasksList() {
  const params = new URLSearchParams(location.search);
  const view = params.get("view") === "table" ? "table" : "board";
  const [employees, departments, stats] = await Promise.all([
    api("/api/attendance/employees"),
    api("/api/departments").catch(() => []),
    tasksAggregateStats(),
  ]);

  let bodyHtml;
  let boardItems = [];
  let tableData = null;
  if (view === "table") {
    tableData = await api(`/api/tasks?${params.toString()}`);
    bodyHtml = `
      <section class="ops-table-card">
        <table class="ops-table">
          <thead><tr><th>Vazifa</th><th>Mas'ul xodimlar</th><th>Bo'lim</th><th>Muhimlik</th><th>Muddat</th><th>Holat</th><th>Yaratgan</th><th></th></tr></thead>
          <tbody>${tableData.items.length ? tableData.items.map((item) => `<tr class="task-priority-${esc(item.priority || "")}">
            <td><button class="ops-primary-link" data-nav="/tasks/${item.id}">${fmt(item.title)}</button></td>
            <td>${taskAssigneeNames(item)}</td>
            <td>${fmt(item.department?.name)}</td>
            <td>${taskPriorityBadge(item.priority)}</td>
            <td class="${item.is_overdue ? "ops-warning" : ""}">${fmtDate(item.deadline)}${item.is_overdue ? " ⚠" : ""}</td>
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
    boardItems = await tasksFetchAllFiltered(params);
    bodyHtml = taskBoardHtml(boardItems);
  }

  app.innerHTML = `
    <div class="page ops-page tasks-ops-page">
      <div class="page-header">
        <div class="page-title">
          <h1>Ijro</h1>
          <p>Xodimlarga topshiriqlar biriktiring, muddat va bajarilishini kuzating. Doskada kartani boshqa ustunga tashlab holatini o'zgartiring.</p>
        </div>
      </div>
      <div class="tasks-summary-cards">
        <div class="tasks-summary-card">
          <span class="tasks-summary-icon teal">${taskIcon("list")}</span>
          <span class="tasks-summary-copy"><span>Jami topshiriqlar</span><strong>${fmt(stats.total)}</strong></span>
        </div>
        <div class="tasks-summary-card">
          <span class="tasks-summary-icon red">${taskIcon("alert")}</span>
          <span class="tasks-summary-copy"><span>Muddati o'tgan</span><strong>${fmt(stats.overdue)}</strong></span>
        </div>
        <div class="tasks-summary-card">
          <span class="tasks-summary-icon amber">${taskIcon("clock")}</span>
          <span class="tasks-summary-copy"><span>Bajarilmoqda</span><strong>${fmt(stats.inProgress)}</strong></span>
        </div>
        <div class="tasks-summary-card">
          <span class="tasks-summary-icon green">${taskIcon("check")}</span>
          <span class="tasks-summary-copy"><span>Yakunlangan</span><strong>${fmt(stats.done)}</strong></span>
        </div>
      </div>
      <div class="ops-commandbar">
        <div class="ops-command-left">
          ${canEdit("ijro") ? `<button class="btn primary" data-nav="/tasks/new">Topshiriq qo'shish</button>` : ""}
          <button class="btn" type="button" data-nav="/tasks">Tozalash</button>
          <div class="tasks-view-toggle">
            <button type="button" class="${view === "board" ? "active" : ""}" data-view-toggle="board">Doska</button>
            <button type="button" class="${view === "table" ? "active" : ""}" data-view-toggle="table">Jadval</button>
          </div>
        </div>
        <form class="ops-search" id="task-search-form">
          <input type="hidden" name="view" value="${esc(view)}" />
          <input name="search" placeholder="Sarlavha, tavsif" value="${esc(params.get("search") || "")}" />
          <select name="status"><option value="">Holat</option>${taskStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>
          <select name="priority"><option value="">Muhimlik</option>${taskPriorities.map(([key, label]) => `<option value="${key}" ${params.get("priority") === key ? "selected" : ""}>${label}</option>`).join("")}</select>
          <select name="assigned_employee_id"><option value="">Mas'ul xodim</option>${employees.map((e) => `<option value="${e.id}" ${params.get("assigned_employee_id") === String(e.id) ? "selected" : ""}>${esc(e.full_name)}</option>`).join("")}</select>
          <select name="department_id"><option value="">Bo'lim</option>${departments.map((d) => `<option value="${d.id}" ${params.get("department_id") === String(d.id) ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select>
          <label class="inline-check"><input type="checkbox" name="overdue_only" value="true" ${params.get("overdue_only") === "true" ? "checked" : ""} /> Muddati o'tgan</label>
          <button class="ops-tool-btn" type="submit">Saralash</button>
          <button class="ops-tool-btn" type="button" data-nav="/tasks">Yangilash</button>
        </form>
      </div>
      ${bodyHtml}
    </div>
  `;

  document.querySelectorAll("[data-view-toggle]").forEach((button) => button.addEventListener("click", () => {
    const next = new URLSearchParams(location.search);
    next.set("view", button.dataset.viewToggle);
    navigate(`/tasks?${next.toString()}`);
  }));

  bindOpsSearch("task-search-form", "/tasks", ["view", "search", "status", "priority", "assigned_employee_id", "department_id", "overdue_only"]);

  if (view === "table") {
    bindOpsPagination("task", "/tasks");
    bindTaskDeleteButtons(tableData.items, () => renderTasksList());
  } else {
    bindTaskBoardEvents(boardItems, () => renderTasksList());
  }
}

function taskActionsPanel(task) {
  const actions = task.available_actions || [];
  if (!actions.length) return "";
  return `<section class="next-action-panel">
    <div><span>Amallar</span><strong>Joriy holat: ${fmt(statusLabel(task.status))}</strong></div>
    <div class="task-action-buttons">
      ${actions.map((s) => `<button class="btn ${s === "rejected" ? "" : "primary"}" type="button" data-task-status-action="${s}">${TASK_STATUS_ACTION_LABELS[s] || s}</button>`).join("")}
    </div>
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
      ["Muddat", fmtDate(task.deadline)],
      ["Bajarilgan sana", task.completed_at ? fmtDate(task.completed_at) : dash],
      ["Yopilgan sana", task.closed_at ? fmtDate(task.closed_at) : dash],
    ]))}
  `;
}

function taskCommentsTab(task) {
  return section("Izohlar", `
    <form id="task-comment-form" class="grid" style="margin-bottom:16px;">
      <textarea name="text" placeholder="Izoh yozing..."></textarea>
      <label>Fayl (ixtiyoriy)<input type="file" name="file" /></label>
      <div class="form-footer"><button class="btn primary" type="submit">Izoh qo'shish</button></div>
    </form>
    ${tableOrEmpty(task.comments, ["Sana", "Foydalanuvchi", "Izoh", "Fayl", ""], (c) => `
      <tr>
        <td>${fmtDate(c.created_at)}</td>
        <td>${fmt(c.author?.full_name)}</td>
        <td>${fmt(c.text)}</td>
        <td>${c.attachment_url ? `<a href="${esc(c.attachment_url)}" target="_blank" rel="noopener">Yuklab olish</a>` : dash}</td>
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
  const tabContent = active === "comments" ? taskCommentsTab(task) : active === "history" ? taskHistoryTab(task) : taskGeneralTab(task);

  app.innerHTML = `<div class="page">
    ${workflowHeader({
      title: task.title,
      subtitle: `${statusBadge(task.status)} ${taskPriorityBadge(task.priority)}`,
      backPath: "/tasks",
      fullEditPath: canEdit("ijro") ? `/tasks/${task.id}/edit` : "",
    })}
    ${task.is_overdue ? workflowWarningsPanel(["Bu topshiriqning muddati o'tib ketgan."]) : ""}
    ${taskActionsPanel(task)}
    ${workflowTabs(active, [["general", "Umumiy"], ["comments", "Izohlar"], ["history", "Tarix"]], "task-tab")}
    ${tabContent}
  </div>`;

  document.querySelectorAll("[data-task-tab]").forEach((button) => button.addEventListener("click", () => {
    navigate(`/tasks/${id}?tab=${button.dataset.taskTab}`);
  }));

  bindTaskStatusActions(task, () => renderTaskDetail(id));

  if (active === "comments") {
    document.querySelector("#task-comment-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData();
      const text = field(form, "text");
      if (text) formData.append("text", text);
      if (form.elements.file.files[0]) formData.append("file", form.elements.file.files[0]);
      try {
        await apiForm(`/api/tasks/${id}/comments`, formData);
        showToast("Izoh qo'shildi.");
        renderTaskDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
    document.querySelectorAll("[data-delete-comment]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Ushbu izohni o'chirasizmi?")) return;
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
