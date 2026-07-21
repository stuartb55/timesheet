export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="app-card">
      <span className="app-card__label govuk-body-s">{label}</span>
      <span className="app-card__value">{value}</span>
      {hint && (
        <span className="govuk-hint govuk-!-margin-bottom-0">{hint}</span>
      )}
    </div>
  );
}
