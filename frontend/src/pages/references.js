// Ma'lumotnomalar bo'limi.
//
// Ma'lumotnoma -- tanlanadigan, kam o'zgaradigan va o'z hayot sikli yo'q
// ma'lumot. Ilgari ular operatsion sahifalar orasiga sochilib ketgan edi:
// mahsulot Sotuvda, ta'minotchi Ta'minotda, transport Yetkazib berishda.
// Uchtasining esa sahifasi umuman yo'q edi -- viloyat/tuman faqat forma
// ichidagi tugma bilan to'ldirilardi, korxonalar reyestri va ombor joylari
// esa hech qayerda ko'rinmasdi.
//
// Bosh sahifa kartochkalarida yozuvlar soni turadi. Bu bezak emas: bo'sh
// yoki chala to'ldirilgan ma'lumotnoma darhol ko'rinadi.

const REFERENCE_GROUPS = [
  {
    title: "Kontragentlar",
    items: [
      { key: "clients", label: "Mijozlar", path: "/clients", hint: "Korxona kartochkasi, manzil va rekvizitlar" },
      { key: "suppliers", label: "Ta'minotchilar", path: "/suppliers", hint: "Yetkazib beruvchilar va ularning shartlari" },
      { key: "company_registry", label: "Korxonalar reyestri", path: "/company-registry", hint: "Talabnoma to'ldirishda ishlatiladigan tashqi reyestr" },
    ],
  },
  {
    title: "Mahsulot",
    items: [
      { key: "products", label: "Mahsulotlar", path: "/products", hint: "Mahsulot kartochkalari va turkumlari", extraKey: "product_categories", extraLabel: "ta turkum" },
    ],
  },
  {
    title: "Joylar",
    items: [
      { key: "delivery_points", label: "ABZ nuqtalari", path: "/delivery-points", hint: "Bitum texnikada yetkaziladigan nuqtalar" },
      { key: "railway_stations", label: "Temiryo'l stansiyalari", path: "/railway-stations", hint: "Vagon keladigan stansiyalar, ESR kodi bilan" },
      { key: "stock_locations", label: "Ombor joylari", path: "/stock-locations", hint: "Zaxira partiyasi turadigan joylar" },
    ],
  },
  {
    title: "Ichki",
    items: [
      { key: "employees", label: "Xodimlar", path: "/employees", hint: "Xodim kartochkasi va lavozimi" },
      { key: "departments", label: "Bo'limlar", path: "/employees?tab=departments", hint: "Xodimlar biriktiriladigan bo'limlar" },
      { key: "transports", label: "Transportlar", path: "/transports", hint: "Park kartochkasi: raqami, hujjatlari, normasi" },
    ],
  },
];

async function renderReferencesHome() {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const summary = await api("/api/references/summary").catch(() => ({}));
  const card = (item) => {
    const stat = summary[item.key] || {};
    const extra = item.extraKey ? summary[item.extraKey] : null;
    return `<button type="button" class="reference-card" data-nav="${esc(item.path)}">
      <span class="reference-card-title">${item.label}</span>
      <span class="reference-card-count">
        <strong data-noloc>${fmt(stat.count ?? 0)}</strong><span>ta yozuv</span>
        ${extra ? `<span class="reference-card-extra"><span data-noloc>${fmt(extra.count ?? 0)}</span> <span>${item.extraLabel}</span></span>` : ""}
      </span>
      <span class="reference-card-hint">${item.hint}</span>
      ${stat.updated_at ? `<span class="reference-card-updated"><span>Yangilangan</span> <span data-noloc>${fmtDate(stat.updated_at)}</span></span>` : ""}
    </button>`;
  };
  app.innerHTML = `<div class="page">
    <div class="page-head-row">
      <div class="page-title">
        <h1>Ma'lumotnomalar</h1>
        <p>Tanlanadigan va kam o'zgaradigan ma'lumotlar bir joyda: kontragentlar, mahsulot, joylar va ichki ro'yxatlar.</p>
      </div>
    </div>
    ${REFERENCE_GROUPS.map((group) => `<section class="card reference-group">
      <div class="card-header"><h2>${group.title}</h2></div>
      <div class="card-body"><div class="reference-grid">${group.items.map(card).join("")}</div></div>
    </section>`).join("")}
  </div>`;
}

// ---- Korxonalar reyestri --------------------------------------------------
//
// Faqat o'qish uchun: reyestr tashqaridan import qilinadi. Qo'lda tuzatish
// keyingi importda bekor bo'lib ketardi, ya'ni tuzatgan odam nima uchun
// o'zgarish yo'qolganini tushunmasdi.

