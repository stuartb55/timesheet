"use server";

import type {
  AccountingPeriod,
  ApprovalStatus,
  HistoryAction,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEFAULT_POLICIES } from "@/domain/defaults";
import type { RuleId } from "@/domain/types";
import {
  addDays,
  dateAtUtcMidnight,
  isValidIsoDate,
  isoDate,
  localDateAndMinute,
  londonTimeOccurrence,
  londonWallTimeToUtc,
  parseTime,
} from "@/domain/time";
import {
  assertDateIsEditable,
  ensureAccountingPeriod,
  ensureSettings,
  type FullSettings,
  getDayWithClient,
  getPeriodWithTransaction,
  lockAccountingPeriod,
  nowInLondon,
  rebuildDayLedger,
} from "@/lib/data";
import { prisma } from "@/lib/prisma";
import {
  creditSchema,
  flexiLeaveSchema,
  settingsSchema,
  timeSegmentSchema,
} from "@/lib/validation";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function requireValidDate(date: string, path: string): void {
  if (!isValidIsoDate(date)) withMessage(path, "error", "Enter a valid date");
}

function errorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return error.issues
      .map((issue) =>
        issue && typeof issue === "object" && "message" in issue
          ? String(issue.message)
          : fallback,
      )
      .join(". ");
  }
  return error instanceof Error ? error.message : fallback;
}

const ruleIds = new Set<RuleId>([
  "OUTSIDE_START_BANDWIDTH",
  "OUTSIDE_FINISH_BANDWIDTH",
  "MISSING_MORNING_CORE_TIME",
  "MISSING_AFTERNOON_CORE_TIME",
  "LUNCH_STARTED_EARLY",
  "LUNCH_TOO_LONG",
  "LUNCH_ENDED_LATE",
  "INSUFFICIENT_BREAK",
  "APPROVAL_REQUIRED",
  "APPROVAL_NOT_RECORDED",
  "FLEXI_LEAVE_LIMIT_EXCEEDED",
  "CREDIT_CARRYOVER_LIMIT_EXCEEDED",
  "DEBIT_CARRYOVER_LIMIT_EXCEEDED",
  "SUCCESSIVE_EXCEPTIONAL_CARRYOVER",
  "WTR_AVERAGE_WARNING",
  "WTR_AVERAGE_EXCEEDED",
  "BOOT_UP_LIMIT_EXCEEDED",
  "INCOMPLETE_TIME_RECORD",
  "OVERLAPPING_TIME_SEGMENTS",
  "OPEN_TIME_SEGMENT",
]);

function json(valueToSerialise: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(valueToSerialise)) as Prisma.InputJsonValue;
}

function withMessage(
  path: string,
  kind: "success" | "error",
  message: string,
  errorTarget = "main-content",
): never {
  const separator = path.includes("?") ? "&" : "?";
  const target =
    kind === "error"
      ? `&errorTarget=${encodeURIComponent(errorTarget)}#${encodeURIComponent(errorTarget)}`
      : "";
  redirect(
    `${path}${separator}${kind}=${encodeURIComponent(message)}${target}`,
  );
}

