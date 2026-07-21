import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  formatDate,
  formatDuration,
  formatTime,
  isValidIsoDate,
  localDateAndMinute,
  weekdayIndex,
} from "@/domain/time";
import { getDays, nowInLondon } from "@/lib/data";

export const metadata: Metadata = { title: "Weekly view" };
export const dynamic = "force-dynamic";

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const query = await searchParams;
  const selected = isValidIsoDate(query.date ?? "")
    ? (query.date as string)
    : nowInLondon().date;
  const monday = addDays(selected, -weekdayIndex(selected));
  const days = await getDays(
    Array.from({ length: 7 }, (_, index) => addDays(monday, index)),
  );
  const today = nowInLondon().date;
  return (
    <>
      <h1 className="govuk-heading-xl">Weekly view</h1>
      <div className="app-date-nav">
        <Link className="govuk-link" href={`/week?date=${addDays(monday, -7)}`}>
          ← Previous week
        </Link>
        <form>
          <label className="govuk-label" htmlFor="week-date">
            Week containing
          </label>
          <input
            className="govuk-input govuk-input--width-10"
            id="week-date"
            name="date"
            type="date"
            defaultValue={selected}
          />
          <button className="govuk-button" data-module="govuk-button">
            Go
          </button>
        </form>
        <Link className="govuk-link" href={`/week?date=${addDays(monday, 7)}`}>
          Next week →
        </Link>
      </div>
      <div className="app-table-scroll">
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">First start</th>
              <th className="govuk-table__header">Last finish</th>
              <th className="govuk-table__header">Work</th>
              <th className="govuk-table__header">Breaks</th>
              <th className="govuk-table__header">Credits</th>
              <th className="govuk-table__header">Overtime</th>
              <th className="govuk-table__header">Expected</th>
              <th className="govuk-table__header">Balance</th>
              <th className="govuk-table__header">Status</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {days.map((day) => {
              const closed = day.segments.filter(
                (segment) =>
                  segment.endAt &&
                  !["LUNCH_BREAK", "OTHER_UNPAID_BREAK"].includes(segment.type),
              );
              const first = closed[0];
              const last = closed.at(-1);
              const severity = day.calculation.findings.some(
                (item) => item.severity === "BREACH",
              )
                ? "Breach"
                : day.calculation.findings.some(
                      (item) =>
                        item.severity === "WARNING" ||
                        item.severity === "APPROVAL_REQUIRED",
                    )
                  ? "Warning"
                  : day.calculation.date > today &&
                      day.calculation.expectedMinutes > 0
                    ? "Future"
                    : day.completion
                      ? "Complete"
                      : day.calculation.expectedMinutes === 0
                        ? "Non-working"
                        : "Incomplete";
              return (
                <tr className="govuk-table__row" key={day.calculation.date}>
                  <th className="govuk-table__header" scope="row">
                    <Link
                      className="govuk-link"
                      href={`/day/${day.calculation.date}`}
                    >
                      {formatDate(
                        day.calculation.date,
                        day.settings.dateFormat,
                      )}
                    </Link>
                  </th>
                  <td className="govuk-table__cell">
                    {first
                      ? formatTime(localDateAndMinute(first.startAt).minute)
                      : "—"}
                  </td>
                  <td className="govuk-table__cell">
                    {last?.endAt
                      ? formatTime(localDateAndMinute(last.endAt).minute)
                      : "—"}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.actualWorkMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.breakMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.confirmedCreditMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.overtimeMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(day.calculation.expectedMinutes)}
                  </td>
                  <td className="govuk-table__cell">
                    {formatDuration(
                      day.calculation.confirmedBalanceChange,
                      true,
                    )}
                  </td>
                  <td className="govuk-table__cell">
                    <span
                      className={`govuk-tag govuk-tag--${
                        severity === "Complete"
                          ? "green"
                          : severity === "Breach"
                            ? "red"
                            : severity === "Warning"
                              ? "yellow"
                              : severity === "Future"
                                ? "grey"
                                : "blue"
                      }`}
                    >
                      {severity}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
