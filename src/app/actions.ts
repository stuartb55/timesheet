"use server";

import type { ApprovalStatus, HistoryAction, Prisma } from "@prisma/client";
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
  londonWallTimeToUtc,
  parseTime,
} from "@/domain/time";
import {
  assertDateIsEditable,
  ensureAccountingPeriod,
  ensureSettings,
  getDay,
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
): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`);
}

async function history(args: {
  recordType: string;
  recordId: string;
  action: HistoryAction;
  previousValues?: unknown;
  newValues?: unknown;
  reason?: string;
}) {
  await prisma.changeHistory.create({
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

async function markChangedAfterCompletion(date: string) {
  await prisma.dailyCompletion.updateMany({
    where: { localDate: dateAtUtcMidnight(date) },
    data: { lastChangedAfterAt: new Date() },
  });
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
  const previous = settings.flexitimePolicy;
  const updated = await prisma.flexitimePolicy.update({
    where: { id: settings.flexitimePolicyId },
    data: { profile, ...defaults },
  });
  await history({
    recordType: "FlexitimePolicy",
    recordId: updated.id,
    action: "UPDATED",
    previousValues: previous,
    newValues: updated,
    reason: "Reset to profile defaults",
  });
  revalidatePath("/", "layout");
  withMessage("/settings", "success", "Policy times reset to their defaults");
}

async function checkOverlap(
  date: string,
  startAt: Date,
  endAt: Date | null,
  excludingId?: string,
) {
  const overlap = await prisma.timeSegment.findFirst({
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
    await assertDateIsEditable(date);
    const agreed = value(formData, "agreedNormalFinish");
    const scheduledStart = value(formData, "scheduledStart");
    const parsed = timeSegmentSchema.parse({
      id: value(formData, "id") || undefined,
      date,
      startTime: value(formData, "startTime"),
      endTime: value(formData, "endTime") || undefined,
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
    );
    const endAt = parsed.endTime
      ? londonWallTimeToUtc(parsed.date, parseTime(parsed.endTime))
      : null;
    await checkOverlap(date, startAt, endAt, parsed.id);
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
    if (parsed.id) {
      const previous = await prisma.timeSegment.findUniqueOrThrow({
        where: { id: parsed.id },
      });
      if (isoDate(previous.localDate) !== date) {
        throw new Error("The submitted date does not match this time segment.");
      }
      const updated = await prisma.timeSegment.update({
        where: { id: parsed.id },
        data: recordData,
      });
      await history({
        recordType: "TimeSegment",
        recordId: updated.id,
        action: "UPDATED",
        previousValues: previous,
        newValues: updated,
      });
    } else {
      const created = await prisma.timeSegment.create({ data: recordData });
      await history({
        recordType: "TimeSegment",
        recordId: created.id,
        action: "CREATED",
        newValues: created,
      });
    }
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not save the time segment"),
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
    withMessage(`/day/${date}`, "error", "Confirm deletion before continuing");
  try {
    await assertDateIsEditable(date);
    const previous = await prisma.timeSegment.findUniqueOrThrow({
      where: { id },
    });
    if (isoDate(previous.localDate) !== date) {
      throw new Error("The submitted date does not match this time segment.");
    }
    if (previous.deletedAt)
      throw new Error("This time segment is already removed.");
    const updated = await prisma.timeSegment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await history({
      recordType: "TimeSegment",
      recordId: id,
      action: "DELETED",
      previousValues: previous,
      newValues: updated,
    });
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not delete the time segment"),
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
  const record = await prisma.timeSegment.findUniqueOrThrow({ where: { id } });
  const date = record.localDate.toISOString().slice(0, 10);
  try {
    if (!record.deletedAt) throw new Error("This time segment is not deleted.");
    await assertDateIsEditable(date);
    await checkOverlap(date, record.startAt, record.endAt, id);
    const restored = await prisma.timeSegment.update({
      where: { id },
      data: { deletedAt: null },
    });
    await history({
      recordType: "TimeSegment",
      recordId: id,
      action: "RESTORED",
      previousValues: record,
      newValues: restored,
    });
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
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
  const record = await prisma.authorisedCredit.findUniqueOrThrow({
    where: { id },
  });
  const date = record.localDate.toISOString().slice(0, 10);
  try {
    if (!record.deletedAt) throw new Error("This credit is not deleted.");
    await assertDateIsEditable(date);
    const restored = await prisma.authorisedCredit.update({
      where: { id },
      data: { deletedAt: null },
    });
    await history({
      recordType: "AuthorisedCredit",
      recordId: id,
      action: "RESTORED",
      previousValues: record,
      newValues: restored,
    });
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
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
  const record = await prisma.flexiLeave.findUniqueOrThrow({ where: { id } });
  const date = record.localDate.toISOString().slice(0, 10);
  try {
    if (!record.deletedAt) throw new Error("This flexi leave is not deleted.");
    await assertDateIsEditable(date);
    const restored = await prisma.flexiLeave.update({
      where: { id },
      data: { deletedAt: null },
    });
    await history({
      recordType: "FlexiLeave",
      recordId: id,
      action: "RESTORED",
      previousValues: record,
      newValues: restored,
    });
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
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
    const open = await prisma.timeSegment.findFirst({
      where: { endAt: null, deletedAt: null },
    });
    if (operation === "start") {
      await assertDateIsEditable(london.date);
      if (open) throw new Error("There is already an open time segment.");
      const created = await prisma.timeSegment.create({
        data: {
          localDate: dateAtUtcMidnight(london.date),
          startAt: now,
          type: "NORMAL_WORK",
        },
      });
      await history({
        recordType: "TimeSegment",
        recordId: created.id,
        action: "CREATED",
        newValues: created,
      });
    } else if (operation === "break") {
      if (open) affectedDate = isoDate(open.localDate);
      await assertDateIsEditable(affectedDate);
      if (
        !open ||
        (open.type !== "NORMAL_WORK" && open.type !== "OFFICIAL_TRAVEL")
      ) {
        throw new Error("Start work before starting a break.");
      }
      if (affectedDate !== london.date) {
        throw new Error(
          "The open work segment began on an earlier date. Finish it and correct the record before starting a break.",
        );
      }
      await prisma.$transaction(async (transaction) => {
        const closed = await transaction.timeSegment.update({
          where: { id: open.id },
          data: { endAt: now },
        });
        const created = await transaction.timeSegment.create({
          data: {
            localDate: dateAtUtcMidnight(london.date),
            startAt: now,
            type: "LUNCH_BREAK",
          },
        });
        await transaction.changeHistory.create({
          data: {
            recordType: "TimeSegment",
            recordId: closed.id,
            action: "UPDATED",
            previousValues: json(open),
            newValues: json(closed),
          },
        });
        await transaction.changeHistory.create({
          data: {
            recordType: "TimeSegment",
            recordId: created.id,
            action: "CREATED",
            newValues: json(created),
          },
        });
      });
    } else if (operation === "resume") {
      if (open) affectedDate = isoDate(open.localDate);
      await assertDateIsEditable(affectedDate);
      if (
        !open ||
        (open.type !== "LUNCH_BREAK" && open.type !== "OTHER_UNPAID_BREAK")
      ) {
        throw new Error("There is no open break to resume from.");
      }
      if (affectedDate !== london.date) {
        throw new Error(
          "The open break began on an earlier date. Finish it and correct the record before resuming work.",
        );
      }
      await prisma.$transaction(async (transaction) => {
        const closed = await transaction.timeSegment.update({
          where: { id: open.id },
          data: { endAt: now },
        });
        const created = await transaction.timeSegment.create({
          data: {
            localDate: dateAtUtcMidnight(london.date),
            startAt: now,
            type: "NORMAL_WORK",
          },
        });
        await transaction.changeHistory.create({
          data: {
            recordType: "TimeSegment",
            recordId: closed.id,
            action: "UPDATED",
            previousValues: json(open),
            newValues: json(closed),
          },
        });
        await transaction.changeHistory.create({
          data: {
            recordType: "TimeSegment",
            recordId: created.id,
            action: "CREATED",
            newValues: json(created),
          },
        });
      });
    } else if (operation === "finish") {
      if (!open) throw new Error("There is no open time segment to finish.");
      affectedDate = isoDate(open.localDate);
      await assertDateIsEditable(affectedDate);
      const previous = open;
      const updated = await prisma.timeSegment.update({
        where: { id: open.id },
        data: { endAt: now },
      });
      await history({
        recordType: "TimeSegment",
        recordId: open.id,
        action: "UPDATED",
        previousValues: previous,
        newValues: updated,
      });
    } else {
      throw new Error("Unknown clock action.");
    }
    await markChangedAfterCompletion(affectedDate);
    await rebuildDayLedger(affectedDate);
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
    await assertDateIsEditable(date);
    const parsed = creditSchema.parse({
      id: value(formData, "id") || undefined,
      date,
      durationMinutes: value(formData, "durationMinutes"),
      startTime: value(formData, "startTime"),
      endTime: value(formData, "endTime"),
      type: value(formData, "type"),
      note: value(formData, "note"),
      approvalStatus: value(formData, "approvalStatus"),
      approvalDate: value(formData, "approvalDate"),
      approvalNote: value(formData, "approvalNote"),
    });
    const startAt = parsed.startTime
      ? londonWallTimeToUtc(date, parseTime(parsed.startTime))
      : null;
    const endAt = parsed.endTime
      ? londonWallTimeToUtc(date, parseTime(parsed.endTime))
      : null;
    const durationMinutes =
      startAt && endAt
        ? Math.round((endAt.getTime() - startAt.getTime()) / 60_000)
        : (parsed.durationMinutes as number);
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
    if (parsed.id) {
      const previous = await prisma.authorisedCredit.findUniqueOrThrow({
        where: { id: parsed.id },
      });
      if (isoDate(previous.localDate) !== date) {
        throw new Error("The submitted date does not match this credit.");
      }
      const updated = await prisma.authorisedCredit.update({
        where: { id: parsed.id },
        data: recordData,
      });
      await history({
        recordType: "AuthorisedCredit",
        recordId: updated.id,
        action: "UPDATED",
        previousValues: previous,
        newValues: updated,
      });
    } else {
      const created = await prisma.authorisedCredit.create({
        data: recordData,
      });
      await history({
        recordType: "AuthorisedCredit",
        recordId: created.id,
        action: "CREATED",
        newValues: created,
      });
    }
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not save the credit"),
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Authorised credit saved");
}

export async function deleteCredit(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  if (!checked(formData, "confirm"))
    withMessage(`/day/${date}`, "error", "Confirm deletion before continuing");
  try {
    await assertDateIsEditable(date);
    const id = value(formData, "id");
    const previous = await prisma.authorisedCredit.findUniqueOrThrow({
      where: { id },
    });
    if (isoDate(previous.localDate) !== date) {
      throw new Error("The submitted date does not match this credit.");
    }
    if (previous.deletedAt) throw new Error("This credit is already removed.");
    const updated = await prisma.authorisedCredit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await history({
      recordType: "AuthorisedCredit",
      recordId: id,
      action: "DELETED",
      previousValues: previous,
      newValues: updated,
    });
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not remove the credit"),
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Credit removed");
}

export async function saveFlexiLeave(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  try {
    await assertDateIsEditable(date);
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
    if (parsed.id) {
      const previous = await prisma.flexiLeave.findUniqueOrThrow({
        where: { id: parsed.id },
      });
      if (isoDate(previous.localDate) !== date) {
        throw new Error("The submitted date does not match this flexi leave.");
      }
      const updated = await prisma.flexiLeave.update({
        where: { id: parsed.id },
        data: recordData,
      });
      await history({
        recordType: "FlexiLeave",
        recordId: updated.id,
        action: "UPDATED",
        previousValues: previous,
        newValues: updated,
      });
    } else {
      const created = await prisma.flexiLeave.create({ data: recordData });
      await history({
        recordType: "FlexiLeave",
        recordId: created.id,
        action: "CREATED",
        newValues: created,
      });
    }
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not save flexi leave"),
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Flexi leave saved");
}

export async function deleteFlexiLeave(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  if (!checked(formData, "confirm"))
    withMessage(`/day/${date}`, "error", "Confirm deletion before continuing");
  try {
    await assertDateIsEditable(date);
    const id = value(formData, "id");
    const previous = await prisma.flexiLeave.findUniqueOrThrow({
      where: { id },
    });
    if (isoDate(previous.localDate) !== date) {
      throw new Error("The submitted date does not match this flexi leave.");
    }
    if (previous.deletedAt)
      throw new Error("This flexi leave is already removed.");
    const updated = await prisma.flexiLeave.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await history({
      recordType: "FlexiLeave",
      recordId: id,
      action: "DELETED",
      previousValues: previous,
      newValues: updated,
    });
    await markChangedAfterCompletion(date);
    await rebuildDayLedger(date);
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      errorMessage(error, "Could not remove flexi leave"),
    );
  }
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Flexi leave removed");
}

export async function toggleDayComplete(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/day");
  try {
    await assertDateIsEditable(date);
    const localDate = dateAtUtcMidnight(date);
    const existing = await prisma.dailyCompletion.findUnique({
      where: { localDate },
    });
    if (existing) {
      await prisma.dailyCompletion.delete({ where: { localDate } });
      await history({
        recordType: "DailyCompletion",
        recordId: existing.id,
        action: "DELETED",
        previousValues: existing,
      });
    } else {
      const open = await prisma.timeSegment.findFirst({
        where: { localDate, endAt: null, deletedAt: null },
      });
      if (open) throw new Error("Finish the open time segment first.");
      const created = await prisma.dailyCompletion.create({
        data: { localDate },
      });
      await history({
        recordType: "DailyCompletion",
        recordId: created.id,
        action: "CREATED",
        newValues: created,
      });
    }
  } catch (error) {
    withMessage(
      `/day/${date}`,
      "error",
      error instanceof Error
        ? error.message
        : "Could not change completion status",
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
    );
  try {
    if (sourceDate === targetDate) {
      throw new Error("Choose a different source date.");
    }
    await assertDateIsEditable(targetDate);
    const source = await getDay(sourceDate);
    const target = await getDay(targetDate);
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
    await prisma.$transaction(async (transaction) => {
      for (const item of source.segments.filter((segment) => segment.endAt)) {
        const startMinute = localDateAndMinute(item.startAt).minute;
        const endMinute = localDateAndMinute(item.endAt as Date).minute;
        await transaction.timeSegment.create({
          data: {
            localDate: dateAtUtcMidnight(targetDate),
            startAt: londonWallTimeToUtc(targetDate, startMinute),
            endAt: londonWallTimeToUtc(targetDate, endMinute),
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
      }
      for (const item of source.credits) {
        const startMinute = item.startAt
          ? localDateAndMinute(item.startAt).minute
          : null;
        const endMinute = item.endAt
          ? localDateAndMinute(item.endAt).minute
          : null;
        await transaction.authorisedCredit.create({
          data: {
            localDate: dateAtUtcMidnight(targetDate),
            durationMinutes: item.durationMinutes,
            startAt:
              startMinute === null
                ? null
                : londonWallTimeToUtc(targetDate, startMinute),
            endAt:
              endMinute === null
                ? null
                : londonWallTimeToUtc(targetDate, endMinute),
            type: item.type,
            note: item.note
              ? `Copied: ${item.note}`
              : `Copied from ${sourceDate}`,
            approvalStatus: item.approvalStatus,
            approvalDate: item.approvalDate,
            approvalNote: item.approvalNote,
          },
        });
      }
      for (const item of source.flexiLeave) {
        await transaction.flexiLeave.create({
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
      }
    });
    await markChangedAfterCompletion(targetDate);
    await history({
      recordType: "Day",
      recordId: targetDate,
      action: "CREATED",
      newValues: { copiedFrom: sourceDate },
    });
    await rebuildDayLedger(targetDate);
  } catch (error) {
    withMessage(
      `/day/${targetDate}`,
      "error",
      errorMessage(error, "Could not copy the day"),
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
  await assertDateIsEditable(date);
  const previous = await prisma.findingResolution.findUnique({
    where: { localDate_ruleId: { localDate: dateAtUtcMidnight(date), ruleId } },
  });
  const updated = await prisma.findingResolution.upsert({
    where: { localDate_ruleId: { localDate: dateAtUtcMidnight(date), ruleId } },
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
  await history({
    recordType: "FindingResolution",
    recordId: updated.id,
    action: previous ? "UPDATED" : "CREATED",
    previousValues: previous ?? undefined,
    newValues: updated,
  });
  await markChangedAfterCompletion(date);
  revalidateRecords(date);
  withMessage(`/day/${date}`, "success", "Policy issue updated");
}

export async function changePeriodStatus(formData: FormData): Promise<void> {
  const date = value(formData, "date");
  requireValidDate(date, "/period");
  const status = value(formData, "status");
  const period = await ensureAccountingPeriod(date);
  if (!["OPEN", "COMPLETE", "CHECKED", "LOCKED"].includes(status))
    withMessage(`/period?date=${date}`, "error", "Invalid status");
  if (period.status === "LOCKED" && status !== "LOCKED") {
    withMessage(
      `/period?date=${date}`,
      "error",
      "Use the unlock form and enter a reason before changing a locked period",
    );
  }
  if (status === "LOCKED" && !checked(formData, "confirmLock")) {
    withMessage(
      `/period?date=${date}`,
      "error",
      "Confirm that you want to lock this accounting period",
    );
  }
  if (status === "LOCKED" && !period.carryoverConfirmed) {
    withMessage(
      `/period?date=${date}`,
      "error",
      "Confirm the final carryover before locking this accounting period",
    );
  }
  const updated = await prisma.accountingPeriod.update({
    where: { id: period.id },
    data: {
      status: status as "OPEN" | "COMPLETE" | "CHECKED" | "LOCKED",
      checkedAt:
        status === "CHECKED" || status === "LOCKED"
          ? new Date()
          : period.checkedAt,
      lockedAt: status === "LOCKED" ? new Date() : null,
    },
  });
  await history({
    recordType: "AccountingPeriod",
    recordId: period.id,
    action: status === "LOCKED" ? "LOCKED" : "UPDATED",
    previousValues: period,
    newValues: updated,
  });
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
    );
  }
  const period = await ensureAccountingPeriod(date);
  if (period.status !== "LOCKED") {
    withMessage(`/period?date=${date}`, "error", "This period is not locked");
  }
  const updated = await prisma.accountingPeriod.update({
    where: { id: period.id },
    data: { status: "OPEN", lockedAt: null, unlockReason: reason },
  });
  await history({
    recordType: "AccountingPeriod",
    recordId: period.id,
    action: "UNLOCKED",
    previousValues: period,
    newValues: updated,
    reason,
  });
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
    );
  }
  const period = await ensureAccountingPeriod(date);
  if (period.status === "LOCKED")
    withMessage(
      `/period?date=${date}`,
      "error",
      "Unlock the period before editing carryover",
    );
  const existing = await prisma.exceptionalCarryover.findFirst({
    where: { accountingPeriodId: period.id },
  });
  const updated = existing
    ? await prisma.exceptionalCarryover.update({
        where: { id: existing.id },
        data: {
          approvedAmountMinutes: amount,
          approvalDate: dateAtUtcMidnight(approvalDate),
          note,
        },
      })
    : await prisma.exceptionalCarryover.create({
        data: {
          accountingPeriodId: period.id,
          approvedAmountMinutes: amount,
          approvalDate: dateAtUtcMidnight(approvalDate),
          note,
        },
      });
  await history({
    recordType: "ExceptionalCarryover",
    recordId: updated.id,
    action: existing ? "UPDATED" : "CREATED",
    previousValues: existing,
    newValues: updated,
  });
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
    );
  const period = await ensureAccountingPeriod(date);
  if (period.status === "LOCKED")
    withMessage(
      `/period?date=${date}`,
      "error",
      "Unlock the period before changing carryover",
    );
  const nextDate = addDays(isoDate(period.endDate), 1);
  const nextPeriod = await ensureAccountingPeriod(nextDate);
  if (nextPeriod.status === "LOCKED") {
    withMessage(
      `/period?date=${date}`,
      "error",
      "The next accounting period is locked. Unlock it before changing carryover",
    );
  }
  await prisma.$transaction(async (transaction) => {
    const updated = await transaction.accountingPeriod.update({
      where: { id: period.id },
      data: { finalCarryoverMinutes: amount, carryoverConfirmed: true },
    });
    const updatedNext = await transaction.accountingPeriod.update({
      where: { id: nextPeriod.id },
      data: { openingBalanceMinutes: amount },
    });
    await transaction.balanceLedgerEntry.updateMany({
      where: { accountingPeriodId: nextPeriod.id, type: "OPENING_BALANCE" },
      data: { durationMinutes: amount },
    });
    await transaction.changeHistory.create({
      data: {
        recordType: "AccountingPeriod",
        recordId: period.id,
        action: "UPDATED",
        previousValues: json(period),
        newValues: json(updated),
        reason: "Final carryover confirmed",
      },
    });
    await transaction.changeHistory.create({
      data: {
        recordType: "AccountingPeriod",
        recordId: nextPeriod.id,
        action: "UPDATED",
        previousValues: json(nextPeriod),
        newValues: json(updatedNext),
        reason: "Opening balance updated from confirmed carryover",
      },
    });
  });
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
    );
  const period = await ensureAccountingPeriod(date);
  if (period.status === "LOCKED")
    withMessage(
      `/period?date=${date}`,
      "error",
      "Unlock the period before adding a correction",
    );
  const created = await prisma.balanceLedgerEntry.create({
    data: {
      localDate: dateAtUtcMidnight(date),
      accountingPeriodId: period.id,
      type: "MANUAL_CORRECTION",
      durationMinutes: amount,
      description: "Manual balance correction",
      reason,
    },
  });
  await history({
    recordType: "BalanceLedgerEntry",
    recordId: created.id,
    action: "CREATED",
    newValues: created,
    reason,
  });
  revalidatePath("/period");
  withMessage(`/period?date=${date}`, "success", "Manual correction added");
}
