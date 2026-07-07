import type { ScheduleRow } from "../types/request";
import { monthLabels } from "../utils/format";

interface ScheduleTableProps {
  rows: ScheduleRow[];
  onChange: (index: number, key: keyof ScheduleRow, value: string | number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export function ScheduleTable({ rows, onChange, onAdd, onRemove }: ScheduleTableProps) {
  return (
    <div className="schedule-block">
      <div className="table-wrap">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Yil</th>
              <th>Oy</th>
              <th>Miqdor</th>
              <th>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${index}-${row.year}-${row.month}`}>
                <td>
                  <input
                    type="number"
                    value={row.year}
                    onChange={(event) => onChange(index, "year", Number(event.target.value))}
                    aria-label="Yil"
                  />
                </td>
                <td>
                  <select
                    value={row.month}
                    onChange={(event) => onChange(index, "month", Number(event.target.value))}
                    aria-label="Oy"
                  >
                    {monthLabels.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.quantity}
                    onChange={(event) => onChange(index, "quantity", event.target.value)}
                    aria-label="Miqdor"
                  />
                </td>
                <td>
                  <button type="button" className="text-button danger" onClick={() => onRemove(index)}>
                    O'chirish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="secondary-button add-row" onClick={onAdd}>
        Oy qo'shish
      </button>
    </div>
  );
}
