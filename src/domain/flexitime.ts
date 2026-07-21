import type {
  DayCalculation,
  DayInput,
  DomainCredit,
  DomainSegment,
  PeriodCalculation,
  PolicyFinding,
} from "./types";

const WORK_TYPES = new Set([
  "NORMAL_WORK",
  "OFFICIAL_TRAVEL",
  "OVERTIME",
  "ROTA_BOOT_UP",
]);
const BREAK_TYPES = new Set(["LUNCH_BREAK", "OTHER_UNPAID_BREAK"]);

function duration(segment: DomainSegment): number {
  return segment.endMinute === null
    ? 0
    : Math.max(
        0,
        segment.actualDurationMinutes ??
          segment.endMinute - segment.startMinute,
      );
}

function approved(status: DomainSegment["approvalStatus"]): boolean {
  return !status || status === "NOT_REQUIRED" || status === "APPROVED";
}

function eligibleBootUpDuration(
  segment: DomainSegment,
  input: DayInput,
): number {
  if (
    segment.type !== "ROTA_BOOT_UP" ||
    segment.endMinute === null ||
    !input.policy.rotaMode ||
    segment.approvalStatus !== "APPROVED" ||
    segment.scheduledStartMinute === undefined
  ) {
    return 0;
  }
  if (segment.endMinute !== segment.scheduledStartMinute) return 0;
  return Math.min(duration(segment), input.policy.bootUpAllowanceMinutes);
}

function segmentCoversCore(segment: DomainSegment, input: DayInput): boolean {
  if (segment.endMinute === null) return false;
  if (segment.type === "NORMAL_WORK" || segment.type === "OVERTIME")
    return true;
  if (segment.type === "OFFICIAL_TRAVEL") {
    return (
      Boolean(segment.officialTravelConfirmed) &&
      approved(segment.approvalStatus)
    );
  }
  return eligibleBootUpDuration(segment, input) > 0;
}

function finding(
  input: DayInput,
  ruleId: PolicyFinding["ruleId"],
  severity: PolicyFinding["severity"],
  message: string,
  affected?: PolicyFinding["affected"],
  approvalRequired = false,
  approvalRecorded = false,
): PolicyFinding {
  return {
    ruleId,
    date: input.date,
    severity,
    message,
    approvalRequired,
    approvalRecorded,
    affected,
  };
}

