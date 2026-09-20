// Xodim obyektivkasi.
//
// Kadrlar bo'limi obyektivkani qog'ozda yuritardi: «tug'ilgan yili qachon»,
// «qaysi oliygohni tamomlagan» degan savol chiqqanda papka titkilanardi.
// Xodim kartochkasi esa faqat ism, lavozim va tabel raqamidan iborat kichik
// oyna -- obyektivka unga sig'maydi, shuning uchun alohida varaq.

const OBYEKTIVKA_PERSONAL = [
  ["birth_place", "Tug'ilgan joyi"],
  ["nationality", "Millati"],
  ["party", "Partiyaviyligi"],
  ["marital_status", "Oilaviy holati"],
  ["phone", "Telefon"],
  ["passport", "Passport seriyasi va raqami"],
  ["pinfl", "JSHSHIR"],
];

const OBYEKTIVKA_EDUCATION = [
  ["education_level", "Ma'lumoti"],
  ["education_institution", "Tamomlagan o'quv yurti"],
  ["education_graduated_year", "Tamomlagan yili"],
  ["speciality", "Mutaxassisligi"],
  ["academic_degree", "Ilmiy darajasi"],
  ["academic_title", "Ilmiy unvoni"],
  ["languages", "Chet tillari"],
];

const OBYEKTIVKA_EXTRA = [
  ["deputy_status", "Qaysi kengash deputati"],
];

async function renderEmployeeProfile(employeeId) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  let profile;
  try {
    profile = await api(`/api/attendance/employees/${employeeId}/profile`);
  } catch (error) {
    app.innerHTML = `<div class="page"><div class="empty">${esc(error.message)}</div></div>`;
    return;
  }
  const editing = new URLSearchParams(location.search).get("edit") === "1" && canEdit("xodimlar");
  if (editing) {
    renderEmployeeProfileForm(profile);
  } else {
    renderEmployeeProfileCard(profile);
  }
}

function employeeProfileHeader(profile, actions) {
  return `
    <div class="page-header">
      <div class="page-title">
        <h1><span>Obyektivka</span><span data-noloc>: ${esc(profile.full_name)}</span></h1>
        <p>${profile.exists ? "Kadrlar bo'limi ma'lumotlari." : "Obyektivka hali to'ldirilmagan."}</p>
      </div>
      <div class="actions">${actions}</div>
    </div>`;
}