async function history(
  args: {
    recordType: string;
    recordId: string;
    action: HistoryAction;
    previousValues?: unknown;
    newValues?: unknown;
    reason?: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await client.changeHistory.create({
    data: {
      recordType: args.recordType,
      recordId: args.recordId,
      action: args.action,
      previousValues:
        args.previousValues === undefined
          ? undefined
          : json(args.previousValues),
      newValues:
        args.newValues === undefined ? undefined : json(args.newValues),
      reason: args.reason,
    },
  });
}

async function markChangedAfterCompletion(
  date: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await client.dailyCompletion.updateMany({
    where: { localDate: dateAtUtcMidnight(date) },
    data: { lastChangedAfterAt: new Date() },
  });
}

async function editablePeriod(
  transaction: Prisma.TransactionClient,
  date: string,
  settings: FullSettings,
): Promise<AccountingPeriod> {
  const initial = await ensureAccountingPeriod(date, settings, transaction);
  await lockAccountingPeriod(transaction, initial.id);
  return assertDateIsEditable(date, settings, transaction);
}

async function invalidateConfirmedCarryover(
  transaction: Prisma.TransactionClient,
  period: AccountingPeriod,
): Promise<void> {
  let current = period;
  if (
    current.status === "CHECKED" &&
    !current.carryoverConfirmed &&
    current.finalCarryoverMinutes === null
  ) {
    const previous = current;
    current = await transaction.accountingPeriod.update({
      where: { id: current.id },
      data: { status: "COMPLETE", checkedAt: null },
    });
    await history(
      {
        recordType: "AccountingPeriod",
        recordId: current.id,
        action: "UPDATED",
        previousValues: previous,
        newValues: current,
        reason: "Review status reset after the period balance changed",
      },
      transaction,
    );
  }
  while (current.carryoverConfirmed || current.finalCarryoverMinutes !== null) {
    const previous = current;
    current = await transaction.accountingPeriod.update({
      where: { id: current.id },
      data: {
        carryoverConfirmed: false,
        finalCarryoverMinutes: null,
        status: current.status === "CHECKED" ? "COMPLETE" : current.status,
        checkedAt: current.status === "CHECKED" ? null : current.checkedAt,
      },
    });
    await history(
      {
        recordType: "AccountingPeriod",
        recordId: current.id,
        action: "UPDATED",
        previousValues: previous,
        newValues: current,
        reason: "Carryover invalidated after the period balance changed",
      },
      transaction,
    );

    const next = await transaction.accountingPeriod.findUnique({
      where: {
        startDate: dateAtUtcMidnight(addDays(isoDate(current.endDate), 1)),
      },
    });
    if (!next) return;
    await lockAccountingPeriod(transaction, next.id);
    if (next.status === "LOCKED") {
      throw new Error(
        "A later accounting period is locked. Unlock it before changing records that affect its opening balance.",
      );
    }
    const updatedNext = await transaction.accountingPeriod.update({
      where: { id: next.id },
      data: { openingBalanceMinutes: 0 },
    });
    const opening = await transaction.balanceLedgerEntry.updateMany({
      where: {
        accountingPeriodId: next.id,
        type: "OPENING_BALANCE",
      },
      data: { durationMinutes: 0 },
    });
    if (opening.count === 0) {
      await transaction.balanceLedgerEntry.create({
        data: {
          localDate: next.startDate,
          accountingPeriodId: next.id,
          type: "OPENING_BALANCE",
          durationMinutes: 0,
          description:
            "Balance brought forward from the previous accounting period",
        },
      });
    }
    await history(
      {
        recordType: "AccountingPeriod",
        recordId: next.id,
        action: "UPDATED",
        previousValues: next,
        newValues: updatedNext,
        reason: "Opening balance cleared after prior carryover changed",
      },
      transaction,
    );
    current = next;
  }
}

async function finishBalanceAffectingMutation(
  transaction: Prisma.TransactionClient,
  date: string,
  settings: FullSettings,
  period: AccountingPeriod,
): Promise<void> {
  await markChangedAfterCompletion(date, transaction);
  await invalidateConfirmedCarryover(transaction, period);
  await rebuildDayLedger(date, transaction, settings, period);
}

function revalidateRecords(date: string) {
  revalidatePath("/");
  revalidatePath(`/day/${date}`);
  revalidatePath("/week");
  revalidatePath("/calendar");
  revalidatePath("/period");
  revalidatePath("/reports");
}

export async function saveSettings(formData: FormData): Promise<void> {
  const settings = await ensureSettings();
  let policyTimes: {
    startBandwidthMinutes: number;
    morningCoreStartMinutes: number;
    morningCoreEndMinutes: number;
    lunchStartMinutes: number;
    lunchEndMinutes: number;
    afternoonCoreStartMinutes: number;
    afternoonCoreEndMinutes: number;
    finishBandwidthMinutes: number;
  };
  try {
    policyTimes = {
      startBandwidthMinutes: parseTime(
        value(formData, "startBandwidthMinutes"),
      ),
      morningCoreStartMinutes: parseTime(
        value(formData, "morningCoreStartMinutes"),
      ),
      morningCoreEndMinutes: parseTime(
        value(formData, "morningCoreEndMinutes"),
      ),
      lunchStartMinutes: parseTime(value(formData, "lunchStartMinutes")),
      lunchEndMinutes: parseTime(value(formData, "lunchEndMinutes")),
      afternoonCoreStartMinutes: parseTime(
        value(formData, "afternoonCoreStartMinutes"),
      ),
      afternoonCoreEndMinutes: parseTime(
        value(formData, "afternoonCoreEndMinutes"),
      ),
      finishBandwidthMinutes: parseTime(
        value(formData, "finishBandwidthMinutes"),
      ),
    };
  } catch {
    withMessage(
      "/settings",
      "error",
      "Enter all policy times in 24-hour format",
      "startBandwidthMinutes",
    );
  }
  const parsed = settingsSchema.safeParse({
    name: value(formData, "name"),
    weeklyConditionedMinutes: value(formData, "weeklyConditionedMinutes"),
    standardDayMinutes: value(formData, "standardDayMinutes"),
    accountingAnchorDate: value(formData, "accountingAnchorDate"),
    warningThresholdMinutes: value(formData, "warningThresholdMinutes"),
    defaultEntryMethod: value(formData, "defaultEntryMethod"),
    dateFormat: value(formData, "dateFormat"),
    timeFormat: "24h",
    profile: value(formData, "profile"),
    rotaMode: checked(formData, "rotaMode"),
    ...policyTimes,
    bootUpAllowanceMinutes: value(formData, "bootUpAllowanceMinutes"),
    expectedMinutes: Array.from({ length: 7 }, (_, index) =>
      value(formData, `expectedMinutes${index}`),
    ),
  });
  if (!parsed.success) {
    withMessage(
      "/settings",
      "error",
      parsed.error.issues.map((issue) => issue.message).join(". "),
      "weekly",
    );
  }
  const input = parsed.data;
  await prisma.$transaction(async (transaction) => {
    const previous = await transaction.personalSettings.findUnique({
      where: { id: 1 },
      include: {
        workingPattern: { include: { days: true } },
        flexitimePolicy: true,
      },
    });
    await transaction.personalSettings.update({
      where: { id: 1 },
      data: {
        name: input.name || null,
        weeklyConditionedMinutes: input.weeklyConditionedMinutes,
        standardDayMinutes: input.standardDayMinutes,
        accountingAnchorDate: dateAtUtcMidnight(input.accountingAnchorDate),
        warningThresholdMinutes: input.warningThresholdMinutes,
        defaultEntryMethod: input.defaultEntryMethod,
        dateFormat: input.dateFormat,
        timeFormat: input.timeFormat,
        setupComplete: true,
      },
    });
    await transaction.flexitimePolicy.update({
      where: { id: settings.flexitimePolicyId },
      data: {
        profile: input.profile,
        rotaMode: input.rotaMode,
        startBandwidthMinutes: input.startBandwidthMinutes,
        morningCoreStartMinutes: input.morningCoreStartMinutes,
        morningCoreEndMinutes: input.morningCoreEndMinutes,
        lunchStartMinutes: input.lunchStartMinutes,
        lunchEndMinutes: input.lunchEndMinutes,
        afternoonCoreStartMinutes: input.afternoonCoreStartMinutes,
        afternoonCoreEndMinutes: input.afternoonCoreEndMinutes,
        finishBandwidthMinutes: input.finishBandwidthMinutes,
        bootUpAllowanceMinutes: input.bootUpAllowanceMinutes,
      },
    });
    await Promise.all(
      input.expectedMinutes.map((expectedMinutes, weekday) =>
        transaction.workingPatternDay.upsert({
          where: {
            workingPatternId_weekday: {
              workingPatternId: settings.workingPatternId,
              weekday,
            },
          },
          create: {
            workingPatternId: settings.workingPatternId,
            weekday,
            expectedMinutes,
            isWorkingDay: expectedMinutes > 0,
          },
          update: { expectedMinutes, isWorkingDay: expectedMinutes > 0 },
        }),
      ),
    );
    await transaction.balanceLedgerEntry.deleteMany({
      where: {
        type: {
          in: ["DAILY_WORK_BALANCE", "AUTHORISED_CREDIT", "FLEXI_LEAVE"],
        },
      },
    });
    await transaction.changeHistory.create({
      data: {
        recordType: "PersonalSettings",
        recordId: "1",
        action: "UPDATED",
        previousValues: json(previous),
        newValues: json(input),
      },
    });
  });
  revalidatePath("/", "layout");
  withMessage("/settings", "success", "Settings saved");
}

export async function resetPolicyDefaults(formData: FormData): Promise<void> {
  const settings = await ensureSettings();
  const profile = value(formData, "profile") as keyof typeof DEFAULT_POLICIES;
  const defaults = DEFAULT_POLICIES[profile];
  if (!defaults) withMessage("/settings", "error", "Unknown policy profile");
  await prisma.$transaction(async (transaction) => {
    const previous = await transaction.flexitimePolicy.findUniqueOrThrow({
      where: { id: settings.flexitimePolicyId },
    });
    const updated = await transaction.flexitimePolicy.update({
      where: { id: settings.flexitimePolicyId },
      data: { profile, ...defaults },
    });
    await transaction.balanceLedgerEntry.deleteMany({
      where: {
        type: {
          in: ["DAILY_WORK_BALANCE", "AUTHORISED_CREDIT", "FLEXI_LEAVE"],
        },
      },
    });
    await history(
      {
        recordType: "FlexitimePolicy",
        recordId: updated.id,
        action: "UPDATED",
        previousValues: previous,
        newValues: updated,
        reason: "Reset to profile defaults",
      },
      transaction,
    );
  });
  revalidatePath("/", "layout");
  withMessage("/settings", "success", "Policy times reset to their defaults");
}

async function checkOverlap(
  date: string,
  startAt: Date,
  endAt: Date | null,
  excludingId?: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const overlap = await client.timeSegment.findFirst({
    where: {
      id: excludingId ? { not: excludingId } : undefined,
      localDate: dateAtUtcMidnight(date),
      deletedAt: null,
      startAt: { lt: endAt ?? new Date("9999-12-31T23:59:59.999Z") },
      OR: [{ endAt: null }, { endAt: { gt: startAt } }],
    },
  });
  if (overlap) throw new Error("This time overlaps an existing segment.");
}

export async function saveTimeSegment(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  try {
    const settings = await ensureSettings();
    const agreed = value(formData, "agreedNormalFinish");
    const scheduledStart = value(formData, "scheduledStart");
    const parsed = timeSegmentSchema.parse({
      id: value(formData, "id") || undefined,
      date,
      startTime: value(formData, "startTime"),
      endTime: value(formData, "endTime") || undefined,
      startOccurrence: value(formData, "startOccurrence") || "earlier",
      endOccurrence: value(formData, "endOccurrence") || "earlier",
      type: value(formData, "type"),
      note: value(formData, "note"),
      approvalStatus: value(formData, "approvalStatus") || "NOT_REQUIRED",
      approvalDate: value(formData, "approvalDate"),
      approvalNote: value(formData, "approvalNote"),
      officialTravelConfirmed: checked(formData, "officialTravelConfirmed"),
      agreedNormalFinishMinutes: agreed ? parseTime(agreed) : undefined,
      scheduledStartMinutes: scheduledStart
        ? parseTime(scheduledStart)
        : undefined,
    });
    const startAt = londonWallTimeToUtc(
      parsed.date,
      parseTime(parsed.startTime),
      parsed.startOccurrence,
    );
    const endAt = parsed.endTime
      ? londonWallTimeToUtc(
          parsed.date,
          parseTime(parsed.endTime),
          parsed.endOccurrence,
        )
      : null;
    const recordData = {
      localDate: dateAtUtcMidnight(parsed.date),
      startAt,
      endAt,
      type: parsed.type,
      note: parsed.note,
      approvalStatus: parsed.approvalStatus,
      approvalDate: parsed.approvalDate
        ? dateAtUtcMidnight(parsed.approvalDate)
        : null,
      approvalNote: parsed.approvalNote,
      officialTravelConfirmed: parsed.officialTravelConfirmed,
      agreedNormalFinishMinutes: parsed.agreedNormalFinishMinutes,
      scheduledStartMinutes: parsed.scheduledStartMinutes,
    };
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        await checkOverlap(date, startAt, endAt, parsed.id, transaction);
        if (parsed.id) {
          const previous = await transaction.timeSegment.findUniqueOrThrow({
            where: { id: parsed.id },
          });
          if (isoDate(previous.localDate) !== date) {
            throw new Error(
              "The submitted date does not match this time segment.",
            );
          }
          const updated = await transaction.timeSegment.update({
            where: { id: parsed.id },
            data: recordData,
          });
          await history(
            {
              recordType: "TimeSegment",
              recordId: updated.id,
              action: "UPDATED",
              previousValues: previous,
              newValues: updated,
            },
            transaction,
          );
        } else {
          const created = await transaction.timeSegment.create({
            data: recordData,
          });
          await history(
            {
              recordType: "TimeSegment",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
            },
            transaction,
          );
        }
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    const message = errorMessage(error, "Could not save the time segment");
    const prefix = `segment-${value(formData, "id") || "new"}`;
    withMessage(
      `/day/${date}`,
      "error",
      message,
      message.includes("Finish time") ? `${prefix}-finish` : `${prefix}-start`,
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Time segment saved");
}

export async function deleteTimeSegment(formData: FormData): Promise<void> {
  const id = value(formData, "id");
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  if (!checked(formData, "confirm"))
    withMessage(
      `/day/${date}`,
      "error",
      "Confirm deletion before continuing",
      `segment-${id}-confirm-delete`,
    );
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const previous = await transaction.timeSegment.findUniqueOrThrow({
          where: { id },
        });
        if (isoDate(previous.localDate) !== date) {
          throw new Error(
            "The submitted date does not match this time segment.",
          );
        }
        if (previous.deletedAt)
          throw new Error("This time segment is already removed.");
        const updated = await transaction.timeSegment.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
        await history(
          {
            recordType: "TimeSegment",
            recordId: id,
            action: "DELETED",
            previousValues: previous,
            newValues: updated,
          },
          transaction,
        );
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not delete the time segment"),
      `segment-${id}-confirm-delete`,
    );
  }
  revalidateRecords(date);
  withMessage(
    `/day/${date}`,
    "success",
    "Time segment removed. It can be restored from history.",
  );
}

export async function restoreTimeSegment(formData: FormData): Promise<void> {
  const id = value(formData, "id");
  const submittedDate = value(formData, "date");
  const existing = await prisma.timeSegment.findUniqueOrThrow({
    where: { id },
  });
  const date = isoDate(existing.localDate);
  if (submittedDate && submittedDate !== date) {
    withMessage("/history", "error", "The submitted date does not match.");
  }
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const record = await transaction.timeSegment.findUniqueOrThrow({
          where: { id },
        });
        if (!record.deletedAt)
          throw new Error("This time segment is not deleted.");
        await checkOverlap(date, record.startAt, record.endAt, id, transaction);
        const restored = await transaction.timeSegment.update({
          where: { id },
          data: { deletedAt: null },
        });
        await history(
          {
            recordType: "TimeSegment",
            recordId: id,
            action: "RESTORED",
            previousValues: record,
            newValues: restored,
          },
          transaction,
        );
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      "/history",
      "error",
      errorMessage(error, "Could not restore the time segment"),
    );
  }
  revalidateRecords(date);
  withMessage("/history", "success", "Time segment restored");
}

