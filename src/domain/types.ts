export type Severity =
  "COMPLIANT" | "WARNING" | "APPROVAL_REQUIRED" | "BREACH" | "INCOMPLETE";

export type RuleId =
  | "OUTSIDE_START_BANDWIDTH"
  | "OUTSIDE_FINISH_BANDWIDTH"
  | "MISSING_MORNING_CORE_TIME"
  | "MISSING_AFTERNOON_CORE_TIME"
  | "LUNCH_STARTED_EARLY"
  | "LUNCH_TOO_LONG"
  | "LUNCH_ENDED_LATE"
  | "INSUFFICIENT_BREAK"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_NOT_RECORDED"
  | "FLEXI_LEAVE_LIMIT_EXCEEDED"
  | "CREDIT_CARRYOVER_LIMIT_EXCEEDED"
  | "DEBIT_CARRYOVER_LIMIT_EXCEEDED"
  | "SUCCESSIVE_EXCEPTIONAL_CARRYOVER"
  | "WTR_AVERAGE_WARNING"
  | "WTR_AVERAGE_EXCEEDED"
  | "BOOT_UP_LIMIT_EXCEEDED"
  | "INCOMPLETE_TIME_RECORD"
  | "OVERLAPPING_TIME_SEGMENTS"
  | "OPEN_TIME_SEGMENT";

export interface PolicyFinding {
  ruleId: RuleId;
  date: string;
  severity: Severity;
  message: string;
  approvalRequired: boolean;
  approvalRecorded: boolean;
  affected?: {
    startMinute?: number;
    endMinute?: number;
    durationMinutes?: number;
    count?: number;
  };
}

export type DomainSegmentType =
  | "NORMAL_WORK"
  | "OFFICIAL_TRAVEL"
  | "OVERTIME"
  | "ROTA_BOOT_UP"
  | "LUNCH_BREAK"
  | "OTHER_UNPAID_BREAK";

export type DomainApprovalStatus =
  "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REFUSED";

export interface DomainSegment {
  id?: string;
  date: string;
  startMinute: number;
  endMinute: number | null;
  endDate?: string;
  /** Elapsed instant duration; supplied by persistence to handle clock changes. */
  actualDurationMinutes?: number;
  type: DomainSegmentType;
  approvalStatus?: DomainApprovalStatus;
  officialTravelConfirmed?: boolean;
  scheduledStartMinute?: number;
}

export interface DomainCredit {
  id?: string;
  date: string;
  durationMinutes: number;
  startMinute?: number;
  endMinute?: number;
  type: string;
  approvalStatus: DomainApprovalStatus;
}

export interface DomainFlexiLeave {
  date: string;
  durationMinutes: number;
  approvalStatus?: DomainApprovalStatus;
}

export interface PolicyTimes {
  startBandwidthMinutes: number;
  morningCoreStartMinutes: number;
  morningCoreEndMinutes: number;
  lunchStartMinutes: number;
  lunchEndMinutes: number;
  afternoonCoreStartMinutes: number;
  afternoonCoreEndMinutes: number;
  finishBandwidthMinutes: number;
  rotaMode: boolean;
  bootUpAllowanceMinutes: number;
}

export interface DayInput {
  date: string;
  expectedMinutes: number;
  segments: DomainSegment[];
  credits?: DomainCredit[];
  flexiLeave?: DomainFlexiLeave[];
  policy: PolicyTimes;
  isComplete?: boolean;
  nowMinute?: number;
  openSegmentFromPreviousDay?: boolean;
}

export interface DayCalculation {
  date: string;
  expectedMinutes: number;
  normalWorkMinutes: number;
  travelMinutes: number;
  overtimeMinutes: number;
  bootUpMinutes: number;
  breakMinutes: number;
  confirmedCreditMinutes: number;
  provisionalCreditMinutes: number;
  flexiLeaveMinutes: number;
  provisionalFlexiLeaveMinutes: number;
  actualWorkMinutes: number;
  confirmedEligibleMinutes: number;
  provisionalEligibleMinutes: number;
  confirmedBalanceChange: number;
  provisionalBalanceChange: number;
  findings: PolicyFinding[];
}

export interface PeriodCalculation {
  openingBalanceMinutes: number;
  expectedMinutes: number;
  normalWorkMinutes: number;
  travelMinutes: number;
  creditMinutes: number;
  provisionalCreditMinutes: number;
  flexiLeaveMinutes: number;
  provisionalFlexiLeaveMinutes: number;
  overtimeMinutes: number;
  manualCorrectionMinutes: number;
  rawClosingBalanceMinutes: number;
  creditLimitMinutes: number;
  debitLimitMinutes: number;
  excessCreditMinutes: number;
  excessDebitMinutes: number;
  proposedCarryoverMinutes: number;
  finalCarryoverMinutes: number;
  findings: PolicyFinding[];
}
