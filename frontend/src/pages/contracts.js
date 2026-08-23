async function fetchClientsForSelect(selectedId = null) {
  const clients = await fetchAllClients();
  return clients.map((client) => `
    <option value="${client.id}" ${Number(selectedId) === client.id ? "selected" : ""}>
      ${esc(client.name)}${client.inn ? ` - ${esc(client.inn)}` : ""}
    </option>
  `).join("");
}

let _contractPageProducts = [];
// The score is a claim about a parse, and a number alone reads as a guarantee.
// Saying what it means keeps "82%" from being taken as "checked".
function parseConfidenceLabel(contract) {
  const value = Number(contract.parse_confidence || 0);
  if (!contract.parse_confidence) return null;
  const percent = Math.round(value * 100);
  // Written out as three whole sentences rather than assembled from a number
  // and a phrase: the Cyrillic dictionary matches a complete "{n}% ..." string,
  // and a verdict glued on at runtime matches nothing.
  if (percent >= 100) return `${percent}% — baribir PDF bilan solishtiring`;
  if (percent >= 80) return `${percent}% — ayrim maydonlarni tekshiring`;
  return `${percent}% — diqqat bilan tekshiring`;
}

// The paper contract states the price with VAT ("QQS bilan birga"); the column
// stores it without, so that quantity x unit_price is always the subtotal.
// Showing both means a reader can check the record against the document
// without doing the arithmetic in their head.
function unitPriceWithVat(item) {
  const quantity = numberValue(item.quantity);
  if (!quantity) return null;
  return numberValue(item.total_with_vat) / quantity;
}


function buildProductOptions(products, selectedId = null) {
  const grouped = {};
  products.forEach((p) => {
    const cat = p.category?.name || "Boshqa";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });
  let html = `<option value="">Boshqa (qo'lda kiriting)</option>`;
  for (const [cat, prods] of Object.entries(grouped)) {
    html += `<optgroup label="${esc(cat)}">`;
    for (const p of prods) {
      const sel = Number(selectedId) === Number(p.id) ? " selected" : "";
      html += `<option value="${p.id}"${sel} data-name="${esc(p.name)}" data-unit="${esc(p.unit)}">${esc(p.name)}</option>`;
    }
    html += `</optgroup>`;
  }
  return html;
}

function bindProductSelects(form) {
  form.querySelectorAll("[data-item-product-select]").forEach((sel) => {
    // Qator jadvalida maydonlar `product_name_0` deb, bitta mahsulot
    // oynasida esa oddiy `product_name` deb ataladi. Oyna bo'sh qo'shimcha
    // bilan belgilanadi, shunda katalogdan tanlash ikkalasida ham ishlaydi.
    const suffix = sel.dataset.itemProductSelect === "" ? "" : `_${sel.dataset.itemProductSelect}`;
    const applySelection = () => {
      const opt = sel.options[sel.selectedIndex];
      const nameInput = form.elements[`product_name${suffix}`];
      const unitInput = form.elements[`unit${suffix}`];
      if (sel.value && opt?.dataset.name) {
        if (nameInput) { nameInput.value = opt.dataset.name; nameInput.readOnly = true; }
        if (unitInput) { unitInput.value = opt.dataset.unit || ""; unitInput.readOnly = true; }
      } else {
        if (nameInput) nameInput.readOnly = false;
        if (unitInput) unitInput.readOnly = false;
      }
    };
    sel.addEventListener("change", () => {
      applySelection();
      // Katalogdan tanlagach keyingi ish -- miqdorni kiritish. Fokusni o'zimiz
      // ko'chirmasak, foydalanuvchi ro'yxat yopilgan joyni bosadi va o'sha
      // paytda qator surilib ulgurgan bo'lishi mumkin.
      form.elements[`quantity${suffix}`]?.focus();
    });
    if (sel.value) applySelection();
  });
}

function contractItemRow(item = {}, index = 0, products = []) {
  return `
    <div class="item-row" data-item-row>
      <label>Mahsulot katalogi
        <select name="product_id_${index}" data-item-product-select="${index}">
          ${buildProductOptions(products, item.product_id)}
        </select>
      </label>
      ${textField(`product_name_${index}`, "Nomi (qo'lda)", item.product_name || "")}
      ${textField(`product_code_${index}`, "Kodi", item.product_code || "")}
      ${textField(`unit_${index}`, "Birlik", item.unit || "tonna")}
      ${textField(`quantity_${index}`, "Miqdor", item.quantity ?? "", "number")}
      ${textField(`unit_price_${index}`, "Birlik narxi", item.unit_price ?? "", "number")}
      ${textField(`vat_rate_${index}`, "QQS %", item.vat_rate ?? 12, "number")}
      <button type="button" class="btn danger" data-remove-item>Olib tashlash</button>
    </div>
  `;
}

function calculateContractForm(form) {
  const rows = [...form.querySelectorAll("[data-item-row]")];
  let subtotal = 0;
  let vat = 0;
  let quantity = 0;
  rows.forEach((row) => {
    const qtyInput = row.querySelector("[name^='quantity_']");
    const priceInput = row.querySelector("[name^='unit_price_']");
    const vatInput = row.querySelector("[name^='vat_rate_']");
    const rowQty = numberValue(qtyInput.value);
    const rowSubtotal = rowQty * numberValue(priceInput.value);
    const rowVat = rowSubtotal * numberValue(vatInput.value || 12) / 100;
    quantity += rowQty;
    subtotal += rowSubtotal;
    vat += rowVat;
  });
  const total = subtotal + vat;
  const advancePercent = numberValue(form.elements.advance_percent?.value || 30);
  const advanceAmount = total * advancePercent / 100;
  const remainingAmount = total - advanceAmount;
  form.querySelector("[data-total-quantity]").textContent = fmtQty(quantity);
  form.querySelector("[data-subtotal]").textContent = fmtMoney(subtotal);
  form.querySelector("[data-vat]").textContent = fmtMoney(vat);
  form.querySelector("[data-total]").textContent = fmtMoney(total);
  form.querySelector("[data-advance-amount]").textContent = fmtMoney(advanceAmount);
  form.querySelector("[data-remaining-amount]").textContent = fmtMoney(remainingAmount);
  if (form.elements.remaining_percent) {
    form.elements.remaining_percent.value = Math.max(0, 100 - advancePercent);
  }
}

function collectContractItems(form) {
  return [...form.querySelectorAll("[data-item-row]")].map((row) => {
    const get = (prefix) => row.querySelector(`[name^='${prefix}_']`)?.value.trim();
    const getNumber = (prefix) => normalizeNumberInputValue(get(prefix));
    const productId = get("product_id");
    return {
      product_id: productId ? Number(productId) : null,
      product_name: get("product_name"),
      product_code: get("product_code") || null,
      unit: get("unit"),
      quantity: getNumber("quantity"),
      unit_price: getNumber("unit_price"),
      vat_rate: getNumber("vat_rate") || "12",
    };
  }).filter((item) => item.product_name && item.unit && Number(item.quantity) > 0);
}

function collectContractPayload(form) {
  return {
    client_id: Number(field(form, "client_id")),
    contract_number: field(form, "contract_number"),
    contract_date: field(form, "contract_date"),
    valid_until: field(form, "valid_until"),
    title: field(form, "title"),
    status: field(form, "status") || "draft",
    currency: "UZS",
    notes: field(form, "notes"),
    items: collectContractItems(form),
    payment_terms: {
      advance_percent: field(form, "advance_percent") || "30",
      advance_due_days: Number(field(form, "advance_due_days") || 10),
      batch_payment_due_days: Number(field(form, "batch_payment_due_days") || 3),
      remaining_payment_rule: field(form, "remaining_payment_rule") || CONTRACT_REMAINING_RULE,
      notes: field(form, "payment_notes"),
    },
    transport_terms: {
      transport_payment_type: field(form, "transport_payment_type") || "separate_invoice",
      delivery_method: field(form, "delivery_method") || "mixed",
      notes: field(form, "transport_notes"),
    },
  };
}

