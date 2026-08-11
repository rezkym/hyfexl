type StepIndicatorProps = {
  current: number;
};

const steps = ['Sesi', 'Nomor', 'Data', 'Persetujuan', 'Verifikasi', 'Konfirmasi'];

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <ol className="step-indicator" aria-label="Tahap pendaftaran">
      {steps.map((label, index) => {
        const number = index + 1;
        const status = number === current ? 'current' : number < current ? 'complete' : 'upcoming';
        return (
          <li key={label} className={`step step-${status}`} aria-current={status === 'current' ? 'step' : undefined}>
            <span>{number}</span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}
