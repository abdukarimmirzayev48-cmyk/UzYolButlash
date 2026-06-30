async function fetchClientsForSelect(selectedId = null) {
  const data = await api("/api/clients?page_size=100");
  return data.items.map((client) => `
    <option value="${client.id}" ${Number(selectedId) === client.id ? "selected" : ""}>
      ${esc(client.name)}${client.inn ? ` - ${esc(client.inn)}` : ""}
    </option>
  `).join("");
}

function contractItemRow(item = {}, index = 0) {
  return `
    <div class="item-row" data-item-row>
      ${textField(`product_name_${index}`, "Product", item.product_name)}
      ${textField(`product_code_${index}`, "Code", item.product_code)}
      ${textField(`unit_${index}`, "Unit", item.unit || "tonna")}
      ${textField(`quantity_${index}`, "Quantity", item.quantity ?? "", "number")}
      ${textField(`unit_price_${index}`, "Unit price", item.unit_price ?? "", "number")}
      ${textField(`vat_rate_${index}`, "VAT %", item.vat_rate ?? 12, "number")}
      <button type="button" class="btn danger" data-remove-item>Remove</button>
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
    return {
      product_name: get("product_name"),
      product_code: get("product_code") || null,
      unit: get("unit"),
      quantity: getNumber("quantity"),
      unit_price: getNumber("unit_price"),
      vat_rate: getNumber("vat_rate") || "12",
    };
  }).filter((item) => item.product_name || item.quantity || item.unit_price);
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
    created_by: field(form, "created_by"),
    items: collectContractItems(form),
    payment_terms: {
      advance_percent: field(form, "advance_percent") || "30",
      remaining_percent: field(form, "remaining_percent") || "70",
      advance_due_days: Number(field(form, "advance_due_days") || 10),
      batch_payment_due_days: Number(field(form, "batch_payment_due_days") || 3),
      remaining_payment_rule: field(form, "remaining_payment_rule") || "Payment of the remaining amount is made per ready delivery batch based on invoice.",
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
  const clientOptions = await fetchClientsForSelect(contract?.client_id);
  const today = new Date().toISOString().slice(0, 10);
  const payment = contract?.payment_terms || {};
  const transport = contract?.transport_terms || {};
  const rows = contract?.items?.length ? contract.items : [{}];
  return `
    <div class="page">
      <div class="page-header">
        <div class="page-title">
          <h1>${contract ? "Edit contract" : "New contract"}</h1>
          <p>Contract data, specification, payment terms, transport terms, and documents.</p>
        </div>
        <div class="actions"><button class="btn" data-nav="${contract ? `/contracts/${contract.id}` : "/contracts"}">Back</button></div>
      </div>
      <form id="contract-form">
        ${section("Basic information", `
          <div class="grid">
            ${textField("contract_number", "Contract number", contract?.contract_number)}
            ${textField("contract_date", "Contract date", contract?.contract_date || today, "date")}
            ${textField("valid_until", "Valid until", contract?.valid_until || today, "date")}
            <label>Client<select name="client_id"><option value="">Select client</option>${clientOptions}</select></label>
            ${textField("title", "Title", contract?.title)}
            ${selectField("status", "Status", contractStatuses, contract?.status || "draft")}
            ${textField("created_by", "Created by", contract?.created_by)}
            ${textArea("notes", "Notes", contract?.notes)}
          </div>
        `)}
        ${section("Specification", `
          <div id="contract-items">${rows.map(contractItemRow).join("")}</div>
          <button type="button" class="btn" id="add-item">Add product</button>
          <div class="totals-bar">
            <div class="total-box"><span>Total quantity</span><strong data-total-quantity>${dash}</strong></div>
            <div class="total-box"><span>Subtotal</span><strong data-subtotal>${dash}</strong></div>
            <div class="total-box"><span>VAT amount</span><strong data-vat>${dash}</strong></div>
            <div class="total-box"><span>Total amount</span><strong data-total>${dash}</strong></div>
          </div>
        `)}
        ${section("Payment terms", `
          <div class="grid">
            ${textField("advance_percent", "Advance percent", payment.advance_percent ?? 30, "number")}
            ${textField("remaining_percent", "Remaining percent", payment.remaining_percent ?? 70, "number")}
            ${textField("advance_due_days", "Advance due days", payment.advance_due_days ?? 10, "number")}
            ${textField("batch_payment_due_days", "Batch payment due days", payment.batch_payment_due_days ?? 3, "number")}
            ${textArea("remaining_payment_rule", "Remaining payment rule", payment.remaining_payment_rule || "Payment of the remaining amount is made per ready delivery batch based on invoice.")}
            ${textArea("payment_notes", "Notes", payment.notes)}
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
            ${textArea("transport_notes", "Notes", transport.notes)}
          </div>
        `)}
        ${section("Documents", `<div class="empty">Contract-level document metadata can be added from the Documents tab after saving.</div>`)}
        <div class="form-footer">
          <button type="button" class="btn" data-nav="${contract ? `/contracts/${contract.id}` : "/contracts"}">Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>
    </div>
  `;
}

function bindContractForm(contract = null) {
  const form = document.querySelector("#contract-form");
  const refresh = () => calculateContractForm(form);
  form.addEventListener("input", refresh);
  document.querySelector("#add-item").addEventListener("click", () => {
    const index = form.querySelectorAll("[data-item-row]").length;
    document.querySelector("#contract-items").insertAdjacentHTML("beforeend", contractItemRow({}, index));
    refresh();
  });
  form.addEventListener("click", (event) => {
    if (!event.target.matches("[data-remove-item]")) return;
    if (form.querySelectorAll("[data-item-row]").length <= 1) {
      showToast("Contract must have at least one item.", true);
      return;
    }
    event.target.closest("[data-item-row]").remove();
    refresh();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = collectContractPayload(form);
    if (!payload.client_id || !payload.contract_number || !payload.contract_date || !payload.valid_until) {
      showToast("Client, contract number, contract date, and validity are required.", true);
      return;
    }
    if (!payload.items.length || payload.items.some((item) => !item.product_name || !item.unit || numberValue(item.quantity) <= 0)) {
      showToast("Add at least one valid product row.", true);
      return;
    }
    try {
      const saved = await api(contract ? `/api/contracts/${contract.id}` : "/api/contracts", {
        method: contract ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      showToast("Contract saved.");
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
  const data = await api("/api/clients?page_size=100");
  return [["", "Mijozni tanlang"], ...data.items.map((client) => [
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
  return `${selectField("client_id", "Mijoz", state.clientOptions || [["", "Mijozni tanlang"]], String(state.clientId || ""), { required: true })}
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
  return `${tableOrEmpty(rows, ['Mahsulot <span class="required-mark">*</span>', "Mahsulot kodi", 'Birlik <span class="required-mark">*</span>', 'Miqdor <span class="required-mark">*</span>', 'Birlik narxi <span class="required-mark">*</span>', 'QQS % <span class="required-mark">*</span>', "Oraliq summa", "QQS summasi", "Jami summa", ""], (item, index) => {
    const calc = totals.rows[index] || {};
    return `<tr data-contract-wizard-item="${index}">
      <td><input name="product_name_${index}" value="${esc(item.product_name || "")}" required /></td>
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
  }, "Kamida bitta mahsulot qo'shilishi kerak.")}
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
    ${textArea("remaining_payment_rule", "Qoldiq to'lov qoidasi", state.remainingPaymentRule || "Qolgan summa tayyor partiya bo'yicha hisob-faktura asosida to'lanadi.", { required: true })}
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
    state.items = itemRows.map((row, index) => ({
      product_name: form.elements[`product_name_${index}`]?.value.trim() || "",
      product_code: form.elements[`product_code_${index}`]?.value.trim() || "",
      unit: form.elements[`unit_${index}`]?.value.trim() || "tonna",
      quantity: normalizeNumberInputValue(form.elements[`quantity_${index}`]?.value || ""),
      unit_price: normalizeNumberInputValue(form.elements[`unit_price_${index}`]?.value || ""),
      vat_rate: normalizeNumberInputValue(form.elements[`vat_rate_${index}`]?.value || "12"),
    }));
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
      remaining_payment_rule: state.remainingPaymentRule || "Qolgan summa tayyor partiya bo'yicha hisob-faktura asosida to'lanadi.",
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
    state.items.push({ product_name: "", product_code: "", unit: "tonna", quantity: "", unit_price: "", vat_rate: "12" });
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
    validUntil: today,
    title: "",
    status: "draft",
    currency: "UZS",
    notes: "",
    items: [{ product_name: "", product_code: "", unit: "tonna", quantity: "", unit_price: "", vat_rate: "12" }],
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
  state.clientOptions = await contractWizardClientOptions(state.clientId);
  if (state.clientId) state.client = await api(`/api/clients/${state.clientId}`);

  async function draw() {
    app.innerHTML = contractWizardHtml(state);
    bindContractWizard(state, draw);
  }

  await draw();
}

