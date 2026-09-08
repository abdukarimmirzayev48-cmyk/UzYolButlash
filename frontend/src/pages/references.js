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
      { key: "clients", label: "Tizim tashkilotlari", path: "/clients", hint: "Tashkilot kartochkasi, rekvizitlar va reyestr ma'lumoti" },
      { key: "suppliers", label: "Ta'minotchilar", path: "/suppliers", hint: "Yetkazib beruvchilar va ularning shartlari" },
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
