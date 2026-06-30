(function () {
  const request = (...args) => window.BitumFrontend.api.request(...args);
  window.BitumFrontend.api.batches = {
    list: (query = "") => request(`/api/delivery-batches${query ? `?${query}` : ""}`),
    get: (id) => request(`/api/delivery-batches/${id}`),
    create: (payload) => request("/api/delivery-batches", { method: "POST", body: JSON.stringify(payload) }),
  };
})();
