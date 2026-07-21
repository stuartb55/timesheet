import type { PolicyFinding } from "./types";

export interface WtrDay {
  date: string;
  actualWorkMinutes: number;
  complete: boolean;
}

export interface WtrCalculation {
  representedDays: number;
  totalMinutes: number;
  averageWeeklyMinutes: number;
  completeWeeks: number;
  incompleteDays: number;
  findings: PolicyFinding[];
  reliable: boolean;
}

export function calculateWtrAverage(
  days: WtrDay[],
  asOfDate: string,
  warningMinutes = 45 * 60,
): WtrCalculation {
  const totalMinutes = days.reduce(
    (sum, day) => sum + day.actualWorkMinutes,
    0,
  );
  const completeWeeks = Array.from(
    { length: Math.floor(days.length / 7) },
    (_, index) => days.slice(index * 7, index * 7 + 7),
  ).filter((week) => week.every((day) => day.complete)).length;
  const denominatorWeeks = Math.min(17, Math.max(1 / 7, days.length / 7));
  const averageWeeklyMinutes = Math.round(totalMinutes / denominatorWeeks);
  const incompleteDays = days.filter((day) => !day.complete).length;
  const findings: PolicyFinding[] = [];
  if (averageWeeklyMinutes > 48 * 60) {
    findings.push({
      ruleId: "WTR_AVERAGE_EXCEEDED",
      date: asOfDate,
      severity: "BREACH",
      message: "Average actual working time exceeds 48 hours a week.",
      approvalRequired: false,
      approvalRecorded: false,
      affected: { durationMinutes: averageWeeklyMinutes },
    });
  } else if (averageWeeklyMinutes >= warningMinutes) {
    findings.push({
      ruleId: "WTR_AVERAGE_WARNING",
      date: asOfDate,
      severity: "WARNING",
      message: "Average actual working time is approaching 48 hours a week.",
      approvalRequired: false,
      approvalRecorded: false,
      affected: { durationMinutes: averageWeeklyMinutes },
    });
  }
  if (incompleteDays > 0) {
    findings.push({
      ruleId: "INCOMPLETE_TIME_RECORD",
      date: asOfDate,
      severity: "INCOMPLETE",
      message:
        "The working-time average may be unreliable because records are incomplete.",
      approvalRequired: false,
      approvalRecorded: false,
      affected: { count: incompleteDays },
    });
  }
  return {
    representedDays: days.length,
    totalMinutes,
    averageWeeklyMinutes,
    completeWeeks,
    incompleteDays,
    findings,
    reliable: incompleteDays === 0,
  };
}
