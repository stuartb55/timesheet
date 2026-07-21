import type { PolicyFinding } from "@/domain/types";
import { formatDuration, formatTime } from "@/domain/time";

export function SeverityTag({
  severity,
}: {
  severity: PolicyFinding["severity"];
}) {
  const label = severity.toLowerCase().replaceAll("_", " ");
  const colour = {
    COMPLIANT: "govuk-tag--green",
    WARNING: "govuk-tag--yellow",
    APPROVAL_REQUIRED: "govuk-tag--orange",
    BREACH: "govuk-tag--red",
    INCOMPLETE: "govuk-tag--grey",
  }[severity];
  return <strong className={`govuk-tag ${colour}`}>{label}</strong>;
}

export function Findings({ findings }: { findings: PolicyFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="govuk-body">
        <strong className="govuk-tag govuk-tag--green">Compliant</strong> No
        policy issues identified.
      </p>
    );
  }
  return (
    <ul className="govuk-list govuk-list--bullet govuk-list--spaced">
      {findings.map((finding, index) => (
        <li key={`${finding.ruleId}-${index}`}>
          <SeverityTag severity={finding.severity} />{" "}
          <strong>{finding.ruleId}</strong>: {finding.message}
          {finding.affected?.startMinute !== undefined &&
            ` Start: ${formatTime(finding.affected.startMinute)}.`}
          {finding.affected?.endMinute !== undefined &&
            ` Finish: ${formatTime(finding.affected.endMinute)}.`}
          {finding.affected?.durationMinutes !== undefined &&
            ` Affected: ${formatDuration(finding.affected.durationMinutes)}.`}
          {finding.affected?.count !== undefined &&
            ` Affected records: ${finding.affected.count}.`}
          {finding.approvalRequired &&
            ` External approval ${finding.approvalRecorded ? "has been recorded" : "has not been recorded"}.`}
        </li>
      ))}
    </ul>
  );
}
