import type {
  AccountingPeriod,
  AuthorisedCredit,
  FlexiLeave,
  FlexitimePolicy,
  PersonalSettings,
  Prisma,
  TimeSegment,
  WorkingPatternDay,
} from "@prisma/client";
import { DEFAULT_POLICIES, DEFAULT_WEEKLY_PATTERN } from "@/domain/defaults";
import { calculatePeriod, evaluateDay } from "@/domain/flexitime";
import { calculateWtrAverage } from "@/domain/wtr";
import type { DomainCredit, DomainSegment } from "@/domain/types";
import {
  addDays,
  dateAtUtcMidnight,
  daysBetween,
  isoDate,
  localDateAndMinute,
  periodBounds,
  weekdayIndex,
} from "@/domain/time";
import { prisma } from "./prisma";

export type FullSettings = PersonalSettings & {
  workingPattern: { days: WorkingPatternDay[] };
  flexitimePolicy: FlexitimePolicy;
};

export async function ensureSettings(): Promise<FullSettings> {
  const existing = await prisma.personalSettings.findUnique({
    where: { id: 1 },
    include: {
      workingPattern: { include: { days: true } },
      flexitimePolicy: true,
    },
  });
  if (existing) return existing;

  const today = localDateAndMinute(new Date()).date;
  const defaults = DEFAULT_POLICIES.STANDARD_CORPORATE;
  return prisma.$transaction(async (transaction) => {
    const pattern = await transaction.workingPattern.upsert({
      where: { id: "default-working-pattern" },
      create: { id: "default-working-pattern" },
      update: {},
    });
    await transaction.workingPatternDay.createMany({
      data: DEFAULT_WEEKLY_PATTERN.map((expectedMinutes, weekday) => ({
        workingPatternId: pattern.id,
        weekday,
        expectedMinutes,
        isWorkingDay: expectedMinutes > 0,
      })),
      skipDuplicates: true,
    });
    const policy = await transaction.flexitimePolicy.upsert({
      where: { id: "default-flexitime-policy" },
      create: {
        id: "default-flexitime-policy",
        profile: "STANDARD_CORPORATE",
        ...defaults,
      },
      update: {},
    });
    return transaction.personalSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        weeklyConditionedMinutes: 2220,
        standardDayMinutes: 444,
        accountingAnchorDate: dateAtUtcMidnight(
          periodBounds(today, today).start,
        ),
        workingPatternId: pattern.id,
        flexitimePolicyId: policy.id,
      },
      update: {},
      include: {
        workingPattern: { include: { days: true } },
        flexitimePolicy: true,
      },
    });
  });
}

export function segmentToDomain(segment: TimeSegment): DomainSegment {
  const start = localDateAndMinute(segment.startAt);
  const end = segment.endAt ? localDateAndMinute(segment.endAt) : null;
  return {
    id: segment.id,
    date: isoDate(segment.localDate),
    startMinute: start.minute,
    endMinute:
      end && end.date > isoDate(segment.localDate)
        ? 1440 + end.minute
        : (end?.minute ?? null),
    endDate: end?.date,
    actualDurationMinutes: segment.endAt
      ? Math.round(
          (segment.endAt.getTime() - segment.startAt.getTime()) / 60_000,
        )
      : undefined,
    type: segment.type,
    approvalStatus: segment.approvalStatus,
    officialTravelConfirmed: segment.officialTravelConfirmed,
    scheduledStartMinute: segment.scheduledStartMinutes ?? undefined,
  };
}

export function creditToDomain(credit: AuthorisedCredit): DomainCredit {
  const start = credit.startAt
    ? localDateAndMinute(credit.startAt).minute
    : undefined;
  const end = credit.endAt
    ? localDateAndMinute(credit.endAt).minute
    : undefined;
  return {
    id: credit.id,
    date: isoDate(credit.localDate),
    durationMinutes: credit.durationMinutes,
    startMinute: start,
    endMinute: end,
    type: credit.type,
    approvalStatus: credit.approvalStatus,
  };
}

export function expectedMinutesForDate(
  settings: FullSettings,
  date: string,
): number {
  return (
    settings.workingPattern.days.find(
      (day) => day.weekday === weekdayIndex(date),
    )?.expectedMinutes ?? 0
  );
}

export async function getDay(date: string, settingsArg?: FullSettings) {
  return (await getDays([date], settingsArg))[0];
}

