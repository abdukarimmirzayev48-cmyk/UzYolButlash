// ---- Products list ----

async function renderProductsList() {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab") || "products";
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  if (tab === "categories") {
    await _renderCategoriesTab();
  } else {
    await _renderProductsTab();
  }
}

async function _renderProductsTab() {
  const data = await api("/api/products");
  app.innerHTML = opsListPage({
    title: "Mahsulotlar",
    tabs: [
      { label: "Mahsulotlar", active: true, path: "/products" },
      { label: "Kategoriyalar", active: false, path: "/products?tab=categories" },
    ],
    createPath: "/products/new",
    createLabel: "Mahsulot qo'shish",
    clearPath: "/products",
    counter: `${data.length} ta mahsulot`,
    headers: ["#", "Kategoriya", "Mahsulot turi / nomi", "Birlik", "Izoh", ""],
    rows: data.map((p, idx) => `
      <tr>
        <td class="muted">${idx + 1}</td>
        <td>${fmt(p.category.name)}</td>
        <td><button class="ops-primary-link" data-nav="/products/${p.id}/edit">${fmt(p.name)}</button></td>
        <td>${fmt(p.unit)}</td>
        <td class="muted">${fmt(p.notes)}</td>
        <td>
          <div class="ops-row-actions">
            <button class="link-btn" data-nav="/products/${p.id}/edit">Tahrirlash</button>
            <button class="link-btn" style="color:var(--danger)" data-product-delete="${p.id}">O'chirish</button>
          </div>
        </td>
      </tr>
    `).join(""),
    emptyText: "Mahsulotlar topilmadi. Avval kategoriya, so'ng mahsulot qo'shing.",
    colspan: 6,
  });

  document.querySelectorAll("[data-product-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Bu mahsulotni o'chirishni tasdiqlaysizmi?")) return;
      try {
        await api(`/api/products/${btn.dataset.productDelete}`, { method: "DELETE" });
        showToast("Mahsulot o'chirildi.");
        await _renderProductsTab();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

async function _renderCategoriesTab() {
  const data = await api("/api/product-categories");
  app.innerHTML = opsListPage({
    title: "Mahsulotlar",
    tabs: [
      { label: "Mahsulotlar", active: false, path: "/products" },
      { label: "Kategoriyalar", active: true, path: "/products?tab=categories" },
    ],
    createPath: null,
    counter: `${data.length} ta kategoriya`,
    headers: ["#", "Kategoriya nomi", "Izoh", ""],
    rows: data.map((cat, idx) => `
      <tr>
        <td class="muted">${idx + 1}</td>
        <td><strong>${fmt(cat.name)}</strong></td>
        <td class="muted">${fmt(cat.notes)}</td>
        <td>
          <div class="ops-row-actions">
            <button class="link-btn" data-category-edit="${cat.id}" data-category-name="${esc(cat.name)}" data-category-notes="${esc(cat.notes || "")}">Tahrirlash</button>
            <button class="link-btn" style="color:var(--danger)" data-category-delete="${cat.id}">O'chirish</button>
          </div>
        </td>
      </tr>
    `).join(""),
    emptyText: "Kategoriyalar topilmadi.",
    colspan: 4,
  });

  const cmdLeft = document.querySelector(".ops-command-left");
  if (cmdLeft) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn primary";
    addBtn.textContent = "Kategoriya qo'shish";
    addBtn.addEventListener("click", () => _showCategoryModal());
    cmdLeft.prepend(addBtn);
  }

  document.querySelectorAll("[data-category-edit]").forEach((btn) => {
    btn.addEventListener("click", () =>
      _showCategoryModal(Number(btn.dataset.categoryEdit), btn.dataset.categoryName, btn.dataset.categoryNotes)
    );
  });

  document.querySelectorAll("[data-category-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Bu kategoriyani o'chirishni tasdiqlaysizmi?\nBarcha mahsulotlar ham o'chiriladi.")) return;
      try {
        await api(`/api/product-categories/${btn.dataset.categoryDelete}`, { method: "DELETE" });
        showToast("Kategoriya o'chirildi.");
        await _renderCategoriesTab();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function _showCategoryModal(id = null, name = "", notes = "") {
  document.querySelector("#category-modal-backdrop")?.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "category-modal-backdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:480px">
      <div class="modal-header">
        <h2>${id ? "Kategoriyani tahrirlash" : "Yangi kategoriya"}</h2>
        <button class="modal-close" type="button" aria-label="Yopish">&#x2715;</button>
      </div>
      <form id="category-modal-form">
        <div class="modal-body">
          ${textField("name", "Kategoriya nomi", name, "text", { required: true })}
          ${textArea("notes", "Izoh", notes)}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn modal-cancel">Bekor qilish</button>
          <button type="submit" class="btn primary">Saqlash</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);
  backdrop.querySelector("input[name=name]")?.focus();

  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector(".modal-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector("#category-modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = { name: field(form, "name"), notes: field(form, "notes") };
    if (!payload.name) { showToast("Kategoriya nomi kiritilishi shart.", true); return; }
    try {
      if (id) {
        await api(`/api/product-categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Kategoriya yangilandi.");
      } else {
        await api("/api/product-categories", { method: "POST", body: JSON.stringify(payload) });
        showToast("Kategoriya yaratildi.");
      }
      close();
      await _renderCategoriesTab();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// ---- Product form (create / edit) ----

function _productForm(categories, product = null) {
  const isNew = !product;
  return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>${isNew ? "Yangi mahsulot" : "Mahsulotni tahrirlash"}</h1>
          <p>${isNew ? "Yangi mahsulot yarating." : "Mahsulot ma'lumotlarini yangilang."}</p>
        </div>
        <div class="actions">
          <button class="btn" data-nav="/products">Orqaga</button>
        </div>
      </div>
      <form id="product-form">
        ${section("Mahsulot ma'lumotlari", `
          <div class="grid">
            ${selectField(
              "category_id",
              "Kategoriya",
              categories.map((c) => [String(c.id), c.name]),
              product ? String(product.category_id) : (categories[0] ? String(categories[0].id) : ""),
              { required: true }
            )}
            ${textField("name", "Mahsulot turi / nomi", product?.name ?? "", "text", { required: true })}
            ${textField("unit", "O'lchov birligi (t, kg, m³ va h.k.)", product?.unit ?? "", "text", { required: true })}
            ${textArea("notes", "Izoh", product?.notes ?? "")}
          </div>
        `)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="/products">Bekor qilish</button>
          <button type="submit" class="btn primary">Saqlash</button>
        </div>
      </form>
    </div>
  `;
}

async function renderNewProduct() {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const categories = await api("/api/product-categories");
  if (!categories.length) {
    app.innerHTML = `
      <div class="page">
        <div class="page-header">
          <div class="page-title"><h1>Yangi mahsulot</h1></div>
          <div class="actions"><button class="btn" data-nav="/products">Orqaga</button></div>
        </div>
        <div class="empty">
          Avval kamida bitta kategoriya yarating.
          <br><br>
          <button class="btn primary" data-nav="/products?tab=categories">Kategoriyalar</button>
        </div>
      </div>
    `;
    document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.nav)));
    return;
  }

  app.innerHTML = _productForm(categories);
  document.querySelector("#product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      category_id: Number(field(form, "category_id")),
      name: field(form, "name"),
      unit: field(form, "unit"),
      notes: field(form, "notes"),
    };
    if (!payload.name) { showToast("Mahsulot nomi kiritilishi shart.", true); return; }
    if (!payload.unit) { showToast("O'lchov birligi kiritilishi shart.", true); return; }
    try {
      await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      showToast("Mahsulot yaratildi.");
      navigate("/products");
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderEditProduct(id) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const [product, categories] = await Promise.all([
    api(`/api/products/${id}`),
    api("/api/product-categories"),
  ]);
  app.innerHTML = _productForm(categories, product);
  document.querySelector("#product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      category_id: Number(field(form, "category_id")),
      name: field(form, "name"),
      unit: field(form, "unit"),
      notes: field(form, "notes"),
    };
    if (!payload.name) { showToast("Mahsulot nomi kiritilishi shart.", true); return; }
    if (!payload.unit) { showToast("O'lchov birligi kiritilishi shart.", true); return; }
    try {
      await api(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      showToast("Mahsulot yangilandi.");
      navigate("/products");
    } catch (error) {
      showToast(error.message, true);
    }
  });
}
