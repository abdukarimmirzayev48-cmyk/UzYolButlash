(function () {
  const escapeHtml = window.BitumFrontend?.formatters?.escapeHtml || ((value) => String(value ?? ""));

  // Qadam ostidagi yozuv: xodim qaysi qadam tugagani va qaysi biri navbatda
  // ekanini raqamni sanamasdan ko'radi. Har biri alohida tugunda -- shunda
  // lug'at ularni tarjima qila oladi.
  const STATE_LABEL = {
    completed: "To'ldirilgan",
    current: "Joriy qadam",
    upcoming: "Keyingi",
  };

  const CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L19 7"/></svg>';

  function stepper(steps = [], activeStep = 1) {
    // Beshtadan ortiq qadamda ostki yozuvga joy qolmaydi -- shartnoma wizardida
    // ettita qadam bor. Bunda faqat nom ko'rsatiladi.
    const compact = steps.length > 5 ? " compact" : "";
    return `<ol class="erp-stepper${compact}" style="--step-count:${steps.length}">${steps.map((label, index) => {
      const step = index + 1;
      const cls = step < activeStep ? "completed" : step === activeStep ? "current" : "upcoming";
      const mark = cls === "completed" ? CHECK : `<span data-noloc>${step}</span>`;
      return `<li class="erp-step ${cls}">
        <span class="erp-step-mark">${mark}</span>
        <span class="erp-step-text"><strong>${escapeHtml(label)}</strong><small>${STATE_LABEL[cls]}</small></span>
      </li>`;
    }).join("")}</ol>`;
  }

  window.BitumFrontend = window.BitumFrontend || {};
  window.BitumFrontend.components = {
    ...(window.BitumFrontend.components || {}),
    stepper,
  };
})();