export async function getDays(dates: string[], settingsArg?: FullSettings) {
  const settings = settingsArg ?? (await ensureSettings());
  const localDates = dates.map(dateAtUtcMidnight);
  const [segments, credits, flexiLeave, completion, resolutions] =
    await Promise.all([
      prisma.timeSegment.findMany({
        where: { localDate: { in: localDates }, deletedAt: null },
        orderBy: { startAt: "asc" },
      }),
      prisma.authorisedCredit.findMany({
        where: { localDate: { in: localDates }, deletedAt: null },
        orderBy: { createdAt: "asc" },
      }),
      prisma.flexiLeave.findMany({
        where: { localDate: { in: localDates }, deletedAt: null },
        orderBy: { createdAt: "asc" },
      }),
      prisma.dailyCompletion.findMany({
        where: { localDate: { in: localDates } },
      }),
      prisma.findingResolution.findMany({
        where: { localDate: { in: localDates } },
      }),
    ]);
  const today = localDateAndMinute(new Date());
  return dates.map((date) => {
    const dateSegments = segments.filter(
      (item) => isoDate(item.localDate) === date,
    );
    const dateCredits = credits.filter(
      (item) => isoDate(item.localDate) === date,
    );
    const dateLeave = flexiLeave.filter(
      (item) => isoDate(item.localDate) === date,
    );
    const dateCompletion =
      completion.find((item) => isoDate(item.localDate) === date) ?? null;
    const dateResolutions = resolutions.filter(
      (item) => isoDate(item.localDate) === date,
    );
    const calculation = evaluateDay({
      date,
      expectedMinutes: expectedMinutesForDate(settings, date),
      segments: dateSegments.map(segmentToDomain),
      credits: dateCredits.map(creditToDomain),
      flexiLeave: dateLeave.map((item) => ({
        date,
        durationMinutes: item.durationMinutes,
        approvalStatus: item.approvalStatus,
      })),
      policy: settings.flexitimePolicy,
      isComplete: Boolean(dateCompletion),
      nowMinute: today.minute,
      openSegmentFromPreviousDay:
        date < today.date &&
        dateSegments.some((segment) => segment.endAt === null),
    });
    const resolutionMap = new Map(
      dateResolutions.map((item) => [item.ruleId, item]),
    );
    calculation.findings = calculation.findings.map((item) => {
      const resolution = resolutionMap.get(item.ruleId);
      if (!resolution) return item;
      return {
        ...item,
        approvalRecorded: resolution.approvalStatus !== "PENDING",
        severity:
          resolution.approvalStatus === "REFUSED"
            ? "BREACH"
            : resolution.approvalStatus === "APPROVED" ||
                resolution.approvalStatus === "NOT_REQUIRED"
              ? "WARNING"
              : item.severity,
      };
    });
    return {
      settings,
      segments: dateSegments,
      credits: dateCredits,
      flexiLeave: dateLeave,
      completion: dateCompletion,
      resolutions: dateResolutions,
      calculation,
    };
  });
}

export async function ensureAccountingPeriod(
  date: string,
  settingsArg?: FullSettings,
): Promise<AccountingPeriod> {
  const settings = settingsArg ?? (await ensureSettings());
  const anchor = isoDate(settings.accountingAnchorDate);
  const bounds = periodBounds(anchor, date);
  const found = await prisma.accountingPeriod.findUnique({
    where: { startDate: dateAtUtcMidnight(bounds.start) },
  });
  if (found) return found;
  const previousBounds = periodBounds(anchor, addDays(bounds.start, -1));
  const previous = await prisma.accountingPeriod.findUnique({
    where: { startDate: dateAtUtcMidnight(previousBounds.start) },
  });
  const openingBalanceMinutes = previous?.finalCarryoverMinutes ?? 0;
  return prisma.accountingPeriod.create({
    data: {
      startDate: dateAtUtcMidnight(bounds.start),
      endDate: dateAtUtcMidnight(bounds.end),
      openingBalanceMinutes,
      ledgerEntries: {
        create: {
          localDate: dateAtUtcMidnight(bounds.start),
          type: "OPENING_BALANCE",
          durationMinutes: openingBalanceMinutes,
          description:
            "Balance brought forward from the previous accounting period",
        },
      },
    },
  });
}

export async function assertDateIsEditable(date: string): Promise<void> {
  const period = await ensureAccountingPeriod(date);
  if (period.status === "LOCKED")
    throw new Error(
      "This accounting period is locked. Unlock it before editing records.",
    );
}