async function renderCompanyRegistryPage() {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/references/company-registry?${params.toString()}`);
  // Hudud ro'yxati ma'lumotnomadan: joriy sahifadan qurilsa, 267 ta
  // korxona 50 tadan bo'lingach filtr o'zi ko'rsatayotgan narsaga bog'liq
  // bo'lib qolardi.
  await loadGeoRegions();

  app.innerHTML = opsListPage({
    className: "company-registry-page",
    title: "Korxonalar reyestri",
    subtitle: "Talabnoma to'ldirishda ishlatiladigan tashqi reyestr. Faqat o'qish uchun.",
    createPath: null,
    clearPath: "/company-registry",
    counter: `${data.total} ta korxona`,
    formId: "company-registry-search-form",
    filters: `
      ${opsFilterField("Qidirish", `<input name="search" placeholder="Nomi, STIR yoki direktor" value="${esc(params.get("search") || "")}" />`)}
      ${opsFilterField("Hudud", `<select name="region"><option value="">Barchasi</option>${(geoRegionsCache || []).map((region) => `<option value="${esc(region.name)}" ${params.get("region") === region.name ? "selected" : ""}>${esc(region.name)}</option>`).join("")}</select>`)}
    `,
    headers: ["Korxona", "STIR", "Hudud", "Direktor", "Bank", "MFO"],
    rows: data.items.map((row) => `<tr>
      <td data-noloc><strong>${esc(row.company_name)}</strong>${row.legal_address ? `<div class="muted">${esc(row.legal_address)}</div>` : ""}</td>
      <td data-noloc>${fmt(row.inn)}</td>
      <td data-noloc>${fmt(row.region)}</td>
      <td data-noloc>${fmt(row.director_full_name)}</td>
      <td data-noloc>${fmt(row.bank_name)}</td>
      <td data-noloc>${fmt(row.mfo)}</td>
    </tr>`).join(""),
    emptyText: "Korxona topilmadi.",
    colspan: 6,
    footer: paginationBlock(data, "registry"),
  });
  bindOpsSearch("company-registry-search-form", "/company-registry", ["search", "region", "page_size"]);
  bindOpsPagination("registry", "/company-registry");
}

// ---- Ombor joylari --------------------------------------------------------

async function renderStockLocationsPage() {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const [locations, suppliers] = await Promise.all([
    api("/api/references/stock-locations"),
    api("/api/suppliers?page_size=100").then((data) => data.items).catch(() => []),
  ]);
  await loadGeoRegions();
  const editable = canEdit("taminot");
  const supplierOptions = suppliers.map((supplier) => `<option value="${supplier.id}">${esc(supplier.name)}</option>`).join("");

  app.innerHTML = `<div class="page">
    ${detailBreadcrumb(["Ma'lumotnomalar", "Ombor joylari"])}
    <div class="page-head-row">
      <div class="page-title">
        <h1>Ombor joylari</h1>
        <p>Zaxira partiyasi turadigan joylar. Partiya turgan ombor o'chirilmaydi.</p>
      </div>
      <div class="actions"><button class="btn" type="button" data-nav="/references">Ma'lumotnomalar</button></div>
    </div>
    <section class="ops-table-card"><table class="ops-table"><thead><tr>
      <th>Nomi</th><th>Turi</th><th>Ta'minotchi</th><th>Joylashuv</th><th>Partiya</th><th></th>
    </tr></thead><tbody>${locations.length ? locations.map((row) => `<tr>
      <td data-noloc><strong>${esc(row.name)}</strong></td>
      <td>${fmt(optionLabel(stockLocationTypes, row.location_type))}</td>
      <td data-noloc>${fmt(row.supplier_name)}</td>
      <td data-noloc>${fmt([row.region, row.district, row.address].filter(Boolean).join(", "))}</td>
      <td data-noloc>${fmt(row.lot_count)}</td>
      <td>${editable ? `<button class="link-btn danger" type="button" data-delete-location="${row.id}" data-name="${esc(row.name)}">O'chirish</button>` : ""}</td>
    </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Ombor joyi kiritilmagan.</div></td></tr>`}</tbody></table></section>
    ${editable ? section("Yangi ombor joyi", `<form id="stock-location-form"><div class="grid">
      ${textField("name", "Nomi", "", "text", { required: true, maxlength: 255 })}
      ${selectField("location_type", "Turi", stockLocationTypes, "company_warehouse")}
      <label><span class="field-label-text">Ta'minotchi</span><select name="supplier_id"><option value="">Bog'lanmagan</option>${supplierOptions}</select></label>
      ${geoRegionField("")}
      ${geoDistrictField("", "")}
      ${textArea("address", "Manzil", "")}
    </div>
    <div class="form-footer"><button class="btn primary" type="submit">Qo'shish</button></div></form>`) : ""}
  </div>`;

  bindGeoFields(app);
  document.querySelector("#stock-location-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const supplierId = field(form, "supplier_id");
    try {
      await api("/api/references/stock-locations", {
        method: "POST",
        body: JSON.stringify({
          name: field(form, "name"),
          location_type: field(form, "location_type"),
          supplier_id: supplierId ? Number(supplierId) : null,
          region: field(form, "region"),
          district: field(form, "district"),
          address: field(form, "address"),
        }),
      });
      showToast("Ombor joyi qo'shildi.");
      await renderStockLocationsPage();
    } catch (error) {
      showToast(error.message, true);
    }
  });
  app.querySelectorAll("[data-delete-location]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmMsg(`«${button.dataset.name}» ombor joyi o'chiriladi. Davom etasizmi?`)) return;
      try {
        await api(`/api/references/stock-locations/${button.dataset.deleteLocation}`, { method: "DELETE" });
        showToast("Ombor joyi o'chirildi.");
        await renderStockLocationsPage();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}