function hasCoverage(
  segments: DomainSegment[],
  credits: DomainCredit[],
  start: number,
  end: number,
  input: DayInput,
): boolean {
  const intervals = [
    ...segments
      .filter((segment) => segmentCoversCore(segment, input))
      .map(
        (segment) =>
          [segment.startMinute, segment.endMinute as number] as const,
      ),
    ...credits
      .filter(
        (credit) =>
          approved(credit.approvalStatus) &&
          credit.startMinute !== undefined &&
          credit.endMinute !== undefined,
      )
      .map(
        (credit) =>
          [credit.startMinute as number, credit.endMinute as number] as const,
      ),
  ].sort((a, b) => a[0] - b[0]);
  let cursor = start;
  for (const [intervalStart, intervalEnd] of intervals) {
    if (intervalEnd <= cursor || intervalStart >= end) continue;
    if (intervalStart > cursor) return false;
    cursor = Math.max(cursor, intervalEnd);
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

function findOverlaps(
  segments: DomainSegment[],
): Array<[DomainSegment, DomainSegment]> {
  const closed = segments
    .filter((segment) => segment.endMinute !== null)
    .sort((a, b) => a.startMinute - b.startMinute);
  const overlaps: Array<[DomainSegment, DomainSegment]> = [];
  let furthest = closed[0];
  for (let index = 1; index < closed.length; index += 1) {
    if ((furthest?.endMinute as number) > closed[index].startMinute) {
      overlaps.push([furthest, closed[index]]);
    }
    if (
      !furthest ||
      (closed[index].endMinute as number) > (furthest.endMinute as number)
    ) {
      furthest = closed[index];
    }
  }
  return overlaps;
}

export function evaluateDay(input: DayInput): DayCalculation {
  const segments = input.segments;
  const credits = input.credits ?? [];
  const leave = input.flexiLeave ?? [];
  const findings: PolicyFinding[] = [];
  const work = segments.filter((segment) => WORK_TYPES.has(segment.type));
  const closedWork = work.filter((segment) => segment.endMinute !== null);
  const breaks = segments.filter(
    (segment) => BREAK_TYPES.has(segment.type) && segment.endMinute !== null,
  );
  const currentDuration = (segment: DomainSegment): number => {
    if (segment.endMinute !== null) return duration(segment);
    if (input.nowMinute === undefined || input.openSegmentFromPreviousDay) {
      return 0;
    }
    return Math.max(0, input.nowMinute - segment.startMinute);
  };

  const overlaps = findOverlaps(segments);
  if (overlaps.length > 0) {
    findings.push(
      finding(
        input,
        "OVERLAPPING_TIME_SEGMENTS",
        "BREACH",
        "Time segments overlap and must be corrected.",
        { count: overlaps.length },
      ),
    );
  }

  for (const open of segments.filter((segment) => segment.endMinute === null)) {
    findings.push(
      finding(
        input,
        "OPEN_TIME_SEGMENT",
        input.openSegmentFromPreviousDay ? "BREACH" : "INCOMPLETE",
        input.openSegmentFromPreviousDay
          ? "An open time segment has continued overnight."
          : "A time segment is still open.",
        { startMinute: open.startMinute },
      ),
    );
  }

  for (const overnight of segments.filter(
    (segment) =>
      segment.endMinute !== null &&
      segment.endDate !== undefined &&
      segment.endDate !== segment.date,
  )) {
    findings.push(
      finding(
        input,
        "INCOMPLETE_TIME_RECORD",
        "BREACH",
        "A time segment crosses into another calendar date. Check it and split the record if needed.",
        {
          startMinute: overnight.startMinute,
          endMinute: overnight.endMinute as number,
        },
      ),
    );
  }

  if (
    !input.isComplete ||
    segments.some((segment) => segment.endMinute === null)
  ) {
    findings.push(
      finding(
        input,
        "INCOMPLETE_TIME_RECORD",
        "INCOMPLETE",
        "This day has not been marked complete.",
      ),
    );
  }

  const wholeDayApprovedCredit = credits.some(
    (credit) =>
      approved(credit.approvalStatus) &&
      credit.durationMinutes >= input.expectedMinutes,
  );
  const wholeDayApprovedFlexiLeave = leave.some(
    (item) =>
      item.approvalStatus === "APPROVED" &&
      item.durationMinutes >= input.expectedMinutes,
  );
  if (
    input.isComplete &&
    input.expectedMinutes > 0 &&
    closedWork.length === 0 &&
    !wholeDayApprovedCredit &&
    !wholeDayApprovedFlexiLeave
  ) {
    findings.push(
      finding(
        input,
        "INCOMPLETE_TIME_RECORD",
        "BREACH",
        "This completed working day has no actual work or approved whole-day absence.",
      ),
    );
  }

  if (closedWork.length > 0) {
    const firstStart = Math.min(
      ...closedWork.map((segment) => segment.startMinute),
    );
    const lastFinish = Math.max(
      ...closedWork.map((segment) => segment.endMinute as number),
    );
    if (firstStart < input.policy.startBandwidthMinutes) {
      findings.push(
        finding(
          input,
          "OUTSIDE_START_BANDWIDTH",
          "APPROVAL_REQUIRED",
          "Work started before the permitted starting bandwidth.",
          { startMinute: firstStart },
          true,
        ),
      );
    } else if (firstStart > input.policy.morningCoreStartMinutes) {
      findings.push(
        finding(
          input,
          "OUTSIDE_START_BANDWIDTH",
          "APPROVAL_REQUIRED",
          "Work started after morning core time began.",
          { startMinute: firstStart },
          true,
        ),
      );
    }
    if (lastFinish < input.policy.afternoonCoreEndMinutes) {
      findings.push(
        finding(
          input,
          "OUTSIDE_FINISH_BANDWIDTH",
          "APPROVAL_REQUIRED",
          "Work finished before afternoon core time ended.",
          { endMinute: lastFinish },
          true,
        ),
      );
    } else if (lastFinish > input.policy.finishBandwidthMinutes) {
      findings.push(
        finding(
          input,
          "OUTSIDE_FINISH_BANDWIDTH",
          "APPROVAL_REQUIRED",
          "Work finished after the permitted finishing bandwidth.",
          { endMinute: lastFinish },
          true,
        ),
      );
    }

    if (
      !wholeDayApprovedCredit &&
      !wholeDayApprovedFlexiLeave &&
      !hasCoverage(
        segments,
        credits,
        input.policy.morningCoreStartMinutes,
        input.policy.morningCoreEndMinutes,
        input,
      )
    ) {
      const approvedCoreBreak = breaks.some(
        (segment) =>
          segment.startMinute < input.policy.morningCoreEndMinutes &&
          (segment.endMinute as number) >
            input.policy.morningCoreStartMinutes &&
          segment.approvalStatus === "APPROVED",
      );
      findings.push(
        finding(
          input,
          "MISSING_MORNING_CORE_TIME",
          approvedCoreBreak ? "WARNING" : "APPROVAL_REQUIRED",
          "The record does not cover all morning core time.",
          {
            startMinute: input.policy.morningCoreStartMinutes,
            endMinute: input.policy.morningCoreEndMinutes,
          },
          true,
          approvedCoreBreak,
        ),
      );
    }
    if (
      !wholeDayApprovedCredit &&
      !wholeDayApprovedFlexiLeave &&
      !hasCoverage(
        segments,
        credits,
        input.policy.afternoonCoreStartMinutes,
        input.policy.afternoonCoreEndMinutes,
        input,
      )
    ) {
      const approvedCoreBreak = breaks.some(
        (segment) =>
          segment.startMinute < input.policy.afternoonCoreEndMinutes &&
          (segment.endMinute as number) >
            input.policy.afternoonCoreStartMinutes &&
          segment.approvalStatus === "APPROVED",
      );
      findings.push(
        finding(
          input,
          "MISSING_AFTERNOON_CORE_TIME",
          approvedCoreBreak ? "WARNING" : "APPROVAL_REQUIRED",
          "The record does not cover all afternoon core time.",
          {
            startMinute: input.policy.afternoonCoreStartMinutes,
            endMinute: input.policy.afternoonCoreEndMinutes,
          },
          true,
          approvedCoreBreak,
        ),
      );
    }

    const shiftDuration = lastFinish - firstStart;
    const breakMinutes = breaks.reduce(
      (sum, segment) => sum + duration(segment),
      0,
    );
    if (shiftDuration >= 360 && breakMinutes < 30) {
      findings.push(
        finding(
          input,
          "INSUFFICIENT_BREAK",
          "BREACH",
          "A shift of six hours or more needs at least a 30-minute break.",
          {
            durationMinutes: breakMinutes,
          },
        ),
      );
    }
  }

  for (const lunch of segments.filter(
    (segment) => segment.type === "LUNCH_BREAK" && segment.endMinute !== null,
  )) {
    const lunchDuration = duration(lunch);
    const approvalRecorded = lunch.approvalStatus === "APPROVED";
    if (lunch.startMinute < input.policy.lunchStartMinutes) {
      findings.push(
        finding(
          input,
          "LUNCH_STARTED_EARLY",
          approvalRecorded ? "WARNING" : "APPROVAL_REQUIRED",
          `Lunch started before ${String(Math.floor(input.policy.lunchStartMinutes / 60)).padStart(2, "0")}:${String(input.policy.lunchStartMinutes % 60).padStart(2, "0")}.`,
          { startMinute: lunch.startMinute },
          true,
          approvalRecorded,
        ),
      );
    }
    if (lunchDuration > 120) {
      findings.push(
        finding(
          input,
          "LUNCH_TOO_LONG",
          approvalRecorded ? "WARNING" : "APPROVAL_REQUIRED",
          "Lunch lasted longer than two hours.",
          { durationMinutes: lunchDuration },
          true,
          approvalRecorded,
        ),
      );
    }
    if ((lunch.endMinute as number) > input.policy.lunchEndMinutes) {
      findings.push(
        finding(
          input,
          "LUNCH_ENDED_LATE",
          approvalRecorded ? "WARNING" : "APPROVAL_REQUIRED",
          `Lunch ended after ${String(Math.floor(input.policy.lunchEndMinutes / 60)).padStart(2, "0")}:${String(input.policy.lunchEndMinutes % 60).padStart(2, "0")}.`,
          { endMinute: lunch.endMinute as number },
          true,
          approvalRecorded,
        ),
      );
    }
  }

  const bootUpMinutes = segments
    .filter((segment) => segment.type === "ROTA_BOOT_UP")
    .reduce((sum, segment) => sum + duration(segment), 0);
  const invalidBootUpMinutes = segments
    .filter((segment) => segment.type === "ROTA_BOOT_UP")
    .reduce(
      (sum, segment) =>
        sum + duration(segment) - eligibleBootUpDuration(segment, input),
      0,
    );
  if (invalidBootUpMinutes > 0) {
    findings.push(
      finding(
        input,
        "BOOT_UP_LIMIT_EXCEEDED",
        "WARNING",
        input.policy.rotaMode
          ? "Rota boot-up time must be approved, end at the scheduled start and stay within the policy allowance."
          : "Rota boot-up time is not eligible while rota mode is disabled.",
        {
          durationMinutes: invalidBootUpMinutes,
        },
      ),
    );
  }

  const pendingApprovalCount = [...segments, ...credits, ...leave].filter(
    (item) => item.approvalStatus === "PENDING",
  ).length;
  for (let index = 0; index < pendingApprovalCount; index += 1) {
    findings.push(
      finding(
        input,
        "APPROVAL_NOT_RECORDED",
        "APPROVAL_REQUIRED",
        "An item that requires external approval is still pending.",
        undefined,
        true,
        false,
      ),
    );
  }

  const normalWorkMinutes = segments
    .filter((segment) => segment.type === "NORMAL_WORK")
    .reduce((sum, segment) => sum + currentDuration(segment), 0);
  const travelMinutes = segments
    .filter(
      (segment) =>
        segment.type === "OFFICIAL_TRAVEL" &&
        segment.officialTravelConfirmed &&
        approved(segment.approvalStatus),
    )
    .reduce((sum, segment) => sum + currentDuration(segment), 0);
  const actualTravelMinutes = segments
    .filter(
      (segment) =>
        segment.type === "OFFICIAL_TRAVEL" &&
        segment.officialTravelConfirmed &&
        approved(segment.approvalStatus),
    )
    .reduce((sum, segment) => sum + currentDuration(segment), 0);
  const overtimeMinutes = segments
    .filter((segment) => segment.type === "OVERTIME")
    .reduce((sum, segment) => sum + currentDuration(segment), 0);
  const eligibleBootUpMinutes = segments.reduce(
    (sum, segment) => sum + eligibleBootUpDuration(segment, input),
    0,
  );
  const breakMinutes = segments
    .filter((segment) => BREAK_TYPES.has(segment.type))
    .reduce((sum, segment) => sum + currentDuration(segment), 0);
  const confirmedCreditMinutes = credits
    .filter(
      (credit) =>
        credit.approvalStatus === "APPROVED" ||
        credit.approvalStatus === "NOT_REQUIRED",
    )
    .reduce((sum, credit) => sum + credit.durationMinutes, 0);
  const provisionalCreditMinutes = credits
    .filter((credit) => credit.approvalStatus === "PENDING")
    .reduce((sum, credit) => sum + credit.durationMinutes, 0);
  const flexiLeaveMinutes = leave
    .filter(
      (item) =>
        item.approvalStatus === undefined || item.approvalStatus === "APPROVED",
    )
    .reduce((sum, item) => sum + item.durationMinutes, 0);
  const provisionalFlexiLeaveMinutes = leave
    .filter((item) => item.approvalStatus === "PENDING")
    .reduce((sum, item) => sum + item.durationMinutes, 0);
  const confirmedEligibleMinutes =
    normalWorkMinutes +
    travelMinutes +
    eligibleBootUpMinutes +
    confirmedCreditMinutes;
  const provisionalEligibleMinutes =
    confirmedEligibleMinutes + provisionalCreditMinutes;

  return {
    date: input.date,
    expectedMinutes: input.expectedMinutes,
    normalWorkMinutes,
    travelMinutes,
    overtimeMinutes,
    bootUpMinutes,
    breakMinutes,
    confirmedCreditMinutes,
    provisionalCreditMinutes,
    flexiLeaveMinutes,
    provisionalFlexiLeaveMinutes,
    actualWorkMinutes:
      normalWorkMinutes + actualTravelMinutes + overtimeMinutes + bootUpMinutes,
    confirmedEligibleMinutes,
    provisionalEligibleMinutes,
    confirmedBalanceChange: confirmedEligibleMinutes - input.expectedMinutes,
    provisionalBalanceChange:
      provisionalEligibleMinutes - input.expectedMinutes,
    findings,
  };
}

export function calculatePeriod(args: {
  days: DayCalculation[];
  openingBalanceMinutes: number;
  standardDayMinutes: number;
  exceptionalCarryoverMinutes?: number;
  previousPeriodHadExceptionalCarryover?: boolean;
  manualCorrectionMinutes?: number;
  balanceThroughDate?: string;
  date: string;
}): PeriodCalculation {
  const sum = (select: (day: DayCalculation) => number) =>
    args.days.reduce((total, day) => total + select(day), 0);
  const balanceDays = args.balanceThroughDate
    ? args.days.filter((day) => day.date <= args.balanceThroughDate!)
    : args.days;
  const manualCorrectionMinutes = args.manualCorrectionMinutes ?? 0;
  const rawClosingBalanceMinutes =
    args.openingBalanceMinutes +
    balanceDays.reduce((total, day) => total + day.confirmedBalanceChange, 0) +
    manualCorrectionMinutes;
  const creditLimitMinutes = args.standardDayMinutes * 3;
  const debitLimitMinutes = args.standardDayMinutes * 2;
  const excessCreditMinutes = Math.max(
    0,
    rawClosingBalanceMinutes - creditLimitMinutes,
  );
  const excessDebitMinutes = Math.max(
    0,
    -debitLimitMinutes - rawClosingBalanceMinutes,
  );
  const proposedCarryoverMinutes = Math.max(
    -debitLimitMinutes,
    Math.min(creditLimitMinutes, rawClosingBalanceMinutes),
  );
  const exceptional = args.exceptionalCarryoverMinutes ?? 0;
  const finalCarryoverMinutes =
    exceptional === 0 ? proposedCarryoverMinutes : exceptional;
  const findings: PolicyFinding[] = [];
  if (excessCreditMinutes > 0) {
    findings.push({
      ruleId: "CREDIT_CARRYOVER_LIMIT_EXCEEDED",
      date: args.date,
      severity: "WARNING",
      message: "The raw credit exceeds the normal three-day carryover limit.",
      approvalRequired: false,
      approvalRecorded: false,
      affected: { durationMinutes: excessCreditMinutes },
    });
  }
  if (excessDebitMinutes > 0) {
    findings.push({
      ruleId: "DEBIT_CARRYOVER_LIMIT_EXCEEDED",
      date: args.date,
      severity: "BREACH",
      message: "The raw debit exceeds the normal two-day carryover limit.",
      approvalRequired: false,
      approvalRecorded: false,
      affected: { durationMinutes: excessDebitMinutes },
    });
  }
  if (exceptional !== 0 && args.previousPeriodHadExceptionalCarryover) {
    findings.push({
      ruleId: "SUCCESSIVE_EXCEPTIONAL_CARRYOVER",
      date: args.date,
      severity: "WARNING",
      message:
        "Exceptional carryover has been recorded in successive accounting periods.",
      approvalRequired: true,
      approvalRecorded: true,
      affected: { durationMinutes: exceptional },
    });
  }
  const flexiLeaveMinutes = sum((day) => day.flexiLeaveMinutes);
  const provisionalFlexiLeaveMinutes = sum(
    (day) => day.provisionalFlexiLeaveMinutes,
  );
  if (flexiLeaveMinutes > args.standardDayMinutes * 2) {
    findings.push({
      ruleId: "FLEXI_LEAVE_LIMIT_EXCEEDED",
      date: args.date,
      severity: "BREACH",
      message: "Flexi leave exceeds two standard working days in this period.",
      approvalRequired: false,
      approvalRecorded: false,
      affected: { durationMinutes: flexiLeaveMinutes },
    });
  }

  return {
    openingBalanceMinutes: args.openingBalanceMinutes,
    expectedMinutes: sum((day) => day.expectedMinutes),
    normalWorkMinutes: sum((day) => day.normalWorkMinutes),
    travelMinutes: sum((day) => day.travelMinutes),
    creditMinutes: sum((day) => day.confirmedCreditMinutes),
    provisionalCreditMinutes: sum((day) => day.provisionalCreditMinutes),
    flexiLeaveMinutes,
    provisionalFlexiLeaveMinutes,
    overtimeMinutes: sum((day) => day.overtimeMinutes),
    manualCorrectionMinutes,
    rawClosingBalanceMinutes,
    creditLimitMinutes,
    debitLimitMinutes,
    excessCreditMinutes,
    excessDebitMinutes,
    proposedCarryoverMinutes,
    finalCarryoverMinutes,
    findings,
  };
}

export function periodEditDecision(
  status: "OPEN" | "COMPLETE" | "CHECKED" | "LOCKED",
  unlockConfirmed = false,
  unlockReason = "",
): { allowed: boolean; message?: string } {
  if (status !== "LOCKED") return { allowed: true };
  if (!unlockConfirmed || unlockReason.trim().length === 0) {
    return {
      allowed: false,
      message:
        "Confirm unlocking and enter a reason before editing a locked period.",
    };
  }
  return { allowed: true };
}
