import { z } from "zod";
import { localDateAndMinute } from "@/domain/time";
import { prisma } from "./prisma";

const portableDataSchema = z.object({
  format: z.literal("personal-flexitime-record"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  data: z.object({
    workingPatterns: z.array(z.record(z.string(), z.unknown())),
    workingPatternDays: z.array(z.record(z.string(), z.unknown())),
    flexitimePolicies: z.array(z.record(z.string(), z.unknown())),
    personalSettings: z.array(z.record(z.string(), z.unknown())),
    accountingPeriods: z.array(z.record(z.string(), z.unknown())),
    timeSegments: z.array(z.record(z.string(), z.unknown())),
    authorisedCredits: z.array(z.record(z.string(), z.unknown())),
    flexiLeave: z.array(z.record(z.string(), z.unknown())),
    exceptionalCarryovers: z.array(z.record(z.string(), z.unknown())),
    dailyCompletions: z.array(z.record(z.string(), z.unknown())),
    ledgerEntries: z.array(z.record(z.string(), z.unknown())),
    findingResolutions: z.array(z.record(z.string(), z.unknown())),
    changeHistory: z.array(z.record(z.string(), z.unknown())),
    applicationSettings: z.array(z.record(z.string(), z.unknown())),
  }),
});

export async function exportAllData() {
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
    prisma.workingPattern.findMany(),
    prisma.workingPatternDay.findMany(),
    prisma.flexitimePolicy.findMany(),
    prisma.personalSettings.findMany(),
    prisma.accountingPeriod.findMany(),
    prisma.timeSegment.findMany(),
    prisma.authorisedCredit.findMany(),
    prisma.flexiLeave.findMany(),
    prisma.exceptionalCarryover.findMany(),
    prisma.dailyCompletion.findMany(),
    prisma.balanceLedgerEntry.findMany(),
    prisma.findingResolution.findMany(),
    prisma.changeHistory.findMany(),
    prisma.applicationSetting.findMany(),
  ]);
  return {
    format: "personal-flexitime-record" as const,
    version: 1 as const,
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
  };
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
  const parsed = portableDataSchema.parse(payload);
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
  await prisma.$transaction(async (transaction) => {
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
  });
}
