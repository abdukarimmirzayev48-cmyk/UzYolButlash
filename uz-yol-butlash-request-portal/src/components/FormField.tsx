import type { ChangeEventHandler, ReactNode } from "react";

interface FormFieldProps {
  label: string;
  name: string;
  value: string | number;
  required?: boolean;
  type?: string;
  error?: string;
  helper?: string;
  readonly?: boolean;
  onChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
  children?: ReactNode;
}

export function FormField({
  label,
  name,
  value,
  required,
  type = "text",
  error,
  helper,
  readonly,
  onChange,
  children,
}: FormFieldProps) {
  const describedBy = error ? `${name}-error` : helper ? `${name}-helper` : undefined;

  return (
    <label className="field">
      <span>
        {label}
        {required ? <b aria-hidden="true">*</b> : null}
      </span>
      {children || (
        <input
          name={name}
          type={type}
          value={value}
          readOnly={readonly}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={onChange}
        />
      )}
      {helper ? <small id={`${name}-helper`}>{helper}</small> : null}
      {error ? <small id={`${name}-error`} className="field-error">{error}</small> : null}
    </label>
  );
}
