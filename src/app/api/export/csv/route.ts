import { NextRequest } from "next/server";
import { addDays, isValidIsoDate, isoDate } from "@/domain/time";
import { getDays, getWtr, nowInLondon } from "@/lib/data";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function safeCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(safeCell).join(","))
    .join("\r\n");
}

export async function GET(request: NextRequest) {
  const report = request.nextUrl.searchParams.get("report") ?? "monthly";
  const allowedReports = new Set([
    "monthly",
    "annual",
    "overtime",
    "credits",
    "flexi-leave",
    "wtr",
  ]);
  if (!allowedReports.has(report)) {
    return new Response("Unknown report type", { status: 400 });
  }
  const today = nowInLondon().date;
  let headers: string[];
  let rows: unknown[][];

  if (report === "wtr") {
    const asOfDate = request.nextUrl.searchParams.get("asOf") ?? today;
    if (!isValidIsoDate(asOfDate)) {
      return new Response("Enter a valid as-of date", { status: 400 });
    }
    const result = await getWtr(asOfDate);
    headers = ["Metric", "Value"];
    rows = [
      ["As-of date", asOfDate],
      ["Represented window days", result.representedDays],
      ["Total actual work minutes", result.totalMinutes],
      ["Average weekly minutes", result.averageWeeklyMinutes],
      ["Complete weeks", result.completeWeeks],
      ["Incomplete working days", result.incompleteDays],
      ["Reliable", result.reliable ? "Yes" : "No"],
      [
        "Policy findings",
        result.findings.map((item) => item.ruleId).join("; "),
      ],
    ];
  } else if (report === "overtime") {
    const records = await prisma.timeSegment.findMany({
      where: { type: "OVERTIME", deletedAt: null },
      orderBy: { localDate: "asc" },
    });
    headers = [
      "Date",
      "Start UTC",
      "Finish UTC",
      "Duration minutes",
      "Agreed normal finish minutes",
      "Approval",
      "Reference",
      "Note",
    ];
    rows = records.map((item) => [
      isoDate(item.localDate),
      item.startAt.toISOString(),
      item.endAt?.toISOString(),
      item.endAt
        ? Math.round((item.endAt.getTime() - item.startAt.getTime()) / 60000)
        : "",
      item.agreedNormalFinishMinutes,
      item.approvalStatus,
      item.approvalNote,
      item.note,
    ]);
  } else if (report === "credits") {
    const records = await prisma.authorisedCredit.findMany({
      where: { deletedAt: null },
      orderBy: { localDate: "asc" },
    });
    headers = [
      "Date",
      "Type",
      "Duration minutes",
      "Approval",
      "Approval date",
      "Reference",
      "Note",
    ];
    rows = records.map((item) => [
      isoDate(item.localDate),
      item.type,
      item.durationMinutes,
      item.approvalStatus,
      item.approvalDate ? isoDate(item.approvalDate) : "",
      item.approvalNote,
      item.note,
    ]);
  } else if (report === "flexi-leave") {
    const records = await prisma.flexiLeave.findMany({
      where: { deletedAt: null },
      orderBy: { localDate: "asc" },
    });
    headers = [
      "Date",
      "Type",
      "Duration minutes",
      "Approval",
      "Approval date",
      "Note",
    ];
    rows = records.map((item) => [
      isoDate(item.localDate),
      item.kind,
      item.durationMinutes,
      item.approvalStatus,
      item.approvalDate ? isoDate(item.approvalDate) : "",
      item.note,
    ]);
  } else {
    const requestedYear = Number(
      request.nextUrl.searchParams.get("year") ?? today.slice(0, 4),
    );
    const requestedMonth = Number(
      request.nextUrl.searchParams.get("month") ?? today.slice(5, 7),
    );
    if (
      !Number.isInteger(requestedYear) ||
      requestedYear < 1900 ||
      requestedYear > 9999 ||
      (report === "monthly" &&
        (!Number.isInteger(requestedMonth) ||
          requestedMonth < 1 ||
          requestedMonth > 12))
    ) {
      return new Response("Enter a valid year and month", { status: 400 });
    }
    const start =
      report === "annual"
        ? `${requestedYear}-01-01`
        : `${requestedYear}-${String(requestedMonth).padStart(2, "0")}-01`;
    const endDate = new Date(`${start}T00:00:00Z`);
    if (report === "annual")
      endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
    else endDate.setUTCMonth(endDate.getUTCMonth() + 1);
    const endExclusive = isoDate(endDate);
    const effectiveEndExclusive =
      start > today
        ? start
        : endExclusive > addDays(today, 1)
          ? addDays(today, 1)
          : endExclusive;
    const dates: string[] = [];
    for (
      let date = start;
      date < effectiveEndExclusive;
      date = addDays(date, 1)
    )
      dates.push(date);
    const days = await getDays(dates);
    headers = [
      "Date",
      "Expected",
      "Actual work",
      "Eligible work",
      "Credits",
      "Flexi leave",
      "Overtime",
      "Confirmed balance",
      "Provisional balance",
      "Complete",
      "Policy findings",
    ];
    rows = days.map((day) => [
      day.calculation.date,
      day.calculation.expectedMinutes,
      day.calculation.actualWorkMinutes,
      day.calculation.confirmedEligibleMinutes,
      day.calculation.confirmedCreditMinutes,
      day.calculation.flexiLeaveMinutes,
      day.calculation.overtimeMinutes,
      day.calculation.confirmedBalanceChange,
      day.calculation.provisionalBalanceChange,
      Boolean(day.completion),
      day.calculation.findings.map((item) => item.ruleId).join("; "),
    ]);
  }
  return new Response(csv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flexitime-${report}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
