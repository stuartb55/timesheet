import { z } from "zod";
import { daysBetween, isoDate, localDateAndMinute } from "@/domain/time";
import { ensureSettings } from "./data";
import { prisma } from "./prisma";

const dateTime = z.string().datetime({ offset: true });
const nullableDateTime = dateTime.nullable();
const id = z.string().min(1).max(200);
const approvalStatus = z.enum([
  "NOT_REQUIRED",
  "PENDING",
  "APPROVED",
  "REFUSED",
]);

const workingPatternSchema = z
  .object({
    id,
    name: z.string().max(200),
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const workingPatternDaySchema = z
  .object({
    id,
    workingPatternId: id,
    weekday: z.number().int().min(0).max(6),
    isWorkingDay: z.boolean(),
    expectedMinutes: z.number().int().min(0).max(1440),
  })
  .strict();

const flexitimePolicySchema = z
  .object({
    id,
    profile: z.enum([
      "STANDARD_CORPORATE",
      "SERVICE_SUPPORT",
      "VOICE_CONTACT_CENTRE",
    ]),
    startBandwidthMinutes: z.number().int().min(0).max(1439),
    morningCoreStartMinutes: z.number().int().min(0).max(1439),
    morningCoreEndMinutes: z.number().int().min(0).max(1439),
    lunchStartMinutes: z.number().int().min(0).max(1439),
    lunchEndMinutes: z.number().int().min(0).max(1439),
    afternoonCoreStartMinutes: z.number().int().min(0).max(1439),
    afternoonCoreEndMinutes: z.number().int().min(0).max(1439),
    finishBandwidthMinutes: z.number().int().min(0).max(1439),
    rotaMode: z.boolean(),
    bootUpAllowanceMinutes: z.number().int().min(0).max(60),
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const personalSettingsSchema = z
  .object({
    id: z.literal(1),
    name: z.string().max(200).nullable(),
    weeklyConditionedMinutes: z.number().int().min(0).max(10_080),
    standardDayMinutes: z.number().int().min(1).max(1440),
    accountingAnchorDate: dateTime,
    warningThresholdMinutes: z.number().int().min(1).max(2880),
    defaultEntryMethod: z.enum(["LIVE_CLOCK", "MANUAL"]),
    dateFormat: z.enum(["dd/MM/yyyy", "d MMMM yyyy", "yyyy-MM-dd"]),
    timeFormat: z.literal("24h"),
    workingPatternId: id,
    flexitimePolicyId: id,
    setupComplete: z.boolean(),
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const accountingPeriodSchema = z
  .object({
    id,
    startDate: dateTime,
    endDate: dateTime,
    openingBalanceMinutes: z.number().int(),
    finalCarryoverMinutes: z.number().int().nullable(),
    carryoverConfirmed: z.boolean(),
    status: z.enum(["OPEN", "COMPLETE", "CHECKED", "LOCKED"]),
    checkedAt: nullableDateTime,
    lockedAt: nullableDateTime,
    unlockReason: z.string().max(1000).nullable(),
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const timeSegmentSchema = z
  .object({
    id,
    localDate: dateTime,
    startAt: dateTime,
    endAt: nullableDateTime,
    type: z.enum([
      "NORMAL_WORK",
      "OFFICIAL_TRAVEL",
      "OVERTIME",
      "ROTA_BOOT_UP",
      "LUNCH_BREAK",
      "OTHER_UNPAID_BREAK",
    ]),
    note: z.string().max(1000).nullable(),
    approvalStatus,
    approvalDate: nullableDateTime,
    approvalNote: z.string().max(1000).nullable(),
    officialTravelConfirmed: z.boolean(),
    agreedNormalFinishMinutes: z
      .number()
      .int()
      .min(0)
      .max(1439)
      .nullable()
      .optional(),
    scheduledStartMinutes: z
      .number()
      .int()
      .min(0)
      .max(1439)
      .nullable()
      .optional(),
    deletedAt: nullableDateTime,
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const authorisedCreditSchema = z
  .object({
    id,
    localDate: dateTime,
    durationMinutes: z.number().int().positive().max(1440),
    startAt: nullableDateTime,
    endAt: nullableDateTime,
    type: z.enum([
      "ANNUAL_LEAVE",
      "SICK_ABSENCE",
      "PUBLIC_HOLIDAY",
      "PRIVILEGE_DAY",
      "TRAINING",
      "TRADE_UNION_FACILITY_TIME",
      "MEDICAL_APPOINTMENT",
      "DOCTOR",
      "DENTIST",
      "HOSPITAL",
      "OPTICIAN",
      "PRE_NATAL_APPOINTMENT",
      "OFFICIAL_TRAVEL",
      "SIGNIFICANT_TRANSPORT_DISRUPTION",
      "OTHER_AUTHORISED_ABSENCE",
    ]),
    note: z.string().max(1000).nullable(),
    approvalStatus,
    approvalDate: nullableDateTime,
    approvalNote: z.string().max(1000).nullable(),
    deletedAt: nullableDateTime,
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const flexiLeaveSchema = z
  .object({
    id,
    localDate: dateTime,
    durationMinutes: z.number().int().positive().max(1440),
    kind: z.enum(["FULL_DAY", "HALF_DAY", "PARTIAL"]),
    note: z.string().max(1000).nullable(),
    approvalStatus,
    approvalDate: nullableDateTime,
    deletedAt: nullableDateTime,
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const exceptionalCarryoverSchema = z
  .object({
    id,
    accountingPeriodId: id,
    approvedAmountMinutes: z.number().int(),
    approvalDate: dateTime,
    note: z.string().min(1).max(1000),
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const dailyCompletionSchema = z
  .object({
    id,
    localDate: dateTime,
    completedAt: dateTime,
    lastChangedAfterAt: nullableDateTime,
  })
  .strict();

const ledgerEntrySchema = z
  .object({
    id,
    localDate: dateTime,
    accountingPeriodId: id,
    type: z.enum([
      "OPENING_BALANCE",
      "DAILY_WORK_BALANCE",
      "AUTHORISED_CREDIT",
      "FLEXI_LEAVE",
      "CARRYOVER_ADJUSTMENT",
      "CREDIT_LOST",
      "EXCEPTIONAL_CARRYOVER",
      "MANUAL_CORRECTION",
    ]),
    durationMinutes: z.number().int(),
    sourceType: z.string().max(100).nullable(),
    sourceId: z.string().max(200).nullable(),
    description: z.string().min(1).max(1000),
    provisional: z.boolean(),
    reason: z.string().max(1000).nullable(),
    createdAt: dateTime,
  })
  .strict();

const findingResolutionSchema = z
  .object({
    id,
    localDate: dateTime,
    ruleId: z.string().min(1).max(100),
    approvalStatus,
    note: z.string().max(1000).nullable(),
    approvalDate: nullableDateTime,
    createdAt: dateTime,
    updatedAt: dateTime,
  })
  .strict();

const changeHistorySchema = z
  .object({
    id,
    recordType: z.string().min(1).max(100),
    recordId: z.string().min(1).max(200),
    action: z.enum([
      "CREATED",
      "UPDATED",
      "DELETED",
      "RESTORED",
      "LOCKED",
      "UNLOCKED",
      "IMPORTED",
    ]),
    previousValues: z.json().nullable(),
    newValues: z.json().nullable(),
    reason: z.string().max(1000).nullable(),
    occurredAt: dateTime,
  })
  .strict();

const applicationSettingSchema = z
  .object({
    key: z.string().min(1).max(200),
    value: z.json(),
    updatedAt: dateTime,
  })
  .strict();

const portableDataSchema = z
  .object({
    format: z.literal("personal-flexitime-record"),
    version: z.literal(1),
    exportedAt: dateTime,
    data: z
      .object({
        workingPatterns: z.array(workingPatternSchema),
        workingPatternDays: z.array(workingPatternDaySchema),
        flexitimePolicies: z.array(flexitimePolicySchema),
        personalSettings: z.array(personalSettingsSchema).length(1),
        accountingPeriods: z.array(accountingPeriodSchema),
        timeSegments: z.array(timeSegmentSchema),
        authorisedCredits: z.array(authorisedCreditSchema),
        flexiLeave: z.array(flexiLeaveSchema),
        exceptionalCarryovers: z.array(exceptionalCarryoverSchema),
        dailyCompletions: z.array(dailyCompletionSchema),
        ledgerEntries: z.array(ledgerEntrySchema),
        findingResolutions: z.array(findingResolutionSchema),
        changeHistory: z.array(changeHistorySchema),
        applicationSettings: z.array(applicationSettingSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ data }, context) => {
    const issue = (message: string, path: Array<string | number> = []) =>
      context.addIssue({ code: "custom", message, path: ["data", ...path] });
    const ensureUnique = (
      records: Array<Record<string, unknown>>,
      field: string,
      path: string,
    ) => {
      const values = records.map((record) => String(record[field]));
      if (new Set(values).size !== values.length) {
        issue(`${path} contains duplicate ${field} values`, [path]);
      }
    };

    for (const [name, records] of Object.entries(data)) {
      if (name === "applicationSettings") {
        ensureUnique(records, "key", name);
      } else {
        ensureUnique(records, "id", name);
      }
    }

    const patternIds = new Set(data.workingPatterns.map((item) => item.id));
    const policyIds = new Set(data.flexitimePolicies.map((item) => item.id));
    const periodIds = new Set(data.accountingPeriods.map((item) => item.id));
    const settings = data.personalSettings[0];
    if (!patternIds.has(settings.workingPatternId)) {
      issue("Personal settings references a missing working pattern", [
        "personalSettings",
      ]);
    }
    if (!policyIds.has(settings.flexitimePolicyId)) {
      issue("Personal settings references a missing flexitime policy", [
        "personalSettings",
      ]);
    }

    for (const item of data.workingPatternDays) {
      if (!patternIds.has(item.workingPatternId)) {
        issue("A working-pattern day references a missing pattern", [
          "workingPatternDays",
        ]);
      }
    }
    const configuredDays = data.workingPatternDays.filter(
      (item) => item.workingPatternId === settings.workingPatternId,
    );
    if (
      configuredDays.length !== 7 ||
      new Set(configuredDays.map((item) => item.weekday)).size !== 7
    ) {
      issue("The configured working pattern must contain weekdays 0 to 6", [
        "workingPatternDays",
      ]);
    }
    if (
      configuredDays.reduce((sum, item) => sum + item.expectedMinutes, 0) !==
      settings.weeklyConditionedMinutes
    ) {
      issue("Working-pattern minutes must equal weekly conditioned minutes", [
        "workingPatternDays",
      ]);
    }

    const periodStarts = new Set<string>();
    for (const period of data.accountingPeriods) {
      const start = isoDate(new Date(period.startDate));
      const end = isoDate(new Date(period.endDate));
      if (daysBetween(start, end) !== 27) {
        issue("Every accounting period must cover exactly 28 days", [
          "accountingPeriods",
        ]);
      }
      if (periodStarts.has(start)) {
        issue("Accounting-period start dates must be unique", [
          "accountingPeriods",
        ]);
      }
      periodStarts.add(start);
      if (
        period.carryoverConfirmed !==
        (period.finalCarryoverMinutes !== null)
      ) {
        issue(
          "Confirmed carryover and final carryover amount are inconsistent",
          ["accountingPeriods"],
        );
      }
      if (period.status === "LOCKED" && period.lockedAt === null) {
        issue("A locked accounting period must have a locked date", [
          "accountingPeriods",
        ]);
      }
    }

    for (const segment of data.timeSegments) {
      const localDate = isoDate(new Date(segment.localDate));
      if (localDateAndMinute(new Date(segment.startAt)).date !== localDate) {
        issue("A time segment start does not match its local date", [
          "timeSegments",
        ]);
      }
      if (
        segment.endAt !== null &&
        new Date(segment.endAt) <= new Date(segment.startAt)
      ) {
        issue("A time segment finish must be after its start", [
          "timeSegments",
        ]);
      }
    }

    for (const credit of data.authorisedCredits) {
      if ((credit.startAt === null) !== (credit.endAt === null)) {
        issue("A credit must contain both times or neither time", [
          "authorisedCredits",
        ]);
      }
      if (
        credit.startAt &&
        credit.endAt &&
        new Date(credit.endAt) <= new Date(credit.startAt)
      ) {
        issue("A credit finish must be after its start", ["authorisedCredits"]);
      }
      if (
        credit.type === "SIGNIFICANT_TRANSPORT_DISRUPTION" &&
        credit.durationMinutes < 30
      ) {
        issue(
          "Significant transport disruption must last at least 30 minutes",
          ["authorisedCredits"],
        );
      }
    }

    const exceptionalPeriods = new Set<string>();
    for (const item of data.exceptionalCarryovers) {
      if (!periodIds.has(item.accountingPeriodId)) {
        issue("Exceptional carryover references a missing period", [
          "exceptionalCarryovers",
        ]);
      }
      if (exceptionalPeriods.has(item.accountingPeriodId)) {
        issue("Only one exceptional carryover is allowed per period", [
          "exceptionalCarryovers",
        ]);
      }
      exceptionalPeriods.add(item.accountingPeriodId);
    }

    const openingPeriods = new Set<string>();
    const dailyBalanceKeys = new Set<string>();
    const sourceKeys = new Set<string>();
    for (const entry of data.ledgerEntries) {
      if (!periodIds.has(entry.accountingPeriodId)) {
        issue("A ledger entry references a missing period", ["ledgerEntries"]);
      }
      if (entry.type === "OPENING_BALANCE") {
        if (openingPeriods.has(entry.accountingPeriodId)) {
          issue("Only one opening balance is allowed per period", [
            "ledgerEntries",
          ]);
        }
        openingPeriods.add(entry.accountingPeriodId);
      }
      if (entry.type === "DAILY_WORK_BALANCE") {
        const key = `${entry.accountingPeriodId}:${isoDate(new Date(entry.localDate))}`;
        if (dailyBalanceKeys.has(key)) {
          issue("Only one daily balance is allowed per period and date", [
            "ledgerEntries",
          ]);
        }
        dailyBalanceKeys.add(key);
      }
      if (entry.sourceType && entry.sourceId) {
        const key = `${entry.accountingPeriodId}:${entry.sourceType}:${entry.sourceId}:${entry.type}`;
        if (sourceKeys.has(key)) {
          issue("A source is duplicated in the balance ledger", [
            "ledgerEntries",
          ]);
        }
        sourceKeys.add(key);
      }
    }
    for (const period of data.accountingPeriods) {
      if (!openingPeriods.has(period.id)) {
        issue("Every accounting period must have an opening balance", [
          "ledgerEntries",
        ]);
      }
    }

    const completionDates = data.dailyCompletions.map((item) =>
      isoDate(new Date(item.localDate)),
    );
    if (new Set(completionDates).size !== completionDates.length) {
      issue("Daily completion dates must be unique", ["dailyCompletions"]);
    }
    const resolutionKeys = data.findingResolutions.map(
      (item) => `${isoDate(new Date(item.localDate))}:${item.ruleId}`,
    );
    if (new Set(resolutionKeys).size !== resolutionKeys.length) {
      issue("Finding resolutions must be unique per date and rule", [
        "findingResolutions",
      ]);
    }
  });

export type PortableData = z.infer<typeof portableDataSchema>;

export function parsePortableData(payload: unknown): PortableData {
  return portableDataSchema.parse(payload);
}

export async function exportAllData(): Promise<PortableData> {
  await ensureSettings();
  return prisma.$transaction(
    async (transaction) => {
      const [
        workingPatterns,
        workingPatternDays,
        flexitimePolicies,
        personalSettings,
        accountingPeriods,
        timeSegments,
        authorisedCredits,
        flexiLeave,
        exceptionalCarryovers,
        dailyCompletions,
        ledgerEntries,
        findingResolutions,
        changeHistory,
        applicationSettings,
      ] = await Promise.all([
        transaction.workingPattern.findMany(),
        transaction.workingPatternDay.findMany(),
        transaction.flexitimePolicy.findMany(),
        transaction.personalSettings.findMany(),
        transaction.accountingPeriod.findMany(),
        transaction.timeSegment.findMany(),
        transaction.authorisedCredit.findMany(),
        transaction.flexiLeave.findMany(),
        transaction.exceptionalCarryover.findMany(),
        transaction.dailyCompletion.findMany(),
        transaction.balanceLedgerEntry.findMany(),
        transaction.findingResolution.findMany(),
        transaction.changeHistory.findMany(),
        transaction.applicationSetting.findMany(),
      ]);
      return parsePortableData(
        JSON.parse(
          JSON.stringify({
            format: "personal-flexitime-record",
            version: 1,
            exportedAt: new Date().toISOString(),
            data: {
              workingPatterns,
              workingPatternDays,
              flexitimePolicies,
              personalSettings,
              accountingPeriods,
              timeSegments,
              authorisedCredits,
              flexiLeave,
              exceptionalCarryovers,
              dailyCompletions,
              ledgerEntries,
              findingResolutions,
              changeHistory,
              applicationSettings,
            },
          }),
        ),
      );
    },
    { isolationLevel: "RepeatableRead" },
  );
}

const dateKeys = new Set([
  "accountingAnchorDate",
  "startDate",
  "endDate",
  "localDate",
  "startAt",
  "endAt",
  "approvalDate",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "checkedAt",
  "lockedAt",
  "completedAt",
  "lastChangedAfterAt",
  "occurredAt",
]);

function hydrate(
  records: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return records.map((record) =>
    Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        dateKeys.has(key) && typeof item === "string" ? new Date(item) : item,
      ]),
    ),
  );
}

/** Replace all application data with a validated full export. Caller must confirm this destructive operation. */
export async function importAllData(payload: unknown): Promise<void> {
  const parsed = parsePortableData(payload);
  const data = Object.fromEntries(
    Object.entries(parsed.data).map(([key, records]) => [
      key,
      hydrate(records),
    ]),
  ) as Record<keyof typeof parsed.data, Array<Record<string, unknown>>>;
  for (const segment of data.timeSegments) {
    const reference =
      segment.endAt instanceof Date
        ? segment.endAt
        : segment.startAt instanceof Date
          ? segment.startAt
          : null;
    if (
      segment.type === "ROTA_BOOT_UP" &&
      segment.scheduledStartMinutes === undefined &&
      reference
    ) {
      segment.scheduledStartMinutes = localDateAndMinute(reference).minute;
    }
    if (
      segment.type === "OVERTIME" &&
      segment.agreedNormalFinishMinutes === undefined &&
      segment.startAt instanceof Date
    ) {
      segment.agreedNormalFinishMinutes = localDateAndMinute(
        segment.startAt,
      ).minute;
    }
  }
  await prisma.$transaction(
    async (transaction) => {
      await transaction.changeHistory.deleteMany();
      await transaction.findingResolution.deleteMany();
      await transaction.balanceLedgerEntry.deleteMany();
      await transaction.dailyCompletion.deleteMany();
      await transaction.exceptionalCarryover.deleteMany();
      await transaction.flexiLeave.deleteMany();
      await transaction.authorisedCredit.deleteMany();
      await transaction.timeSegment.deleteMany();
      await transaction.accountingPeriod.deleteMany();
      await transaction.personalSettings.deleteMany();
      await transaction.workingPatternDay.deleteMany();
      await transaction.workingPattern.deleteMany();
      await transaction.flexitimePolicy.deleteMany();
      await transaction.applicationSetting.deleteMany();

      if (data.workingPatterns.length)
        await transaction.workingPattern.createMany({
          data: data.workingPatterns as never,
        });
      if (data.workingPatternDays.length)
        await transaction.workingPatternDay.createMany({
          data: data.workingPatternDays as never,
        });
      if (data.flexitimePolicies.length)
        await transaction.flexitimePolicy.createMany({
          data: data.flexitimePolicies as never,
        });
      if (data.personalSettings.length)
        await transaction.personalSettings.createMany({
          data: data.personalSettings as never,
        });
      if (data.accountingPeriods.length)
        await transaction.accountingPeriod.createMany({
          data: data.accountingPeriods as never,
        });
      if (data.timeSegments.length)
        await transaction.timeSegment.createMany({
          data: data.timeSegments as never,
        });
      if (data.authorisedCredits.length)
        await transaction.authorisedCredit.createMany({
          data: data.authorisedCredits as never,
        });
      if (data.flexiLeave.length)
        await transaction.flexiLeave.createMany({
          data: data.flexiLeave as never,
        });
      if (data.exceptionalCarryovers.length)
        await transaction.exceptionalCarryover.createMany({
          data: data.exceptionalCarryovers as never,
        });
      if (data.dailyCompletions.length)
        await transaction.dailyCompletion.createMany({
          data: data.dailyCompletions as never,
        });
      if (data.ledgerEntries.length)
        await transaction.balanceLedgerEntry.createMany({
          data: data.ledgerEntries as never,
        });
      if (data.findingResolutions.length)
        await transaction.findingResolution.createMany({
          data: data.findingResolutions as never,
        });
      if (data.changeHistory.length)
        await transaction.changeHistory.createMany({
          data: data.changeHistory as never,
        });
      if (data.applicationSettings.length)
        await transaction.applicationSetting.createMany({
          data: data.applicationSettings as never,
        });
    },
    { isolationLevel: "Serializable" },
  );
}