async function renderContractsList() {
  app.innerHTML = `<div class="page ops-page"><div class="empty">Shartnomalar yuklanmoqda...</div></div>`;
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/contracts?${params.toString()}`);
  app.innerHTML = opsListPage({
    className: "contracts-ops-page",
    title: "Shartnomalar",
    tabs: [{ label: "Mijozlar", path: "/clients" }, { label: "Shartnomalar", active: true }, { label: "Buyurtmalar", path: "/orders" }],
    createPath: "/contracts/new",
    clearPath: "/contracts",
    counter: `${fmt(data.total)} ta shartnoma`,
    formId: "contract-search-form",
    filters: `<input name="contract_number" placeholder="Shartnoma raqami" value="${esc(params.get("contract_number") || "")}" /><input name="client_name" placeholder="Mijoz" value="${esc(params.get("client_name") || "")}" /><input name="inn" placeholder="STIR" value="${esc(params.get("inn") || "")}" /><input name="product_name" placeholder="Mahsulot" value="${esc(params.get("product_name") || "")}" /><select name="status"><option value="">Status</option>${contractStatuses.map(([key, label]) => `<option value="${key}" ${params.get("status") === key ? "selected" : ""}>${label}</option>`).join("")}</select>`,
    headers: ["Shartnoma raqami", "Sana", "Mijoz", "Mahsulot", "Jami miqdor", "Jami summa", "Amal qilish muddati", "Yetkazilgan", "Qoldiq", "Status", "Oxirgi faollik", ""],
    rows: data.items.map((contract) => `<tr><td><button class="ops-primary-link" data-nav="/contracts/${contract.id}">${fmt(contract.contract_number)}</button></td><td>${fmt(contract.contract_date)}</td><td>${fmt(contract.client?.name)}</td><td>${fmt(contract.product)}</td><td>${fmtQty(contract.total_quantity)}</td><td class="ops-money">${fmtMoney(contract.total_amount)}</td><td>${fmt(contract.valid_until)}</td><td>${fmtQty(contract.delivered_quantity)}</td><td class="${numberValue(contract.remaining_quantity) > 0 ? "ops-warning" : ""}">${fmtQty(contract.remaining_quantity)}</td><td>${statusBadge(contract.status)}</td><td>${fmtDate(contract.last_activity)}</td><td><div class="ops-row-actions"><button class="link-btn" data-nav="/contracts/${contract.id}">Ochish</button><button class="link-btn" data-nav="/contracts/${contract.id}/edit">Tahrirlash</button><button class="link-btn" data-nav="/contracts/${contract.id}?tab=documents">Hujjatlar</button><button class="link-btn" data-nav="/orders/new">Buyurtma</button></div></td></tr>`).join(""),
    emptyText: "Shartnomalar topilmadi.",
    colspan: 12,
    footer: opsFooter(data, "contract"),
  });
  bindOpsSearch("contract-search-form", "/contracts", ["contract_number", "client_name", "inn", "product_name", "status"]);
  bindOpsPagination("contract", "/contracts");
}

async function renderNewContract() {
  await renderContractWizard();
}

async function renderEditContract(id) {
  app.innerHTML = `<div class="page"><div class="empty">Loading contract...</div></div>`;
  const contract = await api(`/api/contracts/${id}`);
  app.innerHTML = await contractForm(contract);
  bindContractForm(contract);
}

function contractHeader(contract) {
  const warnings = [];
  if (numberValue(contract.summary?.paid_amount) <= 0 && numberValue(contract.summary?.advance_amount) > 0) warnings.push("Avans to'lovi hali kelmagan.");
  if (numberValue(contract.summary?.remaining_quantity) > 0) warnings.push("Shartnoma bo'yicha yetkazilmagan qoldiq mavjud.");
  if (!hasDocs(contract)) warnings.push("Shartnoma hujjatlari to'liq emas.");
  return `
    ${workflowHeader({title:contract.contract_number,subtitle:`${fmt(contract.client?.name)} · ${fmt(contract.contract_date)} · ${fmt(contract.valid_until)} gacha · ${fmt(statusLabel(contract.status))}`,backPath:"/contracts",fullEditPath:`/contracts/${contract.id}/edit`,actions:[{label:"Buyurtma yaratish",path:"/orders/new",primary:true},{label:"Hujjat yuklash",path:`/contracts/${contract.id}?tab=documents`}]})}
    ${workflowStatusGrid([["Shartnoma holati",statusBadge(contract.status)],["Buyurtmalar holati",statusChip(numberValue(contract.summary?.remaining_quantity)>0?{label:"Jarayonda",tone:"warning"}:{label:"Yopilgan",tone:"success"})],["To'lov holati",statusChip(numberValue(contract.summary?.remaining_amount)>0?{label:"Qoldiq bor",tone:"warning"}:{label:"Yopilgan",tone:"success"})],["Yetkazib berish holati",statusChip(numberValue(contract.summary?.remaining_quantity)>0?{label:"Qoldiq bor",tone:"warning"}:{label:"To'liq",tone:"success"})]])}
    ${summaryCards([["Jami summa",fmtMoney(contract.summary?.total_amount)],["Jami miqdor",fmtQty(contract.summary?.total_quantity)],["Yetkazilgan",fmtQty(contract.summary?.delivered_quantity)],["Qoldiq",fmtQty(contract.summary?.remaining_quantity)],["Avans summasi",fmtMoney(contract.summary?.advance_amount)],["To'langan summa",fmtMoney(contract.summary?.paid_amount)],["Qolgan to'lov",fmtMoney(contract.summary?.remaining_amount)],["Transport xarajatlari",fmtMoney(contract.summary?.transport_expense_total)]])}
    ${workflowWarningsPanel(warnings)}
    ${workflowNextActionPanel(numberValue(contract.summary?.paid_amount)<=0 && numberValue(contract.summary?.advance_amount)>0 ? {title:"Avans hisob-fakturasini yarating yoki to'lovni kiriting",button:"Hisob yaratish",modal:"contract-invoice-modal"} : numberValue(contract.summary?.remaining_quantity)>0 ? {title:"Shartnoma bo'yicha buyurtma yarating",button:"Buyurtma yaratish",path:"/orders/new"} : {title:"Shartnoma yakunlashga tayyor",button:"Tarix",path:`/contracts/${contract.id}?tab=notes`,done:true})}
  `;
}

function contractTabs(active) {
  const items = [
    ["general", "Umumiy"],
    ["specification", "Spetsifikatsiya"],
    ["orders", "Buyurtmalar"],
    ["batches", "Partiyalar"],
    ["payment", "To'lov shartlari"],
    ["transport", "Transport"],
    ["documents", "Hujjatlar"],
    ["notes", "Tarix"],
  ];
  return workflowTabs(active, items, "contract-tab");
}

function contractGeneralTab(contract) {
  return section("Umumiy ma'lumotlar", `
    <div class="detail-list">
      ${[
        ["Shartnoma raqami", contract.contract_number],
        ["Shartnoma sanasi", contract.contract_date],
        ["Amal qilish muddati", contract.valid_until],
        ["Mijoz", contract.client?.name],
        ["Sarlavha", contract.title],
        ["Status", statusLabel(contract.status)],
        ["Valyuta", contract.currency],
        ["Izoh", contract.notes],
        ["Yaratilgan", fmtDate(contract.created_at)],
        ["Yangilangan", fmtDate(contract.updated_at)],
      ].map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${fmt(value)}</strong></div>`).join("")}
    </div>
  `);
}