export async function restoreCredit(formData: FormData): Promise<void> {
  const id = value(formData, "id");
  const existing = await prisma.authorisedCredit.findUniqueOrThrow({
    where: { id },
  });
  const date = isoDate(existing.localDate);
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const record = await transaction.authorisedCredit.findUniqueOrThrow({
          where: { id },
        });
        if (!record.deletedAt) throw new Error("This credit is not deleted.");
        const restored = await transaction.authorisedCredit.update({
          where: { id },
          data: { deletedAt: null },
        });
        await history(
          {
            recordType: "AuthorisedCredit",
            recordId: id,
            action: "RESTORED",
            previousValues: record,
            newValues: restored,
          },
          transaction,
        );
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      "/history",
      "error",
      errorMessage(error, "Could not restore the credit"),
    );
  }
  revalidateRecords(date);
  withMessage("/history", "success", "Authorised credit restored");
}

export async function restoreFlexiLeave(formData: FormData): Promise<void> {
  const id = value(formData, "id");
  const existing = await prisma.flexiLeave.findUniqueOrThrow({
    where: { id },
  });
  const date = isoDate(existing.localDate);
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const record = await transaction.flexiLeave.findUniqueOrThrow({
          where: { id },
        });
        if (!record.deletedAt)
          throw new Error("This flexi leave is not deleted.");
        const restored = await transaction.flexiLeave.update({
          where: { id },
          data: { deletedAt: null },
        });
        await history(
          {
            recordType: "FlexiLeave",
            recordId: id,
            action: "RESTORED",
            previousValues: record,
            newValues: restored,
          },
          transaction,
        );
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      "/history",
      "error",
      errorMessage(error, "Could not restore flexi leave"),
    );
  }
  revalidateRecords(date);
  withMessage("/history", "success", "Flexi leave restored");
}

