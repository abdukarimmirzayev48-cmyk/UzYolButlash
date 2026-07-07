interface StepActionsProps {
  currentStep: number;
  lastStep: number;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function StepActions({ currentStep, lastStep, submitting, onBack, onNext }: StepActionsProps) {
  return (
    <div className="step-actions">
      <button type="button" className="secondary-button" onClick={onBack} disabled={currentStep === 0}>
        Orqaga
      </button>
      <button type="button" className="primary-button" onClick={onNext} disabled={submitting}>
        {currentStep === lastStep ? (submitting ? "Yuborilmoqda..." : "Talabnomani yuborish") : "Davom etish"}
      </button>
    </div>
  );
}
