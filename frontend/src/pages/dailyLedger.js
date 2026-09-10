// Kunlik provodka -- bir kunda bo'lgan barcha pul harakati.
//
// Tizimda pul faqat hisob-faktura orqali ko'rinardi. Ish haqi, soliq,
// yoqilg'i, bank komissiyasi -- kundalik xarajatlarning katta qismi
// hech qayerda yozilmasdi, ya'ni «bugun qancha kirdi va qayerga ketdi»
// degan savolga tizim javob bera olmasdi.

const LEDGER_MISMATCH = "Kun boshi qoldig'i o'tgan kunning oxirgi qoldig'iga mos emas";
const LEDGER_EMPTY = "Jurnalda birorta satr yo'q.";

function ledgerStatusChip(status) {
  return status === "closed"
    ? statusChip({ label: "Yopilgan", tone: "success" })
    : statusChip({ label: "Ochiq", tone: "warning" });
}

// --- Ro'yxat ---

async function renderDailyLedgerList() {
  const params = new URLSearchParams(location.search);
  const query = new URLSearchParams();
  ["date_from", "date_to", "ledger_status", "page"].forEach((key) => {
    if (params.get(key)) query.set(key, params.get(key));
  });
  app.innerHTML = `<div class="page ops-page"><div class="empty">Yuklanmoqda...</div></div>`;
  const [data, overview] = await Promise.all([
    api(`/api/daily-ledgers?${query.toString()}`),
    api(`/api/daily-ledgers/overview?${new URLSearchParams({
      ...(params.get("date_from") ? { date_from: params.get("date_from") } : {}),
      ...(params.get("date_to") ? { date_to: params.get("date_to") } : {}),
    }).toString()}`),
  ]);
  const editable = canEdit("moliya");

  app.innerHTML = opsListPage({
    title: "Kunlik provodka",
    subtitle: "Kuniga bir marta: kimdan nima uchun pul tushdi va nimaga chiqdi",
    createPath: editable ? "/daily-ledgers/new" : null,
    createLabel: "Kun ochish",
    clearPath: "/daily-ledgers",
    counter: `${data.total} ta kun`,
    statCards: [
      { label: "Kirim", value: fmtMoney(overview.total_incoming) },
      { label: "Chiqim", value: fmtMoney(overview.total_outgoing) },
      { label: "Farq", value: fmtMoney(overview.net), cls: numberValue(overview.net) < 0 ? "ops-warning" : "" },
      { label: "Yopilmagan kun", value: String(overview.open_days), cls: overview.open_days ? "ops-warning" : "" },
    ],
    formId: "ledger-search-form",
    filters: `
      ${textField("date_from", "Sanadan", params.get("date_from") || "", "date")}
      ${textField("date_to", "Sanagacha", params.get("date_to") || "", "date")}
      ${selectField("ledger_status", "Holati", [["", "Barchasi"], ...ledgerStatuses], params.get("ledger_status") || "")}
    `,
    headers: ["Sana", "Kun boshi", "Kirim", "Chiqim", "Kun oxiri", "Satr", "Holati", ""],
    rows: data.items.map((row) => `
      <tr>
        <td><button class="ops-primary-link" data-nav="/daily-ledgers/${row.id}" data-noloc>${fmtDayOnly(row.entry_date)}</button></td>
        <td class="number-cell" data-noloc>${fmtMoney(row.opening_balance)}</td>
        <td class="number-cell" data-noloc>${fmtMoney(row.summary.total_incoming)}</td>
        <td class="number-cell" data-noloc>${fmtMoney(row.summary.total_outgoing)}</td>
        <td class="number-cell" data-noloc>${fmtMoney(row.summary.closing_balance)}</td>
        <td class="number-cell" data-noloc>${row.summary.lines_count}</td>
        <td>${ledgerStatusChip(row.status)}${row.summary.balance_mismatch ? statusChip({ label: "Qoldiq mos emas", tone: "warning" }) : ""}</td>
        <td><div class="ops-row-actions"><button class="link-btn" data-nav="/daily-ledgers/${row.id}">Ochish</button></div></td>
      </tr>
    `).join(""),
    emptyText: "Hali birorta kun ochilmagan.",
    colspan: 8,
    footer: `${paginationBlock(data, "ledger")}${ledgerOverviewPanel(overview)}`,
  });

  bindOpsSearch("ledger-search-form", "/daily-ledgers", ["date_from", "date_to", "ledger_status"]);
  bindOpsPagination("ledger", "/daily-ledgers");
  document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.nav)));
}