export async function clockAction(formData: FormData): Promise<void> {
  const operation = value(formData, "operation");
  const now = new Date();
  const london = nowInLondon();
  let affectedDate = london.date;
  try {
    const settings = await ensureSettings();
    affectedDate = await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT pg_advisory_xact_lock(846372915)::text
        `;
        const open = await transaction.timeSegment.findFirst({
          where: { endAt: null, deletedAt: null },
        });
        const mutationDate = open ? isoDate(open.localDate) : london.date;
        const period = await editablePeriod(
          transaction,
          mutationDate,
          settings,
        );

        if (operation === "start") {
          if (open) throw new Error("There is already an open time segment.");
          const created = await transaction.timeSegment.create({
            data: {
              localDate: dateAtUtcMidnight(london.date),
              startAt: now,
              type: "NORMAL_WORK",
            },
          });
          await history(
            {
              recordType: "TimeSegment",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
            },
            transaction,
          );
        } else if (operation === "break" || operation === "resume") {
          const expectedTypes =
            operation === "break"
              ? ["NORMAL_WORK", "OFFICIAL_TRAVEL"]
              : ["LUNCH_BREAK", "OTHER_UNPAID_BREAK"];
          if (!open || !expectedTypes.includes(open.type)) {
            throw new Error(
              operation === "break"
                ? "Start work before starting a break."
                : "There is no open break to resume from.",
            );
          }
          if (mutationDate !== london.date) {
            throw new Error(
              operation === "break"
                ? "The open work segment began on an earlier date. Finish it and correct the record before starting a break."
                : "The open break began on an earlier date. Finish it and correct the record before resuming work.",
            );
          }
          const closed = await transaction.timeSegment.update({
            where: { id: open.id },
            data: { endAt: now },
          });
          const created = await transaction.timeSegment.create({
            data: {
              localDate: dateAtUtcMidnight(london.date),
              startAt: now,
              type: operation === "break" ? "LUNCH_BREAK" : "NORMAL_WORK",
            },
          });
          await history(
            {
              recordType: "TimeSegment",
              recordId: closed.id,
              action: "UPDATED",
              previousValues: open,
              newValues: closed,
            },
            transaction,
          );
          await history(
            {
              recordType: "TimeSegment",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
            },
            transaction,
          );
        } else if (operation === "finish") {
          if (!open)
            throw new Error("There is no open time segment to finish.");
          const updated = await transaction.timeSegment.update({
            where: { id: open.id },
            data: { endAt: now },
          });
          await history(
            {
              recordType: "TimeSegment",
              recordId: open.id,
              action: "UPDATED",
              previousValues: open,
              newValues: updated,
            },
            transaction,
          );
        } else {
          throw new Error("Unknown clock action.");
        }
        await finishBalanceAffectingMutation(
          transaction,
          mutationDate,
          settings,
          period,
        );
        return mutationDate;
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage("/", "error", errorMessage(error, "Clock action failed"));
  }
  revalidateRecords(affectedDate);
  if (affectedDate !== london.date) {
    withMessage(
      `/day/${affectedDate}`,
      "success",
      "Overnight segment finished. Review the finish date and split the record if needed",
    );
  }
  withMessage("/", "success", "Clock updated");
}

export async function saveCredit(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  try {
    const settings = await ensureSettings();
    const parsed = creditSchema.parse({
      id: value(formData, "id") || undefined,
      date,
      durationMinutes: value(formData, "durationMinutes"),
      startTime: value(formData, "startTime"),
      endTime: value(formData, "endTime"),
      startOccurrence: value(formData, "startOccurrence") || "earlier",
      endOccurrence: value(formData, "endOccurrence") || "earlier",
      type: value(formData, "type"),
      note: value(formData, "note"),
      approvalStatus: value(formData, "approvalStatus"),
      approvalDate: value(formData, "approvalDate"),
      approvalNote: value(formData, "approvalNote"),
    });
    const startAt = parsed.startTime
      ? londonWallTimeToUtc(
          date,
          parseTime(parsed.startTime),
          parsed.startOccurrence,
        )
      : null;
    const endAt = parsed.endTime
      ? londonWallTimeToUtc(
          date,
          parseTime(parsed.endTime),
          parsed.endOccurrence,
        )
      : null;
    const durationMinutes =
      startAt && endAt
        ? Math.round((endAt.getTime() - startAt.getTime()) / 60_000)
        : (parsed.durationMinutes as number);
    if (
      parsed.type === "SIGNIFICANT_TRANSPORT_DISRUPTION" &&
      durationMinutes < 30
    ) {
      throw new Error(
        "Significant transport disruption must last at least 30 minutes.",
      );
    }
    const recordData = {
      localDate: dateAtUtcMidnight(parsed.date),
      durationMinutes,
      startAt,
      endAt,
      type: parsed.type,
      note: parsed.note,
      approvalStatus: parsed.approvalStatus,
      approvalDate: parsed.approvalDate
        ? dateAtUtcMidnight(parsed.approvalDate)
        : null,
      approvalNote: parsed.approvalNote,
    };
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        if (parsed.id) {
          const previous = await transaction.authorisedCredit.findUniqueOrThrow(
            {
              where: { id: parsed.id },
            },
          );
          if (isoDate(previous.localDate) !== date) {
            throw new Error("The submitted date does not match this credit.");
          }
          const updated = await transaction.authorisedCredit.update({
            where: { id: parsed.id },
            data: recordData,
          });
          await history(
            {
              recordType: "AuthorisedCredit",
              recordId: updated.id,
              action: "UPDATED",
              previousValues: previous,
              newValues: updated,
            },
            transaction,
          );
        } else {
          const created = await transaction.authorisedCredit.create({
            data: recordData,
          });
          await history(
            {
              recordType: "AuthorisedCredit",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
            },
            transaction,
          );
        }
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not save the credit"),
      `credit-${value(formData, "id") || "new"}-duration`,
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Authorised credit saved");
}

export async function deleteCredit(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  if (!checked(formData, "confirm"))
    withMessage(
      `/day/${date}`,
      "error",
      "Confirm deletion before continuing",
      `credit-${value(formData, "id")}-confirm-delete`,
    );
  try {
    const settings = await ensureSettings();
    const id = value(formData, "id");
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const previous = await transaction.authorisedCredit.findUniqueOrThrow({
          where: { id },
        });
        if (isoDate(previous.localDate) !== date) {
          throw new Error("The submitted date does not match this credit.");
        }
        if (previous.deletedAt)
          throw new Error("This credit is already removed.");
        const updated = await transaction.authorisedCredit.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
        await history(
          {
            recordType: "AuthorisedCredit",
            recordId: id,
            action: "DELETED",
            previousValues: previous,
            newValues: updated,
          },
          transaction,
        );
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not remove the credit"),
      `credit-${value(formData, "id")}-confirm-delete`,
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Credit removed");
}

export async function saveFlexiLeave(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  try {
    const settings = await ensureSettings();
    const parsed = flexiLeaveSchema.parse({
      id: value(formData, "id") || undefined,
      date,
      durationMinutes: value(formData, "durationMinutes"),
      kind: value(formData, "kind"),
      note: value(formData, "note"),
      approvalStatus: value(formData, "approvalStatus"),
      approvalDate: value(formData, "approvalDate"),
    });
    const recordData = {
      localDate: dateAtUtcMidnight(parsed.date),
      durationMinutes: parsed.durationMinutes,
      kind: parsed.kind,
      note: parsed.note,
      approvalStatus: parsed.approvalStatus,
      approvalDate: parsed.approvalDate
        ? dateAtUtcMidnight(parsed.approvalDate)
        : null,
    };
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        if (parsed.id) {
          const previous = await transaction.flexiLeave.findUniqueOrThrow({
            where: { id: parsed.id },
          });
          if (isoDate(previous.localDate) !== date) {
            throw new Error(
              "The submitted date does not match this flexi leave.",
            );
          }
          const updated = await transaction.flexiLeave.update({
            where: { id: parsed.id },
            data: recordData,
          });
          await history(
            {
              recordType: "FlexiLeave",
              recordId: updated.id,
              action: "UPDATED",
              previousValues: previous,
              newValues: updated,
            },
            transaction,
          );
        } else {
          const created = await transaction.flexiLeave.create({
            data: recordData,
          });
          await history(
            {
              recordType: "FlexiLeave",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
            },
            transaction,
          );
        }
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not save flexi leave"),
      `leave-${value(formData, "id") || "new"}-duration`,
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Flexi leave saved");
}

export async function deleteFlexiLeave(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  if (!checked(formData, "confirm"))
    withMessage(
      `/day/${date}`,
      "error",
      "Confirm deletion before continuing",
      `leave-${value(formData, "id")}-confirm-delete`,
    );
  try {
    const settings = await ensureSettings();
    const id = value(formData, "id");
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const previous = await transaction.flexiLeave.findUniqueOrThrow({
          where: { id },
        });
        if (isoDate(previous.localDate) !== date) {
          throw new Error(
            "The submitted date does not match this flexi leave.",
          );
        }
        if (previous.deletedAt)
          throw new Error("This flexi leave is already removed.");
        const updated = await transaction.flexiLeave.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
        await history(
          {
            recordType: "FlexiLeave",
            recordId: id,
            action: "DELETED",
            previousValues: previous,
            newValues: updated,
          },
          transaction,
        );
        await finishBalanceAffectingMutation(
          transaction,
          date,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not remove flexi leave"),
      `leave-${value(formData, "id")}-confirm-delete`,
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Flexi leave removed");
}

export async function toggleDayComplete(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const localDate = dateAtUtcMidnight(date);
        const existing = await transaction.dailyCompletion.findUnique({
          where: { localDate },
        });
        if (existing) {
          await transaction.dailyCompletion.delete({ where: { localDate } });
          await history(
            {
              recordType: "DailyCompletion",
              recordId: existing.id,
              action: "DELETED",
              previousValues: existing,
            },
            transaction,
          );
        } else {
          const open = await transaction.timeSegment.findFirst({
            where: { localDate, endAt: null, deletedAt: null },
          });
          if (open) throw new Error("Finish the open time segment first.");
          const created = await transaction.dailyCompletion.create({
            data: { localDate },
          });
          await history(
            {
              recordType: "DailyCompletion",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
            },
            transaction,
          );
        }
        await rebuildDayLedger(date, transaction, settings, period);
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      error instanceof Error
        ? error.message
        : "Could not change completion status",
      "toggle-completion",
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Completion status updated");
}

export async function copyDay(formData: FormData): Promise<void> {
  const sourceDate = value(formData, "sourceDate");
  const targetDate = value(formData, "targetDate");
  requireValidDate(targetDate, "/day");
  requireValidDate(sourceDate, `/day/${targetDate}`);
  if (!checked(formData, "confirmCopy"))
    withMessage(
      `/day/${targetDate}`,
      "error",
      "Confirm the copied entries before saving",
      "confirm-copy",
    );
  try {
    if (sourceDate === targetDate) {
      throw new Error("Choose a different source date.");
    }
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, targetDate, settings);
        const source = await getDayWithClient(
          sourceDate,
          settings,
          transaction,
        );
        const target = await getDayWithClient(
          targetDate,
          settings,
          transaction,
        );
        if (
          target.segments.length ||
          target.credits.length ||
          target.flexiLeave.length
        ) {
          throw new Error(
            "The target day already has records. Remove them before copying.",
          );
        }
        if (
          !source.segments.length &&
          !source.credits.length &&
          !source.flexiLeave.length
        ) {
          throw new Error("There are no entries to copy from the source date.");
        }
        for (const item of source.segments.filter((segment) => segment.endAt)) {
          const startMinute = localDateAndMinute(item.startAt).minute;
          const endMinute = localDateAndMinute(item.endAt as Date).minute;
          const created = await transaction.timeSegment.create({
            data: {
              localDate: dateAtUtcMidnight(targetDate),
              startAt: londonWallTimeToUtc(
                targetDate,
                startMinute,
                londonTimeOccurrence(item.startAt),
              ),
              endAt: londonWallTimeToUtc(
                targetDate,
                endMinute,
                londonTimeOccurrence(item.endAt as Date),
              ),
              type: item.type,
              note: item.note
                ? `Copied: ${item.note}`
                : `Copied from ${sourceDate}`,
              approvalStatus: item.approvalStatus,
              approvalDate: item.approvalDate,
              approvalNote: item.approvalNote,
              officialTravelConfirmed: item.officialTravelConfirmed,
              agreedNormalFinishMinutes: item.agreedNormalFinishMinutes,
              scheduledStartMinutes: item.scheduledStartMinutes,
            },
          });
          await history(
            {
              recordType: "TimeSegment",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
              reason: `Copied from ${sourceDate}`,
            },
            transaction,
          );
        }
        for (const item of source.credits) {
          const startMinute = item.startAt
            ? localDateAndMinute(item.startAt).minute
            : null;
          const endMinute = item.endAt
            ? localDateAndMinute(item.endAt).minute
            : null;
          const created = await transaction.authorisedCredit.create({
            data: {
              localDate: dateAtUtcMidnight(targetDate),
              durationMinutes: item.durationMinutes,
              startAt:
                startMinute === null
                  ? null
                  : londonWallTimeToUtc(
                      targetDate,
                      startMinute,
                      londonTimeOccurrence(item.startAt as Date),
                    ),
              endAt:
                endMinute === null
                  ? null
                  : londonWallTimeToUtc(
                      targetDate,
                      endMinute,
                      londonTimeOccurrence(item.endAt as Date),
                    ),
              type: item.type,
              note: item.note
                ? `Copied: ${item.note}`
                : `Copied from ${sourceDate}`,
              approvalStatus: item.approvalStatus,
              approvalDate: item.approvalDate,
              approvalNote: item.approvalNote,
            },
          });
          await history(
            {
              recordType: "AuthorisedCredit",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
              reason: `Copied from ${sourceDate}`,
            },
            transaction,
          );
        }
        for (const item of source.flexiLeave) {
          const created = await transaction.flexiLeave.create({
            data: {
              localDate: dateAtUtcMidnight(targetDate),
              durationMinutes: item.durationMinutes,
              kind: item.kind,
              note: item.note
                ? `Copied: ${item.note}`
                : `Copied from ${sourceDate}`,
              approvalStatus: item.approvalStatus,
              approvalDate: item.approvalDate,
            },
          });
          await history(
            {
              recordType: "FlexiLeave",
              recordId: created.id,
              action: "CREATED",
              newValues: created,
              reason: `Copied from ${sourceDate}`,
            },
            transaction,
          );
        }
        await history(
          {
            recordType: "Day",
            recordId: targetDate,
            action: "CREATED",
            newValues: { copiedFrom: sourceDate },
          },
          transaction,
        );
        await finishBalanceAffectingMutation(
          transaction,
          targetDate,
          settings,
          period,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/day/${targetDate}`,
      "error",
      errorMessage(error, "Could not copy the day"),
      "copy-source-date",
    );
  }
  revalidateRecords(targetDate);
  withMessage(
    `/day/${targetDate}`,
    "success",
    `Entries copied from ${sourceDate}`,
  );
}

