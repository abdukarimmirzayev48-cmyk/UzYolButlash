// ---- Auth: login, current user, and the admin-only Foydalanuvchilar (Users) page. ----

const AUTH_MODULE_LABELS = {
  xodimlar: "Xodimlar",
  davomat: "Davomat",
  ijro: "Ijro",
  sotuv: "Sotuv",
  yetkazib_berish: "Yetkazib berish",
  taminot: "Ta'minot",
  moliya: "Moliya",
};

let currentUser = null;

async function loadCurrentUser() {
  try {
    currentUser = await api("/api/auth/me");
  } catch (error) {
    currentUser = null;
  }
  return currentUser;
}

function renderCurrentUserBadge() {
  if (!currentUser) return;
  const avatar = document.querySelector("#top-user-avatar");
  const nameEl = document.querySelector("#top-user-name");
  const roleEl = document.querySelector("#top-user-role");
  const usersLink = document.querySelector("#top-user-menu-users");
  const initial = (currentUser.full_name || currentUser.username || "?").trim().charAt(0).toUpperCase();
  if (avatar) avatar.textContent = initial || "?";
  if (nameEl) nameEl.textContent = currentUser.full_name || currentUser.username;
  if (roleEl) roleEl.textContent = currentUser.is_admin ? "Administrator" : "Operator";
  if (usersLink) usersLink.hidden = !currentUser.is_admin;
  // The audit log is admin-only on the server; hiding the links keeps a
  // non-admin from walking into a 403 page from the menu.
  document.querySelectorAll('a[href="/audit-log"]').forEach((link) => {
    link.hidden = !currentUser.is_admin;
  });

  const toggle = document.querySelector("#top-user");
  const menu = document.querySelector("#top-user-menu");
  if (toggle && menu && !toggle.dataset.bound) {
    toggle.dataset.bound = "true";
    toggle.addEventListener("click", (event) => {
      if (event.target.closest("#top-user-logout") || event.target.closest("#top-user-menu-users")) return;
      menu.hidden = !menu.hidden;
    });
    document.querySelector("#top-user-logout")?.addEventListener("click", (event) => {
      event.stopPropagation();
      logout();
    });
    document.addEventListener("click", (event) => {
      if (!toggle.contains(event.target)) menu.hidden = true;
    });
  }

  bindNotificationBell();
  refreshNotifications();
}

let notifUnreadCount = 0;