// Davr kesimi: pul qaysi moddaga ketgani. Kunlik jadval «qancha»
// degan savolga javob beradi, bu panel «nimaga» degan savolga.
function ledgerOverviewPanel(overview) {
  if (!overview.categories?.length) return "";
  const rows = overview.categories.map((row) => `
    <tr>
      <td>${optionLabel(ledgerDirections, row.direction)}</td>
      <td>${optionLabel(ledgerCategories, row.category)}</td>
      <td class="number-cell" data-noloc>${row.lines_count}</td>
      <td class="number-cell" data-noloc>${fmtMoney(row.amount)}</td>
    </tr>`).join("");
  return section("Moddalar bo'yicha", `<div class="table-scroll"><table class="ops-table">
    <thead><tr><th>Yo'nalish</th><th>Modda</th><th>Satr</th><th>Summa</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`);
}

// --- Yangi kun ---

async function renderNewDailyLedger() {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const suggested = await api("/api/daily-ledgers/next-date");
  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>Yangi kun</h1>
          <p>Kun ochilgach, kirim va chiqim satrlari qo'shiladi.</p>
        </div>
        <div class="actions"><button class="btn" data-nav="/daily-ledgers">Orqaga</button></div>
      </div>
      <form id="ledger-form">
        ${section("Kun", `
          <div class="grid">
            ${textField("entry_date", "Sana", suggested.entry_date || todayIso(), "date", { required: true })}
            ${textField("opening_balance", "Kun boshi qoldig'i", suggested.opening_balance ?? "", "number")}
          </div>
          <p class="form-hint">Qoldiq o'tgan kunning oxiridan to'ldiriladi. Bank ko'chirmasidagi raqam boshqacha bo'lsa, shu yerda tuzating.</p>
          <div class="grid">${textArea("notes", "Izoh", "")}</div>
        `)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="/daily-ledgers">Bekor qilish</button>
          <button type="submit" class="btn primary">Kunni ochish</button>
        </div>
      </form>
    </div>`;
  document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.nav)));
  document.querySelector("#ledger-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const created = await api("/api/daily-ledgers", {
        method: "POST",
        body: JSON.stringify({
          entry_date: field(form, "entry_date"),
          opening_balance: normalizeNumberInputValue(field(form, "opening_balance")) || "0",
          notes: field(form, "notes") || null,
        }),
      });
      showToast("Kun ochildi.");
      navigate(`/daily-ledgers/${created.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// --- Kun kartochkasi ---

function ledgerLineRows(ledger, direction, canChange) {
  const rows = (ledger.lines || []).filter((line) => line.direction === direction);
  if (!rows.length) {
    return `<tr><td colspan="${canChange ? 6 : 5}"><div class="empty">${direction === "incoming" ? "Kirim satri yo'q." : "Chiqim satri yo'q."}</div></td></tr>`;
  }
  return rows.map((line) => `
    <tr>
      <td>${optionLabel(ledgerCategories, line.category)}</td>
      <td data-noloc>${esc(line.client_name || line.supplier_name || line.counterparty || "")}</td>
      <td data-noloc>${esc(line.purpose || "")}</td>
      <td data-noloc>${fmt(line.reference_number)}</td>
      <td class="number-cell" data-noloc>${fmtMoney(line.amount)}</td>
      ${canChange ? `<td><div class="ops-row-actions">
        <button class="link-btn" type="button" data-edit-line="${line.id}">Tahrirlash</button>
        <button class="link-btn" style="color:var(--danger)" type="button" data-delete-line="${line.id}">O'chirish</button>
      </div></td>` : ""}
    </tr>`).join("");
}

function ledgerSideSection(ledger, direction, editable) {
  const isIn = direction === "incoming";
  const total = isIn ? ledger.summary.total_incoming : ledger.summary.total_outgoing;
  const canChange = editable && ledger.status !== "closed";
  const headers = ["Modda", isIn ? "Kimdan" : "Kimga", "Nima uchun", "To'lov hujjati", "Summa"];
  return section(isIn ? "Kirim" : "Chiqim", `
    ${canChange ? `<div class="actions"><button class="btn" type="button" data-add-line="${direction}">${isIn ? "Kirim qo'shish" : "Chiqim qo'shish"}</button></div>` : ""}
    <div class="table-scroll"><table class="ops-table">
      <thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}${canChange ? "<th></th>" : ""}</tr></thead>
      <tbody>${ledgerLineRows(ledger, direction, canChange)}</tbody>
      <tfoot><tr><td colspan="4"><strong>Jami</strong></td><td class="number-cell" data-noloc><strong>${fmtMoney(total)}</strong></td>${canChange ? "<td></td>" : ""}</tr></tfoot>
    </table></div>`);
}

async function renderDailyLedgerDetail(id) {
  app.innerHTML = `<div class="page"><div class="empty">Yuklanmoqda...</div></div>`;
  const ledger = await api(`/api/daily-ledgers/${id}`);
  const editable = canEdit("moliya");
  const open = ledger.status !== "closed";
  app.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1><span>Kunlik provodka</span><span data-noloc>: ${esc(fmtDayOnly(ledger.entry_date))}</span></h1>
          <p>${ledger.status === "closed" ? "Kun yopilgan -- o'zgartirish uchun qayta oching." : "Kun ochiq -- satrlar qo'shiladi va tuzatiladi."}</p>
        </div>
        <div class="actions">
          <button class="btn" data-nav="/daily-ledgers">Orqaga</button>
          ${editable && open ? `<button class="btn primary" type="button" data-close-ledger>Kunni yopish</button>` : ""}
          ${editable && !open ? `<button class="btn" type="button" data-reopen-ledger>Qayta ochish</button>` : ""}
        </div>
      </div>
      ${workflowWarningsPanel(ledger.warnings || [])}
      ${summaryCards([
        ["Holati", ledger.status === "closed" ? "Yopilgan" : "Ochiq"],
        ["Kun boshi", fmtMoney(ledger.opening_balance)],
        ["Kirim", fmtMoney(ledger.summary.total_incoming)],
        ["Chiqim", fmtMoney(ledger.summary.total_outgoing)],
        ["Kun oxiri", fmtMoney(ledger.summary.closing_balance)],
      ])}
      ${ledgerSideSection(ledger, "incoming", editable)}
      ${ledgerSideSection(ledger, "outgoing", editable)}
      ${section("Kun ma'lumotlari", detailList([
        ["Sana", fmtDayOnly(ledger.entry_date)],
        ["O'tgan kun oxiri", ledger.summary.previous_closing_balance == null ? null : fmtMoney(ledger.summary.previous_closing_balance)],
        ["Kunni ochgan", ledger.created_by],
        ["Kunni yopgan", ledger.closed_by],
        ["Yopilgan vaqt", ledger.closed_at ? fmtDate(ledger.closed_at) : null],
        ["Izoh", ledger.notes],
      ]))}
      ${section("Tarix", tableOrEmpty(ledger.notes_history, ["Vaqt", "Kim", "Izoh"],
        (row) => `<tr><td data-noloc>${fmtDate(row.created_at)}</td><td data-noloc>${fmt(row.created_by)}</td><td data-noloc>${esc(row.note || "")}</td></tr>`,
        "Hali yozuv yo'q."))}
    </div>`;

  document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.nav)));
  if (!editable) return;
  document.querySelectorAll("[data-add-line]").forEach((button) => {
    button.addEventListener("click", () => openLedgerLineModal(ledger, button.dataset.addLine));
  });
  document.querySelectorAll("[data-edit-line]").forEach((button) => {
    const line = (ledger.lines || []).find((row) => String(row.id) === button.dataset.editLine);
    button.addEventListener("click", () => openLedgerLineModal(ledger, line.direction, line));
  });
  document.querySelectorAll("[data-delete-line]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmMsg("Bu satr o'chirilsinmi?")) return;
      try {
        await api(`/api/daily-ledger-lines/${button.dataset.deleteLine}`, { method: "DELETE" });
        showToast("Satr o'chirildi.");
        renderDailyLedgerDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
  document.querySelector("[data-close-ledger]")?.addEventListener("click", () => closeDailyLedger(ledger));
  document.querySelector("[data-reopen-ledger]")?.addEventListener("click", () => reopenDailyLedger(ledger));
}

// --- Satr oynasi ---

async function openLedgerLineModal(ledger, direction, line = null) {
  const isIn = direction === "incoming";
  // Kartochkalar faqat oyna ochilganda so'raladi: kun kartochkasi
  // ularsiz ham to'liq ko'rinadi va tez ochiladi.
  const [clients, suppliers] = await Promise.all([
    isIn ? fetchAllClients() : Promise.resolve([]),
    isIn ? Promise.resolve([]) : api("/api/suppliers?page_size=100").then((data) => data.items || data).catch(() => []),
  ]);
  document.querySelector(".modal-backdrop")?.remove();
  const partyOptions = isIn
    ? [["", "Bog'lanmagan"], ...clients.map((row) => [String(row.id), row.name])]
    : [["", "Bog'lanmagan"], ...suppliers.map((row) => [String(row.id), row.name])];
  const selectedParty = isIn ? line?.client_id : line?.supplier_id;

  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="ledger-line-title">
      <div class="modal-header">
        <h2 id="ledger-line-title">${line ? "Satrni tahrirlash" : (isIn ? "Kirim qo'shish" : "Chiqim qo'shish")}</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="ledger-line-form">
        <div class="modal-body">
          <div class="grid">
            ${selectField("category", "Modda", ledgerCategoriesFor(direction), line?.category || "", { required: true })}
            ${textField("amount", "Summa", line?.amount ?? "", "number", { required: true })}
          </div>
          <div class="grid">
            ${selectField("party_id", isIn ? "Mijoz" : "Ta'minotchi", partyOptions, selectedParty ? String(selectedParty) : "")}
            ${textField("counterparty", isIn ? "Kimdan" : "Kimga", line?.counterparty ?? "", "text", { required: true })}
          </div>
          <p class="form-hint">Kartochka tanlansa, nom shundan to'ldiriladi. Soliq, bank yoki xodim uchun kartochka shart emas -- nomni qo'lda yozing.</p>
          <div class="grid">
            ${textField("purpose", "Nima uchun", line?.purpose ?? "", "text", { required: true })}
            ${textField("reference_number", "To'lov hujjati raqami", line?.reference_number ?? "", "text")}
          </div>
          <div class="grid">
            ${textField("bank_account", "Hisob raqami", line?.bank_account ?? "", "text")}
            ${textArea("notes", "Izoh", line?.notes ?? "")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit">Saqlash</button>
        </div>
      </form>
    </section>
  </div>`);

  const backdrop = document.querySelector(".modal-backdrop");
  localizeDom(backdrop);
  const form = document.querySelector("#ledger-line-form");
  const close = () => backdrop?.remove();
  backdrop?.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]")) close();
  });
  // Kartochka tanlangach nom o'zi yoziladi: bir xil tomon uch xil
  // nom ostida yozilib ketmasligi uchun.
  form?.elements.party_id?.addEventListener("change", (event) => {
    const label = event.target.selectedOptions[0]?.textContent?.trim();
    if (event.target.value && label) form.elements.counterparty.value = label;
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const partyId = field(form, "party_id");
    const payload = {
      direction,
      category: field(form, "category"),
      counterparty: field(form, "counterparty"),
      purpose: field(form, "purpose"),
      amount: normalizeNumberInputValue(field(form, "amount")),
      reference_number: field(form, "reference_number") || null,
      bank_account: field(form, "bank_account") || null,
      notes: field(form, "notes") || null,
      client_id: isIn && partyId ? Number(partyId) : null,
      supplier_id: !isIn && partyId ? Number(partyId) : null,
    };
    if (!payload.counterparty) return showToast(isIn ? "Kimdan tushgani yozilishi shart." : "Kimga chiqqani yozilishi shart.", true);
    if (!payload.purpose) return showToast("Nima uchun ekanini yozing.", true);
    if (!numberValue(payload.amount)) return showToast("Summa 0 dan katta bo'lishi kerak.", true);
    try {
      if (line) {
        await api(`/api/daily-ledger-lines/${line.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Satr yangilandi.");
      } else {
        await api(`/api/daily-ledgers/${ledger.id}/lines`, { method: "POST", body: JSON.stringify(payload) });
        showToast("Satr qo'shildi.");
      }
      close();
      renderDailyLedgerDetail(ledger.id);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  form?.elements.amount?.focus();
}

// --- Yopish va qayta ochish ---

async function closeDailyLedger(ledger) {
  const warnings = ledger.warnings || [];
  const mismatch = warnings.some((warning) => warning.startsWith(LEDGER_MISMATCH));
  const empty = warnings.includes(LEDGER_EMPTY);
  if (empty && !confirmMsg("Jurnalda birorta satr yo'q. Kun shundayligicha yopilsinmi?")) return;
  if (mismatch && !confirmMsg("Kun boshi qoldig'i o'tgan kunning oxiriga mos emas. Bu oradagi kunda satr tushib qolganini bildiradi. Baribir yopilsinmi?")) return;
  try {
    await api(`/api/daily-ledgers/${ledger.id}/close`, {
      method: "POST",
      body: JSON.stringify({ allow_empty: empty, allow_balance_mismatch: mismatch }),
    });
    showToast("Kun yopildi.");
    renderDailyLedgerDetail(ledger.id);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function reopenDailyLedger(ledger) {
  const answer = await reasonDialog({
    title: "Kunni qayta ochish",
    message: "Yopilgan kun ochilishi tekshiruv uchun voqea. Sababi tarixga yoziladi.",
    confirmLabel: "Qayta ochish",
  });
  if (!answer) return;
  try {
    await api(`/api/daily-ledgers/${ledger.id}/reopen`, { method: "POST", body: JSON.stringify({ reason: answer }) });
    showToast("Kun qayta ochildi.");
    renderDailyLedgerDetail(ledger.id);
  } catch (error) {
    showToast(error.message, true);
  }
}