export async function resolveFinding(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  const ruleId = value(formData, "ruleId");
  requireValidDate(date, "/day");
  if (!ruleIds.has(ruleId as RuleId)) {
    withMessage(`/day/${date}`, "error", "Choose a valid policy issue");
  }
  const approvalStatus = value(formData, "approvalStatus") as ApprovalStatus;
  if (
    !["NOT_REQUIRED", "PENDING", "APPROVED", "REFUSED"].includes(approvalStatus)
  ) {
    withMessage(`/day/${date}`, "error", "Choose a valid approval status");
  }
  const approvalDate = value(formData, "approvalDate");
  if (approvalDate && !isValidIsoDate(approvalDate)) {
    withMessage(`/day/${date}`, "error", "Enter a valid approval date");
  }
  const settings = await ensureSettings();
  await prisma.$transaction(
    async (transaction) => {
      await editablePeriod(transaction, date, settings);
      const previous = await transaction.findingResolution.findUnique({
        where: {
          localDate_ruleId: { localDate: dateAtUtcMidnight(date), ruleId },
        },
      });
      const updated = await transaction.findingResolution.upsert({
        where: {
          localDate_ruleId: { localDate: dateAtUtcMidnight(date), ruleId },
        },
        create: {
          localDate: dateAtUtcMidnight(date),
          ruleId,
          approvalStatus,
          approvalDate: approvalDate ? dateAtUtcMidnight(approvalDate) : null,
          note: value(formData, "note") || null,
        },
        update: {
          approvalStatus,
          approvalDate: approvalDate ? dateAtUtcMidnight(approvalDate) : null,
          note: value(formData, "note") || null,
        },
      });
      await history(
        {
          recordType: "FindingResolution",
          recordId: updated.id,
          action: previous ? "UPDATED" : "CREATED",
          previousValues: previous ?? undefined,
          newValues: updated,
        },
        transaction,
      );
      await markChangedAfterCompletion(date, transaction);
    },
    { isolationLevel: "ReadCommitted" },
  );
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Policy issue updated");
}

