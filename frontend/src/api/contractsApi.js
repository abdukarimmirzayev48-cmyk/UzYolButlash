(function () {
  const request = (...args) => window.BitumFrontend.api.request(...args);
  window.BitumFrontend.api.contracts = {
    list: (query = "") => request(`/api/contracts${query ? `?${query}` : ""}`),
    get: (id) => request(`/api/contracts/${id}`),
    balances: (id) => request(`/api/orders/contract/${id}/balances`),
  };
})();
