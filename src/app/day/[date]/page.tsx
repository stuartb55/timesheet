import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { copyDay, resolveFinding, toggleDayComplete } from "@/app/actions";
import { Findings, SeverityTag } from "@/components/findings";
import { FlashMessage } from "@/components/flash-message";
import {
  CreditForm,
  FlexiLeaveForm,
  TimeSegmentForm,
} from "@/components/record-forms";
import { StatCard } from "@/components/stat-card";
import {
  addDays,
  formatDate,
  formatDuration,
  formatTime,
  isValidIsoDate,
  localDateAndMinute,
} from "@/domain/time";
import { CREDIT_LABELS, SEGMENT_LABELS } from "@/lib/constants";
import { ensureAccountingPeriod, getDay } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Daily record" };

export default async function DayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{
    success?: string;
    error?: string;
    errorTarget?: string;
  }>;
}) {
  const { date } = await params;
  if (!isValidIsoDate(date)) notFound();
  const [messages, day, period] = await Promise.all([
    searchParams,
    getDay(date),
    ensureAccountingPeriod(date),
  ]);
  const displayDate = formatDate(date, day.settings.dateFormat);
  const isLocked = period.status === "LOCKED";

  return (
    <>
      <div className="app-date-nav app-no-print">
        <Link className="govuk-link" href={`/day/${addDays(date, -1)}`}>
          ← Previous day
        </Link>
        <Link className="govuk-link" href="/day">
          Today
        </Link>
        <Link className="govuk-link" href={`/day/${addDays(date, 1)}`}>
          Next day →
        </Link>
      </div>
      <FlashMessage {...messages} />
      <h1 className="govuk-heading-xl">{displayDate}</h1>
      {isLocked && (
        <div className="govuk-inset-text">
          This accounting period is locked. Unlock it from the accounting period
          page before editing this record.
        </div>
      )}
      {day.completion?.lastChangedAfterAt && (
        <div className="govuk-inset-text">
          <strong>This day was changed after it was marked complete.</strong>
        </div>
      )}

      <div className="app-grid">
        <StatCard
          label="Expected"
          value={formatDuration(day.calculation.expectedMinutes)}
        />
        <StatCard
          label="Actual work"
          value={formatDuration(day.calculation.actualWorkMinutes)}
        />
        <StatCard
          label="Flexitime eligible"
          value={formatDuration(day.calculation.confirmedEligibleMinutes)}
        />
        <StatCard
          label="Authorised credits"
          value={formatDuration(day.calculation.confirmedCreditMinutes)}
          hint={
            day.calculation.provisionalCreditMinutes
              ? `${formatDuration(day.calculation.provisionalCreditMinutes)} pending`
              : undefined
          }
        />
        <StatCard
          label="Flexi leave"
          value={formatDuration(day.calculation.flexiLeaveMinutes)}
          hint={
            day.calculation.provisionalFlexiLeaveMinutes
              ? `${formatDuration(day.calculation.provisionalFlexiLeaveMinutes)} pending`
              : undefined
          }
        />
        <StatCard
          label="Overtime"
          value={formatDuration(day.calculation.overtimeMinutes)}
          hint="excluded from flexitime"
        />
        <StatCard
          label="Daily balance"
          value={formatDuration(day.calculation.confirmedBalanceChange, true)}
        />
      </div>

      <section aria-labelledby="segments-heading">
        <h2 className="govuk-heading-l" id="segments-heading">
          Time segments
        </h2>
        {day.segments.length === 0 ? (
          <p className="govuk-body">No time segments recorded.</p>
        ) : (
          <div className="app-table-scroll">
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th className="govuk-table__header">Type</th>
                  <th className="govuk-table__header">Start</th>
                  <th className="govuk-table__header">Finish</th>
                  <th className="govuk-table__header">Duration</th>
                  <th className="govuk-table__header">Approval</th>
                  <th className="govuk-table__header">Note</th>
                  <th className="govuk-table__header">
                    <span className="govuk-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {day.segments.map((segment) => {
                  const start = localDateAndMinute(segment.startAt).minute;
                  const end = segment.endAt
                    ? localDateAndMinute(segment.endAt)
                    : null;
                  const minutes = segment.endAt
                    ? Math.round(
                        (segment.endAt.getTime() - segment.startAt.getTime()) /
                          60_000,
                      )
                    : null;
                  return (
                    <tr className="govuk-table__row" key={segment.id}>
                      <td className="govuk-table__cell">
                        {SEGMENT_LABELS[segment.type]}
                      </td>
                      <td className="govuk-table__cell">{formatTime(start)}</td>
                      <td className="govuk-table__cell">
                        {end === null ? (
                          <span className="govuk-tag govuk-tag--blue">
                            Open
                          </span>
                        ) : (
                          <>
                            {formatTime(end.minute)}
                            {end.date !== date && (
                              <span className="govuk-hint govuk-!-margin-bottom-0">
                                {formatDate(end.date, day.settings.dateFormat)}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="govuk-table__cell">
                        {minutes === null ? "—" : formatDuration(minutes)}
                      </td>
                      <td className="govuk-table__cell">
                        {segment.approvalStatus
                          .toLowerCase()
                          .replaceAll("_", " ")}
                        {segment.approvalNote && (
                          <span className="govuk-hint govuk-!-margin-bottom-0">
                            {segment.approvalNote}
                          </span>
                        )}
                      </td>
                      <td className="govuk-table__cell">
                        {segment.note || "—"}
                      </td>
                      <td className="govuk-table__cell">
                        {isLocked ? (
                          "Locked"
                        ) : (
                          <details className="govuk-details">
                            <summary className="govuk-details__summary">
                              <span className="govuk-details__summary-text">
                                Edit
                              </span>
                            </summary>
                            <div className="govuk-details__text">
                              <TimeSegmentForm date={date} segment={segment} />
                            </div>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLocked && (
          <details
            className="govuk-details app-no-print"
            open={day.settings.defaultEntryMethod === "MANUAL"}
          >
            <summary className="govuk-details__summary">
              <span className="govuk-details__summary-text">
                Add a time segment
              </span>
            </summary>
            <div className="govuk-details__text">
              <TimeSegmentForm date={date} />
            </div>
          </details>
        )}
      </section>

      <section aria-labelledby="credits-heading">
        <h2 className="govuk-heading-l" id="credits-heading">
          Authorised credits
        </h2>
        {day.credits.length === 0 ? (
          <p className="govuk-body">No authorised credits recorded.</p>
        ) : (
          <div className="app-table-scroll">
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th className="govuk-table__header">Type</th>
                  <th className="govuk-table__header">Duration</th>
                  <th className="govuk-table__header">Status</th>
                  <th className="govuk-table__header">Note</th>
                  <th className="govuk-table__header">Actions</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {day.credits.map((credit) => (
                  <tr className="govuk-table__row" key={credit.id}>
                    <td className="govuk-table__cell">
                      {CREDIT_LABELS[credit.type]}
                    </td>
                    <td className="govuk-table__cell">
                      {formatDuration(credit.durationMinutes)}
                    </td>
                    <td className="govuk-table__cell">
                      {credit.approvalStatus.toLowerCase().replaceAll("_", " ")}
                      {credit.approvalNote && (
                        <span className="govuk-hint govuk-!-margin-bottom-0">
                          {credit.approvalNote}
                        </span>
                      )}
                    </td>
                    <td className="govuk-table__cell">{credit.note || "—"}</td>
                    <td className="govuk-table__cell">
                      {isLocked ? (
                        "Locked"
                      ) : (
                        <details className="govuk-details">
                          <summary className="govuk-details__summary">
                            <span className="govuk-details__summary-text">
                              Edit
                            </span>
                          </summary>
                          <div className="govuk-details__text">
                            <CreditForm
                              date={date}
                              credit={credit}
                              expectedMinutes={day.calculation.expectedMinutes}
                            />
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLocked && (
          <details className="govuk-details app-no-print">
            <summary className="govuk-details__summary">
              <span className="govuk-details__summary-text">
                Add an authorised credit
              </span>
            </summary>
            <div className="govuk-details__text">
              <CreditForm
                date={date}
                expectedMinutes={day.calculation.expectedMinutes}
              />
            </div>
          </details>
        )}
      </section>

      <section aria-labelledby="leave-heading">
        <h2 className="govuk-heading-l" id="leave-heading">
          Flexi leave
        </h2>
        {day.flexiLeave.length === 0 ? (
          <p className="govuk-body">No flexi leave recorded.</p>
        ) : (
          <div className="app-table-scroll">
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th className="govuk-table__header">Type</th>
                  <th className="govuk-table__header">Duration</th>
                  <th className="govuk-table__header">Status</th>
                  <th className="govuk-table__header">Note</th>
                  <th className="govuk-table__header">Actions</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {day.flexiLeave.map((leave) => (
                  <tr className="govuk-table__row" key={leave.id}>
                    <td className="govuk-table__cell">
                      {leave.kind.toLowerCase().replaceAll("_", " ")}
                    </td>
                    <td className="govuk-table__cell">
                      {formatDuration(leave.durationMinutes)}
                    </td>
                    <td className="govuk-table__cell">
                      {leave.approvalStatus.toLowerCase()}
                    </td>
                    <td className="govuk-table__cell">{leave.note || "—"}</td>
                    <td className="govuk-table__cell">
                      {isLocked ? (
                        "Locked"
                      ) : (
                        <details className="govuk-details">
                          <summary className="govuk-details__summary">
                            <span className="govuk-details__summary-text">
                              Edit
                            </span>
                          </summary>
                          <div className="govuk-details__text">
                            <FlexiLeaveForm
                              date={date}
                              leave={leave}
                              expectedMinutes={day.calculation.expectedMinutes}
                            />
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLocked && (
          <details className="govuk-details app-no-print">
            <summary className="govuk-details__summary">
              <span className="govuk-details__summary-text">
                Record flexi leave
              </span>
            </summary>
            <div className="govuk-details__text">
              <FlexiLeaveForm
                date={date}
                expectedMinutes={day.calculation.expectedMinutes}
              />
            </div>
          </details>
        )}
      </section>

      <section aria-labelledby="findings-heading">
        <h2 className="govuk-heading-l" id="findings-heading">
          Policy findings
        </h2>
        <Findings findings={day.calculation.findings} />
        {!isLocked &&
          day.calculation.findings
            .filter(
              (finding) =>
                finding.approvalRequired &&
                finding.ruleId !== "APPROVAL_NOT_RECORDED",
            )
            .map((finding, index) => (
              <details
                key={`${finding.ruleId}-${index}`}
                className="govuk-details app-no-print"
              >
                <summary className="govuk-details__summary">
                  <span className="govuk-details__summary-text">
                    Record response for {finding.ruleId}
                  </span>
                </summary>
                <div className="govuk-details__text">
                  <form action={resolveFinding}>
                    <input type="hidden" name="date" value={date} />
                    <input type="hidden" name="ruleId" value={finding.ruleId} />
                    <p className="govuk-body">
                      <SeverityTag severity={finding.severity} />{" "}
                      {finding.message}
                    </p>
                    <div className="govuk-form-group">
                      <label
                        className="govuk-label"
                        htmlFor={`finding-status-${index}`}
                      >
                        Approval position
                      </label>
                      <select
                        className="govuk-select"
                        id={`finding-status-${index}`}
                        name="approvalStatus"
                        defaultValue={
                          day.resolutions.find(
                            (item) => item.ruleId === finding.ruleId,
                          )?.approvalStatus ?? "PENDING"
                        }
                      >
                        <option value="NOT_REQUIRED">
                          Approval was not required
                        </option>
                        <option value="PENDING">
                          Approval required and pending
                        </option>
                        <option value="APPROVED">
                          Approval obtained externally
                        </option>
                        <option value="REFUSED">Approval refused</option>
                      </select>
                    </div>
                    <div className="govuk-form-group">
                      <label
                        className="govuk-label"
                        htmlFor={`finding-date-${index}`}
                      >
                        Approval date (optional)
                      </label>
                      <input
                        className="govuk-input govuk-input--width-10"
                        id={`finding-date-${index}`}
                        type="date"
                        name="approvalDate"
                        defaultValue={day.resolutions
                          .find((item) => item.ruleId === finding.ruleId)
                          ?.approvalDate?.toISOString()
                          .slice(0, 10)}
                      />
                    </div>
                    <div className="govuk-form-group">
                      <label
                        className="govuk-label"
                        htmlFor={`finding-note-${index}`}
                      >
                        Explanation or reference
                      </label>
                      <textarea
                        className="govuk-textarea"
                        id={`finding-note-${index}`}
                        name="note"
                        rows={2}
                        defaultValue={
                          day.resolutions.find(
                            (item) => item.ruleId === finding.ruleId,
                          )?.note ?? ""
                        }
                      />
                    </div>
                    <button className="govuk-button" data-module="govuk-button">
                      Save response
                    </button>
                  </form>
                </div>
              </details>
            ))}
      </section>

      {!isLocked && (
        <section className="app-no-print" aria-labelledby="day-actions-heading">
          <h2 className="govuk-heading-l" id="day-actions-heading">
            Day actions
          </h2>
          <form action={toggleDayComplete}>
            <input type="hidden" name="date" value={date} />
            <button
              className="govuk-button"
              data-module="govuk-button"
              id="toggle-completion"
            >
              {day.completion ? "Mark day incomplete" : "Mark day complete"}
            </button>
          </form>
          <details className="govuk-details">
            <summary className="govuk-details__summary">
              <span className="govuk-details__summary-text">
                Copy entries from another day
              </span>
            </summary>
            <div className="govuk-details__text">
              <form action={copyDay}>
                <input type="hidden" name="targetDate" value={date} />
                <div className="govuk-form-group">
                  <label className="govuk-label" htmlFor="copy-source-date">
                    Source date
                  </label>
                  <input
                    className="govuk-input govuk-input--width-10"
                    id="copy-source-date"
                    type="date"
                    name="sourceDate"
                    required
                  />
                </div>
                <div className="govuk-form-group">
                  <div
                    className="govuk-checkboxes govuk-checkboxes--small"
                    data-module="govuk-checkboxes"
                  >
                    <div className="govuk-checkboxes__item">
                      <input
                        className="govuk-checkboxes__input"
                        id="confirm-copy"
                        type="checkbox"
                        name="confirmCopy"
                        value="true"
                      />
                      <label
                        className="govuk-label govuk-checkboxes__label"
                        htmlFor="confirm-copy"
                      >
                        I have checked the copied times and want to save them on
                        this date
                      </label>
                    </div>
                  </div>
                </div>
                <button className="govuk-button" data-module="govuk-button">
                  Copy entries
                </button>
              </form>
            </div>
          </details>
        </section>
      )}
    </>
  );
}
