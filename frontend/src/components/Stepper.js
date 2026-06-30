(function () {
  const escapeHtml = window.BitumFrontend?.formatters?.escapeHtml || ((value) => String(value ?? ""));

  function stepper(steps = [], activeStep = 1) {
    return `<div class="erp-stepper" style="--step-count:${steps.length}">${steps.map((label, index) => {
      const step = index + 1;
      const cls = step < activeStep ? "completed" : step === activeStep ? "current" : "upcoming";
      return `<div class="erp-step ${cls}"><span>${step}</span><strong>${escapeHtml(label)}</strong></div>`;
    }).join("")}</div>`;
  }

  window.BitumFrontend = window.BitumFrontend || {};
  window.BitumFrontend.components = {
    ...(window.BitumFrontend.components || {}),
    stepper,
  };
})();
