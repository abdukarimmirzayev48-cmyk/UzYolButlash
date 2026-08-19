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

  // Constraints the browser can enforce before anything is sent. They are a
  // convenience, never the guard -- the server validates the same rules -- but
  // they are what stops a mistyped 8-digit INN from becoming a round trip, and
  // inputmode is what gives a phone a number pad instead of a letter keyboard.
  const VALIDATION_ATTRS = [
    "pattern", "maxlength", "minlength", "inputmode", "placeholder",
    "title", "autocomplete", "min", "max", "step",
  ];

  function validationAttrs(options = {}) {
    return VALIDATION_ATTRS
      .filter((key) => options[key] !== undefined && options[key] !== null && options[key] !== "")
      .map((key) => `${key}="${escapeHtml(options[key])}"`)
      .join(" ");
  }

  function textField({ name, label, value = "", type = "text", required = false, readonly = false, disabled = false, error = "", helperText = "", ...rest }) {
    // "number" runs the thousands formatter, which is right for money and
    // wrong for anything with meaningful decimals -- "decimal" is a real
    // number input, left unformatted.
    const inputType = type === "number" ? "text" : type === "decimal" ? "number" : type;
    const attrs = [
      `type="${escapeHtml(inputType)}"`,
      type === "number" ? 'inputmode="decimal"' : "",
      type === "number" ? 'data-format-number="true"' : "",
      type === "decimal" ? 'data-raw-number="true"' : "",
      type === "decimal" && rest.step === undefined ? 'step="any"' : "",
      `name="${escapeHtml(name)}"`,
      `value="${escapeHtml(type === "number" ? formatNumberInputValue(value) : value)}"`,
      validationAttrs(rest),
      required ? "required" : "",
      readonly ? "readonly" : "",
      disabled ? "disabled" : "",
    ].filter(Boolean).join(" ");
    return fieldShell({ label, required, error, helperText, control: `<input ${attrs} />` });
  }

  function textareaField({ name, label, value = "", required = false, readonly = false, disabled = false, error = "", helperText = "", ...rest }) {
    const attrs = [`name="${escapeHtml(name)}"`, validationAttrs(rest), required ? "required" : "", readonly ? "readonly" : "", disabled ? "disabled" : ""].filter(Boolean).join(" ");
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
