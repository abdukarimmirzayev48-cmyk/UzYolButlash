(function () {
  const request = (...args) => window.BitumFrontend.api.request(...args);
  window.BitumFrontend.api.logistics = {
    list: (query = "") => request(`/api/logistics${query ? `?${query}` : ""}`),
    get: (id) => request(`/api/logistics/${id}`),
  };
})();
