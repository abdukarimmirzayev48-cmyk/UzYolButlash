import type { RequestFormData } from "../types/request";
import { numberValue } from "./format";

export type FormErrors = Record<string, string>;

export function isPhoneValid(value: string) {
  return /^\+?[0-9\s()\-]{7,20}$/.test(value);
}

export function scheduleTotal(form: RequestFormData) {
  return form.schedule.reduce((sum, row) => sum + numberValue(row.quantity), 0);
}

export function validateStep(step: number, form: RequestFormData, confirmed: boolean): FormErrors {
  const errors: FormErrors = {};
  if (step === 0 && !form.customer_type) errors.customer_type = "Mijoz turi majburiy.";
  if (step === 1) {
    if (form.customer_type === "internal_organization" && !form.company_name.trim()) {
      errors.inn_lookup = "Tizim tashkiloti uchun avval STIR orqali tashkilotni toping.";
    }
    if (form.customer_type === "external_customer") {
      if (!form.company_name.trim()) errors.company_name = "Korxona nomi majburiy.";
      if (!form.phone.trim()) errors.phone = "Telefon raqami majburiy.";
    }
    if (form.inn && !/^\d+$/.test(form.inn)) errors.inn = "STIR faqat raqamlardan iborat bo'lishi kerak.";
    if (form.phone && !isPhoneValid(form.phone)) errors.phone = "Telefon raqami noto'g'ri formatda kiritilgan.";
  }
  if (step === 2 && !form.payment_source) errors.payment_source = "To'lov manbasi majburiy.";
  if (step === 3) {
    if (!form.product_id) errors.product_id = "Mahsulot majburiy.";
    if (numberValue(form.total_quantity) <= 0) errors.total_quantity = "Umumiy miqdor 0 dan katta bo'lishi kerak.";
  }
  if (step === 4) {
    const rows = form.schedule.filter((row) => row.year || row.month || row.quantity);
    if (!rows.length) errors.schedule = "Kalendar grafik majburiy.";
    if (rows.some((row) => Number(row.month) < 1 || Number(row.month) > 12)) errors.schedule = "Oy qiymati 1 dan 12 gacha bo'lishi kerak.";
    if (rows.some((row) => numberValue(row.quantity) <= 0)) errors.schedule = "Grafikdagi miqdor 0 dan katta bo'lishi kerak.";
    if (scheduleTotal(form) !== numberValue(form.total_quantity)) {
      errors.schedule = "Kalendar grafikdagi jami miqdor umumiy miqdorga teng bo'lishi kerak.";
    }
  }
  if (step === 5 && !confirmed) errors.confirmed = "Ma'lumotlarning to'g'riligini tasdiqlashingiz kerak.";
  return errors;
}
