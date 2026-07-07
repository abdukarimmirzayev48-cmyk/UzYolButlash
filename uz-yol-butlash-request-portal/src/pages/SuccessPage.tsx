import type { SubmitResult } from "../types/request";

interface SuccessPageProps {
  result: SubmitResult;
  onNewRequest: () => void;
}

export function SuccessPage({ result, onNewRequest }: SuccessPageProps) {
  return (
    <section className="form-card success-card">
      <div className="success-mark" aria-hidden="true">
        ✓
      </div>
      <h2>Talabnoma yuborildi</h2>
      <p>Talabnomangiz muvaffaqiyatli yuborildi. Mas'ul xodimlar tomonidan ko'rib chiqiladi.</p>
      <div className="metric-grid">
        <div>
          <span>Talabnoma raqami</span>
          <strong>{result.request_number}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{result.status_label || "Yangi"}</strong>
        </div>
      </div>
      <div className="success-actions">
        <button type="button" className="primary-button" onClick={onNewRequest}>
          Yangi talabnoma yuborish
        </button>
        <a className="secondary-button" href="/talabnoma">
          Bosh sahifaga qaytish
        </a>
      </div>
    </section>
  );
}
