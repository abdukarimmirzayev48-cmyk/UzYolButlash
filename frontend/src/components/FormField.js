(function () {
  const escapeHtml = window.BitumFrontend?.formatters?.escapeHtml || ((value) => String(value ?? ""));

  function requiredLabel(label, required = false) {
    return `<span class="field-label-text">${escapeHtml(label)}${required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ""}</span>`;
  }

  function fieldShell({ label, required = false, error = "", helperText = "", control = "" }) {
    return `<label class="form-field ${error ? "has-error" : ""}">${requiredLabel(label, required)}${control}${helperText ? `<small class="field-helper">${escapeHtml(helperText)}</small>` : ""}${error ? `<small class="field-error">${escapeHtml(error)}</small>` : ""}</label>`;
  }

  function formatNumberInputValue(value) {
    if (value === null || value === undefined || value === "") return "";
    const normalized = String(value).replace(/\s/g, "").replace(",", ".");
    if (normalized === "" || Number.isNaN(Number(normalized))) return "";
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(normalized));
  }

  function textField({ name, label, value = "", type = "text", required = false, readonly = false, disabled = false, error = "", helperText = "" }) {
    const inputType = type === "number" ? "text" : type;
    const attrs = [
      `type="${escapeHtml(inputType)}"`,
      type === "number" ? 'inputmode="decimal"' : "",
      type === "number" ? 'data-format-number="true"' : "",
      `name="${escapeHtml(name)}"`,
      `value="${escapeHtml(type === "number" ? formatNumberInputValue(value) : value)}"`,
      required ? "required" : "",
      readonly ? "readonly" : "",
      disabled ? "disabled" : "",
    ].filter(Boolean).join(" ");
    return fieldShell({ label, required, error, helperText, control: `<input ${attrs} />` });
  }

  function textareaField({ name, label, value = "", required = false, readonly = false, disabled = false, error = "", helperText = "" }) {
    const attrs = [`name="${escapeHtml(name)}"`, required ? "required" : "", readonly ? "readonly" : "", disabled ? "disabled" : ""].filter(Boolean).join(" ");
    return fieldShell({ label, required, error, helperText, control: `<textarea ${attrs}>${escapeHtml(value)}</textarea>` });
  }

  function selectField({ name, label, options = [], value = "", required = false, disabled = false, error = "", helperText = "" }) {
    const attrs = [`name="${escapeHtml(name)}"`, required ? "required" : "", disabled ? "disabled" : ""].filter(Boolean).join(" ");
    const html = options.map(([key, labelText]) => `<option value="${escapeHtml(key)}" ${key === value ? "selected" : ""}>${escapeHtml(labelText)}</option>`).join("");
    return fieldShell({ label, required, error, helperText, control: `<select ${attrs}>${html}</select>` });
  }

  window.BitumFrontend = window.BitumFrontend || {};
  window.BitumFrontend.components = {
    ...(window.BitumFrontend.components || {}),
    requiredLabel,
    textField,
    textareaField,
    selectField,
  };
})();
