import type { Metadata } from "next";
import Link from "next/link";
import { Findings } from "@/components/findings";
import { StatCard } from "@/components/stat-card";
import { formatDate, formatDuration } from "@/domain/time";
import { ensureSettings, getWtr, nowInLondon } from "@/lib/data";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Reports and exports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const today = nowInLondon().date;
  const year = today.slice(0, 4);
  const month = today.slice(5, 7);
  const [settings, wtr, overtime, credits, leave] = await Promise.all([
    ensureSettings(),
    getWtr(today),
    prisma.timeSegment.findMany({
      where: { type: "OVERTIME", deletedAt: null },
      orderBy: { localDate: "desc" },
      take: 10,
    }),
    prisma.authorisedCredit.findMany({
      where: { deletedAt: null },
      orderBy: { localDate: "desc" },
      take: 10,
    }),
    prisma.flexiLeave.findMany({
      where: { deletedAt: null },
      orderBy: { localDate: "desc" },
      take: 10,
    }),
  ]);
  return (
    <>
      <h1 className="govuk-heading-xl">Reports and exports</h1>
      <p className="govuk-body-l">
        Download spreadsheet-friendly CSV reports or a complete JSON copy of all
        application data.
      </p>
      <div className="app-grid">
        <div className="app-card">
          <h2 className="govuk-heading-m">Monthly summary</h2>
          <p className="govuk-body">
            Daily expected, actual, eligible, credit, leave, overtime and
            balance figures.
          </p>
          <form action="/api/export/csv">
            <input type="hidden" name="report" value="monthly" />
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="monthly-year">
                Year
              </label>
              <input
                className="govuk-input govuk-input--width-4"
                id="monthly-year"
                name="year"
                type="number"
                min="1900"
                max="9999"
                defaultValue={year}
                required
              />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="monthly-month">
                Month
              </label>
              <select
                className="govuk-select"
                id="monthly-month"
                name="month"
                defaultValue={String(Number(month))}
              >
                {[
                  "January",
                  "February",
                  "March",
                  "April",
                  "May",
                  "June",
                  "July",
                  "August",
                  "September",
                  "October",
                  "November",
                  "December",
                ].map((label, index) => (
                  <option value={index + 1} key={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button className="govuk-button" data-module="govuk-button">
              Download monthly CSV
            </button>
          </form>
        </div>
        <div className="app-card">
          <h2 className="govuk-heading-m">Annual summary</h2>
          <p className="govuk-body">
            A day-by-day record for the selected calendar year.
          </p>
          <form action="/api/export/csv">
            <input type="hidden" name="report" value="annual" />
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="annual-year">
                Year
              </label>
              <input
                className="govuk-input govuk-input--width-4"
                id="annual-year"
                name="year"
                type="number"
                min="1900"
                max="9999"
                defaultValue={year}
                required
              />
            </div>
            <button className="govuk-button" data-module="govuk-button">
              Download annual CSV
            </button>
          </form>
        </div>
        <div className="app-card">
          <h2 className="govuk-heading-m">Full data export</h2>
          <p className="govuk-body">
            Versioned JSON containing settings, source records, approvals,
            history and ledger entries.
          </p>
          <Link className="govuk-button" href="/api/export/json">
            Download full JSON export
          </Link>
        </div>
        <div className="app-card">
          <h2 className="govuk-heading-m">Period statement</h2>
          <p className="govuk-body">
            Printable statement suitable for saving as PDF.
          </p>
          <Link
            className="govuk-button"
            href={`/period/statement?date=${today}`}
          >
            Open current statement
          </Link>
        </div>
      </div>

      <h2 className="govuk-heading-l">
        Working Time Regulations: rolling 17 weeks
      </h2>
      <div className="app-grid">
        <StatCard
          label="Represented days"
          value={String(wtr.representedDays)}
        />
        <StatCard
          label="Total actual work"
          value={formatDuration(wtr.totalMinutes)}
        />
        <StatCard
          label="Average per week"
          value={formatDuration(wtr.averageWeeklyMinutes)}
        />
        <StatCard label="Complete weeks" value={String(wtr.completeWeeks)} />
        <StatCard
          label="Incomplete days"
          value={String(wtr.incompleteDays)}
          hint={
            wtr.reliable ? "Result is complete" : "Result may be unreliable"
          }
        />
      </div>
      <Findings findings={wtr.findings} />
      <form action="/api/export/csv">
        <input type="hidden" name="report" value="wtr" />
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="wtr-as-of">
            Report end date
          </label>
          <input
            className="govuk-input govuk-input--width-10"
            id="wtr-as-of"
            name="asOf"
            type="date"
            defaultValue={today}
            required
          />
        </div>
        <button className="govuk-button" data-module="govuk-button">
          Download working-time report CSV
        </button>
      </form>

      <h2 className="govuk-heading-l">Overtime report</h2>
      <p className="govuk-body">
        <Link className="govuk-link" href="/api/export/csv?report=overtime">
          Download all overtime as CSV
        </Link>
      </p>
      <div className="app-table-scroll">
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">Duration</th>
              <th className="govuk-table__header">Approval</th>
              <th className="govuk-table__header">Note</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {overtime.map((item) => (
              <tr className="govuk-table__row" key={item.id}>
                <td className="govuk-table__cell">
                  {formatDate(item.localDate, settings.dateFormat)}
                </td>
                <td className="govuk-table__cell">
                  {item.endAt
                    ? formatDuration(
                        Math.round(
                          (item.endAt.getTime() - item.startAt.getTime()) /
                            60000,
                        ),
                      )
                    : "Open"}
                </td>
                <td className="govuk-table__cell">
                  {item.approvalStatus.toLowerCase()}
                </td>
                <td className="govuk-table__cell">{item.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="govuk-heading-l">Authorised credit report</h2>
      <p className="govuk-body">
        <Link className="govuk-link" href="/api/export/csv?report=credits">
          Download all authorised credits as CSV
        </Link>
      </p>
      <div className="app-table-scroll">
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">Type</th>
              <th className="govuk-table__header">Duration</th>
              <th className="govuk-table__header">Approval</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {credits.map((item) => (
              <tr className="govuk-table__row" key={item.id}>
                <td className="govuk-table__cell">
                  {formatDate(item.localDate, settings.dateFormat)}
                </td>
                <td className="govuk-table__cell">
                  {item.type.toLowerCase().replaceAll("_", " ")}
                </td>
                <td className="govuk-table__cell">
                  {formatDuration(item.durationMinutes)}
                </td>
                <td className="govuk-table__cell">
                  {item.approvalStatus.toLowerCase()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="govuk-heading-l">Flexi leave report</h2>
      <p className="govuk-body">
        <Link className="govuk-link" href="/api/export/csv?report=flexi-leave">
          Download all flexi leave as CSV
        </Link>
      </p>
      <div className="app-table-scroll">
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">Type</th>
              <th className="govuk-table__header">Duration</th>
              <th className="govuk-table__header">Approval</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {leave.map((item) => (
              <tr className="govuk-table__row" key={item.id}>
                <td className="govuk-table__cell">
                  {formatDate(item.localDate, settings.dateFormat)}
                </td>
                <td className="govuk-table__cell">
                  {item.kind.toLowerCase().replaceAll("_", " ")}
                </td>
                <td className="govuk-table__cell">
                  {formatDuration(item.durationMinutes)}
                </td>
                <td className="govuk-table__cell">
                  {item.approvalStatus.toLowerCase()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="govuk-inset-text">
        <h2 className="govuk-heading-m">Import and database backups</h2>
        <p className="govuk-body">
          Full JSON imports and PostgreSQL backup/restore are intentionally
          command-line operations because they replace data. Follow the
          confirmed commands in the README.
        </p>
      </div>
    </>
  );
}