export async function changePeriodStatus(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/period");
  const status = value(formData, "status");
  if (!["OPEN", "COMPLETE", "CHECKED", "LOCKED"].includes(status))
    withMessage(
      `/period?date=${date}`,
      "error",
      "Invalid status",
      "period-status",
    );
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const initial = await ensureAccountingPeriod(
          date,
          settings,
          transaction,
        );
        await lockAccountingPeriod(transaction, initial.id);
        const period = await transaction.accountingPeriod.findUniqueOrThrow({
          where: { id: initial.id },
        });
        const allowedTransitions: Record<string, string[]> = {
          OPEN: ["OPEN", "COMPLETE"],
          COMPLETE: ["OPEN", "COMPLETE", "CHECKED"],
          CHECKED: ["COMPLETE", "CHECKED", "LOCKED"],
          LOCKED: ["LOCKED"],
        };
        if (!allowedTransitions[period.status].includes(status)) {
          throw new Error(
            period.status === "LOCKED"
              ? "Use the unlock form and enter a reason before changing a locked period."
              : `Change the period through the required review stages; ${period.status.toLowerCase()} cannot change directly to ${status.toLowerCase()}.`,
          );
        }
        if (status === "LOCKED" && !checked(formData, "confirmLock")) {
          throw new Error(
            "Confirm that you want to lock this accounting period.",
          );
        }
        if (status === "LOCKED" && !period.carryoverConfirmed) {
          throw new Error(
            "Confirm the final carryover before locking this accounting period.",
          );
        }
        const updated = await transaction.accountingPeriod.update({
          where: { id: period.id },
          data: {
            status: status as "OPEN" | "COMPLETE" | "CHECKED" | "LOCKED",
            checkedAt:
              status === "CHECKED" || status === "LOCKED"
                ? (period.checkedAt ?? new Date())
                : null,
            lockedAt: status === "LOCKED" ? new Date() : null,
          },
        });
        await history(
          {
            recordType: "AccountingPeriod",
            recordId: period.id,
            action: status === "LOCKED" ? "LOCKED" : "UPDATED",
            previousValues: period,
            newValues: updated,
          },
          transaction,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/period?date=${date}`,
      "error",
      errorMessage(error, "Could not update the accounting period"),
      "period-status",
    );
  }
  revalidatePath("/period");
  withMessage(
    `/period?date=${date}`,
    "success",
    "Accounting period status updated",
  );
}

export async function unlockPeriod(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/period");
  const reason = value(formData, "reason").trim();
  if (!checked(formData, "confirmUnlock") || !reason) {
    withMessage(
      `/period?date=${date}`,
      "error",
      "Confirm the unlock and enter a reason",
      "unlock-reason",
    );
  }
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const initial = await ensureAccountingPeriod(
          date,
          settings,
          transaction,
        );
        await lockAccountingPeriod(transaction, initial.id);
        const period = await transaction.accountingPeriod.findUniqueOrThrow({
          where: { id: initial.id },
        });
        if (period.status !== "LOCKED") {
          throw new Error("This period is not locked.");
        }
        const updated = await transaction.accountingPeriod.update({
          where: { id: period.id },
          data: { status: "OPEN", lockedAt: null, unlockReason: reason },
        });
        await history(
          {
            recordType: "AccountingPeriod",
            recordId: period.id,
            action: "UNLOCKED",
            previousValues: period,
            newValues: updated,
            reason,
          },
          transaction,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/period?date=${date}`,
      "error",
      errorMessage(error, "Could not unlock the accounting period"),
      "unlock-reason",
    );
  }
  revalidatePath("/period");
  withMessage(`/period?date=${date}`, "success", "Accounting period unlocked");
}

