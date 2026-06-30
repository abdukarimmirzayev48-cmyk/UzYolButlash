(function () {
  const request = (...args) => window.BitumFrontend.api.request(...args);
  window.BitumFrontend.api.invoices = {
    customers: (query = "") => request(`/api/customer-invoices${query ? `?${query}` : ""}`),
    suppliers: (query = "") => request(`/api/supplier-invoices${query ? `?${query}` : ""}`),
  };
})();
