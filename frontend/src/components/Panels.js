(function () {
  const escapeHtml = window.BitumFrontend?.formatters?.escapeHtml || ((value) => String(value ?? ""));

  function warningPanel(messages = [], title = "E'tibor kerak") {
    const clean = messages.filter(Boolean);
    if (!clean.length) return "";
    return `<div class="erp-warning-panel"><strong>${escapeHtml(title)}</strong><ul>${clean.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul></div>`;
  }

  function emptyState(message) {
    return `<div class="empty">${escapeHtml(message)}</div>`;
  }

  window.BitumFrontend = window.BitumFrontend || {};
  window.BitumFrontend.components = {
    ...(window.BitumFrontend.components || {}),
    warningPanel,
    emptyState,
  };
})();