export async function saveExceptionalCarryover(
  formData: FormData,
): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/period");
  const amount = Number(value(formData, "approvedAmountMinutes"));
  const approvalDate = value(formData, "approvalDate");
  const note = value(formData, "note").trim();
  if (
    !Number.isSafeInteger(amount) ||
    Math.abs(amount) > 100_800 ||
    !isValidIsoDate(approvalDate) ||
    !note ||
    note.length > 1000
  ) {
    withMessage(
      `/period?date=${date}`,
      "error",
      "Enter an approved amount, approval date and reason",
      "exceptional-amount",
    );
  }
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const existing = await transaction.exceptionalCarryover.findUnique({
          where: { accountingPeriodId: period.id },
        });
        const updated = await transaction.exceptionalCarryover.upsert({
          where: { accountingPeriodId: period.id },
          create: {
            accountingPeriodId: period.id,
            approvedAmountMinutes: amount,
            approvalDate: dateAtUtcMidnight(approvalDate),
            note,
          },
          update: {
            approvedAmountMinutes: amount,
            approvalDate: dateAtUtcMidnight(approvalDate),
            note,
          },
        });
        await history(
          {
            recordType: "ExceptionalCarryover",
            recordId: updated.id,
            action: existing ? "UPDATED" : "CREATED",
            previousValues: existing ?? undefined,
            newValues: updated,
          },
          transaction,
        );
        await invalidateConfirmedCarryover(transaction, period);
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/period?date=${date}`,
      "error",
      errorMessage(error, "Could not save exceptional carryover"),
      "exceptional-amount",
    );
  }
  revalidatePath("/period");
  withMessage(
    `/period?date=${date}`,
    "success",
    "Exceptional carryover recorded",
  );
}

export async function confirmCarryover(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/period");
  const amount = Number(value(formData, "finalCarryoverMinutes"));
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > 100_800)
    withMessage(
      `/period?date=${date}`,
      "error",
      "Enter the final carryover in minutes",
      "final-carryover",
    );
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const initial = await ensureAccountingPeriod(
          date,
          settings,
          transaction,
        );
        await lockAccountingPeriod(transaction, initial.id);
        const period = await transaction.accountingPeriod.findUniqueOrThrow({
          where: { id: initial.id },
        });
        if (period.status === "LOCKED") {
          throw new Error("Unlock the period before changing its carryover.");
        }
        if (!["COMPLETE", "CHECKED"].includes(period.status)) {
          throw new Error(
            "Mark the period complete before confirming its final carryover.",
          );
        }
        if (isoDate(period.endDate) > nowInLondon().date) {
          throw new Error(
            "Final carryover cannot be confirmed before the accounting period ends.",
          );
        }
        const periodData = await getPeriodWithTransaction(
          date,
          settings,
          transaction,
          period,
        );
        if (amount !== periodData.calculation.finalCarryoverMinutes) {
          throw new Error(
            `The final carryover must be ${periodData.calculation.finalCarryoverMinutes} minutes. Record an approved exceptional carryover first if a different amount is required.`,
          );
        }

        const nextDate = addDays(isoDate(period.endDate), 1);
        const initialNext = await ensureAccountingPeriod(
          nextDate,
          settings,
          transaction,
        );
        await lockAccountingPeriod(transaction, initialNext.id);
        const nextPeriod = await transaction.accountingPeriod.findUniqueOrThrow(
          {
            where: { id: initialNext.id },
          },
        );
        if (nextPeriod.status === "LOCKED") {
          throw new Error(
            "The next accounting period is locked. Unlock it before changing carryover.",
          );
        }
        const updated = await transaction.accountingPeriod.update({
          where: { id: period.id },
          data: { finalCarryoverMinutes: amount, carryoverConfirmed: true },
        });
        const updatedNext = await transaction.accountingPeriod.update({
          where: { id: nextPeriod.id },
          data: { openingBalanceMinutes: amount },
        });
        const opening = await transaction.balanceLedgerEntry.updateMany({
          where: {
            accountingPeriodId: nextPeriod.id,
            type: "OPENING_BALANCE",
          },
          data: { durationMinutes: amount },
        });
        if (opening.count === 0) {
          await transaction.balanceLedgerEntry.create({
            data: {
              localDate: nextPeriod.startDate,
              accountingPeriodId: nextPeriod.id,
              type: "OPENING_BALANCE",
              durationMinutes: amount,
              description:
                "Balance brought forward from the previous accounting period",
            },
          });
        }
        await history(
          {
            recordType: "AccountingPeriod",
            recordId: period.id,
            action: "UPDATED",
            previousValues: period,
            newValues: updated,
            reason: "Final carryover confirmed",
          },
          transaction,
        );
        await history(
          {
            recordType: "AccountingPeriod",
            recordId: nextPeriod.id,
            action: "UPDATED",
            previousValues: nextPeriod,
            newValues: updatedNext,
            reason: "Opening balance updated from confirmed carryover",
          },
          transaction,
        );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/period?date=${date}`,
      "error",
      errorMessage(error, "Could not confirm final carryover"),
      "final-carryover",
    );
  }
  revalidatePath("/period");
  withMessage(`/period?date=${date}`, "success", "Final carryover confirmed");
}

