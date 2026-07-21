import type { Metadata } from "next";
import Link from "next/link";
import {
  addManualCorrection,
  changePeriodStatus,
  confirmCarryover,
  saveExceptionalCarryover,
  unlockPeriod,
} from "@/app/actions";
import { FlashMessage } from "@/components/flash-message";
import { Findings } from "@/components/findings";
import { StatCard } from "@/components/stat-card";
import {
  addDays,
  formatDate,
  formatDuration,
  isValidIsoDate,
  isoDate,
} from "@/domain/time";
import { getPeriod, nowInLondon } from "@/lib/data";

export const metadata: Metadata = { title: "Accounting period" };
export const dynamic = "force-dynamic";

export default async function PeriodPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; success?: string; error?: string }>;
}) {
  const query = await searchParams;
  const date = isValidIsoDate(query.date ?? "")
    ? (query.date as string)
    : nowInLondon().date;
  const data = await getPeriod(date);
  const start = isoDate(data.period.startDate);
  const today = nowInLondon().date;
  const manualCorrections = data.ledger.filter(
    (entry) => entry.type === "MANUAL_CORRECTION",
  );
  const unresolvedFindings = [
    ...data.calculation.findings,
    ...data.days.flatMap((day) => day.calculation.findings),
  ].filter(
    (finding) =>
      finding.severity === "BREACH" ||
      (finding.approvalRequired && !finding.approvalRecorded),
  ).length;
  return (
    <>
      <FlashMessage success={query.success} error={query.error} />
      <h1 className="govuk-heading-xl">Accounting period</h1>
      <div className="app-date-nav app-no-print">
        <Link
          className="govuk-link"
          href={`/period?date=${addDays(start, -28)}`}
        >
          ← Previous period
        </Link>
        <form>
          <label className="govuk-label" htmlFor="period-date">
            Period containing
          </label>
          <input
            className="govuk-input govuk-input--width-10"
            id="period-date"
            name="date"
            type="date"
            defaultValue={date}
          />
          <button className="govuk-button" data-module="govuk-button">
            Go
          </button>
        </form>
        <Link
          className="govuk-link"
          href={`/period?date=${addDays(start, 28)}`}
        >
          Next period →
        </Link>
      </div>
      <p className="govuk-body-l">
        {formatDate(data.period.startDate, data.settings.dateFormat)} to{" "}
        {formatDate(data.period.endDate, data.settings.dateFormat)}
      </p>
      <p className="govuk-body">
        Status:{" "}
        <span
          className={`govuk-tag govuk-tag--${data.period.status === "LOCKED" ? "yellow" : "blue"}`}
        >
          {data.period.status.toLowerCase()}
        </span>
      </p>

      <div className="app-grid">
        <StatCard
          label="Opening balance"
          value={formatDuration(data.calculation.openingBalanceMinutes, true)}
        />
        <StatCard
          label="Expected hours"
          value={formatDuration(data.calculation.expectedMinutes)}
        />
        <StatCard
          label="Normal work"
          value={formatDuration(data.calculation.normalWorkMinutes)}
        />
        <StatCard
          label="Official travel"
          value={formatDuration(data.calculation.travelMinutes)}
        />
        <StatCard
          label="Authorised credits"
          value={formatDuration(data.calculation.creditMinutes)}
          hint={
            data.calculation.provisionalCreditMinutes
              ? `${formatDuration(data.calculation.provisionalCreditMinutes)} provisional`
              : undefined
          }
        />
        <StatCard
          label="Flexi leave"
          value={formatDuration(data.calculation.flexiLeaveMinutes)}
          hint={
            data.calculation.provisionalFlexiLeaveMinutes
              ? `${formatDuration(data.calculation.provisionalFlexiLeaveMinutes)} pending`
              : undefined
          }
        />
        <StatCard
          label="Overtime"
          value={formatDuration(data.calculation.overtimeMinutes)}
          hint="shown separately"
        />
        <StatCard
          label="Manual corrections"
          value={formatDuration(data.calculation.manualCorrectionMinutes, true)}
        />
        <StatCard
          label="Raw closing balance"
          value={formatDuration(
            data.calculation.rawClosingBalanceMinutes,
            true,
          )}
        />
        <StatCard
          label="Normal credit limit"
          value={formatDuration(data.calculation.creditLimitMinutes)}
        />
        <StatCard
          label="Normal debit limit"
          value={formatDuration(data.calculation.debitLimitMinutes)}
        />
        <StatCard
          label="Proposed carryover"
          value={formatDuration(
            data.calculation.proposedCarryoverMinutes,
            true,
          )}
        />
        <StatCard
          label="Excess credit normally lost"
          value={formatDuration(data.calculation.excessCreditMinutes)}
        />
        <StatCard
          label="Excess debit"
          value={formatDuration(data.calculation.excessDebitMinutes)}
        />
        <StatCard
          label="Exceptional carryover"
          value={
            data.exceptional
              ? formatDuration(data.exceptional.approvedAmountMinutes, true)
              : "None"
          }
        />
        <StatCard
          label="Final carryover"
          value={
            data.period.carryoverConfirmed &&
            data.period.finalCarryoverMinutes !== null
              ? formatDuration(data.period.finalCarryoverMinutes, true)
              : "Not confirmed"
          }
        />
        <StatCard
          label="Unresolved policy findings"
          value={String(unresolvedFindings)}
        />
      </div>

      <h2 className="govuk-heading-l">Daily balances</h2>
      <div className="app-table-scroll">
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">First start</th>
              <th className="govuk-table__header">Last finish</th>
              <th className="govuk-table__header">Expected</th>
              <th className="govuk-table__header">Eligible</th>
              <th className="govuk-table__header">Credits</th>
              <th className="govuk-table__header">Flexi leave</th>
              <th className="govuk-table__header">Overtime</th>
              <th className="govuk-table__header">Balance change</th>
              <th className="govuk-table__header">Warnings</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {data.days.map((day) => {
              const workSegments = day.segments.filter(
                (segment) =>
                  !["LUNCH_BREAK", "OTHER_UNPAID_BREAK"].includes(segment.type),
              );
              const first = workSegments[0];
              const last = workSegments
                .filter((segment) => segment.endAt)
                .at(-1);
              const isFuture = day.calculation.date > today;
              return (
                <tr className="govuk-table__row" key={day.calculation.date}>
                  <th className="govuk-table__header" scope="row">
                    <Link
                      className="govuk-link"
                      href={`/day/${day.calculation.date}`}
                    >
                      {new Intl.DateTimeFormat("en-GB", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        timeZone: "UTC",
                      }).format(new Date(`${day.calculation.date}T00:00:00Z`))}
                    </Link>
                  </th>
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
                    {formatDuration(day.calculation.expectedMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.confirmedEligibleMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.confirmedCreditMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.flexiLeaveMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.overtimeMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {isFuture
                      ? "—"
                      : formatDuration(
                          day.calculation.confirmedBalanceChange,
                          true,
                        )}
                  </td>
                  <td className="govuk-table__cell">
                    {isFuture
                      ? "—"
                      : day.calculation.findings.filter(
                          (item) => item.severity !== "INCOMPLETE",
                        ).length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="govuk-heading-l">Period policy findings</h2>
      <Findings findings={data.calculation.findings} />

      <h2 className="govuk-heading-l">Balance ledger</h2>
      <p className="govuk-body">
        The confirmed balance can be reproduced from the source-linked entries
        below. Provisional entries are excluded from confirmed totals.
      </p>
      <div className="app-table-scroll">
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">Entry</th>
              <th className="govuk-table__header">Description</th>
              <th className="govuk-table__header">Amount</th>
              <th className="govuk-table__header">Status</th>
              <th className="govuk-table__header">Reason</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {data.ledger.map((entry) => (
              <tr className="govuk-table__row" key={entry.id}>
                <td className="govuk-table__cell">
                  {formatDate(entry.localDate, data.settings.dateFormat)}
                </td>
                <td className="govuk-table__cell">
                  {entry.type.toLowerCase().replaceAll("_", " ")}
                </td>
                <td className="govuk-table__cell">{entry.description}</td>
                <td className="govuk-table__cell">
                  {formatDuration(entry.durationMinutes, true)}
                </td>
                <td className="govuk-table__cell">
                  {entry.provisional ? "Provisional" : "Confirmed"}
                </td>
                <td className="govuk-table__cell">{entry.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section
        className="app-no-print"
        aria-labelledby="period-actions-heading"
      >
        <h2 className="govuk-heading-l" id="period-actions-heading">
          Period actions
        </h2>
        {data.period.status !== "LOCKED" ? (
          <>
            <form action={changePeriodStatus}>
              <input type="hidden" name="date" value={date} />
              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="period-status">
                  Status
                </label>
                <select
                  className="govuk-select"
                  id="period-status"
                  name="status"
                  defaultValue={data.period.status}
                >
                  <option value="OPEN">Open</option>
                  <option value="COMPLETE">Complete</option>
                  <option value="CHECKED">Checked</option>
                  <option value="LOCKED">Locked</option>
                </select>
              </div>
              <div className="govuk-form-group">
                <div
                  className="govuk-checkboxes govuk-checkboxes--small"
                  data-module="govuk-checkboxes"
                >
                  <div className="govuk-checkboxes__item">
                    <input
                      className="govuk-checkboxes__input"
                      id="confirm-lock"
                      name="confirmLock"
                      type="checkbox"
                      value="true"
                    />
                    <label
                      className="govuk-label govuk-checkboxes__label"
                      htmlFor="confirm-lock"
                    >
                      I confirm I want to lock the period if I select locked
                    </label>
                  </div>
                </div>
              </div>
              <button className="govuk-button" data-module="govuk-button">
                Update status
              </button>
            </form>
            <details className="govuk-details">
              <summary className="govuk-details__summary">
                <span className="govuk-details__summary-text">
                  Confirm final carryover
                </span>
              </summary>
              <div className="govuk-details__text">
                <form action={confirmCarryover}>
                  <input type="hidden" name="date" value={date} />
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor="final-carryover">
                      Final carryover in minutes
                    </label>
                    <input
                      className="govuk-input govuk-input--width-5"
                      id="final-carryover"
                      name="finalCarryoverMinutes"
                      type="number"
                      required
                      defaultValue={data.calculation.finalCarryoverMinutes}
                    />
                  </div>
                  <button className="govuk-button" data-module="govuk-button">
                    Confirm final carryover
                  </button>
                </form>
              </div>
            </details>
            <details className="govuk-details">
              <summary className="govuk-details__summary">
                <span className="govuk-details__summary-text">
                  Record externally approved exceptional carryover
                </span>
              </summary>
              <div className="govuk-details__text">
                <form action={saveExceptionalCarryover}>
                  <input type="hidden" name="date" value={date} />
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor="exceptional-amount">
                      Approved carryover in minutes
                    </label>
                    <input
                      className="govuk-input govuk-input--width-5"
                      id="exceptional-amount"
                      name="approvedAmountMinutes"
                      type="number"
                      required
                      defaultValue={data.exceptional?.approvedAmountMinutes}
                    />
                  </div>
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor="exceptional-date">
                      Approval date
                    </label>
                    <input
                      className="govuk-input govuk-input--width-10"
                      id="exceptional-date"
                      name="approvalDate"
                      type="date"
                      required
                      defaultValue={data.exceptional?.approvalDate
                        .toISOString()
                        .slice(0, 10)}
                    />
                  </div>
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor="exceptional-note">
                      Reason or approval note
                    </label>
                    <textarea
                      className="govuk-textarea"
                      id="exceptional-note"
                      name="note"
                      required
                      defaultValue={data.exceptional?.note}
                    />
                  </div>
                  <button className="govuk-button" data-module="govuk-button">
                    Save exceptional carryover
                  </button>
                </form>
              </div>
            </details>
            <details className="govuk-details">
              <summary className="govuk-details__summary">
                <span className="govuk-details__summary-text">
                  Add a manual balance correction
                </span>
              </summary>
              <div className="govuk-details__text">
                <form action={addManualCorrection}>
                  <input type="hidden" name="date" value={date} />
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor="correction-minutes">
                      Correction in minutes
                    </label>
                    <div className="govuk-hint">
                      Use a negative number for a debit.
                    </div>
                    <input
                      className="govuk-input govuk-input--width-5"
                      id="correction-minutes"
                      name="durationMinutes"
                      type="number"
                      required
                    />
                  </div>
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor="correction-reason">
                      Reason
                    </label>
                    <textarea
                      className="govuk-textarea"
                      id="correction-reason"
                      name="reason"
                      required
                    />
                  </div>
                  <button className="govuk-button" data-module="govuk-button">
                    Add correction
                  </button>
                </form>
                {manualCorrections.length > 0 && (
                  <p className="govuk-body">
                    {manualCorrections.length} correction(s) recorded.
                  </p>
                )}
              </div>
            </details>
          </>
        ) : (
          <div className="govuk-inset-text">
            <p className="govuk-body">
              This period is locked. Records in it cannot be edited.
            </p>
            <form action={unlockPeriod}>
              <input type="hidden" name="date" value={date} />
              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="unlock-reason">
                  Reason for unlocking
                </label>
                <textarea
                  className="govuk-textarea"
                  id="unlock-reason"
                  name="reason"
                  required
                />
              </div>
              <div
                className="govuk-checkboxes govuk-checkboxes--small"
                data-module="govuk-checkboxes"
              >
                <div className="govuk-checkboxes__item">
                  <input
                    className="govuk-checkboxes__input"
                    id="confirm-unlock"
                    type="checkbox"
                    name="confirmUnlock"
                    value="true"
                  />
                  <label
                    className="govuk-label govuk-checkboxes__label"
                    htmlFor="confirm-unlock"
                  >
                    I confirm that I want to unlock this period
                  </label>
                </div>
              </div>
              <button
                className="govuk-button govuk-button--warning"
                data-module="govuk-button"
              >
                Unlock period
              </button>
            </form>
          </div>
        )}
        <p className="govuk-body">
          <Link
            className="govuk-button govuk-button--secondary"
            href={`/period/statement?date=${date}`}
          >
            Printable accounting-period statement
          </Link>
        </p>
      </section>
    </>
  );
}