export async function getOpenTimeSegment(): Promise<TimeSegment | null> {
  return prisma.timeSegment.findFirst({
    where: { endAt: null, deletedAt: null },
  });
}

export async function rebuildDayLedger(date: string): Promise<void> {
  const settings = await ensureSettings();
  const period = await ensureAccountingPeriod(date, settings);
  const day = await getDay(date, settings);
  const localDate = dateAtUtcMidnight(date);
  await prisma.$transaction(async (transaction) => {
    await transaction.balanceLedgerEntry.deleteMany({
      where: {
        localDate,
        type: {
          in: ["DAILY_WORK_BALANCE", "AUTHORISED_CREDIT", "FLEXI_LEAVE"],
        },
      },
    });
    await transaction.balanceLedgerEntry.create({
      data: {
        localDate,
        accountingPeriodId: period.id,
        type: "DAILY_WORK_BALANCE",
        durationMinutes:
          day.calculation.confirmedEligibleMinutes -
          day.calculation.confirmedCreditMinutes -
          day.calculation.expectedMinutes,
        description: "Eligible actual work less expected time",
        provisional: date > nowInLondon().date,
      },
    });
    for (const credit of day.credits) {
      if (credit.approvalStatus === "REFUSED") continue;
      await transaction.balanceLedgerEntry.create({
        data: {
          localDate,
          accountingPeriodId: period.id,
          type: "AUTHORISED_CREDIT",
          durationMinutes: credit.durationMinutes,
          sourceType: "AuthorisedCredit",
          sourceId: credit.id,
          description: `Authorised credit: ${credit.type.toLowerCase().replaceAll("_", " ")}`,
          provisional: credit.approvalStatus === "PENDING",
        },
      });
    }
    for (const item of day.flexiLeave) {
      await transaction.balanceLedgerEntry.create({
        data: {
          localDate,
          accountingPeriodId: period.id,
          type: "FLEXI_LEAVE",
          durationMinutes: 0,
          sourceType: "FlexiLeave",
          sourceId: item.id,
          description: `Flexi leave recorded (${item.durationMinutes} minutes); impact is included through expected time`,
          provisional: item.approvalStatus !== "APPROVED",
        },
      });
    }
  });
}

async function rebuildPeriodLedger(
  period: AccountingPeriod,
  days: Array<Awaited<ReturnType<typeof getDay>>>,
) {
  const today = nowInLondon().date;
  const generated: Prisma.BalanceLedgerEntryCreateManyInput[] = [];
  for (const day of days) {
    generated.push({
      localDate: dateAtUtcMidnight(day.calculation.date),
      accountingPeriodId: period.id,
      type: "DAILY_WORK_BALANCE",
      durationMinutes:
        day.calculation.confirmedEligibleMinutes -
        day.calculation.confirmedCreditMinutes -
        day.calculation.expectedMinutes,
      description: "Eligible actual work less expected time",
      provisional: day.calculation.date > today,
    });
    for (const credit of day.credits) {
      if (credit.approvalStatus === "REFUSED") continue;
      generated.push({
        localDate: credit.localDate,
        accountingPeriodId: period.id,
        type: "AUTHORISED_CREDIT",
        durationMinutes: credit.durationMinutes,
        sourceType: "AuthorisedCredit",
        sourceId: credit.id,
        description: `Authorised credit: ${credit.type.toLowerCase().replaceAll("_", " ")}`,
        provisional:
          credit.approvalStatus === "PENDING" || day.calculation.date > today,
      });
    }
    for (const item of day.flexiLeave) {
      generated.push({
        localDate: item.localDate,
        accountingPeriodId: period.id,
        type: "FLEXI_LEAVE",
        durationMinutes: 0,
        sourceType: "FlexiLeave",
        sourceId: item.id,
        description: `Flexi leave recorded (${item.durationMinutes} minutes); impact is included through expected time`,
        provisional:
          item.approvalStatus !== "APPROVED" || day.calculation.date > today,
      });
    }
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.balanceLedgerEntry.deleteMany({
      where: {
        accountingPeriodId: period.id,
        type: {
          in: ["DAILY_WORK_BALANCE", "AUTHORISED_CREDIT", "FLEXI_LEAVE"],
        },
      },
    });
    if (generated.length)
      await transaction.balanceLedgerEntry.createMany({ data: generated });
  });
}

