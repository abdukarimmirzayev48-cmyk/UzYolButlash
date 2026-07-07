export const monthLabels = [
  [1, "Yanvar"],
  [2, "Fevral"],
  [3, "Mart"],
  [4, "Aprel"],
  [5, "May"],
  [6, "Iyun"],
  [7, "Iyul"],
  [8, "Avgust"],
  [9, "Sentabr"],
  [10, "Oktabr"],
  [11, "Noyabr"],
  [12, "Dekabr"],
] as const;

export function numberValue(value: string | number | null | undefined): number {
  const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatQuantity(value: string | number | null | undefined, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  const amount = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(numberValue(value));
  return `${amount}${unit ? ` ${unit}` : ""}`;
}

export function monthName(month: number) {
  return monthLabels.find(([value]) => value === month)?.[1] || "—";
}

export function displayValue(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}