function employeePhotoBlock(profile, editable) {
  const photo = profile.photo_url
    ? `<img src="${esc(profile.photo_url)}" alt="" class="obyektivka-photo" />`
    : `<div class="obyektivka-photo obyektivka-photo-empty"><span>Rasm yo'q</span></div>`;
  if (!editable) return `<div class="obyektivka-photo-box">${photo}</div>`;
  return `<div class="obyektivka-photo-box">
      ${photo}
      <div class="obyektivka-photo-actions">
        <label class="link-btn obyektivka-photo-pick">Rasm yuklash<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input hidden /></label>
        ${profile.photo_url ? `<button class="link-btn" type="button" style="color:var(--danger)" data-photo-delete>Rasmni o'chirish</button>` : ""}
      </div>
    </div>`;
}

function renderEmployeeProfileCard(profile) {
  const editable = canEdit("xodimlar");
  const rows = (items) => items.map(([key, label]) => [label, profile[key]]);
  app.innerHTML = `
    <div class="page obyektivka-page">
      ${employeeProfileHeader(profile, `
        <button class="btn" data-nav="/employees">Orqaga</button>
        <button class="btn" type="button" data-print>Chop etish</button>
        ${editable ? `<button class="btn primary" type="button" data-edit>Tahrirlash</button>` : ""}`)}
      <section class="card">
        <div class="card-body obyektivka-top">
          ${employeePhotoBlock(profile, false)}
          <div class="obyektivka-top-fields">
            ${detailList([
              ["F.I.Sh.", profile.full_name],
              ["Lavozimi", profile.position],
              ["Bo'lim", profile.department],
              ["Tabel raqami", profile.badge_number],
              ["Tug'ilgan sanasi", profile.birth_date ? fmtDayOnly(profile.birth_date) : null],
            ])}
          </div>
        </div>
      </section>
      ${section("Shaxsiy ma'lumotlar", detailList(rows(OBYEKTIVKA_PERSONAL).concat([["Manzili", profile.address]])))}
      ${section("Ma'lumoti", detailList(rows(OBYEKTIVKA_EDUCATION)))}
      ${section("Qo'shimcha", detailList(rows(OBYEKTIVKA_EXTRA).concat([
        ["Davlat mukofotlari", profile.state_awards],
        ["Izoh", profile.notes],
      ])))}
      ${section("Mehnat faoliyati", tableOrEmpty(profile.career || [], ["Davri", "Tashkilot", "Lavozimi"],
        (row) => `<tr><td data-noloc>${esc(row.period)}</td><td data-noloc>${esc(row.organization || "")}</td><td data-noloc>${esc(row.position || "")}</td></tr>`,
        "Mehnat faoliyati kiritilmagan."))}
    </div>`;
  document.querySelector("[data-nav]")?.addEventListener("click", () => navigate("/employees"));
  document.querySelector("[data-print]")?.addEventListener("click", () => window.print());
  document.querySelector("[data-edit]")?.addEventListener("click", () => navigate(`/employees/${profile.employee_id}/obyektivka?edit=1`));
}

function careerFormRow(row = {}) {
  return `<tr data-career-row>
      <td><input name="career_period" value="${esc(row.period || "")}" placeholder="2015 -- 2019" /></td>
      <td><input name="career_organization" value="${esc(row.organization || "")}" /></td>
      <td><input name="career_position" value="${esc(row.position || "")}" /></td>
      <td><button class="link-btn" type="button" style="color:var(--danger)" data-career-remove>O'chirish</button></td>
    </tr>`;
}

function renderEmployeeProfileForm(profile) {
  const fields = (items) => items.map(([key, label]) => textField(key, label, profile[key] ?? "")).join("");
  app.innerHTML = `
    <div class="page obyektivka-page">
      ${employeeProfileHeader(profile, `<button class="btn" type="button" data-cancel>Bekor qilish</button>`)}
      <form id="obyektivka-form">
        <section class="card">
          <div class="card-body obyektivka-top">
            ${employeePhotoBlock(profile, true)}
            <div class="obyektivka-top-fields">
              ${detailList([
                ["F.I.Sh.", profile.full_name],
                ["Lavozimi", profile.position],
                ["Bo'lim", profile.department],
                ["Tabel raqami", profile.badge_number],
              ])}
              <p class="form-hint">F.I.Sh., lavozim va tabel raqami xodim kartochkasida tahrirlanadi.</p>
            </div>
          </div>
        </section>
        ${section("Shaxsiy ma'lumotlar", `<div class="grid">
          ${dateField("birth_date", "Tug'ilgan sanasi", profile.birth_date || "")}
          ${fields(OBYEKTIVKA_PERSONAL)}
        </div>
        ${textArea("address", "Manzili", profile.address ?? "")}`)}
        ${section("Ma'lumoti", `<div class="grid three">${fields(OBYEKTIVKA_EDUCATION)}</div>`)}
        ${section("Qo'shimcha", `<div class="grid">${fields(OBYEKTIVKA_EXTRA)}</div>
          ${textArea("state_awards", "Davlat mukofotlari", profile.state_awards ?? "")}
          ${textArea("notes", "Izoh", profile.notes ?? "")}`)}
        ${section("Mehnat faoliyati", `
          <div class="table-scroll">
            <table class="obyektivka-career-table">
              <thead><tr><th>Davri</th><th>Tashkilot</th><th>Lavozimi</th><th></th></tr></thead>
              <tbody data-career-body>${(profile.career || []).map((row) => careerFormRow(row)).join("")}</tbody>
            </table>
          </div>
          <div class="actions"><button class="btn" type="button" data-career-add>Qator qo'shish</button></div>`)}
        <div class="actions obyektivka-form-actions">
          <button class="btn" type="button" data-cancel>Bekor qilish</button>
          <button class="btn primary" type="submit">Saqlash</button>
        </div>
      </form>
    </div>`;

  bindRuDateFields();
  const back = () => navigate(`/employees/${profile.employee_id}/obyektivka`);
  document.querySelectorAll("[data-cancel]").forEach((btn) => btn.addEventListener("click", back));
  bindEmployeePhoto(profile);

  const body = document.querySelector("[data-career-body]");
  const bindRemove = (row) => row.querySelector("[data-career-remove]").addEventListener("click", () => row.remove());
  body.querySelectorAll("[data-career-row]").forEach(bindRemove);
  document.querySelector("[data-career-add]").addEventListener("click", () => {
    body.insertAdjacentHTML("beforeend", careerFormRow());
    const row = body.lastElementChild;
    bindRemove(row);
    localizeDom(row);
  });

  document.querySelector("#obyektivka-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = { birth_date: field(form, "birth_date"), address: field(form, "address"), state_awards: field(form, "state_awards"), notes: field(form, "notes") };
    OBYEKTIVKA_PERSONAL.concat(OBYEKTIVKA_EDUCATION, OBYEKTIVKA_EXTRA).forEach(([key]) => {
      payload[key] = field(form, key);
    });
    // Bo'sh davr -- to'ldirilmagan qator: uni saqlash jadvalga bo'sh satr
    // qo'shardi, shuning uchun tashlab yuboriladi.
    payload.career = [...body.querySelectorAll("[data-career-row]")]
      .map((row) => ({
        period: row.querySelector("[name=career_period]").value.trim(),
        organization: row.querySelector("[name=career_organization]").value.trim() || null,
        position: row.querySelector("[name=career_position]").value.trim() || null,
      }))
      .filter((row) => row.period);
    try {
      await api(`/api/attendance/employees/${profile.employee_id}/profile`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Obyektivka saqlandi.");
      back();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function bindEmployeePhoto(profile) {
  const input = document.querySelector("[data-photo-input]");
  input?.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      await apiForm(`/api/attendance/employees/${profile.employee_id}/profile/photo`, formData);
      showToast("Rasm yuklandi.");
      renderEmployeeProfile(profile.employee_id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  document.querySelector("[data-photo-delete]")?.addEventListener("click", async () => {
    if (!confirmMsg("Xodim rasmi o'chirilsinmi?")) return;
    try {
      await api(`/api/attendance/employees/${profile.employee_id}/profile/photo`, { method: "DELETE" });
      showToast("Rasm o'chirildi.");
      renderEmployeeProfile(profile.employee_id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}