async function contractForm(contract = null) {
  const [clientOptions, products] = await Promise.all([
    fetchClientsForSelect(contract?.client_id),
    api("/api/products"),
  ]);
  _contractPageProducts = products;
  const today = new Date().toISOString().slice(0, 10);
  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const payment = contract?.payment_terms || {};
  const transport = contract?.transport_terms || {};
  const rows = contract?.items?.length ? contract.items : [{}];
  return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>${contract ? "Shartnomani tahrirlash" : "Yangi shartnoma"}</h1>
          <p>Contract data, specification, payment terms, transport terms, and documents.</p>
        </div>
        <div class="actions"><button class="btn" data-nav="${contract ? `/contracts/${contract.id}` : "/contracts"}">Back</button></div>
      </div>
      <form id="contract-form">
        ${section("Basic information", `
          <div class="grid">
            ${textField("contract_number", "Shartnoma raqami", contract?.contract_number, "text", { required: true, maxlength: 128 })}
            ${textField("contract_date", "Shartnoma sanasi", contract?.contract_date || today, "date", { required: true })}
            ${textField("valid_until", "Amal qilish muddati", contract?.valid_until || oneYearLater, "date", { required: true })}
            <label><span class="field-label-text">Mijoz</span>${selectSearch("client_id", "Mijoz nomi yoki STIR bo'yicha qidiring")}<select name="client_id"><option value="">Mijozni tanlang</option>${clientOptions}</select></label>
            ${textField("title", "Sarlavha", contract?.title, "text", { maxlength: 255 })}
            ${contract ? `<label><span class="field-label-text">Status</span><input value="${esc(optionLabel(contractStatuses, contract.status))}" readonly /><small class="field-helper">Holat shartnoma kartochkasidagi tugmalar orqali o'zgartiriladi — shunda kim va nima uchun o'zgartirgani yozib boriladi.</small></label>` : selectField("status", "Status", contractStatuses, "draft")}
            ${contract?.created_by ? `<label><span class="field-label-text">Kim yaratgan</span><input value="${esc(contract.created_by)}" readonly data-noloc /></label>` : ""}
            ${textArea("notes", "Izohlar", contract?.notes, { maxlength: 2000 })}
          </div>
        `)}
        ${section("Specification", `
          <div id="contract-items">${rows.map((item, i) => contractItemRow(item, i, products)).join("")}</div>
          <button type="button" class="btn" id="add-item">Mahsulot qo'shish</button>
          <div class="totals-bar">
            <div class="total-box"><span>Total quantity</span><strong data-total-quantity>${dash}</strong></div>
            <div class="total-box"><span>Subtotal</span><strong data-subtotal>${dash}</strong></div>
            <div class="total-box"><span>VAT amount</span><strong data-vat>${dash}</strong></div>
            <div class="total-box"><span>Total amount</span><strong data-total>${dash}</strong></div>
          </div>
        `)}
        ${section("Payment terms", `
          <div class="grid">
            ${textField("advance_percent", "Avans foizi", payment.advance_percent ?? 30, "number")}
            ${textField("remaining_percent", "Qoldiq foizi (avtomatik)", payment.remaining_percent ?? 70, "number", { readonly: true, disabled: true })}
            ${textField("advance_due_days", "Avans muddati, kun", payment.advance_due_days ?? 10, "number")}
            ${textField("batch_payment_due_days", "Partiya to'lovi muddati, kun", payment.batch_payment_due_days ?? 3, "number")}
            ${textArea("remaining_payment_rule", "Qoldiq to'lov qoidasi", payment.remaining_payment_rule || CONTRACT_REMAINING_RULE, { maxlength: 2000 })}
            ${textArea("payment_notes", "Izohlar", payment.notes, { maxlength: 2000 })}
          </div>
          <div class="totals-bar">
            <div class="total-box"><span>Advance amount</span><strong data-advance-amount>${dash}</strong></div>
            <div class="total-box"><span>Remaining amount</span><strong data-remaining-amount>${dash}</strong></div>
          </div>
        `)}
        ${section("Transport terms", `
          <div class="grid">
            ${selectField("transport_payment_type", "Transport payment type", transportPaymentTypes, transport.transport_payment_type || "separate_invoice")}
            ${selectField("delivery_method", "Delivery method", deliveryMethods, transport.delivery_method || "mixed")}
            ${textArea("transport_notes", "Izohlar", transport.notes, { maxlength: 2000 })}
          </div>
        `)}
        ${section("Documents", `<div class="empty">Contract-level document metadata can be added from the Documents tab after saving.</div>`)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="${contract ? `/contracts/${contract.id}` : "/contracts"}">Bekor qilish</button>
          <button type="submit" class="btn primary">Saqlash</button>
        </div>
      </form>
    </div>
  `;
}

function bindContractForm(contract = null) {
  const form = document.querySelector("#contract-form");
  const refresh = () => calculateContractForm(form);
  bindProductSelects(form);
  form.addEventListener("input", refresh);
  document.querySelector("#add-item").addEventListener("click", () => {
    const index = form.querySelectorAll("[data-item-row]").length;
    document.querySelector("#contract-items").insertAdjacentHTML("beforeend", contractItemRow({}, index, _contractPageProducts));
    bindProductSelects(form);
    refresh();
  });
  form.addEventListener("click", (event) => {
    if (!event.target.matches("[data-remove-item]")) return;
    if (form.querySelectorAll("[data-item-row]").length <= 1) {
      showToast("Shartnomada kamida bitta mahsulot bo'lishi kerak.", true);
      return;
    }
    event.target.closest("[data-item-row]").remove();
    refresh();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectContractPayload(form);
    if (!payload.client_id || !payload.contract_number || !payload.contract_date || !payload.valid_until) {
      showToast("Mijoz, shartnoma raqami, sanasi va amal muddati to'ldirilishi shart.", true);
      return;
    }
    if (!payload.items.length || payload.items.some((item) => !item.product_name || !item.unit || numberValue(item.quantity) <= 0)) {
      showToast("Kamida bitta to'g'ri to'ldirilgan mahsulot qatorini qo'shing.", true);
      return;
    }
    try {
      const saved = await api(contract ? `/api/contracts/${contract.id}` : "/api/contracts", {
        method: contract ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      showToast("Shartnoma saqlandi.");
      navigate(`/contracts/${saved.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  refresh();
}

function contractWizardStepper(step) {
  const steps = ["Mijoz", "Asosiy", "Mahsulotlar", "To'lov", "Transport", "Hujjatlar", "Tasdiqlash"];
  if (window.BitumFrontend?.components?.stepper) return window.BitumFrontend.components.stepper(steps, step);
  return `<div class="batch-wizard-stepper">${steps.map((label, index) => {
    const key = index + 1;
    const cls = key < step ? "completed" : key === step ? "current" : "upcoming";
    return `<div class="batch-wizard-step ${cls}"><span>${key}</span><strong>${label}</strong></div>`;
  }).join("")}</div>`;
}

async function contractWizardClientOptions(selectedId = "") {
  const clients = await fetchAllClients();
  return [["", "Mijozni tanlang"], ...clients.map((client) => [
    String(client.id),
    `${client.name}${client.inn ? ` - ${client.inn}` : ""}`,
  ])];
}

function contractWizardPrimaryContact(client) {
  return (client?.contacts || []).find((item) => item.is_primary) || client?.contacts?.[0] || null;
}

function contractWizardLegalAddress(client) {
  return (client?.addresses || []).find((item) => item.address_type === "legal") || client?.addresses?.[0] || null;
}

function contractWizardPrimaryBank(client) {
  return (client?.bank_accounts || []).find((item) => item.is_primary) || client?.bank_accounts?.[0] || null;
}

function contractWizardAddressText(address) {
  if (!address) return null;
  return [address.region, address.district, address.address].filter(Boolean).join(", ");
}

function contractWizardBankText(bank) {
  if (!bank) return null;
  return [bank.bank_name, bank.mfo ? `MFO ${bank.mfo}` : "", bank.account_number].filter(Boolean).join(" · ");
}

function contractWizardClientWarnings(client) {
  if (!client) return [];
  const messages = [];
  if (!contractWizardPrimaryBank(client)) messages.push("Bank rekvizitlari kiritilmagan.");
  if (!contractWizardLegalAddress(client)) messages.push("Yuridik manzil kiritilmagan.");
  if (!contractWizardPrimaryContact(client)) messages.push("Asosiy kontakt kiritilmagan.");
  return messages;
}

function contractWizardTotals(state) {
  let quantity = 0;
  let subtotal = 0;
  let vat = 0;
  const rows = (state.items || []).map((item) => {
    const rowQuantity = numberValue(item.quantity);
    const rowSubtotal = rowQuantity * numberValue(item.unit_price);
    const rowVat = rowSubtotal * numberValue(item.vat_rate || 12) / 100;
    quantity += rowQuantity;
    subtotal += rowSubtotal;
    vat += rowVat;
    return { ...item, subtotal: rowSubtotal, vat_amount: rowVat, total_with_vat: rowSubtotal + rowVat };
  });
  const total = subtotal + vat;
  const advancePercent = numberValue(state.advancePercent || 30);
  const remainingPercent = Math.max(0, 100 - advancePercent);
  const advanceAmount = total * advancePercent / 100;
  return {
    rows,
    quantity,
    subtotal,
    vat,
    total,
    advancePercent,
    remainingPercent,
    advanceAmount,
    remainingAmount: total - advanceAmount,
  };
}

function contractWizardClientPanel(state) {
  const contact = contractWizardPrimaryContact(state.client);
  const address = contractWizardLegalAddress(state.client);
  const bank = contractWizardPrimaryBank(state.client);
  const warnings = state.client ? contractWizardClientWarnings(state.client) : [];
  return `${selectSearch("client_id", "Mijoz nomi yoki STIR bo'yicha qidiring")}${selectField("client_id", "Mijoz", state.clientOptions || [["", "Mijozni tanlang"]], String(state.clientId || ""), { required: true })}
    ${state.client ? `
      ${warnings.length ? workflowWarningsPanel(["Mijoz ma'lumotlari to'liq emas. Shartnoma yaratishdan oldin mijoz rekvizitlarini tekshiring.", ...warnings]) : ""}
      ${summaryCards([
        ["Mijoz nomi", fmt(state.client.name)],
        ["STIR", fmt(state.client.inn)],
        ["Telefon", fmt(state.client.phone || contact?.phone)],
        ["Asosiy kontakt", fmt(contact?.full_name)],
        ["Viloyat", fmt(address?.region)],
        ["Yuridik manzil", fmt(contractWizardAddressText(address))],
        ["Bank rekvizitlari", fmt(contractWizardBankText(bank))],
      ])}
    ` : `<div class="empty compact">Shartnoma yaratish uchun mavjud mijozni tanlang.</div>`}`;
}

function contractWizardMainPanel(state) {
  return `<div class="grid">
    ${textField("contract_number", "Shartnoma raqami", state.contractNumber || "", "text", { required: true })}
    ${textField("contract_date", "Shartnoma sanasi", state.contractDate || "", "date", { required: true })}
    ${textField("valid_until", "Amal qilish muddati", state.validUntil || "", "date", { required: true })}
    ${textField("title", "Sarlavha", state.title || "")}
    ${selectField("status", "Status", contractStatuses, state.status || "draft", { required: true })}
    ${selectField("currency", "Valyuta", [["UZS", "UZS"]], state.currency || "UZS", { required: true })}
    ${textArea("notes", "Izoh", state.notes || "")}
  </div>`;
}

function contractWizardProductsPanel(state) {
  const totals = contractWizardTotals(state);
  const rows = state.items || [];
  const products = state.products || [];
  return `<div class="fixed-item-table cols-contract">${tableOrEmpty(rows, ['Mahsulot <span class="required-mark">*</span>', "Mahsulot kodi", 'Birlik <span class="required-mark">*</span>', 'Miqdor <span class="required-mark">*</span>', 'Birlik narxi <span class="required-mark">*</span>', 'QQS % <span class="required-mark">*</span>', "Oraliq summa", "QQS summasi", "Jami summa", ""], (item, index) => {
    const calc = totals.rows[index] || {};
    return `<tr data-contract-wizard-item="${index}">
      <td>
        <select name="product_id_${index}" data-item-product-select="${index}" style="width:100%;margin-bottom:4px">
          ${buildProductOptions(products, item.product_id)}
        </select>
        <input name="product_name_${index}" value="${esc(item.product_name || "")}" placeholder="Mahsulot nomi" style="width:100%" />
      </td>
      <td><input name="product_code_${index}" value="${esc(item.product_code || "")}" /></td>
      <td><input name="unit_${index}" value="${esc(item.unit || "tonna")}" required /></td>
      <td><input type="number" step="any" min="0" name="quantity_${index}" value="${esc(item.quantity || "")}" required /></td>
      <td><input type="number" step="any" min="0" name="unit_price_${index}" value="${esc(item.unit_price || "")}" required /></td>
      <td><input type="number" step="any" min="0" name="vat_rate_${index}" value="${esc(item.vat_rate ?? 12)}" required /></td>
      <td class="number-cell" data-contract-row-subtotal="${index}">${fmtMoney(calc.subtotal)}</td>
      <td class="number-cell" data-contract-row-vat="${index}">${fmtMoney(calc.vat_amount)}</td>
      <td class="number-cell" data-contract-row-total="${index}">${fmtMoney(calc.total_with_vat)}</td>
      <td class="action-cell"><button type="button" class="link-btn" data-contract-wizard-remove-item="${index}">Olib tashlash</button></td>
    </tr>`;
  }, "Kamida bitta mahsulot qo'shilishi kerak.")}</div>
  <div class="actions"><button type="button" class="btn" data-contract-wizard-add-item>Mahsulot qo'shish</button></div>
  ${summaryCards([
    ["Jami miqdor", `<span data-contract-total-quantity>${fmtQty(totals.quantity)}</span>`],
    ["Mahsulot oraliq summasi", `<span data-contract-total-subtotal>${fmtMoney(totals.subtotal)}</span>`],
    ["QQS", `<span data-contract-total-vat>${fmtMoney(totals.vat)}</span>`],
    ["Jami summa", `<span data-contract-total-amount>${fmtMoney(totals.total)}</span>`],
  ])}`;
}

function updateContractWizardProductTotals(state) {
  syncContractWizardInputs(state);
  const totals = contractWizardTotals(state);
  totals.rows.forEach((item, index) => {
    const subtotal = document.querySelector(`[data-contract-row-subtotal="${index}"]`);
    const vat = document.querySelector(`[data-contract-row-vat="${index}"]`);
    const total = document.querySelector(`[data-contract-row-total="${index}"]`);
    if (subtotal) subtotal.textContent = fmtMoney(item.subtotal);
    if (vat) vat.textContent = fmtMoney(item.vat_amount);
    if (total) total.textContent = fmtMoney(item.total_with_vat);
  });
  const quantity = document.querySelector("[data-contract-total-quantity]");
  const subtotal = document.querySelector("[data-contract-total-subtotal]");
  const vat = document.querySelector("[data-contract-total-vat]");
  const amount = document.querySelector("[data-contract-total-amount]");
  if (quantity) quantity.textContent = fmtQty(totals.quantity);
  if (subtotal) subtotal.textContent = fmtMoney(totals.subtotal);
  if (vat) vat.textContent = fmtMoney(totals.vat);
  if (amount) amount.textContent = fmtMoney(totals.total);
}

function contractWizardPaymentPanel(state) {
  const totals = contractWizardTotals(state);
  return `<div class="grid">
    ${textField("advance_percent", "Avans foizi", state.advancePercent ?? "30", "number", { required: true })}
    ${readonlyField("advance_amount", "Avans summasi", fmtMoney(totals.advanceAmount))}
    ${readonlyField("remaining_percent", "Qoldiq foizi", `${fmt(totals.remainingPercent)}%`)}
    ${textField("advance_due_days", "Avans muddati, kun", state.advanceDueDays ?? "10", "number", { required: true })}
    ${textField("batch_payment_due_days", "Partiya to'lovi muddati, kun", state.batchPaymentDueDays ?? "3", "number", { required: true })}
    ${textArea("remaining_payment_rule", "Qoldiq to'lov qoidasi", state.remainingPaymentRule || CONTRACT_REMAINING_RULE, { required: true })}
    ${textArea("payment_notes", "Izoh", state.paymentNotes || "")}
  </div>
  ${summaryCards([
    ["Avans summasi", fmtMoney(totals.advanceAmount)],
    ["Qolgan to'lov", fmtMoney(totals.remainingAmount)],
    ["Qoldiq foizi", `${fmt(totals.remainingPercent)}%`],
  ])}`;
}

function contractWizardTransportPanel(state) {
  return `<div class="grid">
    ${selectField("transport_payment_type", "Transport to'lovi turi", transportPaymentTypes, state.transportPaymentType || "separate_invoice", { required: true })}
    ${selectField("delivery_method", "Yetkazib berish usuli", deliveryMethods, state.deliveryMethod || "auto", { required: true })}
    ${textArea("transport_notes", "Izoh", state.transportNotes || "")}
  </div><div class="empty compact">Transport bo'yicha aniq tashuvchi, haydovchi va sana ma'lumotlari partiya yaratilgandan keyin kiritiladi.</div>`;
}

function contractWizardDocumentsPanel(state) {
  const documents = state.documents || [];
  return `${tableOrEmpty(documents, ["Hujjat turi", "Hujjat nomi", "Fayl", "Yuklagan", ""], (doc, index) => `
    <tr data-contract-wizard-document="${index}">
      <td><select name="document_type_${index}">${contractDocumentTypes.map(([key, label]) => `<option value="${key}" ${doc.document_type === key ? "selected" : ""}>${label}</option>`).join("")}</select></td>
      <td><input name="document_title_${index}" value="${esc(doc.title || "")}" /></td>
      <td><input type="file" name="document_file_${index}" />${doc.file ? `<small class="helper-text">${esc(doc.file.name)}</small>` : ""}</td>
      <td><input name="document_uploaded_by_${index}" value="${esc(doc.uploaded_by || "")}" /></td>
      <td><button type="button" class="link-btn" data-contract-wizard-remove-document="${index}">Olib tashlash</button></td>
    </tr>
  `, "Hujjat ma'lumotlari kiritilmagan.")}
  <div class="actions"><button type="button" class="btn" data-contract-wizard-add-document>Hujjat ma'lumotini qo'shish</button></div>
  <div class="empty compact">Faylni kompyuteringizdan tanlang. Shartnoma yaratilgandan keyin fayllar avtomatik yuklanadi.</div>`;
}

function contractWizardConfirmPanel(state) {
  const totals = contractWizardTotals(state);
  const clientWarnings = contractWizardClientWarnings(state.client);
  const products = totals.rows.map((item) => `${item.product_name || dash} - ${fmtQty(item.quantity, item.unit)} - ${fmtMoney(item.total_with_vat)}`).join("<br>");
  return `${clientWarnings.length ? workflowWarningsPanel(["Mijoz ma'lumotlari to'liq emas. Shartnoma yaratilgandan keyin rekvizitlarni tekshiring.", ...clientWarnings]) : ""}
  <div class="confirm-grid">
    ${section("Mijoz", detailList([["Mijoz nomi", state.client?.name], ["STIR", state.client?.inn], ["Telefon", state.client?.phone], ["Yuridik manzil", contractWizardAddressText(contractWizardLegalAddress(state.client))], ["Bank rekvizitlari", contractWizardBankText(contractWizardPrimaryBank(state.client))]]))}
    ${section("Asosiy ma'lumotlar", detailList([["Shartnoma raqami", state.contractNumber], ["Shartnoma sanasi", state.contractDate], ["Amal qilish muddati", state.validUntil], ["Sarlavha", state.title], ["Status", optionLabel(contractStatuses, state.status)], ["Valyuta", state.currency]]))}
    ${section("Mahsulotlar", `${detailList([["Jami miqdor", fmtQty(totals.quantity)], ["Mahsulot oraliq summasi", fmtMoney(totals.subtotal)], ["QQS", fmtMoney(totals.vat)], ["Jami summa", fmtMoney(totals.total)]])}<div class="empty compact">${products || dash}</div>`)}
    ${section("To'lov shartlari", detailList([["Avans foizi", `${fmt(totals.advancePercent)}%`], ["Avans summasi", fmtMoney(totals.advanceAmount)], ["Qoldiq foizi", `${fmt(totals.remainingPercent)}%`], ["Avans muddati, kun", state.advanceDueDays], ["Partiya to'lovi muddati, kun", state.batchPaymentDueDays], ["Qoldiq to'lov qoidasi", state.remainingPaymentRule]]))}
    ${section("Transport shartlari", detailList([["Transport to'lovi turi", optionLabel(transportPaymentTypes, state.transportPaymentType)], ["Yetkazib berish usuli", optionLabel(deliveryMethods, state.deliveryMethod)], ["Izoh", state.transportNotes]]))}
    ${section("Hujjatlar", detailList([["Hujjatlar soni", fmt((state.documents || []).filter((doc) => doc.title).length)]]))}
  </div>`;
}

function contractWizardBody(state) {
  if (state.step === 1) return section("Mijoz", contractWizardClientPanel(state));
  if (state.step === 2) return section("Asosiy ma'lumotlar", contractWizardMainPanel(state));
  if (state.step === 3) return section("Mahsulotlar", contractWizardProductsPanel(state));
  if (state.step === 4) return section("To'lov shartlari", contractWizardPaymentPanel(state));
  if (state.step === 5) return section("Transport shartlari", contractWizardTransportPanel(state));
  if (state.step === 6) return section("Hujjatlar", contractWizardDocumentsPanel(state));
  return section("Tasdiqlash", contractWizardConfirmPanel(state));
}

function contractWizardHtml(state) {
  return `<div class="page batch-wizard-page contract-wizard-page">
    <div class="page-header">
      <div class="page-title"><h1>Yangi shartnoma</h1><p>Shartnomani bosqichma-bosqich yarating.</p></div>
      <div class="actions"><button class="btn" type="button" data-contract-wizard-cancel>Bekor qilish</button></div>
    </div>
    ${contractWizardStepper(state.step)}
    <form id="contract-wizard-form">${contractWizardBody(state)}
      <div class="form-footer">
        <button type="button" class="btn" data-contract-wizard-back ${state.step <= 1 ? "disabled" : ""}>Ortga</button>
        ${state.step < 7 ? `<button type="button" class="btn primary" data-contract-wizard-next>Keyingi</button>` : `<button type="submit" class="btn primary">Shartnomani yaratish</button>`}
      </div>
    </form>
  </div>`;
}

function syncContractWizardInputs(state) {
  const form = document.querySelector("#contract-wizard-form");
  if (!form) return;
  if (form.elements.contract_number) state.contractNumber = form.elements.contract_number.value.trim();
  if (form.elements.contract_date) state.contractDate = form.elements.contract_date.value;
  if (form.elements.valid_until) state.validUntil = form.elements.valid_until.value;
  if (form.elements.title) state.title = form.elements.title.value.trim();
  if (form.elements.status) state.status = form.elements.status.value;
  if (form.elements.currency) state.currency = form.elements.currency.value;
  if (form.elements.notes) state.notes = form.elements.notes.value.trim();
  if (form.elements.advance_percent) state.advancePercent = form.elements.advance_percent.value;
  if (form.elements.advance_due_days) state.advanceDueDays = form.elements.advance_due_days.value;
  if (form.elements.batch_payment_due_days) state.batchPaymentDueDays = form.elements.batch_payment_due_days.value;
  if (form.elements.remaining_payment_rule) state.remainingPaymentRule = form.elements.remaining_payment_rule.value.trim();
  if (form.elements.payment_notes) state.paymentNotes = form.elements.payment_notes.value.trim();
  if (form.elements.transport_payment_type) state.transportPaymentType = form.elements.transport_payment_type.value;
  if (form.elements.delivery_method) state.deliveryMethod = form.elements.delivery_method.value;
  if (form.elements.transport_notes) state.transportNotes = form.elements.transport_notes.value.trim();

  const itemRows = [...form.querySelectorAll("[data-contract-wizard-item]")];
  if (itemRows.length) {
    state.items = itemRows.map((row, index) => {
      const productIdVal = form.elements[`product_id_${index}`]?.value;
      return {
        product_id: productIdVal ? Number(productIdVal) : null,
        product_name: form.elements[`product_name_${index}`]?.value.trim() || "",
        product_code: form.elements[`product_code_${index}`]?.value.trim() || "",
        unit: form.elements[`unit_${index}`]?.value.trim() || "tonna",
        quantity: normalizeNumberInputValue(form.elements[`quantity_${index}`]?.value || ""),
        unit_price: normalizeNumberInputValue(form.elements[`unit_price_${index}`]?.value || ""),
        vat_rate: normalizeNumberInputValue(form.elements[`vat_rate_${index}`]?.value || "12"),
      };
    });
  }
  const documentRows = [...form.querySelectorAll("[data-contract-wizard-document]")];
  if (documentRows.length) {
    const existingDocuments = state.documents || [];
    state.documents = documentRows.map((row, index) => ({
      document_type: form.elements[`document_type_${index}`]?.value || "other",
      title: form.elements[`document_title_${index}`]?.value.trim() || "",
      file: form.elements[`document_file_${index}`]?.files?.[0] || existingDocuments[index]?.file || null,
      uploaded_by: form.elements[`document_uploaded_by_${index}`]?.value.trim() || "",
    }));
  }
}

function validateContractWizardStep(state, targetStep = state.step) {
  if (targetStep >= 1 && !state.clientId) return "Mijozni tanlang.";
  if (targetStep >= 2) {
    if (!state.contractNumber || !state.contractDate || !state.validUntil) return "Shartnoma raqami, shartnoma sanasi va amal qilish muddati majburiy.";
    if (state.validUntil < state.contractDate) return "Amal qilish muddati shartnoma sanasidan oldin bo'lishi mumkin emas.";
    if (!state.status || !state.currency) return "Status va valyutani tanlang.";
  }
  if (targetStep >= 3) {
    const items = state.items || [];
    if (!items.length) return "Kamida bitta mahsulot qo'shilishi kerak.";
    if (items.some((item) => !item.product_name || !item.unit)) return "Mahsulot nomi va birlik majburiy.";
    if (items.some((item) => numberValue(item.quantity) <= 0)) return "Miqdor 0 dan katta bo'lishi kerak.";
    if (items.some((item) => numberValue(item.unit_price) < 0)) return "Birlik narxi manfiy bo'lishi mumkin emas.";
  }
  if (targetStep >= 4) {
    const advance = numberValue(state.advancePercent);
    if (advance < 0 || advance > 100) return "Avans foizi 0 dan 100 gacha bo'lishi kerak.";
    if (numberValue(state.advanceDueDays) < 0 || numberValue(state.batchPaymentDueDays) < 0) return "To'lov muddatlari manfiy bo'lishi mumkin emas.";
    if (!state.remainingPaymentRule) return "Qoldiq to'lov qoidasi majburiy.";
  }
  if (targetStep >= 5 && (!state.transportPaymentType || !state.deliveryMethod)) return "Transport shartlarini tanlang.";
  if (targetStep >= 6 && (state.documents || []).some((doc) => (doc.file || doc.uploaded_by || doc.document_type !== "other") && !doc.title)) return "Hujjat nomini kiriting yoki bo'sh hujjat qatorini olib tashlang.";
  if (targetStep >= 6 && (state.documents || []).some((doc) => (doc.title || doc.uploaded_by || doc.document_type !== "other") && !doc.file)) return "Hujjat faylini kompyuterdan tanlang yoki bo'sh hujjat qatorini olib tashlang.";
  return null;
}

function collectContractWizardPayload(state) {
  const totals = contractWizardTotals(state);
  return {
    client_id: Number(state.clientId),
    contract_number: state.contractNumber,
    contract_date: state.contractDate,
    valid_until: state.validUntil,
    title: state.title || null,
    status: state.status || "draft",
    currency: state.currency || "UZS",
    notes: state.notes || null,
    items: (state.items || []).map((item) => ({
      product_id: item.product_id || null,
      product_name: item.product_name,
      product_code: item.product_code || null,
      unit: item.unit || "tonna",
      quantity: normalizeNumberInputValue(item.quantity),
      unit_price: normalizeNumberInputValue(item.unit_price),
      vat_rate: normalizeNumberInputValue(item.vat_rate || "12"),
    })),
    payment_terms: {
      advance_percent: normalizeNumberInputValue(state.advancePercent || "30"),
      remaining_percent: String(totals.remainingPercent),
      advance_due_days: Number(normalizeNumberInputValue(state.advanceDueDays || 10)),
      batch_payment_due_days: Number(normalizeNumberInputValue(state.batchPaymentDueDays || 3)),
      remaining_payment_rule: state.remainingPaymentRule || CONTRACT_REMAINING_RULE,
      notes: state.paymentNotes || null,
    },
    transport_terms: {
      transport_payment_type: state.transportPaymentType || "separate_invoice",
      delivery_method: state.deliveryMethod || "auto",
      notes: state.transportNotes || null,
    },
    documents: [],
  };
}

async function uploadContractWizardDocuments(contractId, state) {
  const documents = (state.documents || []).filter((doc) => doc.title && doc.file);
  for (const document of documents) {
    const formData = new FormData();
    formData.append("document_type", document.document_type || "other");
    formData.append("title", document.title);
    if (document.uploaded_by) formData.append("uploaded_by", document.uploaded_by);
    formData.append("file", document.file);
    await apiForm(`/api/contracts/${contractId}/documents/upload`, formData);
  }
}

function bindContractWizard(state, draw) {
  const form = document.querySelector("#contract-wizard-form");
  if (form) bindProductSelects(form);
  // The wizard redraws itself between steps without going through the router.
  bindSelectSearch(app);
  if (form?.querySelector("[data-contract-wizard-item]")) updateContractWizardProductTotals(state);
  document.querySelector("[data-contract-wizard-cancel]")?.addEventListener("click", () => navigate("/contracts"));
  form?.elements.client_id?.addEventListener("change", async (event) => {
    state.clientId = event.target.value;
    state.client = state.clientId ? await api(`/api/clients/${state.clientId}`) : null;
    state.clientOptions = await contractWizardClientOptions(state.clientId);
    await draw();
  });
  form?.addEventListener("input", (event) => {
    if (event.target.closest("[data-contract-wizard-item]")) {
      updateContractWizardProductTotals(state);
      return;
    }
    syncContractWizardInputs(state);
  });
  form?.addEventListener("change", (event) => {
    if (event.target.closest("[data-contract-wizard-item]")) {
      updateContractWizardProductTotals(state);
      return;
    }
    syncContractWizardInputs(state);
  });
  document.querySelector("[data-contract-wizard-add-item]")?.addEventListener("click", async () => {
    syncContractWizardInputs(state);
    state.items.push({ product_id: null, product_name: "", product_code: "", unit: "tonna", quantity: "", unit_price: "", vat_rate: "12" });
    await draw();
  });
  document.querySelectorAll("[data-contract-wizard-remove-item]").forEach((button) => button.addEventListener("click", async () => {
    syncContractWizardInputs(state);
    if (state.items.length <= 1) return showToast("Kamida bitta mahsulot qo'shilishi kerak.", true);
    state.items.splice(Number(button.dataset.contractWizardRemoveItem), 1);
    await draw();
  }));
  document.querySelector("[data-contract-wizard-add-document]")?.addEventListener("click", async () => {
    syncContractWizardInputs(state);
    state.documents.push({ document_type: "other", title: "", file: null, uploaded_by: "" });
    await draw();
  });
  document.querySelectorAll("[data-contract-wizard-remove-document]").forEach((button) => button.addEventListener("click", async () => {
    syncContractWizardInputs(state);
    state.documents.splice(Number(button.dataset.contractWizardRemoveDocument), 1);
    await draw();
  }));
  document.querySelector("[data-contract-wizard-back]")?.addEventListener("click", async () => {
    syncContractWizardInputs(state);
    state.step = Math.max(1, state.step - 1);
    await draw();
  });
  document.querySelector("[data-contract-wizard-next]")?.addEventListener("click", async () => {
    syncContractWizardInputs(state);
    const error = validateContractWizardStep(state, state.step);
    if (error) return showToast(error, true);
    state.step = Math.min(7, state.step + 1);
    await draw();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncContractWizardInputs(state);
    const error = validateContractWizardStep(state, 7);
    if (error) return showToast(error, true);
    try {
      const saved = await api("/api/contracts", { method: "POST", body: JSON.stringify(collectContractWizardPayload(state)) });
      await uploadContractWizardDocuments(saved.id, state);
      showToast("Shartnoma yaratildi.");
      navigate(`/contracts/${saved.id}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderContractWizard() {
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams(location.search);
  const state = {
    step: 1,
    clientId: params.get("client_id") || "",
    client: null,
    clientOptions: [],
    contractNumber: "",
    contractDate: today,
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    title: "",
    status: "draft",
    currency: "UZS",
    notes: "",
    items: [{ product_id: null, product_name: "", product_code: "", unit: "tonna", quantity: "", unit_price: "", vat_rate: "12" }],
    advancePercent: "30",
    advanceDueDays: "10",
    batchPaymentDueDays: "3",
    remainingPaymentRule: "Qolgan summa tayyor partiya bo'yicha hisob-faktura asosida to'lanadi.",
    paymentNotes: "",
    transportPaymentType: "separate_invoice",
    deliveryMethod: "auto",
    transportNotes: "",
    documents: [],
  };
  [state.clientOptions, state.products, state.contractNumber] = await Promise.all([
    contractWizardClientOptions(state.clientId),
    api("/api/products"),
    api("/api/contracts/next-number").then((data) => data.contract_number).catch(() => ""),
  ]);
  if (state.clientId) state.client = await api(`/api/clients/${state.clientId}`);

  async function draw() {
    app.innerHTML = contractWizardHtml(state);
    bindContractWizard(state, draw);
  }

  await draw();
}

const CONTRACT_LIST_ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
};

function contractListIcon(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CONTRACT_LIST_ICONS[name] || ""}</svg>`;
}

// The row menu holds the actions that are not the obvious one. "Ko'rish" earns
// its own icon because it is what people do nine times out of ten; editing and
// opening the PDF sit behind the dots so the column stays quiet.
function contractRowActions(contract, editable) {
  const items = [];
  if (editable) items.push(`<button type="button" data-nav="/contracts/${contract.id}/edit">Tahrirlash</button>`);
  if (contract.source_file_path) items.push(`<a target="_blank" href="/api/contracts/${contract.id}/file">Faylni ko'rish</a>`);
  return `<div class="clist-actions">
    <button type="button" class="clist-icon-btn" data-nav="/contracts/${contract.id}" title="Ko'rish" aria-label="Ko'rish">${contractListIcon("eye", 18)}</button>
    ${items.length ? `<div class="clist-menu" data-clist-menu>
      <button type="button" class="clist-icon-btn" data-clist-toggle aria-label="Boshqa amallar">${contractListIcon("dots", 18)}</button>
      <div class="clist-menu-list" hidden>${items.join("")}</div>
    </div>` : ""}
  </div>`;
}

async function renderContractsList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Shartnomalar yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/contracts?${params.toString()}`);
  const editable = canEdit("sotuv");
  const rows = data.items.map((contract) => `<tr>
    <td><button class="clist-number" data-nav="/contracts/${contract.id}">${fmt(contract.contract_number)}</button></td>
    <td>${fmt(contract.contract_date)}</td>
    <td>${fmt(contract.valid_until)}</td>
    <td class="clist-customer">${fmt(contract.customer_name || contract.client?.name)}</td>
    <td>${fmt(contract.customer_inn || contract.client?.inn)}</td>
    <td class="clist-amount">${fmtMoney(contract.total_amount)}</td>
    <td>${statusBadge(contract.status)}</td>
    <td>${contractRowActions(contract, editable)}</td>
  </tr>`).join("");

  app.innerHTML = `
    <div class="page contracts-list-page">
      <header class="clist-head">
        <div class="clist-title">
          <h1>Shartnomalar</h1>
          <span class="clist-count">${fmt(data.total)} ta shartnoma</span>
        </div>
        ${editable ? `<div class="clist-head-actions">
          <button class="btn primary clist-create" data-nav="/contracts/new">${contractListIcon("plus", 16)}<span>Yangi shartnoma</span></button>
          <button class="btn" type="button" data-nav="/contracts/upload">PDF orqali yaratish</button>
        </div>` : ""}
      </header>

      <nav class="clist-tabs" aria-label="Sotuv bo'limlari">
        <button type="button" data-nav="/clients">Mijozlar</button>
        <button type="button" class="active" aria-current="page">Shartnomalar</button>
        <button type="button" data-nav="/orders">Buyurtmalar</button>
      </nav>

      <form class="clist-filters" id="contract-search-form">
        <div class="clist-filter-row">
          <label class="clist-field clist-field-search">
            <span class="clist-search-icon">${contractListIcon("search", 16)}</span>
            <input name="search" placeholder="Shartnoma raqami yoki mijoz" value="${esc(params.get("search") || "")}" />
          </label>
          <label class="clist-field">
            <span class="clist-label">STIR</span>
            <input name="inn" placeholder="STIR" value="${esc(params.get("inn") || "")}" />
          </label>
          <label class="clist-field">
            <span class="clist-label">Mahsulot</span>
            <input name="product_name" placeholder="Mahsulot" value="${esc(params.get("product_name") || "")}" />
          </label>
          <label class="clist-field">
            <span class="clist-label">Status</span>
            <select name="status"><option value="">Status</option>${contractStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select><select name="expiry"><option value="">Amal muddati</option>${[["expired", "Muddati tugagan"], ["soon", "30 kun ichida tugaydi"], ["valid", "Amaldagi"]].map(([key, label]) => `<option value="${key}" ${params.get("expiry") === key ? "selected" : ""}>${label}</option>`).join("")}</select>
          </label>
          <button class="clist-apply" type="submit" title="Qidirish" aria-label="Qidirish">${contractListIcon("sliders", 18)}</button>
        </div>
        <div class="clist-filter-foot"><button type="button" class="link-btn" data-nav="/contracts">Tozalash</button></div>
      </form>

      <section class="clist-card">
        <table class="clist-table">
          <thead><tr>
            <th>Shartnoma raqami</th><th>Sana</th><th>Amal qilish muddati</th><th>Buyurtmachi</th>
            <th>STIR</th><th>Umumiy summa</th><th>Status</th><th>Amallar</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="8"><div class="empty">Shartnomalar topilmadi.</div></td></tr>`}</tbody>
        </table>
      </section>

      <div class="clist-foot">
        <span class="clist-range" data-noloc>${data.total ? `${(data.page - 1) * data.page_size + 1}–${Math.min(data.page * data.page_size, data.total)}` : 0} / ${data.total}</span>
        <div class="ops-pagination">${contractsPaginationHtml(data)}</div>
      </div>
    </div>
  `;

  bindOpsSearch("contract-search-form", "/contracts", ["search", "inn", "product_name", "status", "expiry"]);
  bindOpsPagination("contract", "/contracts");
  bindContractRowMenus();
}

function contractsPaginationHtml(data) {
  const current = Number(data.page || 1);
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.page_size || 20)));
  const end = Math.min(current * (data.page_size || 20), data.total);
  return `<button type="button" class="ops-page-btn" data-contract-page="${current - 1}" ${current <= 1 ? "disabled" : ""} aria-label="Oldingi">${paginationChevron("left")}</button>
    ${paginationPageList(current, totalPages).map((p) => (p === "..." ? `<span class="ops-page-btn ellipsis">…</span>` : `<button type="button" class="ops-page-btn ${p === current ? "active" : ""}" data-contract-page="${p}">${fmt(p)}</button>`)).join("")}
    <button type="button" class="ops-page-btn" data-contract-page="${current + 1}" ${end >= data.total ? "disabled" : ""} aria-label="Keyingi">${paginationChevron("right")}</button>`;
}

function bindContractRowMenus() {
  const closeAll = () => document.querySelectorAll("[data-clist-menu] .clist-menu-list").forEach((menu) => { menu.hidden = true; });
  document.querySelectorAll("[data-clist-toggle]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const list = button.parentElement.querySelector(".clist-menu-list");
    const wasHidden = list.hidden;
    closeAll();
    list.hidden = !wasHidden;
  }));
  document.addEventListener("click", closeAll);
}

function parsedItemRow(item = {}, index = 0, products = []) {
  return `<tr data-parsed-item="${index}">
    <td><input name="item_product_name_${index}" value="${esc(item.product_name || "")}" /></td>
    <td><input name="item_product_brand_${index}" value="${esc(item.product_brand || "")}" /></td>
    <td><input name="item_catalog_code_${index}" value="${esc(item.catalog_code || "")}" /></td>
    <td><input name="item_unit_${index}" value="${esc(item.unit || "tonna")}" /></td>
    <td><input data-format-number name="item_quantity_${index}" value="${esc(item.quantity ?? "")}" /></td>
    <td><input data-format-number name="item_unit_price_${index}" value="${esc(item.unit_price ?? "")}" /></td>
    <td><input data-format-number name="item_amount_without_vat_${index}" value="${esc(item.amount_without_vat ?? "")}" /></td>
    <td><input data-format-number name="item_vat_rate_${index}" value="${esc(item.vat_rate ?? 12)}" /></td>
    <td><input data-format-number name="item_vat_amount_${index}" value="${esc(item.vat_amount ?? "")}" /></td>
    <td><input data-format-number name="item_amount_with_vat_${index}" value="${esc(item.amount_with_vat ?? "")}" /></td>
    <td><select name="item_product_id_${index}">${buildProductOptions(products, item.product_id)}</select></td>
  </tr>`;
}

function collectParsedContractPayload(form, parsedState) {
  const rows = [...form.querySelectorAll("[data-parsed-item]")];
  return {
    parse_session_id: parsedState.parse_session_id,
    customer_id: field(form, "customer_id") ? Number(field(form, "customer_id")) : null,
    customer_request_id: field(form, "customer_request_id") ? Number(field(form, "customer_request_id")) : null,
    contract_number: field(form, "contract_number"),
    contract_date: field(form, "contract_date"),
    valid_until: field(form, "valid_until"),
    place: field(form, "place"),
    customer_name: field(form, "customer_name"),
    customer_director_full_name: field(form, "customer_director_full_name"),
    customer_inn: field(form, "customer_inn"),
    customer_oked: field(form, "customer_oked"),
    customer_legal_address: field(form, "customer_legal_address"),
    customer_bank_account: field(form, "customer_bank_account"),
    customer_bank_name: field(form, "customer_bank_name"),
    customer_mfo: field(form, "customer_mfo"),
    executor_name: field(form, "executor_name"),
    executor_director_full_name: field(form, "executor_director_full_name"),
    executor_inn: field(form, "executor_inn"),
    executor_oked: field(form, "executor_oked"),
    executor_legal_address: field(form, "executor_legal_address"),
    executor_bank_account: field(form, "executor_bank_account"),
    executor_bank_name: field(form, "executor_bank_name"),
    executor_mfo: field(form, "executor_mfo"),
    total_without_vat: field(form, "total_without_vat"),
    vat_rate: field(form, "vat_rate"),
    vat_amount: field(form, "vat_amount"),
    total_with_vat: field(form, "total_with_vat"),
    prepayment_percent: field(form, "prepayment_percent"),
    prepayment_amount: field(form, "prepayment_amount"),
    remaining_payment_percent: field(form, "remaining_payment_percent"),
    payment_terms_text: field(form, "payment_terms_text"),
    transport_cost_separate: field(form, "transport_cost_separate"),
    didox_id: field(form, "didox_id"),
    rouming_id: field(form, "rouming_id"),
    status: field(form, "status") || "active",
    items: rows.map((row) => {
      const index = row.dataset.parsedItem;
      const get = (name) => field(form, `${name}_${index}`);
      return {
        product_id: get("item_product_id") ? Number(get("item_product_id")) : null,
        product_name: get("item_product_name"),
        product_brand: get("item_product_brand"),
        catalog_code: get("item_catalog_code"),
        unit: get("item_unit"),
        quantity: get("item_quantity"),
        unit_price: get("item_unit_price"),
        amount_without_vat: get("item_amount_without_vat"),
        vat_rate: get("item_vat_rate"),
        vat_amount: get("item_vat_amount"),
        amount_with_vat: get("item_amount_with_vat"),
      };
    }),
  };
}

async function contractParsedReview(parsedState) {
  const parsed = parsedState.parsed || {};
  const [clientOptions, products, requests, suggestedNumber] = await Promise.all([
    fetchClientsForSelect(parsedState.suggestions?.customer?.id),
    api("/api/products"),
    api("/api/customer-requests?page_size=100").catch(() => ({ items: [] })),
    parsed.contract_number ? Promise.resolve(null) : api("/api/contracts/next-number").then((data) => data.contract_number).catch(() => ""),
  ]);
  if (!parsed.contract_number && suggestedNumber) parsed.contract_number = suggestedNumber;
  const requestOptions = (requests.items || []).map((r) => `<option value="${r.id}" ${Number(parsed.customer_request_id) === r.id ? "selected" : ""}>${fmt(r.request_number)} - ${fmt(r.company_name)}${r.inn ? ` - ${fmt(r.inn)}` : ""}</option>`).join("");
  const items = parsed.items?.length ? parsed.items : [{}];
  (parsedState.suggestions?.products || []).forEach((suggestion) => {
    if (items[suggestion.item_index] && suggestion.product_id && !items[suggestion.item_index].product_id) {
      items[suggestion.item_index].product_id = suggestion.product_id;
    }
  });
  return `<form id="contract-parsed-form">
    ${section("Aniqlik darajasi", `<div class="summary-grid">${summaryCards([["Aniqlik darajasi", parseConfidenceLabel({ parse_confidence: parsedState.confidence })], ["Ogohlantirishlar", parsedState.warnings?.length || 0]])}</div>${parsedState.warnings?.length ? `<div class="warning-message">${parsedState.warnings.map(esc).join("<br>")}</div>` : `<p class="form-hint">Ogohlantirish yo'q. Shunda ham raqamlarni PDF bilan solishtirib chiqing — parser hamma xatoni topa olmaydi.</p>`}`)}
    ${section("Asosiy ma'lumotlar", `<div class="grid">${textField("contract_number", "Shartnoma raqami", parsed.contract_number, "text", { required: true })}${textField("contract_date", "Shartnoma sanasi", parsed.contract_date || "", "date", { required: true })}${textField("valid_until", "Amal qilish muddati", parsed.valid_until || "", "date")}${textField("place", "Tuzilgan joy", parsed.place)}${selectField("status", "Status", contractStatuses.filter(([key]) => ["draft","active","completed","cancelled"].includes(key)), parsed.status || "active")}</div>`)}
    ${section("Bajaruvchi", `<div class="grid">${textField("executor_name", "Bajaruvchi nomi", parsed.executor_name)}${textField("executor_director_full_name", "Direktor F.I.Sh.", parsed.executor_director_full_name)}${textField("executor_inn", "STIR", parsed.executor_inn)}${textField("executor_oked", "OKED", parsed.executor_oked)}${textArea("executor_legal_address", "Yuridik manzil", parsed.executor_legal_address)}${textField("executor_bank_account", "Hisob raqami", parsed.executor_bank_account)}${textField("executor_bank_name", "Bank nomi", parsed.executor_bank_name)}${textField("executor_mfo", "MFO", parsed.executor_mfo)}</div>`)}
    ${section("Buyurtmachi", `<div class="grid">${textField("customer_name", "Buyurtmachi nomi", parsed.customer_name, "text", { required: true })}${textField("customer_director_full_name", "Direktor F.I.Sh.", parsed.customer_director_full_name)}${textField("customer_inn", "STIR", parsed.customer_inn, "text", { required: true })}${textField("customer_oked", "OKED", parsed.customer_oked)}${textArea("customer_legal_address", "Yuridik manzil", parsed.customer_legal_address)}${textField("customer_bank_account", "Hisob raqami", parsed.customer_bank_account)}${textField("customer_bank_name", "Bank nomi", parsed.customer_bank_name)}${textField("customer_mfo", "MFO", parsed.customer_mfo)}</div>`)}
    ${section("Mahsulotlar", `<div class="table-wrap"><table><thead><tr><th>Mahsulot</th><th>Marka</th><th>Katalog kodi</th><th>O'lchov birligi</th><th>Miqdor</th><th>Birlik narxi</th><th>QQSsiz summa</th><th>QQS stavkasi</th><th>QQS summasi</th><th>QQS bilan summa</th><th>ERP mahsuloti bilan bog'lash</th></tr></thead><tbody>${items.map((item, i) => parsedItemRow(item, i, products)).join("")}</tbody></table></div>`)}
    ${section("Hisob-kitob", `<div class="grid">${textField("total_without_vat", "QQSsiz umumiy summa", parsed.total_without_vat, "number")}${textField("vat_rate", "QQS stavkasi", parsed.vat_rate || 12, "number")}${textField("vat_amount", "QQS summasi", parsed.vat_amount, "number")}${textField("total_with_vat", "QQS bilan umumiy summa", parsed.total_with_vat, "number")}</div>`)}
    ${section("To'lov shartlari", `<div class="grid">${textField("prepayment_percent", "Oldindan to'lov foizi", parsed.prepayment_percent || 30, "number")}${textField("prepayment_amount", "Oldindan to'lov summasi", parsed.prepayment_amount, "number")}${textField("remaining_payment_percent", "Qolgan to'lov foizi", parsed.remaining_payment_percent || 70, "number")}<label class="checkbox-row"><input type="checkbox" name="transport_cost_separate" ${parsed.transport_cost_separate ? "checked" : ""} /> Transport xarajati alohida hisoblanadi</label>${textArea("payment_terms_text", "To'lov shartlari", parsed.payment_terms_text)}</div>`)}
    ${section("Elektron hujjat identifikatorlari", `<div class="grid">${textField("didox_id", "Didox ID", parsed.didox_id)}${textField("rouming_id", "Rouming ID", parsed.rouming_id)}</div>`)}
    ${section("Bog'lash", `<div class="grid"><label>Mijoz bilan bog'lash${selectSearch("customer_id", "Mijoz nomi yoki STIR bo'yicha qidiring")}<select name="customer_id"><option value="">Snapshot bo'yicha saqlash</option>${clientOptions}</select></label><label>Talabnoma bilan bog'lash<select name="customer_request_id"><option value="">—</option>${requestOptions}</select></label></div>`)}
    <div class="form-footer"><button type="button" class="btn" data-nav="/contracts">Bekor qilish</button>${parsedState.file_url ? `<a class="btn" target="_blank" href="${esc(parsedState.file_url)}">PDF faylni ko'rish</a>` : ""}<button class="btn primary" type="submit">Shartnomani yaratish</button></div>
  </form>`;
}

async function renderContractUpload() {
  app.innerHTML = `<div class="page"><div class="page-header"><div class="page-title"><h1>PDF orqali shartnoma yaratish</h1><p>Shartnoma PDF faylini yuklang. Faqat PDF fayl qabul qilinadi.</p></div><div class="actions"><button class="btn" data-nav="/contracts">Orqaga</button></div></div>${section("Fayl yuklash", `<form id="contract-pdf-form"><div class="grid"><label>Shartnoma PDF faylini yuklang <span class="required-mark">*</span><input type="file" name="file" accept="application/pdf,.pdf" required /></label></div><div class="form-footer"><button class="btn primary" type="submit">Tahlil qilish</button></div></form>`)}<div id="contract-parse-review"></div></div>`;
  document.querySelector("#contract-pdf-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      const response = await apiForm("/api/contracts/parse-pdf", formData);
      const parsedState = response.data;
      document.querySelector("#contract-parse-review").innerHTML = `<div class="page-title"><h1>Shartnoma ma'lumotlarini tekshirish</h1></div>${await contractParsedReview(parsedState)}`;
      setupFormattedNumberInputs(document.querySelector("#contract-parse-review"));
      // This screen is injected outside the router, so bind the pickers here too.
      bindSelectSearch(document.querySelector("#contract-parse-review"));
      document.querySelector("#contract-parsed-form").addEventListener("submit", async (submitEvent) => {
        submitEvent.preventDefault();
        try {
          const saved = await api("/api/contracts/from-parsed", { method: "POST", body: JSON.stringify(collectParsedContractPayload(submitEvent.currentTarget, parsedState)) });
          showToast("Shartnoma yaratildi.");
          navigate(`/contracts/${saved.id}`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderNewContract() {
  await renderContractWizard();
}

async function renderEditContract(id) {
  app.innerHTML = `<div class="page"><div class="empty">Shartnoma yuklanmoqda...</div></div>`;
  const contract = await api(`/api/contracts/${id}`);
  app.innerHTML = await contractForm(contract);
  bindContractForm(contract);
}

// Buttons come from the server's own description of the flow, so what is on
// screen is exactly what the API will accept. The card used to offer no status
// control at all -- the only way was the dropdown on the full edit form, which
// allowed any jump and recorded nothing.
const CONTRACT_STATUS_DIALOGS = {
  forward: {
    title: "Keyingi holatga o'tkazish",
    intro: "Shartnoma quyidagi holatga o'tadi. Izoh ixtiyoriy, lekin u tarixda qoladi.",
    confirmLabel: "O'tkazish", tone: "primary", commentLabel: "Izoh",
    placeholder: "Nima qilindi?", required: false,
  },
  backward: {
    title: "Oldingi holatga qaytarish",
    intro: "Shartnoma orqaga qaytariladi. Sabab majburiy — u tarixda qoladi.",
    confirmLabel: "Qaytarish", tone: "primary", commentLabel: "Qaytarish sababi",
    placeholder: "Nima noto'g'ri edi?", required: true,
  },
  cancel: {
    title: "Shartnomani bekor qilish",
    intro: "Shartnoma bekor qilinadi. Sabab majburiy.",
    confirmLabel: "Bekor qilish", tone: "danger", commentLabel: "Bekor qilish sababi",
    placeholder: "Nima uchun bekor qilinyapti?", required: true,
  },
};

const CONTRACT_BACK_LABEL = "Orqaga qaytarish";

function contractTransitionsHtml(contract) {
  const moves = contract.available_transitions || [];
  if (!moves.length) return `<div class="empty">Bu holatdan status o'zgartirilmaydi.</div>`;
  const order = { forward: 0, backward: 1, cancel: 2 };
  const buttons = [...moves]
    .sort((a, b) => order[a.direction] - order[b.direction])
    .map((move) => {
      const cls = move.direction === "forward" ? "btn primary" : move.direction === "cancel" ? "btn danger" : "btn";
      const prefix = move.direction === "backward"
        ? `<span>${CONTRACT_BACK_LABEL}</span><span data-noloc>\u2190</span>`
        : "";
      return `<button class="${cls}" type="button" data-contract-status="${esc(move.status)}" data-contract-direction="${esc(move.direction)}">${prefix}<span>${esc(move.label)}</span></button>`;
    })
    .join("");
  const hint = moves.some((m) => m.direction === "backward" || m.direction === "cancel")
    ? `<p class="form-hint">Orqaga qaytarish va bekor qilish uchun sabab yozish shart — u tarixda qoladi.</p>`
    : "";
  return `${hint}<div class="actions">${buttons}</div>`;
}

function bindContractStatusActions(contract) {
  app.querySelectorAll("[data-contract-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const direction = button.dataset.contractDirection;
      const cfg = CONTRACT_STATUS_DIALOGS[direction] || CONTRACT_STATUS_DIALOGS.forward;
      const target = (button.querySelector("span:last-child") || button).textContent.trim();
      const { confirmed, comment } = await appDialog({
        title: cfg.title,
        intro: cfg.intro,
        subject: direction === "cancel" ? "" : target,
        confirmLabel: cfg.confirmLabel,
        tone: cfg.tone,
        comment: { label: cfg.commentLabel, placeholder: cfg.placeholder, optional: !cfg.required },
      });
      if (!confirmed) return;
      try {
        await api(`/api/contracts/${contract.id}/status`, {
          method: "POST",
          body: JSON.stringify({ status: button.dataset.contractStatus, comment }),
        });
        showToast("Shartnoma holati yangilandi.");
        render();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  app.querySelector("[data-contract-remove]")?.addEventListener("click", async () => {
    const { confirmed } = await appDialog({
      title: "Shartnomani o'chirish",
      intro: "Shartnoma butunlay o'chiriladi. Buyurtmalari yoki partiyalari bo'lsa server ruxsat bermaydi.",
      subject: contract.contract_number,
      confirmLabel: "O'chirish",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await api(`/api/contracts/${contract.id}`, { method: "DELETE" });
      showToast("Shartnoma o'chirildi.");
      navigate("/contracts");
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

// The terms said "10 kun"; nobody turned that into a date, so nothing could
// tell whether it had passed. Each row now carries the date it is due and how
// far past it is.
// Whole days from today; negative once the date has passed.
function daysUntilDate(value) {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

const MONTH_NAMES = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

// Plan against actual, month by month. Without this a contract for 1 000 tonnes
// with 44 delivered and a year left to run could be badly behind or comfortably
// ahead, and nothing on the page could tell the difference.
function deliveryPlanHtml(contract) {
  const plan = contract.delivery_plan;
  const addButton = canEdit("sotuv")
    ? `<div class="toolbar"><button class="btn" type="button" data-contract-child="schedule">Oy qo'shish</button></div>`
    : "";
  if (!plan?.has_schedule) {
    return `${addButton}<div class="empty">Yetkazib berish grafigi kiritilmagan. Grafik kiritilsa, reja va fakt taqqoslanadi.</div>`;
  }
  const head = addButton + `<div class="totals-bar">
    <div class="total-box"><span>Reja jami</span><strong>${fmtQty(plan.planned_total)}</strong></div>
    <div class="total-box"><span>Yetkazilgan</span><strong>${fmtQty(plan.delivered_total)}</strong></div>
    <div class="total-box"><span>Bugungacha kerak</span><strong>${fmtQty(plan.due_by_now)}</strong></div>
    <div class="total-box"><span>Orqada</span><strong>${fmtQty(plan.behind_by)}</strong></div>
  </div>`;
  const editable = canEdit("sotuv");
  const rowById = new Map((contract.schedule || []).map((row) => [`${row.year}-${row.month}`, row]));
  return head + tableOrEmpty(
    plan.months,
    ["Oy", "Reja", "Yetkazilgan", "Jamlanma reja", "Jamlanma fakt", "Farq", ""],
    (row) => {
      const behind = row.is_past && Number(row.difference) < -1;
      return `<tr class="${behind ? "row-overdue" : ""}">
        <td>${fmt(MONTH_NAMES[row.month - 1])} <span data-noloc>${row.year}</span></td>
        <td>${fmtQty(row.planned)}</td>
        <td>${fmtQty(row.delivered)}</td>
        <td>${fmtQty(row.planned_cumulative)}</td>
        <td>${fmtQty(row.delivered_cumulative)}</td>
        <td>${fmtQty(row.difference)}</td>
        <td><div class="table-actions">${editable && rowById.has(`${row.year}-${row.month}`) ? `<button class="link-btn" data-contract-edit="schedule" data-id="${rowById.get(`${row.year}-${row.month}`).id}">Tahrirlash</button><button class="link-btn" data-contract-delete="schedule" data-id="${rowById.get(`${row.year}-${row.month}`).id}">O'chirish</button>` : ""}</div></td>
      </tr>`;
    },
    "Grafik bo'sh."
  );
}

function lateOrdersHtml(contract) {
  const rows = contract.summary?.overdue_orders || [];
  if (!rows.length) return "";
  return tableOrEmpty(
    rows,
    ["Buyurtma", "Talab qilingan sana", "Holat", "Kechikish"],
    (row) => `<tr class="row-overdue">
      <td><a class="ops-primary-link" href="/orders/${row.id}" data-nav="/orders/${row.id}">${fmt(row.order_number)}</a></td>
      <td data-noloc>${fmtDayOnly(row.required_date)}</td>
      <td>${fmt(row.status_label)}</td>
      <td>${statusChip({ label: `${row.overdue_days} kun`, tone: "danger" })}</td>
    </tr>`,
    ""
  );
}

// What the customer owes against what they have been asked for. The advance
// lives at the contract, so this is the only level where the two can be
// compared -- per order the advance is invisible.
function billingPositionHtml(contract) {
  const billing = contract.summary?.billing;
  if (!billing) return `<div class="empty">Hisob-kitob holati hisoblanmadi.</div>`;
  const over = numberValue(billing.over_billed);
  const rows = [
    ["Buyurtmalar bo'yicha to'lanishi kerak", fmtMoney(billing.billable)],
    ["Hisob qo'yilgan", fmtMoney(billing.invoiced)],
    ["Shundan avans", fmtMoney(billing.advance_invoiced)],
    ["To'langan", fmtMoney(billing.paid)],
    ["Hisob qilinmagan qoldiq", fmtMoney(billing.remaining_to_bill)],
  ];
  const verdict = over > 0
    ? statusChip({ label: "Ortiqcha hisob", tone: "danger" })
    : statusChip({ label: "Mos", tone: "success" });
  return `<div class="detail-list">
    ${rows.map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${value}</strong></div>`).join("")}
    <div class="detail-item"><span>Farq</span><strong>${fmtMoney(over)} ${verdict}</strong></div>
  </div>`;
}

function paymentScheduleHtml(contract) {
  const rows = contract.summary?.payment_schedule || [];
  if (!rows.length) return `<div class="empty">To'lov muddatlari hisoblanmadi — to'lov shartlari kiritilmagan.</div>`;
  return tableOrEmpty(
    rows,
    ["To'lov", "Muddat", "Summa", "To'langan", "Qoldiq", "Holat"],
    (item) => {
      const state = item.is_overdue
        ? statusChip({ label: `${item.overdue_days} kun kechikdi`, tone: "danger" })
        : Number(item.outstanding) <= 0
          ? statusChip({ label: "To'langan", tone: "success" })
          : statusChip({ label: "Kutilmoqda", tone: "warning" });
      return `<tr class="${item.is_overdue ? "row-overdue" : ""}">
        <td>${fmt(item.label)}</td>
        <td data-noloc>${item.due_date ? fmtDayOnly(item.due_date) : dash}</td>
        <td>${fmtMoney(item.amount)}</td>
        <td>${fmtMoney(item.paid_amount)}</td>
        <td>${fmtMoney(item.outstanding)}</td>
        <td>${state}</td>
      </tr>`;
    },
    "To'lov muddatlari yo'q."
  );
}

function contractHeader(contract) {
  const warnings = [];
  // The old rule was "nothing paid and an advance exists", which says the same
  // mild thing on day one and on day two hundred. The deadline decides now.
  // Expiry is the first thing to say: everything else on the card is about a
  // contract that may no longer be in force.
  const daysLeft = daysUntilDate(contract.valid_until);
  if (daysLeft !== null && daysLeft < 0) {
    warnings.push(`Shartnoma muddati ${-daysLeft} kun oldin tugagan.`);
  } else if (daysLeft !== null && daysLeft <= 30) {
    warnings.push(`Shartnoma muddati ${daysLeft} kundan keyin tugaydi.`);
  }
  const lateOrders = contract.summary?.overdue_orders || [];
  if (lateOrders.length) {
    // The orders card said "Jarayonda" while six orders sat three to four
    // months past their requested date.
    const worst = lateOrders.reduce((a, b) => (a.overdue_days >= b.overdue_days ? a : b));
    warnings.push(`${lateOrders.length} ta buyurtma muddati o'tgan, eng kechikkani ${worst.overdue_days} kun.`);
  }
  (contract.delivery_plan?.warnings || []).forEach((message) => warnings.push(message));
  const overBilled = numberValue(contract.summary?.billing?.over_billed);
  if (overBilled > 0) {
    warnings.push(`Shartnoma bo'yicha ortiqcha hisob qo'yilgan: ${fmtMoney(overBilled)}`);
  }
  const overdueCount = Number(contract.summary?.overdue_count || 0);
  if (overdueCount) {
    // One template literal on one line, so the dictionary can match it as a
    // "{n} ..." pattern; split across lines it matches nothing.
    warnings.push(`${overdueCount} ta to'lov muddati o'tgan, jami ${fmtMoney(contract.summary.overdue_amount)}, eng kechikkani ${contract.summary.max_overdue_days} kun.`);
  } else if (numberValue(contract.summary?.advance_amount) > 0 && numberValue(contract.summary?.paid_amount) <= 0) {
    const advance = (contract.summary?.payment_schedule || []).find((item) => item.kind === "advance");
    warnings.push(advance?.due_date
      ? `Avans to'lovi hali kelmagan. Muddat: ${fmtDayOnly(advance.due_date)}.`
      : "Avans to'lovi hali kelmagan.");
  }
  if (numberValue(contract.summary?.remaining_quantity) > 0) warnings.push("Shartnoma bo'yicha yetkazilmagan qoldiq mavjud.");
  if (!hasDocs(contract)) warnings.push("Shartnoma hujjatlari to'liq emas.");
  // Parser warnings belong on the contract, not only on the review screen that
  // is closed the moment the contract is saved.
  (contract.parse_warnings || []).forEach((warning) => warnings.push(warning));
  const editable = canEdit("sotuv");
  const nextAction = !contract.client_id ? {title:"Shartnoma mijozga bog'lanmagan. Buyurtma yaratishdan oldin mijozni bog'lang.",button:"Mijozni bog'lash",modal:"contract-link-client"} : numberValue(contract.summary?.paid_amount)<=0 && numberValue(contract.summary?.advance_amount)>0 ? {title:"Avans hisob-fakturasini yarating yoki to'lovni kiriting",button:"Hisob yaratish",modal:"contract-invoice-modal"} : numberValue(contract.summary?.unordered_quantity)>0 ? {title:"Shartnoma bo'yicha buyurtma yarating",button:"Buyurtma yaratish",path:`/orders/new?contract_id=${contract.id}`} : numberValue(contract.summary?.remaining_quantity)>0 ? {title:"Buyurtmalar bo'yicha yetkazib berish davom etmoqda",button:"Buyurtmalarni ko'rish",path:`/contracts/${contract.id}?tab=orders`} : {title:"Shartnoma yakunlashga tayyor",button:"Tarix",path:`/contracts/${contract.id}?tab=notes`,done:true};
  return `
    ${workflowHeader({title:contract.contract_number,subtitle:`<span data-noloc>${fmt(contract.customer_name || contract.client?.name)}</span><span data-noloc> · ${fmtDayOnly(contract.contract_date)} — ${fmtDayOnly(contract.valid_until)} · </span><span>${fmt(statusLabel(contract.status))}</span>`,backPath:"/contracts",fullEditPath:editable ? `/contracts/${contract.id}/edit` : "",actions: editable ? [...(contract.client_id ? [{label:"Buyurtma yaratish",path:`/orders/new?contract_id=${contract.id}`,primary:true}] : [{label:"Mijozni bog'lash",modal:"contract-link-client",primary:true}]),{label:"Hujjat yuklash",path:`/contracts/${contract.id}?tab=documents`},{label:"O'chirish",modal:"contract-remove"}] : [{label:"Hujjat yuklash",path:`/contracts/${contract.id}?tab=documents`}]})}
    ${workflowStatusGrid([["Shartnoma holati",statusBadge(contract.status)],["Buyurtmalar holati",statusChip(numberValue(contract.summary?.remaining_quantity)>0?{label:"Jarayonda",tone:"warning"}:{label:"Yopilgan",tone:"success"})],["To'lov holati",statusChip(numberValue(contract.summary?.remaining_amount)>0?{label:"Qoldiq bor",tone:"warning"}:{label:"Yopilgan",tone:"success"})],["Yetkazib berish holati",statusChip(numberValue(contract.summary?.remaining_quantity)>0?{label:"Qoldiq bor",tone:"warning"}:{label:"To'liq",tone:"success"})]])}
    ${summaryCards([["Jami summa",fmtMoney(contract.summary?.total_amount)],["Jami miqdor",fmtQty(contract.summary?.total_quantity, contractUnit(contract))],["Yetkazilgan",fmtQty(contract.summary?.delivered_quantity, contractUnit(contract))],["Qoldiq",fmtQty(contract.summary?.remaining_quantity, contractUnit(contract))],["Avans summasi",fmtMoney(contract.summary?.advance_amount)],["To'langan summa",fmtMoney(contract.summary?.paid_amount)],["Qolgan to'lov (hisoblar bo'yicha)",fmtMoney(contract.summary?.remaining_amount)],["Transport (mijozga)",fmtMoney(contract.summary?.transport_billed_total)],["Transport xarajati (bizga)",fmtMoney(contract.summary?.transport_expense_total)]])}
    ${workflowWarningsPanel(warnings)}
    ${nextAction.done || !nextAction.modal || canEdit(contractActionModule(nextAction.modal)) ? workflowNextActionPanel(nextAction) : workflowNextActionPanel({ title: nextAction.title })}
  `;
}

function contractActionModule(modal) {
  const map = {
    "contract-link-client": "sotuv",
    "contract-invoice-modal": "moliya",
  };
  return map[modal] || "sotuv";
}

function contractTabs(active) {
  const items = [
    ["general", "Umumiy"],
    ["specification", "Spetsifikatsiya"],
    ["orders", "Buyurtmalar"],
    ["batches", "Partiyalar"],
    // Named "To'lov shartlari" it read as a page about terms, so nobody looked
    // for invoices behind it -- the order card calls the same thing "Moliya"
    // and that is where people went hunting.
    ["payment", "Moliya"],
    ["transport", "Transport"],
    ["documents", "Hujjatlar"],
    ["notes", "Tarix"],
  ];
  return workflowTabs(active, items, "contract-tab");
}

// Quantities on this page are all in the contract's own unit; showing "1 000"
// with no unit next to "4 760 000 so'm" reads as another sum.
// One wording for the remaining-payment clause. Four different ones are on
// file -- two Uzbek variants, one English default and a fragment the parser cut
// out of the middle of a sentence -- because every form supplied its own.
const CONTRACT_REMAINING_RULE = "Qolgan summa tayyor partiya bo'yicha hisob-faktura asosida to'lanadi.";

function contractUnit(contract) {
  return contract.items?.[0]?.unit || "";
}

function contractGeneralTab(contract) {
  return section("Asosiy ma'lumotlar", `
    <div class="detail-list">
      ${[
        ["Shartnoma raqami", contract.contract_number],
        ["Shartnoma sanasi", fmtDayOnly(contract.contract_date)],
        ["Amal qilish muddati", fmtDayOnly(contract.valid_until)],
        ["Tuzilgan joy", contract.place],
        ["Mijoz", contract.customer_name || contract.client?.name],
        ["Sarlavha", contract.title],
        ["Status", statusLabel(contract.status)],
        ["Valyuta", contract.currency],
        ["Didox ID", contract.didox_id],
        ["Rouming ID", contract.rouming_id],
        ["Izoh", contract.notes],
        ["Yaratilgan", fmtDate(contract.created_at)],
        ["Yangilangan", fmtDate(contract.updated_at)],
      ].map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}
    </div>
  `) + section("Hisob-kitob holati", billingPositionHtml(contract))
  + section("Yetkazib berish rejasi", deliveryPlanHtml(contract))
  + (lateOrdersHtml(contract) ? section("Muddati o'tgan buyurtmalar", lateOrdersHtml(contract)) : "")
  + section("To'lov muddatlari", paymentScheduleHtml(contract))
  + (canEdit("sotuv") ? section("Holatni o'zgartirish", contractTransitionsHtml(contract)) : "")
  + section("Holat tarixi", tableOrEmpty(contract.status_history, ["Sana", "Oldingi holat", "Yangi holat", "Izoh", "Kim"], (item) => `
      <tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.old_status_label)}</td><td>${fmt(item.new_status_label)}</td><td>${fmt(item.comment)}</td><td>${fmt(item.changed_by)}</td></tr>
    `, "Holat tarixi mavjud emas."))
  + section("Bajaruvchi", detailList([["Bajaruvchi nomi", contract.executor_name], ["Direktor F.I.Sh.", contract.executor_director_full_name], ["STIR", contract.executor_inn], ["OKED", contract.executor_oked], ["Yuridik manzil", contract.executor_legal_address], ["Hisob raqami", contract.executor_bank_account], ["Bank nomi", contract.executor_bank_name], ["MFO", contract.executor_mfo], ["Telefon", contract.executor_phone]])) + section("Buyurtmachi", detailList([["Buyurtmachi nomi", contract.customer_name || contract.client?.name], ["Direktor F.I.Sh.", contract.customer_director_full_name], ["STIR", contract.customer_inn || contract.client?.inn], ["OKED", contract.customer_oked], ["Yuridik manzil", contract.customer_legal_address], ["Hisob raqami", contract.customer_bank_account], ["Bank nomi", contract.customer_bank_name], ["MFO", contract.customer_mfo], ["Telefon", contract.customer_phone]])) + section("Bog'langan obyektlar", `<div class="detail-list">${[["ERP mijoz", contract.client?.name], ["Talabnoma ID", contract.customer_request_id], ["Parser versiyasi", contract.parser_version], ["Aniqlik darajasi", parseConfidenceLabel(contract)]].map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}<div class="detail-item"><span>PDF fayl</span><strong>${contract.source_file_path ? `<a class="link-btn" target="_blank" href="/api/contracts/${contract.id}/file">PDF faylni ko'rish</a>` : dash}</strong></div></div>`);
}

function contractSpecificationTab(contract) {
  const editable = canEdit("sotuv");
  return section("Spetsifikatsiya", `
    ${editable ? `<div class="actions"><button class="btn primary" data-contract-child="items">Mahsulot qo'shish</button></div>` : ""}
    ${tableOrEmpty(contract.items, ["Mahsulot", "Kod", "Birlik", "Miqdor", "Birlik narxi (QQSsiz)", "Birlik narxi (QQS bilan)", "QQS", "Jami", "Amallar"], (item) => `
      <tr>
        <td>${fmt(item.product_name)}</td><td>${fmt(item.product_code)}</td><td>${fmt(item.unit)}</td>
        <td>${fmtQty(item.quantity)}</td><td>${fmtMoney(item.unit_price)}</td>
        <td>${fmtMoney(unitPriceWithVat(item))}</td><td>${fmtMoney(item.vat_amount)} (${fmt(item.vat_rate)}%)</td>
        <td>${fmtMoney(item.total_with_vat)}</td>
        <td><div class="table-actions">${editable ? `<button class="link-btn" data-contract-edit="items" data-id="${item.id}">Tahrirlash</button><button class="link-btn" data-contract-delete="items" data-id="${item.id}">O'chirish</button>` : ""}</div></td>
      </tr>
    `, "Spetsifikatsiya elementlari yo'q.")}
    <div class="totals-bar">
      <div class="total-box"><span>Oraliq summa</span><strong>${fmtMoney(contract.summary?.subtotal_amount)}</strong></div>
      <div class="total-box"><span>QQS</span><strong>${fmtMoney(contract.summary?.vat_amount)}</strong></div>
      <div class="total-box"><span>QQS bilan jami</span><strong>${fmtMoney(contract.summary?.total_amount)}</strong></div>
      <div class="total-box"><span>Elementlar</span><strong>${fmt(contract.summary?.items_count)}</strong></div>
    </div>
  `);
}

function contractPaymentTab(contract, invoices = []) {
  const item = contract.payment_terms || {};
  const clientId = contract.client_id || contract.client?.id || "";
  const editable = canEdit("sotuv");
  return section("Moliya", `
    <div class="actions">${editable ? `<button class="btn primary" data-contract-child="payment">To'lov shartlarini tahrirlash</button>` : ""}${canEdit("moliya") ? `<button class="btn" type="button" data-contract-invoice-modal>Hisob yaratish</button><button class="btn" data-nav="/customer-payments/new?client_id=${clientId}&contract_id=${contract.id}">To'lov qo'shish</button>` : ""}</div>
    <h3 class="section-subtitle">To'lov shartlari</h3>
    <div class="detail-list">
      ${[
        ["Avans foizi", item.advance_percent ? `${item.advance_percent}%` : null],
        ["Avans summasi", fmtMoney(item.advance_amount)],
        ["Avans muddati, kun", item.advance_due_days],
        ["Qoldiq foizi", item.remaining_percent ? `${item.remaining_percent}%` : null],
        ["Partiya to'lovi muddati, kun", item.batch_payment_due_days],
        ["Qoldiq to'lov qoidasi", item.remaining_payment_rule],
        ["Izoh", item.notes],
      ].map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}
    </div>
    <h3 class="section-subtitle">Mijoz hisob-fakturalari</h3>
    ${tableOrEmpty(invoices, ["Hisob raqami", "Turi", "Hisob sanasi", "To'lov muddati", "Jami", "To'langan", "Qoldiq", "Status", "Amallar"], (invoice) => `
      <tr>
        <td>${fmt(invoice.invoice_number)}</td>
        <td>${fmt(optionLabel(invoiceTypes, invoice.invoice_type))}</td>
        <td>${fmt(invoice.invoice_date)}</td>
        <td>${fmt(invoice.due_date)}</td>
        <td>${fmtMoney(invoice.total_amount)}</td>
        <td>${fmtMoney(invoice.paid_amount)}</td>
        <td>${fmtMoney(invoice.remaining_amount)}</td>
        <td>${statusBadge(invoice.status)}</td>
        <td><button class="link-btn" data-nav="/customer-invoices/${invoice.id}">Ochish</button></td>
      </tr>
    `, "Ushbu shartnoma bo'yicha hisob-fakturalar topilmadi.")}
  `);
}

function contractTransportTab(contract, logisticsRows = []) {
  const item = contract.transport_terms || {};
  return section("Transport", `
    ${canEdit("sotuv") ? `<div class="actions"><button class="btn primary" data-contract-child="transport">Transport shartlarini tahrirlash</button></div>` : ""}
    <div class="detail-list">
      ${[
        ["Transport to'lovi turi", optionLabel(transportPaymentTypes, item.transport_payment_type)],
        ["Yetkazib berish usuli", optionLabel(deliveryMethods, item.delivery_method)],
        ["Izoh", item.notes],
      ].map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}
    </div>
    ${tableOrEmpty(logisticsRows, ["Partiya", "Buyurtma", "Tashuvchi", "Haydovchi", "Transport", "Xarajat", "Mijoz narxi", "Kim to'laydi", "Status", "Amallar"], (row) => `
      <tr>
        <td>${fmt(row.batch?.batch_number)}</td>
        <td>${fmt(row.order?.order_number)}</td>
        <td>${fmt(row.carrier_name)}</td>
        <td>${fmt(row.driver_name)}</td>
        <td>${fmt(row.vehicle_number)}</td>
        <td>${fmtMoney(row.cost_amount)}</td>
        <td>${fmtMoney(row.customer_price)}</td>
        <td>${fmt(optionLabel(paidByTypes, row.paid_by))}</td>
        <td>${fmt(optionLabel(logisticsStatuses, row.status))}</td>
        <td><button class="link-btn" data-nav="/logistics/${row.id}">Ochish</button></td>
      </tr>
    `, "Logistika yozuvlari topilmadi.")}
  `);
}

function contractDocumentsTab(contract) {
  const editable = canEdit("sotuv");
  return section("Hujjatlar", `
    ${editable ? `<div class="actions"><button class="btn primary" data-contract-child="documents">Hujjat qo'shish</button></div>` : ""}
    ${tableOrEmpty(contract.documents, ["Hujjat nomi", "Turi", "Yuklangan sana", "Yuklagan", "Amallar"], (item) => `
      <tr>
        <td>${fmt(item.title)}</td><td>${fmt(optionLabel(contractDocumentTypes, item.document_type))}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td>
        <td><div class="table-actions">
          ${item.file_url ? `<a class="link-btn" target="_blank" href="${esc(item.file_url)}">Ochish</a><a class="link-btn" href="${esc(item.file_url)}" download>Yuklab olish</a>` : `<button class="link-btn" disabled>Ochish</button><button class="link-btn" disabled>Yuklab olish</button>`}
          ${editable ? `<button class="link-btn" data-contract-edit="documents" data-id="${item.id}">Tahrirlash</button>
          <button class="link-btn" data-contract-delete="documents" data-id="${item.id}">O'chirish</button>` : ""}
        </div></td>
      </tr>
    `, "Shartnoma hujjatlari hali yo'q.")}
  `);
}

function contractNotesTab(contract) {
  const editable = canEdit("sotuv");
  return section("Izohlar / Tarix", `
    ${editable ? `<div class="actions"><button class="btn primary" data-contract-child="notes">Izoh qo'shish</button></div>` : ""}
    ${tableOrEmpty(contract.notes_history, ["Sana", "Foydalanuvchi", "Izoh", "Amallar"], (item) => `
      <tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td><td>${editable ? `<button class="link-btn" data-contract-delete="notes" data-id="${item.id}">O'chirish</button>` : ""}</td></tr>
    `, "Izohlar hali yo'q.")}
  `);
}

function contractOrdersTab(contract, orders = []) {
  const editable = canEdit("sotuv");
  return section("Buyurtmalar", `
    ${editable ? `<div class="actions"><button class="btn primary" data-nav="/orders/new?contract_id=${contract.id}">Buyurtma yaratish</button></div>` : ""}
    ${tableOrEmpty(orders, ["Buyurtma raqami", "Sana", "Mahsulot", "Miqdor", "Yetkazilgan", "Qoldiq", "Ta'minotchi", "Status", "Amallar"], (order) => `
      <tr>
        <td><strong>${fmt(order.order_number)}</strong></td>
        <td>${fmt(order.order_date)}</td>
        <td>${fmt(order.product)}</td>
        <td>${fmtQty(order.total_quantity)}</td>
        <td>${fmtQty(order.delivered_quantity)}</td>
        <td>${fmtQty(order.remaining_quantity)}</td>
        <td>${fmt(order.supplier_name)}</td>
        <td>${fmt(optionLabel(orderStatuses, order.status))}</td>
        <td><div class="table-actions"><button class="link-btn" data-nav="/orders/${order.id}">Ochish</button>${editable ? `<button class="link-btn" data-nav="/orders/${order.id}/edit">To'liq tahrirlash</button>` : ""}</div></td>
      </tr>
    `, "Ushbu shartnoma bo'yicha buyurtmalar topilmadi.")}
  `);
}

function contractBatchesTab(contract, batches = []) {
  return section("Partiyalar", `
    ${tableOrEmpty(batches, ["Partiya raqami", "Buyurtma", "Mahsulot", "Reja", "Yuklangan", "Qabul qilingan", "Ta'minotchi", "Status", "Amallar"], (batch) => `
      <tr>
        <td><strong>${fmt(batch.batch_number)}</strong></td>
        <td>${fmt(batch.order?.order_number)}</td>
        <td>${fmt(batch.product)}</td>
        <td>${fmtQty(batch.total_planned_quantity)}</td>
        <td>${fmtQty(batch.total_loaded_quantity)}</td>
        <td>${fmtQty(batch.total_accepted_quantity)}</td>
        <td>${fmt(batch.supplier_name)}</td>
        <td>${fmt(optionLabel(batchStatuses, batch.status))}</td>
        <td><div class="table-actions"><button class="link-btn" data-nav="/delivery-batches/${batch.id}">Ochish</button><button class="link-btn" data-nav="/delivery-batches/${batch.id}/edit">To'liq tahrirlash</button></div></td>
      </tr>
    `, "Yetkazib berish partiyalari topilmadi.")}
  `);
}

function renderContractActiveTab(contract, active, related = {}) {
  if (active === "specification") return contractSpecificationTab(contract);
  if (active === "orders") return contractOrdersTab(contract, related.orders || []);
  if (active === "batches") return contractBatchesTab(contract, related.batches || []);
  if (active === "payment") return contractPaymentTab(contract, related.invoices || []);
  if (active === "transport") return contractTransportTab(contract, related.logistics || []);
  if (active === "documents") return contractDocumentsTab(contract);
  if (active === "notes") return contractNotesTab(contract);
  return contractGeneralTab(contract);
}

function contractChildForm(kind, item = {}, products = []) {
  if (kind === "schedule") {
    const now = new Date();
    return {
      title: item.id ? "Grafik qatorini tahrirlash" : "Grafikka oy qo'shish",
      tab: "general",
      path: "schedule",
      body: `<div class="grid">
        ${textField("year", "Yil", item.year ?? now.getFullYear(), "number", { required: true })}
        <label><span class="field-label-text">Oy <span class="required-mark" aria-hidden="true">*</span></span>
          <select name="month" required>${MONTH_NAMES.map((label, index) => `<option value="${index + 1}" ${Number(item.month) === index + 1 ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        ${textField("quantity", "Miqdor", item.quantity ?? "", "number", { required: true })}
      </div>`,
      payload: (form) => ({
        year: Number(normalizeNumberInputValue(field(form, "year"))),
        month: Number(field(form, "month")),
        quantity: normalizeNumberInputValue(field(form, "quantity")),
      }),
    };
  }
  if (kind === "items") {
    return {
      title: item.id ? "Mahsulotni tahrirlash" : "Mahsulot qo'shish",
      tab: "specification",
      path: "items",
      body: `<div class="grid">
        <label>Mahsulot katalogi<select name="product_id" data-item-product-select="">${buildProductOptions(products, item.product_id)}</select></label>
        ${textField("product_name", "Nomi (qo'lda)", item.product_name || "")}
        ${textField("product_code", "Kodi", item.product_code || "")}
        ${textField("unit", "Birlik", item.unit || "tonna")}
        ${textField("quantity", "Miqdor", item.quantity ?? "", "number")}
        ${textField("unit_price", "Birlik narxi", item.unit_price ?? "", "number")}
        ${textField("vat_rate", "QQS %", item.vat_rate ?? 12, "number")}
      </div>`,
      payload: (form) => ({
        product_id: form.elements.product_id?.value ? Number(form.elements.product_id.value) : null,
        product_name: field(form, "product_name"),
        product_code: field(form, "product_code") || null,
        unit: field(form, "unit"),
        quantity: field(form, "quantity"),
        unit_price: field(form, "unit_price"),
        vat_rate: field(form, "vat_rate") || "12",
      }),
    };
  }
  if (kind === "payment") {
    return {
      title: "To'lov shartlarini tahrirlash",
      tab: "payment",
      path: "payment-terms",
      method: "PUT",
      body: `<div class="grid">${textField("advance_percent", "Avans foizi", item.advance_percent ?? 30, "number")}${textField("advance_due_days", "Avans muddati, kun", item.advance_due_days ?? 10, "number")}${textField("batch_payment_due_days", "Partiya to'lovi muddati, kun", item.batch_payment_due_days ?? 3, "number")}${textArea("remaining_payment_rule", "Qoldiq to'lov qoidasi", item.remaining_payment_rule || CONTRACT_REMAINING_RULE, { maxlength: 2000 })}${textArea("notes", "Izohlar", item.notes, { maxlength: 2000 })}</div>`,
      payload: (form) => ({ advance_percent: field(form, "advance_percent"), advance_due_days: Number(field(form, "advance_due_days") || 10), batch_payment_due_days: Number(field(form, "batch_payment_due_days") || 3), remaining_payment_rule: field(form, "remaining_payment_rule"), notes: field(form, "notes") }),
    };
  }
  if (kind === "transport") {
    return {
      title: "Transport shartlarini tahrirlash",
      tab: "transport",
      path: "transport-terms",
      method: "PUT",
      body: `<div class="grid">${selectField("transport_payment_type", "Transport payment type", transportPaymentTypes, item.transport_payment_type || "separate_invoice")}${selectField("delivery_method", "Delivery method", deliveryMethods, item.delivery_method || "mixed")}${textArea("notes", "Notes", item.notes)}</div>`,
      payload: (form) => ({ transport_payment_type: field(form, "transport_payment_type"), delivery_method: field(form, "delivery_method"), notes: field(form, "notes") }),
    };
  }
  if (kind === "documents") {
    return {
      title: item.id ? "Hujjatni tahrirlash" : "Hujjat qo'shish",
      tab: "documents",
      path: "documents",
      multipart: true,
      uploadPath: item.id ? `documents/${item.id}/upload` : "documents/upload",
      body: `<div class="grid">${selectField("document_type", "Hujjat turi", contractDocumentTypes, item.document_type || "other")}${textField("title", "Hujjat nomi", item.title)}<label>Fayl${item.id ? "" : ' <span class="required-mark">*</span>'}<input type="file" name="file" ${item.id ? "" : "required"} /></label>${textField("uploaded_by", "Yuklagan", item.uploaded_by)}</div>${item.file_url ? `<div class="empty compact">Joriy fayl: <a class="link-btn" target="_blank" href="${esc(item.file_url)}">Ochish</a></div>` : ""}`,
      payload: (form) => {
        const formData = new FormData();
        formData.append("document_type", field(form, "document_type") || "other");
        formData.append("title", field(form, "title") || "");
        const uploadedBy = field(form, "uploaded_by");
        if (uploadedBy) formData.append("uploaded_by", uploadedBy);
        if (form.elements.file.files[0]) formData.append("file", form.elements.file.files[0]);
        return formData;
      },
    };
  }
  return {
    title: "Add note",
    tab: "notes",
    path: "notes",
    body: `<div class="grid">${textArea("note", "Izoh", item.note)}${textField("created_by", "Foydalanuvchi", item.created_by)}</div>`,
    payload: (form) => ({ note: field(form, "note"), created_by: field(form, "created_by") }),
  };
}

async function openContractChildForm(contract, kind, item = {}) {
  const products = kind === "items" ? await api("/api/products") : [];
  const cfg = contractChildForm(kind, item, products);
  app.innerHTML = `
    <div class="page">
      ${contractHeader(contract)}
      ${section(cfg.title, `
        <form id="contract-child-form">
          ${cfg.body}
          <div class="form-footer">
            <button type="button" class="btn" data-nav="/contracts/${contract.id}?tab=${cfg.tab}">Bekor qilish</button>
            <button type="submit" class="btn primary">Saqlash</button>
          </div>
        </form>
      `)}
    </div>
  `;
  if (kind === "items") bindProductSelects(document.querySelector("#contract-child-form"));
  document.querySelector("#contract-child-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const method = cfg.method || (item.id ? "PATCH" : "POST");
    const path = cfg.multipart
      ? `/api/contracts/${contract.id}/${cfg.uploadPath}`
      : item.id && !cfg.method
        ? `/api/contracts/${contract.id}/${cfg.path}/${item.id}`
        : `/api/contracts/${contract.id}/${cfg.path}`;
    try {
      if (cfg.multipart) {
        await apiForm(path, cfg.payload(event.currentTarget), { method });
      } else {
        await api(path, { method, body: JSON.stringify(cfg.payload(event.currentTarget)) });
      }
      showToast("Saqlandi.");
      navigate(`/contracts/${contract.id}?tab=${cfg.tab}`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function invoiceItemFromModalAmount(contract, type, amount) {
  const total = numberValue(amount);
  const vatRate = 12;
  const unitPrice = total > 0 ? total / (1 + vatRate / 100) : 0;
  const typeLabel = optionLabel(invoiceTypes, type);
  return {
    description: `${fmt(contract.contract_number)} bo'yicha ${typeLabel}`,
    product_name: typeLabel,
    unit: "dona",
    quantity: "1",
    unit_price: unitPrice.toFixed(2),
    vat_rate: String(vatRate),
  };
}

function contractInvoiceDefaultDueDate(contract, invoiceType, invoiceDate) {
  if (invoiceType === "advance") return addBusinessDays(invoiceDate, contract.payment_terms?.advance_due_days || 0);
  if (invoiceType === "batch_payment") return addDays(invoiceDate, contract.payment_terms?.batch_payment_due_days || 0);
  return invoiceDate;
}

function contractInvoiceDefaultAmount(contract, invoiceType, state = {}) {
  if (invoiceType === "advance") {
    return String(numberValue(contract.payment_terms?.advance_amount || contract.summary?.advance_amount) || "");
  }
  if (invoiceType === "remaining") {
    return String(numberValue(contract.summary?.remaining_amount) || "");
  }
  if (invoiceType === "transport") {
    return String(numberValue(state.batchDetail?.logistics?.customer_price) || "");
  }
  return "";
}

function contractInvoiceModal(contract, state = {}) {
  const type = state.invoiceType || "advance";
  const invoiceDate = state.invoiceDate || new Date().toISOString().slice(0, 10);
  const dueDate = state.dueDate || contractInvoiceDefaultDueDate(contract, type, invoiceDate);
  const advanceAmount = numberValue(contract.payment_terms?.advance_amount || contract.summary?.advance_amount);
  const defaultAmount = contractInvoiceDefaultAmount(contract, type, state);
  const amount = state.amount || defaultAmount;
  const needsBatch = ["batch_payment", "transport"].includes(type);
  const selectedBatch = (state.batches || []).find((batch) => Number(batch.id) === Number(state.deliveryBatchId));
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="contract-invoice-modal-title">
      <div class="modal-header">
        <h2 id="contract-invoice-modal-title">Mijoz hisob-fakturasini yaratish</h2>
        <button class="modal-close" type="button" data-modal-close aria-label="Yopish">×</button>
      </div>
      <form id="contract-invoice-modal-form">
        <div class="modal-body">
          <div class="modal-summary">${detailList([
            ["Shartnoma raqami", contract.contract_number],
            ["Mijoz", contract.client?.name],
            ["Shartnoma jami summasi", fmtMoney(contract.summary?.total_amount || contract.total_amount)],
            ["Avans foizi", contract.payment_terms?.advance_percent ? `${fmt(contract.payment_terms.advance_percent)}%` : null],
            ["Avans summasi", fmtMoney(advanceAmount)],
            ["Qolgan summa", fmtMoney(contract.summary?.remaining_amount)],
          ])}</div>
          ${state.hasAdvanceInvoice && type === "advance" ? workflowWarningsPanel(["Ushbu shartnoma uchun avans hisob-fakturasi allaqachon mavjud."]) : ""}
          <div class="grid">
            ${selectField("invoice_type", "Hisob turi", invoiceTypes, type, { required: true })}
            ${textField("invoice_date", "Hisob sanasi", invoiceDate, "date", { required: true })}
            ${textField("due_date", "To'lov muddati", dueDate, "date", { required: true })}
            ${moneyInputField("amount", "Summa", amount, { required: true })}
            ${needsBatch ? `<label class="form-field">Partiya<span class="required-mark">*</span><select name="delivery_batch_id" required><option value="">Partiyani tanlang</option>${(state.batches || []).map((batch) => `<option value="${batch.id}" ${Number(state.deliveryBatchId) === Number(batch.id) ? "selected" : ""}>${esc(batch.batch_number)}${batch.order?.order_number ? ` - ${esc(batch.order.order_number)}` : ""}</option>`).join("")}</select></label>` : ""}
            ${needsBatch && selectedBatch ? readonlyField("selected_order", "Buyurtma", selectedBatch.order?.order_number || "") : ""}
            ${textArea("notes", "Izoh", state.notes || "")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-modal-close>Bekor qilish</button>
          <button class="btn primary" type="submit">Hisob yaratish</button>
        </div>
      </form>
    </section>
  </div>`;
}

async function openContractInvoiceModal(contract) {
  const [advanceInvoices, batchesData] = await Promise.all([
    api(`/api/customer-invoices?contract_id=${contract.id}&invoice_type=advance&page_size=100`),
    api(`/api/delivery-batches?contract_id=${contract.id}&page_size=100`).catch(() => ({ items: [] })),
  ]);
  const state = {
    invoiceType: "advance",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    amount: contractInvoiceDefaultAmount(contract, "advance"),
    notes: "",
    deliveryBatchId: "",
    batches: batchesData.items || [],
    hasAdvanceInvoice: (advanceInvoices.items || []).some((invoice) => invoice.status !== "cancelled"),
  };

  async function hydrateSelectedBatch() {
    if (!state.deliveryBatchId) {
      state.batchDetail = null;
      return;
    }
    state.batchDetail = await api(`/api/delivery-batches/${state.deliveryBatchId}`);
    if (state.invoiceType === "transport") {
      state.amount = state.batchDetail?.logistics?.customer_price || "";
    } else if (state.invoiceType === "batch_payment") {
      const rows = await invoiceRowsFromBatch(state.deliveryBatchId);
      const total = (rows?.rows || []).reduce((sum, item) => {
        const subtotal = numberValue(item.quantity) * numberValue(item.unit_price);
        return sum + subtotal + subtotal * numberValue(item.vat_rate || 12) / 100;
      }, 0);
      if (total > 0) state.amount = String(total.toFixed(2));
    }
  }

  async function draw() {
    document.querySelector(".modal-backdrop")?.remove();
    document.body.insertAdjacentHTML("beforeend", contractInvoiceModal(contract, state));
    const backdrop = document.querySelector(".modal-backdrop");
    const form = document.querySelector("#contract-invoice-modal-form");
    const close = () => backdrop?.remove();
    backdrop?.addEventListener("click", (event) => {
      if (event.target.matches("[data-modal-close]")) close();
    });
    form?.elements.invoice_type?.addEventListener("change", async () => {
      state.invoiceType = form.elements.invoice_type.value;
      state.invoiceDate = form.elements.invoice_date.value;
      state.dueDate = contractInvoiceDefaultDueDate(contract, state.invoiceType, state.invoiceDate);
      state.amount = contractInvoiceDefaultAmount(contract, state.invoiceType, state);
      state.deliveryBatchId = "";
      await draw();
    });
    form?.elements.invoice_date?.addEventListener("change", async () => {
      state.invoiceDate = form.elements.invoice_date.value;
      state.dueDate = contractInvoiceDefaultDueDate(contract, state.invoiceType, state.invoiceDate);
      await draw();
    });
    form?.elements.delivery_batch_id?.addEventListener("change", async () => {
      state.invoiceDate = form.elements.invoice_date.value;
      state.dueDate = form.elements.due_date.value;
      state.amount = form.elements.amount.value;
      state.notes = form.elements.notes.value.trim();
      state.deliveryBatchId = form.elements.delivery_batch_id.value;
      await hydrateSelectedBatch();
      await draw();
    });
    form?.elements.amount?.addEventListener("input", () => {
      const input = form.elements.amount;
      input.value = formatNumberInputValue(input.value);
      state.amount = input.value;
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.invoiceType = field(form, "invoice_type");
      state.invoiceDate = field(form, "invoice_date");
      state.dueDate = field(form, "due_date");
      state.amount = field(form, "amount");
      state.notes = field(form, "notes") || "";
      state.deliveryBatchId = field(form, "delivery_batch_id") || "";
      if (!state.invoiceType) return showToast("Hisob turi majburiy.", true);
      if (!state.invoiceDate) return showToast("Hisob sanasi majburiy.", true);
      if (!state.dueDate) return showToast("To'lov muddati majburiy.", true);
      if (numberValue(state.amount) <= 0) return showToast("Summa 0 dan katta bo'lishi kerak.", true);
      if (["batch_payment", "transport"].includes(state.invoiceType) && !state.deliveryBatchId) return showToast("Ushbu hisob turi uchun partiyani tanlang.", true);
      if (state.invoiceType === "advance" && state.hasAdvanceInvoice && !confirmMsg("Ushbu shartnoma uchun avans hisob-fakturasi allaqachon mavjud. Davom etasizmi?")) return;
      if (state.deliveryBatchId && !state.batchDetail) await hydrateSelectedBatch();
      const batch = state.batchDetail || null;
      const invoiceNumber = generatedInvoiceNumber(contract.contract_number, batch?.batch_number || "");
      const payload = {
        client_id: Number(contract.client_id || contract.client?.id),
        contract_id: Number(contract.id),
        order_id: batch?.order_id || null,
        delivery_batch_id: batch?.id || null,
        logistics_id: batch?.logistics?.id || null,
        invoice_number: invoiceNumber,
        invoice_date: state.invoiceDate,
        due_date: state.dueDate,
        invoice_type: state.invoiceType,
        status: "issued",
        currency: contract.currency || "UZS",
        notes: state.notes || null,
        items: [invoiceItemFromModalAmount(contract, state.invoiceType, state.amount)],
      };
      try {
        await api("/api/customer-invoices", { method: "POST", body: JSON.stringify(payload) });
        showToast("Hisob-faktura yaratildi.");
        close();
        navigate(`/contracts/${contract.id}?tab=payment`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  await draw();
}

async function renderContractDetail(id) {
  app.innerHTML = `<div class="page"><div class="empty">Shartnoma yuklanmoqda...</div></div>`;
  const contract = await api(`/api/contracts/${id}`);
  const active = new URLSearchParams(location.search).get("tab") || "general";
  const related = {};
  if (active === "orders") {
    related.orders = (await api(`/api/orders?contract_id=${id}&page_size=100`)).items;
  }
  if (active === "batches") {
    related.batches = (await api(`/api/delivery-batches?contract_id=${id}&page_size=100`)).items;
  }
  if (active === "transport") {
    related.logistics = (await api(`/api/logistics?contract_id=${id}&page_size=100`)).items;
  }
  if (active === "payment") {
    related.invoices = (await api(`/api/customer-invoices?contract_id=${id}&page_size=100`)).items;
  }
  app.innerHTML = `<div class="page">${contractHeader(contract)}${contractTabs(active)}${renderContractActiveTab(contract, active, related)}</div>`;

  bindContractStatusActions(contract);
  document.querySelectorAll("[data-contract-tab]").forEach((button) => {
    button.addEventListener("click", () => navigate(`/contracts/${id}?tab=${button.dataset.contractTab}`));
  });
  document.querySelectorAll("[data-contract-child]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.contractChild;
      const item = kind === "payment" ? contract.payment_terms : kind === "transport" ? contract.transport_terms : {};
      openContractChildForm(contract, kind, item || {});
    });
  });
  document.querySelectorAll("[data-contract-invoice-modal]").forEach((button) => {
    button.addEventListener("click", () => openContractInvoiceModal(contract).catch((error) => showToast(error.message, true)));
  });
  document.querySelectorAll("[data-contract-link-client]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmMsg("Shartnomani mos mijoz bilan bog'laymizmi? STIR bo'yicha mos mijoz yoki reestrdagi tashkilot topilsa shu ishlatiladi, aks holda yangi mijoz yaratiladi.")) return;
      try {
        await api(`/api/contracts/${id}/link-new-client`, { method: "POST" });
        showToast("Mijoz bog'landi.");
        renderContractDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
  document.querySelectorAll("[data-contract-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.contractEdit;
      const collection = kind === "items" ? contract.items : contract[kind];
      const item = collection.find((row) => row.id === Number(button.dataset.id));
      openContractChildForm(contract, kind, item);
    });
  });
  document.querySelectorAll("[data-contract-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.contractDelete;
      const { confirmed } = await appDialog({
        title: "Yozuvni o'chirish",
        intro: "Bu yozuv shartnomadan butunlay o'chiriladi.",
        confirmLabel: "O'chirish",
        tone: "danger",
      });
      if (!confirmed) return;
      try {
        await api(`/api/contracts/${id}/${kind}/${button.dataset.id}`, { method: "DELETE" });
        showToast("O'chirildi.");
        renderContractDetail(id);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function optionLabel(options, value) {
  return options.find(([key]) => key === value)?.[1] || value || dash;
}