function bindNotificationBell() {
  const container = document.querySelector("#top-notif");
  const toggle = document.querySelector("#top-notif-toggle");
  const menu = document.querySelector("#top-notif-menu");
  if (!container || !toggle || !menu || container.dataset.bound) return;
  container.dataset.bound = "true";
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", (event) => {
    if (!container.contains(event.target)) menu.hidden = true;
  });
  document.querySelector("#top-notif-read-all")?.addEventListener("click", async (event) => {
    event.stopPropagation();
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      await refreshNotifications();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function refreshNotifications() {
  try {
    const data = await api("/api/notifications?unread_only=true&page_size=20");
    notifUnreadCount = data.total;
    renderNotificationList(data.items);
  } catch (error) {
    // notifications are not critical to page function -- fail silently
  }
}

function renderNotificationList(items) {
  const badge = document.querySelector("#top-notif-badge");
  if (badge) {
    badge.hidden = notifUnreadCount === 0;
    badge.textContent = notifUnreadCount > 99 ? "99+" : String(notifUnreadCount);
  }
  const list = document.querySelector("#top-notif-list");
  if (!list) return;
  list.innerHTML = items.length
    ? items.map((n) => `<button type="button" class="top-notif-item" data-notif-id="${n.id}" data-notif-task="${n.task_id ?? ""}" data-notif-link="${esc(n.link_path || "")}">
        <strong>${esc(n.title)}</strong>
        ${n.body ? `<span>${esc(n.body)}</span>` : ""}
        <small>${fmtDate(n.created_at)}</small>
      </button>`).join("")
    : `<div class="top-notif-empty">Yangi bildirishnomalar yo'q.</div>`;
  list.querySelectorAll("[data-notif-id]").forEach((button) => button.addEventListener("click", async () => {
    const taskId = button.dataset.notifTask;
    const linkPath = button.dataset.notifLink;
    try {
      await api(`/api/notifications/${button.dataset.notifId}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) });
    } catch (error) {
      // ignore -- still navigate even if marking-read failed
    }
    const menu = document.querySelector("#top-notif-menu");
    if (menu) menu.hidden = true;
    await refreshNotifications();
    if (linkPath) navigate(linkPath);
    else if (taskId) navigate(`/tasks/${taskId}`);
  }));
}

function canEdit(moduleKey) {
  if (!currentUser) return false;
  if (currentUser.is_admin) return true;
  return (currentUser.edit_modules || []).includes(moduleKey);
}

async function renderLoginPage() {
  document.body.classList.add("public-layout");
  app.innerHTML = `<div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand"><span class="brand-mark">B</span><strong>UzYolButlash</strong></div>
      <h1>Tizimga kirish</h1>
      <form id="login-form">
        ${textField("username", "Login", "", "text", { required: true })}
        ${textField("password", "Parol", "", "password", { required: true })}
        <button type="submit" class="btn primary" style="width:100%">Kirish</button>
      </form>
    </div>
  </div>`;
  document.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: field(form, "username"), password: field(form, "password") }),
      });
      await loadCurrentUser();
      document.body.classList.remove("public-layout");
      navigate("/dashboard");
    } catch (error) {
      showToast(error.message || "Login yoki parol noto'g'ri.", true);
    }
  });
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    // ignore — we're logging out regardless
  }
  currentUser = null;
  navigate("/login");
}

function userModuleCheckboxes(user) {
  const selected = new Set(user?.edit_modules || []);
  return Object.entries(AUTH_MODULE_LABELS).map(([key, label]) =>
    `<label class="check-row"><input type="checkbox" name="edit_modules" value="${key}" ${selected.has(key) ? "checked" : ""} /> ${esc(label)}</label>`
  ).join("");
}

async function syncUserEmployeeLink(userId, selectedEmployeeIdStr, previouslyLinkedEmployee) {
  const selectedId = selectedEmployeeIdStr ? Number(selectedEmployeeIdStr) : null;
  const previousId = previouslyLinkedEmployee ? previouslyLinkedEmployee.id : null;
  if (selectedId === previousId) return;
  if (previousId && previousId !== selectedId) {
    await api(`/api/attendance/employees/${previousId}`, { method: "PATCH", body: JSON.stringify({ user_id: null }) });
  }
  if (selectedId) {
    await api(`/api/attendance/employees/${selectedId}`, { method: "PATCH", body: JSON.stringify({ user_id: userId }) });
  }
}

async function userModal(user, onSaved) {
  document.querySelector("#attendance-modal-backdrop")?.remove();
  const employees = await api("/api/attendance/employees").catch(() => []);
  const linkedEmployee = user ? employees.find((e) => e.user_id === user.id) : null;
  const employeeOptions = [["", "Xodim tanlanmagan"], ...employees.map((e) => [String(e.id), `${e.full_name}${e.department ? ` — ${e.department}` : ""}`])];
  const backdrop = document.createElement("div");
  backdrop.id = "attendance-modal-backdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:480px">
      <div class="modal-header">
        <h2>${user ? "Foydalanuvchini tahrirlash" : "Yangi foydalanuvchi"}</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="user-form">
        <div class="modal-body">
          ${textField("username", "Login", user?.username ?? "", "text", { required: true })}
          ${textField("full_name", "F.I.Sh.", user?.full_name ?? "", "text", { required: true })}
          ${selectField("employee_id", "Bog'langan xodim (Ijro uchun)", employeeOptions, linkedEmployee ? String(linkedEmployee.id) : "")}
          ${textField("password", user ? "Yangi parol (o'zgartirmasangiz bo'sh qoldiring)" : "Parol", "", "password", user ? {} : { required: true })}
          ${checkField("is_admin", "Administrator (hammasini tahrirlay oladi)", user?.is_admin ?? false)}
          <div class="field-group"><span class="field-label-text">Tahrirlash huquqi (bo'limlar)</span>${userModuleCheckboxes(user)}</div>
          ${checkField("is_active", "Faol", user?.is_active ?? true)}
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

  backdrop.querySelector("#user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const editModules = [...form.querySelectorAll('input[name="edit_modules"]:checked')].map((el) => el.value);
    const payload = {
      username: field(form, "username"),
      full_name: field(form, "full_name"),
      is_admin: form.elements.is_admin.checked,
      edit_modules: editModules,
      is_active: form.elements.is_active.checked,
    };
    const password = field(form, "password");
    if (password) payload.password = password;
    if (!payload.username || !payload.full_name) { showToast("Login va F.I.Sh. kiritilishi shart.", true); return; }
    try {
      let savedUser;
      if (user) {
        savedUser = await api(`/api/users/${user.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Foydalanuvchi yangilandi.");
      } else {
        savedUser = await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
        showToast("Foydalanuvchi qo'shildi.");
      }
      await syncUserEmployeeLink(savedUser.id, field(form, "employee_id"), linkedEmployee);
      close();
      await onSaved();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderUsersList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  let users;
  try {
    users = await api("/api/users");
  } catch (error) {
    app.innerHTML = `<div class="page ops-page"><div class="empty error">Bu sahifa faqat administrator uchun.</div></div>`;
    return;
  }

  app.innerHTML = opsListPage({
    className: "users-ops-page",
    title: "Foydalanuvchilar",
    counter: `${fmt(users.length)} ta foydalanuvchi`,
    headers: ["Login", "F.I.Sh.", "Huquq", "Holat", ""],
    rows: users.map((u) => `<tr>
      <td><button class="ops-primary-link" data-edit-user="${u.id}">${fmt(u.username)}</button></td>
      <td>${fmt(u.full_name)}</td>
      <td>${u.is_admin ? `<span class="status-badge success">Administrator</span>` : fmt((u.edit_modules || []).map((m) => AUTH_MODULE_LABELS[m] || m).join(", ") || "Faqat ko'rish")}</td>
      <td><span class="status-badge ${u.is_active ? "success" : "muted"}">${u.is_active ? "Faol" : "Faol emas"}</span></td>
      <td><button class="link-btn" data-edit-user="${u.id}">Tahrirlash</button></td>
    </tr>`).join(""),
    emptyText: "Foydalanuvchilar topilmadi.",
    colspan: 5,
  });

  const addButton = document.createElement("button");
  addButton.className = "btn primary";
  addButton.type = "button";
  addButton.textContent = "Foydalanuvchi qo'shish";
  addButton.addEventListener("click", () => userModal(null, () => renderUsersList()));
  document.querySelector(".ops-command-left")?.prepend(addButton);

  document.querySelectorAll("[data-edit-user]").forEach((btn) => btn.addEventListener("click", () => {
    const user = users.find((u) => u.id === Number(btn.dataset.editUser));
    userModal(user, () => renderUsersList());
  }));
}
