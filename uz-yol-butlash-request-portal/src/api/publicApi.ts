import type { ApiEnvelope, CompanyRegistry, Product, SubmitPayload, SubmitResult } from "../types/request";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

function publicUrl(path: string) {
  return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(publicUrl(path), {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error("Server bilan ulanishda xatolik yuz berdi.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((item: { msg?: string }) => item.msg).join(", ") : body.detail;
    throw new Error(detail || "Server bilan ulanishda xatolik yuz berdi.");
  }
  return body as T;
}

export async function lookupCompanyByInn(inn: string): Promise<CompanyRegistry | null> {
  const response = await requestJson<ApiEnvelope<CompanyRegistry>>(`/api/public/company-by-inn?inn=${encodeURIComponent(inn)}`);
  if (!response.success) return null;
  return response.data || null;
}

export async function loadProducts(): Promise<Product[]> {
  const response = await requestJson<ApiEnvelope<Product[]>>("/api/public/products");
  if (!response.success || !response.data) {
    throw new Error("Mahsulotlar ro'yxatini yuklashda xatolik yuz berdi.");
  }
  return response.data;
}

export async function submitCustomerRequest(payload: SubmitPayload): Promise<SubmitResult> {
  const response = await requestJson<ApiEnvelope<SubmitResult>>("/api/public/customer-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.success || !response.data) {
    throw new Error("Talabnomani yuborishda xatolik yuz berdi.");
  }
  return response.data;
}
