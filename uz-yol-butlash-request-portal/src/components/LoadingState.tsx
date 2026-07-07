interface LoadingStateProps {
  text?: string;
}

export function LoadingState({ text = "Yuklanmoqda..." }: LoadingStateProps) {
  return <div className="notice">{text}</div>;
}
