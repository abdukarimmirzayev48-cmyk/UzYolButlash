interface SelectCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}

export function SelectCard({ title, description, selected, onSelect }: SelectCardProps) {
  return (
    <button type="button" className={`select-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </button>
  );
}
