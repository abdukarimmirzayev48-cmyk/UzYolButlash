import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ErrorMessage } from "../components/ErrorMessage";
import { FormField } from "../components/FormField";
import { LoadingState } from "../components/LoadingState";
import { ScheduleTable } from "../components/ScheduleTable";
import { SelectCard } from "../components/SelectCard";
import { StepActions } from "../components/StepActions";
import { StepIndicator } from "../components/StepIndicator";
import { SummaryCard } from "../components/SummaryCard";
import { lookupCompanyByInn, loadProducts, submitCustomerRequest } from "../api/publicApi";
import type { CustomerType, PaymentSource, Product, RequestFormData, ScheduleRow, SubmitPayload, SubmitResult } from "../types/request";
import { displayValue, formatQuantity, monthName, numberValue } from "../utils/format";
import { FormErrors, scheduleTotal, validateStep } from "../utils/validation";
import { SuccessPage } from "./SuccessPage";

const steps = ["Mijoz turi", "Korxona ma'lum...", "To'lov manbasi", "Mahsulot talabi", "Kalendar grafik", "Tasdiqlash"];
const draftKey = "uzYolButlashRequestDraft";

const initialForm: RequestFormData = {
  customer_type: "",
  payment_source: "",
  company_name: "",
  inn: "",
  oked: "",
  director_full_name: "",
  legal_address: "",
  region: "",
  activity_type: "",
  function_description: "",
  privatization_project_name: "",
  bank_account: "",
  bank_name: "",
  mfo: "",
  phone: "",
  contact_full_name: "",
  contact_phone: "",
  product_id: "",
  total_quantity: "",
  unit: "",
  schedule: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1, quantity: "" }],
};

const companyFieldDefaults = {
  company_name: "",
  inn: "",
  oked: "",
  director_full_name: "",
  legal_address: "",
  region: "",
  activity_type: "",
  function_description: "",
  privatization_project_name: "",
  bank_account: "",
  bank_name: "",
  mfo: "",
  phone: "",
  contact_full_name: "",
  contact_phone: "",
};

function loadDraft(): { step: number; form: RequestFormData } {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || "null") as { step?: number; form?: Partial<RequestFormData> } | null;
    if (saved?.form) return { step: saved.step || 0, form: { ...initialForm, ...saved.form } };
  } catch {
    return { step: 0, form: initialForm };
  }
  return { step: 0, form: initialForm };
}

