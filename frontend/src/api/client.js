(function () {
  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = Array.isArray(body.detail) ? body.detail.map((item) => item.msg).join(", ") : body.detail;
      throw new Error(detail || "Request failed");
    }
    return body;
  }

  window.BitumFrontend = window.BitumFrontend || {};
  window.BitumFrontend.api = {
    ...(window.BitumFrontend.api || {}),
    request,
  };
})();
