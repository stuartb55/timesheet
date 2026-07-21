import type { Metadata } from "next";
import Link from "next/link";
import { clockAction } from "./actions";
import { FlashMessage } from "@/components/flash-message";
import { Findings } from "@/components/findings";
import { LiveDuration } from "@/components/live-duration";
import { StatCard } from "@/components/stat-card";
import {
  daysBetween,
  formatDate,
  formatDuration,
  localDateAndMinute,
} from "@/domain/time";
import {
  ensureSettings,
  getDay,
  getOpenTimeSegment,
  getPeriod,
  getWtr,
  nowInLondon,
} from "@/lib/data";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const messages = await searchParams;
  const today = nowInLondon();
  const settings = await ensureSettings();
  const [day, period, wtr, open] = await Promise.all([
    getDay(today.date, settings),
    getPeriod(today.date, settings),
    getWtr(today.date, settings),
    getOpenTimeSegment(),
  ]);
  const status = !open
    ? "Not clocked in"
    : open.type === "LUNCH_BREAK" || open.type === "OTHER_UNPAID_BREAK"
      ? "On a break"
      : "Working";
  const pendingApprovals = [
    ...day.segments,
    ...day.credits,
    ...day.flexiLeave,
  ].filter((item) => item.approvalStatus === "PENDING").length;
  const openDate = open ? open.localDate.toISOString().slice(0, 10) : null;
  const openIsOvernight = Boolean(openDate && openDate < today.date);
  const unusuallyLongOpen =
    open &&
    (openIsOvernight ||
      daysBetween(openDate as string, today.date) * 1440 +
        today.minute -
        localDateAndMinute(open.startAt).minute >
        12 * 60);
  const incompleteDays = period.days.filter(
    (item) =>
      item.calculation.date <= today.date &&
      item.calculation.expectedMinutes > 0 &&
      !item.completion,
  ).length;

  return (
    <>
      <FlashMessage {...messages} />
      {!day.settings.setupComplete && !messages.error && !messages.success && (
        <div
          className="govuk-notification-banner"
          role="region"
          aria-labelledby="setup-banner-title"
          data-module="govuk-notification-banner"
        >
          <div className="govuk-notification-banner__header">
            <h2
              className="govuk-notification-banner__title"
              id="setup-banner-title"
            >
              Important
            </h2>
          </div>
          <div className="govuk-notification-banner__content">
            <h3 className="govuk-notification-banner__heading">
              Complete initial setup
            </h3>
            <p className="govuk-body">
              Check your working pattern, accounting anchor and policy before
              relying on balances.
            </p>
            <Link className="govuk-button" href="/settings">
              Set up the application
            </Link>
          </div>
        </div>
      )}
      <h1 className="govuk-heading-xl">Flexitime dashboard</h1>

      <section aria-labelledby="clock-heading">
        <h2 className="govuk-heading-l" id="clock-heading">
          Current clock status
        </h2>
        <div className="app-card">
          <p className="govuk-body">
            <strong>{status}</strong>
            {open && (
              <>
                {" "}
                for <LiveDuration startedAt={open.startAt.toISOString()} />
              </>
            )}
          </p>
          <form action={clockAction}>
            <div className="govuk-button-group">
              {!open && (
                <button
                  className="govuk-button"
                  data-module="govuk-button"
                  name="operation"
                  value="start"
                >
                  Start work
                </button>
              )}
              {open &&
                !openIsOvernight &&
                open.type !== "LUNCH_BREAK" &&
                open.type !== "OTHER_UNPAID_BREAK" && (
                  <>
                    <button
                      className="govuk-button"
                      data-module="govuk-button"
                      name="operation"
                      value="break"
                    >
                      Start a break
                    </button>
                    <button
                      className="govuk-button govuk-button--secondary"
                      data-module="govuk-button"
                      name="operation"
                      value="finish"
                    >
                      Finish work
                    </button>
                  </>
                )}
              {open &&
                !openIsOvernight &&
                (open.type === "LUNCH_BREAK" ||
                  open.type === "OTHER_UNPAID_BREAK") && (
                  <>
                    <button
                      className="govuk-button"
                      data-module="govuk-button"
                      name="operation"
                      value="resume"
                    >
                      Resume work
                    </button>
                    <button
                      className="govuk-button govuk-button--secondary"
                      data-module="govuk-button"
                      name="operation"
                      value="finish"
                    >
                      Finish
                    </button>
                  </>
                )}
              {openIsOvernight && (
                <button
                  className="govuk-button govuk-button--warning"
                  data-module="govuk-button"
                  name="operation"
                  value="finish"
                >
                  Finish overnight segment
                </button>
              )}
            </div>
          </form>
          {unusuallyLongOpen && (
            <p className="govuk-warning-text">
              <span className="govuk-warning-text__icon" aria-hidden="true">
                !
              </span>
              <strong className="govuk-warning-text__text">
                <span className="govuk-visually-hidden">Warning</span>
                This open segment has continued unusually long. Check the
                recorded start{openDate ? ` on ${openDate}` : ""}.
              </strong>
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="today-heading">
        <h2 className="govuk-heading-l" id="today-heading">
          Today, {formatDate(today.date, day.settings.dateFormat)}
        </h2>
        <div className="app-grid">
          <StatCard
            label="Work recorded"
            value={formatDuration(day.calculation.actualWorkMinutes)}
          />
          <StatCard
            label="Breaks"
            value={formatDuration(day.calculation.breakMinutes)}
          />
          <StatCard
            label="Expected"
            value={formatDuration(day.calculation.expectedMinutes)}
          />
          <StatCard
            label="Estimated balance"
            value={formatDuration(day.calculation.confirmedBalanceChange, true)}
            hint={
              day.calculation.provisionalCreditMinutes
                ? `Provisional: ${formatDuration(day.calculation.provisionalBalanceChange, true)}`
                : undefined
            }
          />
        </div>
        <p className="govuk-body">
          <Link className="govuk-link" href={`/day/${today.date}`}>
            {settings.defaultEntryMethod === "MANUAL"
              ? "Add or edit time manually"
              : "View or edit today’s record"}
          </Link>
        </p>
      </section>

      <section aria-labelledby="period-heading">
        <h2 className="govuk-heading-l" id="period-heading">
          Current accounting period
        </h2>
        <div className="app-grid">
          <StatCard
            label="Confirmed balance"
            value={formatDuration(
              period.calculation.rawClosingBalanceMinutes,
              true,
            )}
          />
          <StatCard
            label="Current carryover limit"
            value={formatDuration(
              period.calculation.rawClosingBalanceMinutes >= 0
                ? period.calculation.creditLimitMinutes
                : period.calculation.debitLimitMinutes,
            )}
            hint={
              period.calculation.rawClosingBalanceMinutes >= 0
                ? "maximum credit"
                : "maximum debit"
            }
          />
          <StatCard
            label="Flexi leave used"
            value={formatDuration(period.calculation.flexiLeaveMinutes)}
            hint={`${period.calculation.provisionalFlexiLeaveMinutes ? `${formatDuration(period.calculation.provisionalFlexiLeaveMinutes)} pending; ` : ""}limit ${formatDuration(day.settings.standardDayMinutes * 2)}`}
          />
          <StatCard label="Missing records" value={String(incompleteDays)} />
          <StatCard
            label="Pending approval issues"
            value={String(pendingApprovals)}
          />
          <StatCard
            label="17-week average"
            value={formatDuration(wtr.averageWeeklyMinutes)}
            hint={`${wtr.completeWeeks} complete weeks; ${wtr.incompleteDays} incomplete days`}
          />
        </div>
      </section>

      <section aria-labelledby="warnings-heading">
        <h2 className="govuk-heading-l" id="warnings-heading">
          Today’s policy results
        </h2>
        <Findings findings={day.calculation.findings} />
      </section>
    </>
  );
}
