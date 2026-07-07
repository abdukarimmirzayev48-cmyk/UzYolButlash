import { displayValue } from "../utils/format";

interface SummaryCardProps {
  title: string;
  rows: Array<[string, unknown]>;
}

export function SummaryCard({ title, rows }: SummaryCardProps) {
  return (
    <section className="summary-card">
      <h3>{title}</h3>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{displayValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
