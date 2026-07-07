export type CustomerType = "internal_organization" | "external_customer";
export type PaymentSource = "treasury" | "bank";

export interface CompanyRegistry {
  inn: string;
  company_name: string;
  legal_address?: string | null;
  region?: string | null;
  activity_type?: string | null;
  function_description?: string | null;
  privatization_project_name?: string | null;
}

export interface Product {
  id: number;
  name: string;
  product_type?: string | null;
  brand?: string | null;
  unit: string;
}

export interface ScheduleRow {
  year: number;
  month: number;
  quantity: string;
}

export interface RequestFormData {
  customer_type: CustomerType | "";
  payment_source: PaymentSource | "";
  company_name: string;
  inn: string;
  oked: string;
  director_full_name: string;
  legal_address: string;
  region: string;
  activity_type: string;
  function_description: string;
  privatization_project_name: string;
  bank_account: string;
  bank_name: string;
  mfo: string;
  phone: string;
  contact_full_name: string;
  contact_phone: string;
  product_id: string;
  total_quantity: string;
  unit: string;
  schedule: ScheduleRow[];
}

export interface SubmitPayload {
  customer_type: CustomerType;
  payment_source: PaymentSource;
  company_name: string;
  inn: string | null;
  oked: string | null;
  director_full_name: string | null;
  legal_address: string | null;
  region: string | null;
  activity_type: string | null;
  function_description: string | null;
  privatization_project_name: string | null;
  bank_account: string | null;
  bank_name: string | null;
  mfo: string | null;
  phone: string;
  contact_full_name: string | null;
  contact_phone: string | null;
  product_id: number;
  total_quantity: number;
  unit: string;
  schedule: Array<{
    year: number;
    month: number;
    quantity: number;
  }>;
}

export interface SubmitResult {
  id: number;
  request_number: string;
  status: string;
  status_label: string;
  message: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