export async function addManualCorrection(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/period");
  const amount = Number(value(formData, "durationMinutes"));
  const reason = value(formData, "reason").trim();
  if (
    !Number.isSafeInteger(amount) ||
    Math.abs(amount) > 100_800 ||
    !reason ||
    reason.length > 1000
  )
    withMessage(
      `/period?date=${date}`,
      "error",
      "A correction amount and reason are required",
      "correction-minutes",
    );
  try {
    const settings = await ensureSettings();
    await prisma.$transaction(
      async (transaction) => {
        const period = await editablePeriod(transaction, date, settings);
        const created = await transaction.balanceLedgerEntry.create({
          data: {
            localDate: dateAtUtcMidnight(date),
            accountingPeriodId: period.id,
            type: "MANUAL_CORRECTION",
            durationMinutes: amount,
            description: "Manual balance correction",
            reason,
          },
        });
        await history(
          {
            recordType: "BalanceLedgerEntry",
            recordId: created.id,
            action: "CREATED",
            newValues: created,
            reason,
          },
          transaction,
        );
        await invalidateConfirmedCarryover(transaction, period);
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    withMessage(
      `/period?date=${date}`,
      "error",
      errorMessage(error, "Could not add the manual correction"),
      "correction-minutes",
    );
  }
  revalidatePath("/period");
  withMessage(`/period?date=${date}`, "success", "Manual correction added");
}
