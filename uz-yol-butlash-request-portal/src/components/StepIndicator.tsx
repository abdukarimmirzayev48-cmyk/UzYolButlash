interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  onStepClick: (step: number) => void;
}

export function StepIndicator({ steps, currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <nav className="step-indicator" aria-label="Talabnoma bosqichlari">
      {steps.map((step, index) => (
        <button
          key={step}
          type="button"
          className={`${index === currentStep ? "active" : ""} ${index < currentStep ? "done" : ""}`}
          disabled={index > currentStep}
          onClick={() => onStepClick(index)}
        >
          <span aria-hidden="true">{index + 1}</span>
          <strong>{step}</strong>
        </button>
      ))}
    </nav>
  );
}
