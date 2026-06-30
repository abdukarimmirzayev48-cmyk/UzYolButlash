(function () {
  const request = (...args) => window.BitumFrontend.api.request(...args);
  window.BitumFrontend.api.orders = {
    list: (query = "") => request(`/api/orders${query ? `?${query}` : ""}`),
    get: (id) => request(`/api/orders/${id}`),
    create: (payload) => request("/api/orders", { method: "POST", body: JSON.stringify(payload) }),
  };
})();
