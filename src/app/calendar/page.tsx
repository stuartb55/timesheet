import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  dateAtUtcMidnight,
  isValidIsoDate,
  isoDate,
  weekdayIndex,
} from "@/domain/time";
import { getDays, nowInLondon } from "@/lib/data";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

function addMonths(month: string, amount: number): string {
  const date = dateAtUtcMidnight(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return isoDate(date).slice(0, 7);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const query = await searchParams;
  const today = nowInLondon().date;
  const month = isValidIsoDate(`${query.month ?? ""}-01`)
    ? (query.month as string)
    : nowInLondon().date.slice(0, 7);
  const first = `${month}-01`;
  const gridStart = addDays(first, -weekdayIndex(first));
  const days = await getDays(
    Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)),
  );
  return (
    <>
      <h1 className="govuk-heading-xl">Calendar</h1>
      <div className="app-date-nav">
        <Link
          className="govuk-link"
          href={`/calendar?month=${addMonths(month, -1)}`}
        >
          ← Previous month
        </Link>
        <form>
          <label className="govuk-label" htmlFor="month">
            Month
          </label>
          <input
            className="govuk-input govuk-input--width-10"
            id="month"
            name="month"
            type="month"
            defaultValue={month}
          />
          <button className="govuk-button" data-module="govuk-button">
            Go
          </button>
        </form>
        <Link
          className="govuk-link"
          href={`/calendar?month=${addMonths(month, 1)}`}
        >
          Next month →
        </Link>
      </div>
      <div className="app-table-scroll">
        <table className="govuk-table app-calendar-grid">
          <caption className="govuk-visually-hidden">
            {new Intl.DateTimeFormat("en-GB", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${first}T00:00:00Z`))}
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              {[
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ].map((day) => (
                <th className="govuk-table__header" scope="col" key={day}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {Array.from({ length: 6 }, (_, week) => (
              <tr className="govuk-table__row" key={week}>
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const date = day.calculation.date;
                  const breach = day.calculation.findings.some(
                    (item) => item.severity === "BREACH",
                  );
                  const warning = day.calculation.findings.some(
                    (item) =>
                      item.severity === "WARNING" ||
                      item.severity === "APPROVAL_REQUIRED",
                  );
                  const tags = [
                    day.completion
                      ? "Complete"
                      : day.calculation.expectedMinutes === 0
                        ? "Non-working day"
                        : date > today
                          ? "Future"
                          : "Incomplete",
                    day.credits.length ? "Credit" : "",
                    day.flexiLeave.length ? "Flexi leave" : "",
                    breach ? "Breach" : "",
                    warning ? "Warning" : "",
                  ].filter(Boolean);
                  return (
                    <td
                      className={`govuk-table__cell app-calendar-day ${date.slice(0, 7) !== month ? "app-calendar-day--outside" : ""}`}
                      key={date}
                    >
                      <Link className="govuk-link" href={`/day/${date}`}>
                        <strong>{Number(date.slice(8))}</strong>
                        <span className="govuk-visually-hidden">
                          {` ${date}`}
                        </span>
                      </Link>
                      <div>
                        {tags.map((tag) => (
                          <span
                            className={`govuk-tag govuk-tag--${tag === "Breach" ? "red" : tag === "Warning" ? "yellow" : tag === "Complete" ? "green" : tag === "Future" ? "grey" : "blue"}`}
                            key={tag}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