export function RequestPage() {
  const draft = useMemo(loadDraft, []);
  const [step, setStep] = useState(draft.step);
  const [form, setForm] = useState<RequestFormData>(draft.form);
  const [products, setProducts] = useState<Product[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirmed, setConfirmed] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [lookingUpInn, setLookingUpInn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState<SubmitResult | null>(null);

  const selectedProduct = products.find((product) => String(product.id) === String(form.product_id));
  const totalSchedule = scheduleTotal(form);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ step, form }));
  }, [step, form]);

  useEffect(() => {
    loadProducts()
      .then(setProducts)
      .catch((error: Error) => setApiError(error.message || "Mahsulotlar ro'yxatini yuklashda xatolik yuz berdi."))
      .finally(() => setLoadingProducts(false));
  }, []);

  function updateField(name: keyof RequestFormData, value: string) {
    setForm((current) => {
      if (name === "customer_type" && current.customer_type !== value) {
        return { ...current, ...companyFieldDefaults, customer_type: value as CustomerType };
      }
      return { ...current, [name]: value };
    });
    setErrors({});
  }

  function handleInput(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    if (name === "inn" && form.customer_type === "internal_organization") {
      setForm((current) => ({ ...current, ...companyFieldDefaults, customer_type: current.customer_type, inn: value }));
      setErrors({});
      return;
    }
    if (name === "product_id") {
      const product = products.find((item) => String(item.id) === value);
      setForm((current) => ({ ...current, product_id: value, unit: product?.unit || "" }));
      setErrors({});
      return;
    }
    updateField(name as keyof RequestFormData, value);
  }

  async function handleLookupInn() {
    const inn = form.inn.trim();
    if (!inn || !/^\d+$/.test(inn)) {
      setErrors({ inn: "STIR faqat raqamlardan iborat bo'lishi kerak." });
      return;
    }
    setLookingUpInn(true);
    setApiError("");
    try {
      const company = await lookupCompanyByInn(inn);
      if (!company) {
        setErrors({ inn_lookup: "Ushbu STIR bo'yicha tashkilot topilmadi." });
        setForm((current) => ({ ...current, ...companyFieldDefaults, customer_type: current.customer_type, inn }));
        return;
      }
      setForm((current) => ({
        ...current,
        company_name: company.company_name || "",
        inn: company.inn || inn,
        oked: "",
        director_full_name: "",
        legal_address: company.legal_address || "",
        region: company.region || "",
        activity_type: company.activity_type || "",
        function_description: company.function_description || "",
        privatization_project_name: company.privatization_project_name || "",
        bank_account: "",
        bank_name: "",
        mfo: "",
        phone: "",
      }));
      setErrors({});
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Server bilan ulanishda xatolik yuz berdi.");
    } finally {
      setLookingUpInn(false);
    }
  }

  function changeSchedule(index: number, key: keyof ScheduleRow, value: string | number) {
    setForm((current) => ({
      ...current,
      schedule: current.schedule.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    }));
    setErrors({});
  }

  function addScheduleRow() {
    setForm((current) => ({
      ...current,
      schedule: [...current.schedule, { year: new Date().getFullYear(), month: 1, quantity: "" }],
    }));
  }

  function removeScheduleRow(index: number) {
    setForm((current) => {
      const next = current.schedule.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, schedule: next.length ? next : [{ year: new Date().getFullYear(), month: 1, quantity: "" }] };
    });
  }

  function goNext() {
    const stepErrors = validateStep(step, form, confirmed);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      return;
    }
    if (step < steps.length - 1) {
      setStep((current) => current + 1);
      setErrors({});
      return;
    }
    submit();
  }

  async function submit() {
    setSubmitting(true);
    setApiError("");
    try {
      const internal = form.customer_type === "internal_organization";
      const payload: SubmitPayload = {
        customer_type: form.customer_type as CustomerType,
        payment_source: form.payment_source as PaymentSource,
        company_name: form.company_name,
        inn: form.inn || null,
        oked: internal ? null : form.oked || null,
        director_full_name: internal ? null : form.director_full_name || null,
        legal_address: form.legal_address || null,
        region: form.region || null,
        activity_type: form.activity_type || null,
        function_description: form.function_description || null,
        privatization_project_name: form.privatization_project_name || null,
        bank_account: internal ? null : form.bank_account || null,
        bank_name: internal ? null : form.bank_name || null,
        mfo: internal ? null : form.mfo || null,
        phone: internal ? form.contact_phone || "" : form.phone,
        contact_full_name: form.contact_full_name || null,
        contact_phone: form.contact_phone || null,
        product_id: Number(form.product_id),
        total_quantity: numberValue(form.total_quantity),
        unit: form.unit,
        schedule: form.schedule.map((row) => ({ year: Number(row.year), month: Number(row.month), quantity: numberValue(row.quantity) })),
      };
      const result = await submitCustomerRequest(payload);
      localStorage.removeItem(draftKey);
      setSuccess(result);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Talabnomani yuborishda xatolik yuz berdi.");
    } finally {
      setSubmitting(false);
    }
  }

  function newRequest() {
    localStorage.removeItem(draftKey);
    setForm(initialForm);
    setStep(0);
    setConfirmed(false);
    setErrors({});
    setApiError("");
    setSuccess(null);
  }

  if (success) return <SuccessPage result={success} onNewRequest={newRequest} />;

  return (
    <>
      <StepIndicator steps={steps} currentStep={step} onStepClick={setStep} />
      <section className={`form-card ${step === steps.length - 1 ? "confirmation-card" : ""}`}>
        {apiError ? <ErrorMessage message={apiError} /> : null}
        {loadingProducts && step === 3 ? <LoadingState text="Mahsulotlar ro'yxati yuklanmoqda..." /> : renderStep()}
        <StepActions currentStep={step} lastStep={steps.length - 1} submitting={submitting} onBack={() => setStep((current) => Math.max(0, current - 1))} onNext={goNext} />
      </section>
    </>
  );

  function renderStep() {
    if (step === 0) {
      return (
        <>
          <div className="section-heading">
            <h2>Mijoz turini tanlang</h2>
          </div>
          <div className="choice-grid">
            <SelectCard title="Tizim tashkiloti" selected={form.customer_type === "internal_organization"} onSelect={() => updateField("customer_type", "internal_organization")} />
            <SelectCard title="Tashqi mijoz" selected={form.customer_type === "external_customer"} onSelect={() => updateField("customer_type", "external_customer")} />
          </div>
          <ErrorMessage message={errors.customer_type} />
        </>
      );
    }

    if (step === 1) {
      const internal = form.customer_type === "internal_organization";
      return (
        <>
          <div className="section-heading">
            <h2>{internal ? "Korxona ma'lumotlarini qidirish" : "Korxona ma'lumotlari"}</h2>
            <p>{internal ? "Tashkilot ma'lumotlarini topish uchun STIR kiriting." : "Korxona ma'lumotlarini to'liq va aniq kiriting."}</p>
          </div>
          {internal ? (
            <>
              <div className="registry-search-card">
                <div className="lookup-row">
                  <FormField label="STIR" name="inn" value={form.inn} error={errors.inn} onChange={handleInput} />
                  <button type="button" className="primary-button" onClick={handleLookupInn} disabled={lookingUpInn}>
                    {lookingUpInn ? "Qidirilmoqda..." : "Qidirish"}
                  </button>
                </div>
              </div>
              <ErrorMessage message={errors.inn_lookup} />
              {form.company_name ? (
                <>
                  <SummaryCard
                    title="Tashkilot ma'lumotlari"
                    rows={[
                      ["Korxona nomi", form.company_name],
                      ["STIR", form.inn],
                      ["Hudud", form.region],
                      ["Yuridik manzil", form.legal_address],
                      ["Asosiy faoliyat turi", form.activity_type],
                      ["Funksiyasi va vazifalari", form.function_description],
                    ]}
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <ErrorMessage message={errors.inn_lookup} />
              <div className="form-grid">
                <FormField label="Korxona nomi" name="company_name" value={form.company_name} required error={errors.company_name} onChange={handleInput} />
                <FormField label="STIR" name="inn" value={form.inn} error={errors.inn} onChange={handleInput} />
                <FormField label="OKED" name="oked" value={form.oked} onChange={handleInput} />
                <FormField label="Direktor F.I.Sh." name="director_full_name" value={form.director_full_name} onChange={handleInput} />
                <FormField label="Yuridik manzil" name="legal_address" value={form.legal_address} onChange={handleInput}>
                  <textarea name="legal_address" value={form.legal_address} onChange={handleInput} />
                </FormField>
                <FormField label="Hisob raqami" name="bank_account" value={form.bank_account} onChange={handleInput} />
                <FormField label="Bank nomi" name="bank_name" value={form.bank_name} onChange={handleInput} />
                <FormField label="MFO" name="mfo" value={form.mfo} onChange={handleInput} />
                <FormField label="Telefon raqami" name="phone" value={form.phone} required error={errors.phone} onChange={handleInput} />
                <FormField label="Kontakt shaxs F.I.Sh." name="contact_full_name" value={form.contact_full_name} onChange={handleInput} />
                <FormField label="Kontakt telefon raqami" name="contact_phone" value={form.contact_phone} onChange={handleInput} />
              </div>
            </>
          )}
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <div className="section-heading">
            <h2>To'lov manbasini tanlang</h2>
            <p>Talabnoma bo'yicha to'lov qaysi manba orqali amalga oshirilishini belgilang.</p>
          </div>
          <div className="choice-grid">
            <SelectCard title="G'azna" selected={form.payment_source === "treasury"} onSelect={() => updateField("payment_source", "treasury")} />
            <SelectCard title="Bank" selected={form.payment_source === "bank"} onSelect={() => updateField("payment_source", "bank")} />
          </div>
          <ErrorMessage message={errors.payment_source} />
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <div className="section-heading">
            <h2>Mahsulot talabi</h2>
            <p>Kerakli mahsulot turi, markasi va umumiy miqdorini kiriting.</p>
          </div>
          <div className="form-grid">
            <FormField label="Mahsulot" name="product_id" value={form.product_id} required error={errors.product_id} onChange={handleInput}>
              <select name="product_id" value={form.product_id} onChange={handleInput}>
                <option value="">Mahsulotni tanlang</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.product_type || "—"} · {product.brand || "—"} · {product.unit}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Umumiy miqdor" name="total_quantity" value={form.total_quantity} type="number" required error={errors.total_quantity} onChange={handleInput} />
            <FormField label="Marka" name="brand" value={selectedProduct?.brand || ""} readonly onChange={() => undefined} />
            <FormField label="O'lchov birligi" name="unit" value={form.unit} readonly onChange={() => undefined} />
          </div>
          {selectedProduct ? (
            <SummaryCard title="Tanlangan mahsulot" rows={[["Mahsulot nomi", selectedProduct.name], ["Marka", selectedProduct.brand], ["O'lchov birligi", selectedProduct.unit]]} />
          ) : null}
        </>
      );
    }

    if (step === 4) {
      return (
        <>
          <div className="section-heading">
            <h2>Kalendar grafik</h2>
            <p>Mahsulot qaysi oyda qancha miqdorda kerak bo'lishini kiriting.</p>
          </div>
          <ScheduleTable rows={form.schedule} onChange={changeSchedule} onAdd={addScheduleRow} onRemove={removeScheduleRow} />
          <div className="metric-grid">
            <div><span>Umumiy miqdor</span><strong>{formatQuantity(form.total_quantity, form.unit)}</strong></div>
            <div><span>Grafik jami</span><strong>{formatQuantity(totalSchedule, form.unit)}</strong></div>
          </div>
          <ErrorMessage message={errors.schedule} />
          {totalSchedule > 0 && totalSchedule !== numberValue(form.total_quantity) ? <p className="warning-message">Kalendar grafikdagi jami miqdor umumiy miqdorga teng bo'lishi kerak.</p> : null}
        </>
      );
    }

    const companyRows: Array<[string, unknown]> = [
      ["Korxona nomi", form.company_name],
      ["STIR", form.inn],
      ["Hudud", form.region],
      ["Yuridik manzil", form.legal_address],
      ["Asosiy faoliyat turi", form.activity_type],
      ["Funksiyasi va vazifalari", form.function_description],
      ...(form.customer_type === "external_customer"
        ? ([
            ["OKED", form.oked],
            ["Direktor F.I.Sh.", form.director_full_name],
          ] as Array<[string, unknown]>)
        : []),
    ];
    const productRows: Array<[string, unknown]> = [
      ["Mahsulot nomi", selectedProduct?.name],
      ["Marka", selectedProduct?.brand],
      ["O'lchov birligi", form.unit],
      ["Umumiy miqdor", formatQuantity(form.total_quantity, form.unit)],
    ];
    const scheduleRows: Array<[string, unknown]> = [
      ...form.schedule.map((row): [string, unknown] => [`${row.year} · ${monthName(Number(row.month))}`, formatQuantity(row.quantity, form.unit)]),
      ["Grafik jami", formatQuantity(totalSchedule, form.unit)],
    ];

    return (
      <>
        <div className="section-heading confirmation-heading">
          <h2>Ma'lumotlarni tasdiqlash</h2>
          <p>Talabnomani yuborishdan oldin kiritilgan ma'lumotlarni tekshiring.</p>
        </div>
        <div className="confirmation-grid">
          <div className="confirmation-column">
            <ConfirmCard icon="person" title="Mijoz turi" rows={[["Mijoz turi", form.customer_type === "internal_organization" ? "Tizim tashkiloti" : "Tashqi mijoz"]]} />
            <ConfirmCard icon="building" title="Korxona ma'lumotlari" rows={companyRows} />
            {form.customer_type === "external_customer" ? <ConfirmCard icon="card" title="Rekvizitlar" rows={[["Hisob raqami", form.bank_account], ["Bank nomi", form.bank_name], ["MFO", form.mfo]]} /> : null}
          </div>
          <div className="confirmation-column">
            <ConfirmCard icon="wallet" title="To'lov manbasi" rows={[["To'lov manbasi", form.payment_source === "treasury" ? "G'azna" : "Bank"]]} />
            <ConfirmCard icon="box" title="Mahsulot talabi" rows={productRows} />
            <ConfirmCard icon="calendar" title="Kalendar grafik" rows={scheduleRows} emphasizeLast />
            {form.customer_type === "external_customer" ? <ConfirmCard icon="phone" title="Kontakt ma'lumotlari" rows={[["Telefon raqami", form.phone], ["Kontakt shaxs F.I.Sh.", form.contact_full_name], ["Kontakt telefon raqami", form.contact_phone]]} /> : null}
          </div>
        </div>
        <label className="confirm-row">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Kiritilgan ma'lumotlarning to'g'riligini tasdiqlayman.</span>
        </label>
        <ErrorMessage message={errors.confirmed} />
      </>
    );
  }
}

interface ConfirmCardProps {
  icon: "person" | "building" | "wallet" | "box" | "calendar" | "card" | "phone";
  title: string;
  rows: Array<[string, unknown]>;
  emphasizeLast?: boolean;
}

function ConfirmCard({ icon, title, rows, emphasizeLast = false }: ConfirmCardProps) {
  return (
    <section className="confirm-card">
      <h3>
        <ConfirmIcon type={icon} />
        {title}
      </h3>
      <dl>
        {rows.map(([label, value], index) => (
          <div key={`${title}-${label}-${index}`} className={emphasizeLast && index === rows.length - 1 ? "total-row" : ""}>
            <dt>{label}</dt>
            <dd>{displayValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ConfirmIcon({ type }: { type: ConfirmCardProps["icon"] }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg className="confirm-icon" aria-hidden="true" viewBox="0 0 24 24">
      {type === "person" ? (
        <>
          <path {...common} d="M20 21a8 8 0 0 0-16 0" />
          <circle {...common} cx="12" cy="7" r="4" />
        </>
      ) : null}
      {type === "building" ? (
        <>
          <path {...common} d="M4 21h16" />
          <path {...common} d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
          <path {...common} d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
        </>
      ) : null}
      {type === "wallet" || type === "card" ? (
        <>
          <rect {...common} x="3" y="6" width="18" height="14" rx="2" />
          <path {...common} d="M3 10h18M16 15h2" />
        </>
      ) : null}
      {type === "box" ? (
        <>
          <path {...common} d="m21 8-9-5-9 5 9 5 9-5Z" />
          <path {...common} d="M3 8v8l9 5 9-5V8" />
          <path {...common} d="M12 13v8" />
        </>
      ) : null}
      {type === "calendar" ? (
        <>
          <rect {...common} x="3" y="4" width="18" height="17" rx="2" />
          <path {...common} d="M8 2v4M16 2v4M3 10h18" />
        </>
      ) : null}
      {type === "phone" ? (
        <path {...common} d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.08 5.18 2 2 0 0 1 5.06 3h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L9 10.69a16 16 0 0 0 4.31 4.31l1.24-1.24a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92Z" />
      ) : null}
    </svg>
  );
}
