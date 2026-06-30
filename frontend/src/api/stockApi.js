(function () {
  const request = (...args) => window.BitumFrontend.api.request(...args);
  window.BitumFrontend.api.stock = {
    lots: (query = "") => request(`/api/stock-lots${query ? `?${query}` : ""}`),
    lot: (id) => request(`/api/stock-lots/${id}`),
    allocations: (query = "") => request(`/api/stock-allocations${query ? `?${query}` : ""}`),
    allocate: (payload) => request("/api/stock-allocations", { method: "POST", body: JSON.stringify(payload) }),
  };
})();
