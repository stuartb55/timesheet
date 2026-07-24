import type { Metadata } from "next";
import Link from "next/link";
import {
  restoreCredit,
  restoreFlexiLeave,
  restoreTimeSegment,
} from "@/app/actions";
import { FlashMessage } from "@/components/flash-message";
import { formatDate, formatDateTime, isoDate } from "@/domain/time";
import { ensureSettings } from "@/lib/data";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Change history" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    errorTarget?: string;
    page?: string;
  }>;
}) {
  const query = await searchParams;
  const parsedPage = Number(query.page ?? "1");
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 10_000
      ? parsedPage
      : 1;
  const pageSize = 100;
  const [settings, changeResults, segments, credits, leave] = await Promise.all(
    [
      ensureSettings(),
      prisma.changeHistory.findMany({
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize + 1,
      }),
      prisma.timeSegment.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.authorisedCredit.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.flexiLeave.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
      }),
    ],
  );
  const hasNextPage = changeResults.length > pageSize;
  const changes = changeResults.slice(0, pageSize);
  return (
    <>
      <FlashMessage
        success={query.success}
        error={query.error}
        errorTarget={query.errorTarget}
      />
      <h1 className="govuk-heading-xl">Change history</h1>
      <p className="govuk-body-l">
        A simple local history of important changes. This is intended for
        understanding and recovery, not as an enterprise audit system.
      </p>
      <h2 className="govuk-heading-l">Restore deleted records</h2>
      {segments.length + credits.length + leave.length === 0 ? (
        <p className="govuk-body">There are no deleted records to restore.</p>
      ) : (
        <div className="app-table-scroll">
          <table className="govuk-table">
            <thead className="govuk-table__head">
              <tr className="govuk-table__row">
                <th className="govuk-table__header">Record</th>
                <th className="govuk-table__header">Date</th>
                <th className="govuk-table__header">Deleted</th>
                <th className="govuk-table__header">Action</th>
              </tr>
            </thead>
            <tbody className="govuk-table__body">
              {segments.map((item) => (
                <tr className="govuk-table__row" key={item.id}>
                  <td className="govuk-table__cell">
                    Time segment: {item.type.toLowerCase().replaceAll("_", " ")}
                  </td>
                  <td className="govuk-table__cell">
                    <Link
                      className="govuk-link"
                      href={`/day/${isoDate(item.localDate)}`}
                    >
                      {formatDate(item.localDate, settings.dateFormat)}
                    </Link>
                  </td>
                  <td className="govuk-table__cell">
                    {item.deletedAt ? formatDateTime(item.deletedAt) : "—"}
                  </td>
                  <td className="govuk-table__cell">
                    <form action={restoreTimeSegment}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        className="govuk-button govuk-button--secondary"
                        data-module="govuk-button"
                      >
                        Restore
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {credits.map((item) => (
                <tr className="govuk-table__row" key={item.id}>
                  <td className="govuk-table__cell">
                    Credit: {item.type.toLowerCase().replaceAll("_", " ")}
                  </td>
                  <td className="govuk-table__cell">
                    <Link
                      className="govuk-link"
                      href={`/day/${isoDate(item.localDate)}`}
                    >
                      {formatDate(item.localDate, settings.dateFormat)}
                    </Link>
                  </td>
                  <td className="govuk-table__cell">
                    {item.deletedAt ? formatDateTime(item.deletedAt) : "—"}
                  </td>
                  <td className="govuk-table__cell">
                    <form action={restoreCredit}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        className="govuk-button govuk-button--secondary"
                        data-module="govuk-button"
                      >
                        Restore
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {leave.map((item) => (
                <tr className="govuk-table__row" key={item.id}>
                  <td className="govuk-table__cell">
                    Flexi leave: {item.kind.toLowerCase().replaceAll("_", " ")}
                  </td>
                  <td className="govuk-table__cell">
                    <Link
                      className="govuk-link"
                      href={`/day/${isoDate(item.localDate)}`}
                    >
                      {formatDate(item.localDate, settings.dateFormat)}
                    </Link>
                  </td>
                  <td className="govuk-table__cell">
                    {item.deletedAt ? formatDateTime(item.deletedAt) : "—"}
                  </td>
                  <td className="govuk-table__cell">
                    <form action={restoreFlexiLeave}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        className="govuk-button govuk-button--secondary"
                        data-module="govuk-button"
                      >
                        Restore
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="govuk-heading-l">Change log</h2>
      <div className="app-table-scroll">
        <table className="govuk-table">
          <caption className="govuk-table__caption govuk-table__caption--m">
            Page {page}
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th className="govuk-table__header">When</th>
              <th className="govuk-table__header">Record</th>
              <th className="govuk-table__header">Action</th>
              <th className="govuk-table__header">Reason</th>
              <th className="govuk-table__header">Values</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {changes.map((change) => (
              <tr className="govuk-table__row" key={change.id}>
                <td className="govuk-table__cell app-nowrap">
                  {formatDateTime(change.occurredAt)}
                </td>
                <td className="govuk-table__cell">
                  {change.recordType}
                  <br />
                  <span className="govuk-hint">{change.recordId}</span>
                </td>
                <td className="govuk-table__cell">
                  {change.action.toLowerCase()}
                </td>
                <td className="govuk-table__cell">{change.reason || "—"}</td>
                <td className="govuk-table__cell">
                  <details className="govuk-details">
                    <summary className="govuk-details__summary">
                      <span className="govuk-details__summary-text">
                        View change
                      </span>
                    </summary>
                    <pre className="govuk-details__text app-pre-wrap">
                      {JSON.stringify(
                        {
                          previous: change.previousValues,
                          new: change.newValues,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(page > 1 || hasNextPage) && (
        <nav className="govuk-pagination" aria-label="Change history pages">
          {page > 1 && (
            <div className="govuk-pagination__prev">
              <Link
                className="govuk-link govuk-pagination__link"
                href={`/history?page=${page - 1}`}
                rel="prev"
              >
                <span className="govuk-pagination__link-title">
                  Previous page
                </span>
              </Link>
            </div>
          )}
          {hasNextPage && (
            <div className="govuk-pagination__next">
              <Link
                className="govuk-link govuk-pagination__link"
                href={`/history?page=${page + 1}`}
                rel="next"
              >
                <span className="govuk-pagination__link-title">Next page</span>
              </Link>
            </div>
          )}
        </nav>
      )}
    </>
  );
}
