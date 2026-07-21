import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { formatDate, formatDuration, isValidIsoDate } from "@/domain/time";
import { getPeriod, nowInLondon } from "@/lib/data";

export const metadata: Metadata = { title: "Accounting-period statement" };
export const dynamic = "force-dynamic";

export default async function Statement({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const query = await searchParams;
  const date = isValidIsoDate(query.date ?? "")
    ? (query.date as string)
    : nowInLondon().date;
  const data = await getPeriod(date);
  return (
    <>
      <div className="app-no-print">
        <Link className="govuk-link" href={`/period?date=${date}`}>
          ← Back to accounting period
        </Link>{" "}
        <PrintButton />
        <p className="govuk-body">
          Use your browser’s Print command to print or save this statement as
          PDF.
        </p>
      </div>
      <p className="app-print-only">Personal flexitime statement</p>
      <h1 className="govuk-heading-xl">Accounting-period statement</h1>
      {data.settings.name && (
        <p className="govuk-body">
          <strong>Staff member:</strong> {data.settings.name}
        </p>
      )}
      <dl className="govuk-summary-list">
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">Period</dt>
          <dd className="govuk-summary-list__value">
            {formatDate(data.period.startDate, data.settings.dateFormat)} to{" "}
            {formatDate(data.period.endDate, data.settings.dateFormat)}
          </dd>
        </div>
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">Opening balance</dt>
          <dd className="govuk-summary-list__value">
            {formatDuration(data.calculation.openingBalanceMinutes, true)}
          </dd>
        </div>
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">Raw closing balance</dt>
          <dd className="govuk-summary-list__value">
            {formatDuration(data.calculation.rawClosingBalanceMinutes, true)}
          </dd>
        </div>
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">Proposed carryover</dt>
          <dd className="govuk-summary-list__value">
            {formatDuration(data.calculation.proposedCarryoverMinutes, true)}
          </dd>
        </div>
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">Final carryover decision</dt>
          <dd className="govuk-summary-list__value">
            {data.period.finalCarryoverMinutes === null
              ? "Not confirmed"
              : formatDuration(data.period.finalCarryoverMinutes, true)}
          </dd>
        </div>
        <div className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">Checked</dt>
          <dd className="govuk-summary-list__value">
            {data.period.checkedAt
              ? new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "long",
                  timeZone: "Europe/London",
                }).format(data.period.checkedAt)
              : "Not checked"}
          </dd>
        </div>
      </dl>
      <h2 className="govuk-heading-l">Daily statement</h2>
      <div className="app-table-scroll">
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">Start</th>
              <th className="govuk-table__header">Finish</th>
              <th className="govuk-table__header">Credits</th>
              <th className="govuk-table__header">Flexi leave</th>
              <th className="govuk-table__header">Daily balance</th>
              <th className="govuk-table__header">Approval notes</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {data.days.map((day) => {
              const workSegments = day.segments.filter(
                (item) =>
                  !["LUNCH_BREAK", "OTHER_UNPAID_BREAK"].includes(item.type),
              );
              const first = workSegments[0];
              const last = workSegments.filter((item) => item.endAt).at(-1);
              const approvalNotes = [
                ...day.segments.map((item) => item.approvalNote),
                ...day.credits.map((item) => item.approvalNote),
                ...day.flexiLeave.map((item) => item.note),
                ...day.resolutions.map((item) => item.note),
              ]
                .filter(Boolean)
                .join("; ");
              return (
                <tr className="govuk-table__row" key={day.calculation.date}>
                  <td className="govuk-table__cell">
                    {formatDate(day.calculation.date, data.settings.dateFormat)}
                  </td>
                  <td className="govuk-table__cell">
                    {first
                      ? new Intl.DateTimeFormat("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hourCycle: "h23",
                          timeZone: "Europe/London",
                        }).format(first.startAt)
                      : "—"}
                  </td>
                  <td className="govuk-table__cell">
                    {last?.endAt
                      ? new Intl.DateTimeFormat("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hourCycle: "h23",
                          timeZone: "Europe/London",
                        }).format(last.endAt)
                      : "—"}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.confirmedCreditMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.flexiLeaveMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(
                      day.calculation.confirmedBalanceChange,
                      true,
                    )}
                  </td>
                  <td className="govuk-table__cell">{approvalNotes || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="govuk-heading-l">Approvals and carryover</h2>
      <p className="govuk-body">
        {data.exceptional
          ? `Exceptional carryover of ${formatDuration(data.exceptional.approvedAmountMinutes, true)} approved on ${formatDate(data.exceptional.approvalDate, data.settings.dateFormat)}: ${data.exceptional.note}`
          : "No exceptional carryover recorded."}
      </p>
    </>
  );
}
