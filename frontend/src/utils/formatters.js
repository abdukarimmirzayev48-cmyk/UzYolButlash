(function () {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  window.BitumFrontend = window.BitumFrontend || {};
  window.BitumFrontend.formatters = {
    escapeHtml,
  };
})();