function contractSpecificationTab(contract) {
  return section("Spetsifikatsiya", `
    <div class="actions"><button class="btn primary" data-contract-child="items">Mahsulot qo'shish</button></div>
    ${tableOrEmpty(contract.items, ["Mahsulot", "Kod", "Birlik", "Miqdor", "Birlik narxi", "QQS", "Jami", "Amallar"], (item) => `
      <tr>
        <td>${fmt(item.product_name)}</td><td>${fmt(item.product_code)}</td><td>${fmt(item.unit)}</td>
        <td>${fmtQty(item.quantity)}</td><td>${fmtMoney(item.unit_price)}</td><td>${fmtMoney(item.vat_amount)} (${fmt(item.vat_rate)}%)</td>
        <td>${fmtMoney(item.total_with_vat)}</td>
        <td><div class="table-actions"><button class="link-btn" data-contract-edit="items" data-id="${item.id}">Tahrirlash</button><button class="link-btn" data-contract-delete="items" data-id="${item.id}">O'chirish</button></div></td>
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
  return section("To'lov shartlari", `
    <div class="actions"><button class="btn primary" data-contract-child="payment">To'lov shartlarini tahrirlash</button><button class="btn" type="button" data-contract-invoice-modal>Hisob yaratish</button><button class="btn" data-nav="/customer-payments/new?client_id=${clientId}&contract_id=${contract.id}">To'lov qo'shish</button></div>
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
    <div class="actions"><button class="btn primary" data-contract-child="transport">Transport shartlarini tahrirlash</button></div>
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
  return section("Hujjatlar", `
    <div class="actions"><button class="btn primary" data-contract-child="documents">Hujjat qo'shish</button></div>
    ${tableOrEmpty(contract.documents, ["Hujjat nomi", "Turi", "Yuklangan sana", "Yuklagan", "Amallar"], (item) => `
      <tr>
        <td>${fmt(item.title)}</td><td>${fmt(optionLabel(contractDocumentTypes, item.document_type))}</td><td>${fmtDate(item.uploaded_at)}</td><td>${fmt(item.uploaded_by)}</td>
        <td><div class="table-actions">
          ${item.file_url ? `<a class="link-btn" target="_blank" href="${esc(item.file_url)}">Ochish</a><a class="link-btn" href="${esc(item.file_url)}" download>Yuklab olish</a>` : `<button class="link-btn" disabled>Ochish</button><button class="link-btn" disabled>Yuklab olish</button>`}
          <button class="link-btn" data-contract-edit="documents" data-id="${item.id}">Tahrirlash</button>
          <button class="link-btn" data-contract-delete="documents" data-id="${item.id}">O'chirish</button>
        </div></td>
      </tr>
    `, "Shartnoma hujjatlari hali yo'q.")}
  `);
}

function contractNotesTab(contract) {
  return section("Izohlar / Tarix", `
    <div class="actions"><button class="btn primary" data-contract-child="notes">Izoh qo'shish</button></div>
    ${tableOrEmpty(contract.notes_history, ["Sana", "Foydalanuvchi", "Izoh", "Amallar"], (item) => `
      <tr><td>${fmtDate(item.created_at)}</td><td>${fmt(item.created_by)}</td><td>${fmt(item.note)}</td><td><button class="link-btn" data-contract-delete="notes" data-id="${item.id}">O'chirish</button></td></tr>
    `, "Izohlar hali yo'q.")}
  `);
}

function contractOrdersTab(contract, orders = []) {
  return section("Buyurtmalar", `
    <div class="actions"><button class="btn primary" data-nav="/orders/new">Buyurtma yaratish</button></div>
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
        <td><div class="table-actions"><button class="link-btn" data-nav="/orders/${order.id}">Ochish</button><button class="link-btn" data-nav="/orders/${order.id}/edit">To'liq tahrirlash</button></div></td>
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

function contractChildForm(kind, item = {}) {
  if (kind === "items") {
    return {
      title: item.id ? "Edit product" : "Add product",
      tab: "specification",
      path: "items",
      body: `<div class="grid">${textField("product_name", "Product", item.product_name)}${textField("product_code", "Code", item.product_code)}${textField("unit", "Unit", item.unit || "tonna")}${textField("quantity", "Quantity", item.quantity ?? "", "number")}${textField("unit_price", "Unit price", item.unit_price ?? "", "number")}${textField("vat_rate", "VAT %", item.vat_rate ?? 12, "number")}</div>`,
      payload: (form) => ({ product_name: field(form, "product_name"), product_code: field(form, "product_code"), unit: field(form, "unit"), quantity: field(form, "quantity"), unit_price: field(form, "unit_price"), vat_rate: field(form, "vat_rate") || "12" }),
    };
  }
  if (kind === "payment") {
    return {
      title: "Edit payment terms",
      tab: "payment",
      path: "payment-terms",
      method: "PUT",
      body: `<div class="grid">${textField("advance_percent", "Advance percent", item.advance_percent ?? 30, "number")}${textField("remaining_percent", "Remaining percent", item.remaining_percent ?? 70, "number")}${textField("advance_due_days", "Advance due days", item.advance_due_days ?? 10, "number")}${textField("batch_payment_due_days", "Batch payment due days", item.batch_payment_due_days ?? 3, "number")}${textArea("remaining_payment_rule", "Remaining payment rule", item.remaining_payment_rule || "Payment of the remaining amount is made per ready delivery batch based on invoice.")}${textArea("notes", "Notes", item.notes)}</div>`,
      payload: (form) => ({ advance_percent: field(form, "advance_percent"), remaining_percent: field(form, "remaining_percent"), advance_due_days: Number(field(form, "advance_due_days") || 10), batch_payment_due_days: Number(field(form, "batch_payment_due_days") || 3), remaining_payment_rule: field(form, "remaining_payment_rule"), notes: field(form, "notes") }),
    };
  }
  if (kind === "transport") {
    return {
      title: "Edit transport terms",
      tab: "transport",
      path: "transport-terms",
      method: "PUT",
      body: `<div class="grid">${selectField("transport_payment_type", "Transport payment type", transportPaymentTypes, item.transport_payment_type || "separate_invoice")}${selectField("delivery_method", "Delivery method", deliveryMethods, item.delivery_method || "mixed")}${textArea("notes", "Notes", item.notes)}</div>`,
      payload: (form) => ({ transport_payment_type: field(form, "transport_payment_type"), delivery_method: field(form, "delivery_method"), notes: field(form, "notes") }),
    };
  }
  if (kind === "documents") {
    return {
      title: item.id ? "Edit document" : "Add document",
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
    body: `<div class="grid">${textArea("note", "Note", item.note)}${textField("created_by", "User", item.created_by)}</div>`,
    payload: (form) => ({ note: field(form, "note"), created_by: field(form, "created_by") }),
  };
}

async function openContractChildForm(contract, kind, item = {}) {
  const cfg = contractChildForm(kind, item);
  app.innerHTML = `
    <div class="page">
      ${contractHeader(contract)}
      ${section(cfg.title, `
        <form id="contract-child-form">
          ${cfg.body}
          <div class="form-footer">
            <button type="button" class="btn" data-nav="/contracts/${contract.id}?tab=${cfg.tab}">Cancel</button>
            <button type="submit" class="btn primary">Save</button>
          </div>
        </form>
      `)}
    </div>
  `;
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
      showToast("Saved.");
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
  if (invoiceType === "advance") return addDays(invoiceDate, contract.payment_terms?.advance_due_days || 0);
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
      if (state.invoiceType === "advance" && state.hasAdvanceInvoice && !confirm("Ushbu shartnoma uchun avans hisob-fakturasi allaqachon mavjud. Davom etasizmi?")) return;
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
  app.innerHTML = `<div class="page"><div class="empty">Loading contract...</div></div>`;
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
      if (!confirm(localizeText("Delete this item?"))) return;
      const kind = button.dataset.contractDelete;
      try {
        await api(`/api/contracts/${id}/${kind}/${button.dataset.id}`, { method: "DELETE" });
        showToast("Deleted.");
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