export async function getPeriod(date: string, settingsArg?: FullSettings) {
  const settings = settingsArg ?? (await ensureSettings());
  const period = await ensureAccountingPeriod(date, settings);
  const start = isoDate(period.startDate);
  const end = isoDate(period.endDate);
  const dayDates = Array.from({ length: 28 }, (_, index) =>
    addDays(start, index),
  );
  const days = await getDays(dayDates, settings);
  await rebuildPeriodLedger(period, days);
  const exceptional = await prisma.exceptionalCarryover.findFirst({
    where: { accountingPeriodId: period.id },
  });
  const previousDate = addDays(start, -1);
  const previousBounds = periodBounds(
    isoDate(settings.accountingAnchorDate),
    previousDate,
  );
  const previousPeriod = await prisma.accountingPeriod.findUnique({
    where: { startDate: dateAtUtcMidnight(previousBounds.start) },
    include: { exceptionalCarryovers: true },
  });
  const ledger = await prisma.balanceLedgerEntry.findMany({
    where: { accountingPeriodId: period.id },
    orderBy: [{ localDate: "asc" }, { createdAt: "asc" }],
  });
  const calculation = calculatePeriod({
    days: days.map((item) => item.calculation),
    openingBalanceMinutes: period.openingBalanceMinutes,
    standardDayMinutes: settings.standardDayMinutes,
    exceptionalCarryoverMinutes: exceptional?.approvedAmountMinutes,
    previousPeriodHadExceptionalCarryover: Boolean(
      previousPeriod?.exceptionalCarryovers.length,
    ),
    manualCorrectionMinutes: ledger
      .filter(
        (entry) => entry.type === "MANUAL_CORRECTION" && !entry.provisional,
      )
      .reduce((sum, entry) => sum + entry.durationMinutes, 0),
    balanceThroughDate: nowInLondon().date < end ? nowInLondon().date : end,
    date: end,
  });
  return { settings, period, days, calculation, exceptional, ledger };
}

export async function getWtr(asOfDate: string, settingsArg?: FullSettings) {
  const settings = settingsArg ?? (await ensureSettings());
  const windowStart = addDays(asOfDate, -118);
  const [firstSegment, firstCredit, firstLeave, firstCompletion] =
    await Promise.all([
      prisma.timeSegment.aggregate({
        where: {
          deletedAt: null,
          localDate: { lte: dateAtUtcMidnight(asOfDate) },
        },
        _min: { localDate: true },
      }),
      prisma.authorisedCredit.aggregate({
        where: {
          deletedAt: null,
          localDate: { lte: dateAtUtcMidnight(asOfDate) },
        },
        _min: { localDate: true },
      }),
      prisma.flexiLeave.aggregate({
        where: {
          deletedAt: null,
          localDate: { lte: dateAtUtcMidnight(asOfDate) },
        },
        _min: { localDate: true },
      }),
      prisma.dailyCompletion.aggregate({
        where: { localDate: { lte: dateAtUtcMidnight(asOfDate) } },
        _min: { localDate: true },
      }),
    ]);
  const representedStart = [
    localDateAndMinute(settings.createdAt).date,
    firstSegment._min.localDate ? isoDate(firstSegment._min.localDate) : null,
    firstCredit._min.localDate ? isoDate(firstCredit._min.localDate) : null,
    firstLeave._min.localDate ? isoDate(firstLeave._min.localDate) : null,
    firstCompletion._min.localDate
      ? isoDate(firstCompletion._min.localDate)
      : null,
  ]
    .filter(
      (candidate): candidate is string =>
        candidate !== null && candidate <= asOfDate,
    )
    .sort()[0];
  const start =
    representedStart && representedStart > windowStart
      ? representedStart
      : windowStart;
  const dates = Array.from(
    { length: daysBetween(start, asOfDate) + 1 },
    (_, index) => addDays(start, index),
  );
  const days = await getDays(dates, settings);
  return calculateWtrAverage(
    days.map((day) => ({
      date: day.calculation.date,
      actualWorkMinutes: day.calculation.actualWorkMinutes,
      complete:
        Boolean(day.completion) || day.calculation.expectedMinutes === 0,
    })),
    asOfDate,
    settings.warningThresholdMinutes,
  );
}

export function nowInLondon(): { date: string; minute: number } {
  return localDateAndMinute(new Date());
}

export type DayWithRecords = Awaited<ReturnType<typeof getDay>>;
export type PeriodWithRecords = Awaited<ReturnType<typeof getPeriod>>;
export type StoredFlexiLeave = FlexiLeave;
