import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES } from "./defaults";
import { calculatePeriod, evaluateDay, periodEditDecision } from "./flexitime";
import {
  isValidIsoDate,
  londonWallTimeToUtc,
  localDateAndMinute,
  periodBounds,
} from "./time";
import type { DayInput, DomainSegment } from "./types";
import { calculateWtrAverage } from "./wtr";

const policy = DEFAULT_POLICIES.STANDARD_CORPORATE;
const date = "2026-07-20";

function segment(
  startMinute: number,
  endMinute: number | null,
  type: DomainSegment["type"] = "NORMAL_WORK",
  extra: Partial<DomainSegment> = {},
): DomainSegment {
  return { date, startMinute, endMinute, type, ...extra };
}

function normalSegments(): DomainSegment[] {
  return [
    segment(510, 750),
    segment(750, 780, "LUNCH_BREAK"),
    segment(780, 984),
  ];
}

function day(overrides: Partial<DayInput> = {}) {
  return evaluateDay({
    date,
    expectedMinutes: 444,
    segments: normalSegments(),
    policy,
    isComplete: true,
    ...overrides,
  });
}

describe("daily flexitime calculation and policy evaluation", () => {
  it("1. calculates a normal compliant working day", () => {
    const result = day();
    expect(result.confirmedEligibleMinutes).toBe(444);
    expect(result.confirmedBalanceChange).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("2. totals multiple work periods without treating gaps as lunch", () => {
    const result = day({
      segments: [
        segment(510, 645),
        segment(645, 690, "OTHER_UNPAID_BREAK"),
        segment(690, 750),
        segment(750, 780, "LUNCH_BREAK"),
        segment(780, 1029),
      ],
    });
    expect(result.normalWorkMinutes).toBe(444);
    expect(result.breakMinutes).toBe(75);
  });

  it("3. finds a start before the permitted bandwidth", () => {
    expect(
      day({
        segments: [
          segment(440, 750),
          segment(750, 780, "LUNCH_BREAK"),
          segment(780, 914),
        ],
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "OUTSIDE_START_BANDWIDTH" }),
      ]),
    );
  });

  it("4. finds a start after morning core time begins", () => {
    expect(day({ segments: [segment(605, 970)] }).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "OUTSIDE_START_BANDWIDTH" }),
      ]),
    );
  });

  it("5. finds a finish before afternoon core time ends", () => {
    expect(
      day({
        segments: [
          segment(510, 750),
          segment(750, 780, "LUNCH_BREAK"),
          segment(780, 950),
        ],
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "OUTSIDE_FINISH_BANDWIDTH" }),
      ]),
    );
  });

  it("6. finds a finish after the permitted bandwidth", () => {
    expect(
      day({
        segments: [
          segment(600, 750),
          segment(750, 780, "LUNCH_BREAK"),
          segment(780, 1171),
        ],
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "OUTSIDE_FINISH_BANDWIDTH" }),
      ]),
    );
  });

  it("7. finds absence during morning core time", () => {
    expect(
      day({
        segments: [
          segment(510, 630),
          segment(660, 750),
          segment(750, 780, "LUNCH_BREAK"),
          segment(780, 1014),
        ],
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "MISSING_MORNING_CORE_TIME" }),
      ]),
    );
  });

  it("8. finds absence during afternoon core time", () => {
    expect(
      day({
        segments: [
          segment(510, 750),
          segment(750, 780, "LUNCH_BREAK"),
          segment(780, 900),
          segment(930, 1014),
        ],
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "MISSING_AFTERNOON_CORE_TIME" }),
      ]),
    );
  });

  it("9. finds lunch before 11:30", () => {
    expect(
      day({
        segments: [
          segment(510, 660),
          segment(660, 690, "LUNCH_BREAK"),
          segment(690, 984),
        ],
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "LUNCH_STARTED_EARLY" }),
      ]),
    );
  });

  it("10. finds lunch longer than two hours", () => {
    expect(
      day({
        segments: [
          segment(510, 690),
          segment(690, 811, "LUNCH_BREAK"),
          segment(811, 1075),
        ],
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "LUNCH_TOO_LONG" }),
      ]),
    );
  });

  it("11. finds lunch ending after 14:30", () => {
    expect(
      day({
        segments: [
          segment(510, 750),
          segment(750, 871, "LUNCH_BREAK"),
          segment(871, 1135),
        ],
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "LUNCH_ENDED_LATE" }),
      ]),
    );
  });

  it("12. requires 30 minutes of break for a six-hour shift", () => {
    expect(day({ segments: [segment(600, 970)] }).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "INSUFFICIENT_BREAK" }),
      ]),
    );
  });

  it("13. does not apply the break rule just below six hours", () => {
    expect(
      day({ segments: [segment(600, 959)] }).findings.some(
        (item) => item.ruleId === "INSUFFICIENT_BREAK",
      ),
    ).toBe(false);
  });

  it("14. counts a full-day authorised credit", () => {
    const result = day({
      segments: [],
      credits: [
        {
          date,
          durationMinutes: 444,
          type: "ANNUAL_LEAVE",
          approvalStatus: "APPROVED",
        },
      ],
    });
    expect(result.confirmedBalanceChange).toBe(0);
  });

  it("15. counts a partial medical appointment credit", () => {
    const result = day({
      segments: [segment(510, 909)],
      credits: [
        {
          date,
          durationMinutes: 45,
          type: "MEDICAL_APPOINTMENT",
          approvalStatus: "APPROVED",
        },
      ],
    });
    expect(result.confirmedEligibleMinutes).toBe(444);
  });

  it("16. excludes an unapproved credit from confirmed balance and shows it provisionally", () => {
    const result = day({
      segments: [],
      credits: [
        {
          date,
          durationMinutes: 444,
          type: "ANNUAL_LEAVE",
          approvalStatus: "PENDING",
        },
      ],
    });
    expect(result.confirmedBalanceChange).toBe(-444);
    expect(result.provisionalBalanceChange).toBe(0);
  });

  it("17. treats transport disruption below 30 minutes as time to make up while pending", () => {
    const result = day({
      segments: [segment(510, 930)],
      credits: [
        {
          date,
          durationMinutes: 24,
          type: "SIGNIFICANT_TRANSPORT_DISRUPTION",
          approvalStatus: "PENDING",
        },
      ],
    });
    expect(result.confirmedBalanceChange).toBe(-24);
    expect(result.provisionalBalanceChange).toBe(-24);
  });

  it("18. shows a 30-minute travel disruption request provisionally", () => {
    const result = day({
      segments: [segment(510, 924)],
      credits: [
        {
          date,
          durationMinutes: 30,
          type: "SIGNIFICANT_TRANSPORT_DISRUPTION",
          approvalStatus: "PENDING",
        },
      ],
    });
    expect(result.provisionalBalanceChange).toBe(0);
  });

  it("19. includes confirmed official weekday travel", () => {
    const result = day({
      segments: [
        segment(510, 750),
        segment(750, 780, "LUNCH_BREAK"),
        segment(780, 984, "OFFICIAL_TRAVEL", {
          officialTravelConfirmed: true,
          approvalStatus: "APPROVED",
        }),
      ],
    });
    expect(result.travelMinutes).toBe(204);
    expect(result.actualWorkMinutes).toBe(444);
  });

  it("20. includes weekend official travel against zero expected time", () => {
    const result = day({
      date: "2026-07-19",
      expectedMinutes: 0,
      segments: [
        segment(600, 720, "OFFICIAL_TRAVEL", {
          officialTravelConfirmed: true,
          approvalStatus: "NOT_REQUIRED",
        }),
      ],
    });
    expect(result.confirmedBalanceChange).toBe(120);
  });

  it("21. excludes overtime from flexitime", () => {
    const result = day({
      segments: [
        ...normalSegments(),
        segment(1020, 1080, "OVERTIME", { approvalStatus: "APPROVED" }),
      ],
    });
    expect(result.confirmedBalanceChange).toBe(0);
    expect(result.overtimeMinutes).toBe(60);
  });

  it("22. includes overtime in actual working time used by WTR", () => {
    const result = day({
      segments: [...normalSegments(), segment(1020, 1080, "OVERTIME")],
    });
    expect(result.actualWorkMinutes).toBe(504);
  });

  it("23. full-day flexi leave reduces balance through unmet expected time", () => {
    const result = day({
      segments: [],
      flexiLeave: [{ date, durationMinutes: 444 }],
    });
    expect(result.flexiLeaveMinutes).toBe(444);
    expect(result.confirmedBalanceChange).toBe(-444);
  });

  it("24. records half-day flexi leave without crediting it", () => {
    const result = day({
      segments: [segment(510, 732)],
      flexiLeave: [{ date, durationMinutes: 222 }],
    });
    expect(result.flexiLeaveMinutes).toBe(222);
    expect(result.confirmedBalanceChange).toBe(-222);
  });

  it("37. counts five minutes of rota boot-up time", () => {
    const result = day({
      policy: { ...DEFAULT_POLICIES.SERVICE_SUPPORT, rotaMode: true },
      segments: [
        ...normalSegments(),
        segment(505, 510, "ROTA_BOOT_UP", {
          approvalStatus: "APPROVED",
          scheduledStartMinute: 510,
        }),
      ],
    });
    expect(result.confirmedEligibleMinutes).toBe(449);
    expect(
      result.findings.some((item) => item.ruleId === "BOOT_UP_LIMIT_EXCEEDED"),
    ).toBe(false);
  });

  it("38. caps and warns for more than five minutes of boot-up time", () => {
    const result = day({
      policy: { ...DEFAULT_POLICIES.SERVICE_SUPPORT, rotaMode: true },
      segments: [
        ...normalSegments(),
        segment(500, 510, "ROTA_BOOT_UP", {
          approvalStatus: "APPROVED",
          scheduledStartMinute: 510,
        }),
      ],
    });
    expect(result.confirmedEligibleMinutes).toBe(449);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "BOOT_UP_LIMIT_EXCEEDED" }),
      ]),
    );
  });

  it("caps split rota boot-up segments across the whole day", () => {
    const result = day({
      policy: { ...DEFAULT_POLICIES.SERVICE_SUPPORT, rotaMode: true },
      segments: [
        ...normalSegments(),
        segment(500, 505, "ROTA_BOOT_UP", {
          approvalStatus: "APPROVED",
          scheduledStartMinute: 505,
        }),
        segment(505, 510, "ROTA_BOOT_UP", {
          approvalStatus: "APPROVED",
          scheduledStartMinute: 510,
        }),
      ],
    });
    expect(result.confirmedEligibleMinutes).toBe(449);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "BOOT_UP_LIMIT_EXCEEDED" }),
      ]),
    );
  });

  it("does not treat valid boot-up time as the bandwidth start", () => {
    const result = day({
      policy: { ...DEFAULT_POLICIES.SERVICE_SUPPORT, rotaMode: true },
      segments: [
        ...normalSegments(),
        segment(505, 510, "ROTA_BOOT_UP", {
          approvalStatus: "APPROVED",
          scheduledStartMinute: 510,
        }),
      ],
    });
    expect(
      result.findings.some((item) => item.ruleId === "OUTSIDE_START_BANDWIDTH"),
    ).toBe(false);
  });

  it("39. identifies overlapping time entries", () => {
    const result = day({ segments: [segment(510, 750), segment(700, 900)] });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "OVERLAPPING_TIME_SEGMENTS" }),
      ]),
    );
  });

  it("40. identifies an open segment continuing overnight", () => {
    const result = day({
      segments: [segment(510, null)],
      isComplete: false,
      openSegmentFromPreviousDay: true,
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "OPEN_TIME_SEGMENT",
          severity: "BREACH",
        }),
      ]),
    );
  });

  it("41. converts Europe/London times correctly across daylight-saving changes", () => {
    const beforeChange = londonWallTimeToUtc("2026-03-28", 9 * 60);
    const afterChange = londonWallTimeToUtc("2026-03-30", 9 * 60);
    expect(beforeChange.toISOString()).toContain("T09:00:00.000Z");
    expect(afterChange.toISOString()).toContain("T08:00:00.000Z");
    expect(localDateAndMinute(afterChange)).toEqual({
      date: "2026-03-30",
      minute: 540,
    });
  });

  it("finds every nested overlap", () => {
    const result = day({
      segments: [segment(500, 900), segment(510, 520), segment(600, 610)],
    });
    expect(
      result.findings.find(
        (item) => item.ruleId === "OVERLAPPING_TIME_SEGMENTS",
      )?.affected?.count,
    ).toBe(2);
  });

  it("excludes refused official travel from flexitime and WTR time", () => {
    const result = day({
      expectedMinutes: 0,
      segments: [
        segment(600, 720, "OFFICIAL_TRAVEL", {
          officialTravelConfirmed: true,
          approvalStatus: "REFUSED",
        }),
      ],
    });
    expect(result.travelMinutes).toBe(0);
    expect(result.actualWorkMinutes).toBe(0);
  });

  it("keeps pending flexi leave provisional and excludes refused leave", () => {
    const result = day({
      segments: [],
      flexiLeave: [
        { date, durationMinutes: 222, approvalStatus: "PENDING" },
        { date, durationMinutes: 222, approvalStatus: "REFUSED" },
      ],
    });
    expect(result.flexiLeaveMinutes).toBe(0);
    expect(result.provisionalFlexiLeaveMinutes).toBe(222);
  });

  it("does not treat an empty completed working day as compliant", () => {
    expect(day({ segments: [], isComplete: true }).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "INCOMPLETE_TIME_RECORD",
          severity: "BREACH",
        }),
      ]),
    );
  });

  it("accepts approved whole-day flexi leave without an empty-day breach", () => {
    const result = day({
      segments: [],
      isComplete: true,
      flexiLeave: [{ date, durationMinutes: 444, approvalStatus: "APPROVED" }],
    });
    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "INCOMPLETE_TIME_RECORD",
          severity: "BREACH",
        }),
      ]),
    );
  });

  it("combines separate approved absences to cover a whole day", () => {
    const result = day({
      segments: [],
      isComplete: true,
      credits: [
        {
          date,
          durationMinutes: 222,
          type: "ANNUAL_LEAVE",
          approvalStatus: "APPROVED",
        },
        {
          date,
          durationMinutes: 222,
          type: "OTHER_AUTHORISED_ABSENCE",
          approvalStatus: "APPROVED",
        },
      ],
    });
    expect(
      result.findings.some(
        (item) =>
          item.ruleId === "INCOMPLETE_TIME_RECORD" &&
          item.severity === "BREACH",
      ),
    ).toBe(false);
  });

  it("rejects invalid calendar dates and non-existent London wall times", () => {
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(() => londonWallTimeToUtc("2026-03-29", 90)).toThrow(
      /clocks change/,
    );
  });

  it("represents both occurrences of a repeated autumn wall time", () => {
    const earlier = londonWallTimeToUtc("2026-10-25", 90, "earlier");
    const later = londonWallTimeToUtc("2026-10-25", 90, "later");
    expect(earlier.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(later.toISOString()).toBe("2026-10-25T01:30:00.000Z");
  });

  it("includes elapsed live work and break time in current estimates", () => {
    const working = day({
      segments: [segment(510, null)],
      nowMinute: 570,
      isComplete: false,
    });
    expect(working.normalWorkMinutes).toBe(60);
    expect(working.confirmedEligibleMinutes).toBe(60);

    const breakResult = day({
      segments: [segment(510, 555), segment(555, null, "LUNCH_BREAK")],
      nowMinute: 570,
      isComplete: false,
    });
    expect(breakResult.breakMinutes).toBe(15);
  });

  it("flags a closed time segment that crosses a calendar date", () => {
    const result = day({
      segments: [segment(1380, 1920, "NORMAL_WORK", { endDate: "2026-07-21" })],
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "INCOMPLETE_TIME_RECORD",
          severity: "BREACH",
        }),
      ]),
    );
  });
});

describe("accounting period and carryover", () => {
  const blank = () => day({ segments: [], expectedMinutes: 0 });
  const period = (
    balance: number,
    extra: Partial<Parameters<typeof calculatePeriod>[0]> = {},
  ) =>
    calculatePeriod({
      days: [],
      openingBalanceMinutes: balance,
      standardDayMinutes: 444,
      date,
      ...extra,
    });

  it("25. warns when more than two standard days of flexi leave are taken", () => {
    const leaveDay = day({
      segments: [],
      expectedMinutes: 0,
      flexiLeave: [{ date, durationMinutes: 889 }],
    });
    expect(
      calculatePeriod({
        days: [leaveDay],
        openingBalanceMinutes: 0,
        standardDayMinutes: 444,
        date,
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "FLEXI_LEAVE_LIMIT_EXCEEDED" }),
      ]),
    );
  });
  it("26. carries credit exactly at three standard days", () =>
    expect(period(1332).excessCreditMinutes).toBe(0));
  it("27. caps credit above three standard days", () => {
    const result = period(1333);
    expect(result.proposedCarryoverMinutes).toBe(1332);
    expect(result.excessCreditMinutes).toBe(1);
  });
  it("28. carries debit exactly at two standard days", () =>
    expect(period(-888).excessDebitMinutes).toBe(0));
  it("29. caps debit above two standard days", () => {
    const result = period(-889);
    expect(result.proposedCarryoverMinutes).toBe(-888);
    expect(result.excessDebitMinutes).toBe(1);
  });
  it("30. uses an externally approved exceptional carryover", () =>
    expect(
      period(1400, { exceptionalCarryoverMinutes: 1400 }).finalCarryoverMinutes,
    ).toBe(1400));
  it("allows an explicitly approved zero exceptional carryover", () =>
    expect(
      period(1400, { exceptionalCarryoverMinutes: 0 }).finalCarryoverMinutes,
    ).toBe(0));
  it("31. warns for successive exceptional carryover", () =>
    expect(
      period(1400, {
        exceptionalCarryoverMinutes: 1400,
        previousPeriodHadExceptionalCarryover: true,
      }).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "SUCCESSIVE_EXCEPTIONAL_CARRYOVER" }),
      ]),
    ));
  it("32. supports a part-time expected day", () =>
    expect(
      day({ expectedMinutes: 360, segments: [segment(510, 870)] })
        .confirmedBalanceChange,
    ).toBe(0));
  it("33. supports irregular expected hours", () =>
    expect(
      day({
        expectedMinutes: 480,
        segments: [
          segment(510, 750),
          segment(750, 780, "LUNCH_BREAK"),
          segment(780, 1020),
        ],
      }).confirmedBalanceChange,
    ).toBe(0));
  it("42. requires confirmation and reason to unlock a period", () => {
    expect(periodEditDecision("LOCKED", false, "").allowed).toBe(false);
    expect(
      periodEditDecision("LOCKED", true, "Correction needed").allowed,
    ).toBe(true);
  });
  it("43. includes a reasoned manual balance correction", () =>
    expect(
      period(0, { manualCorrectionMinutes: 30 }).rawClosingBalanceMinutes,
    ).toBe(30));
  it("44. preserves balances through JSON serialisation used by export/import", () => {
    const before = period(120, { manualCorrectionMinutes: -10 });
    const restored = JSON.parse(JSON.stringify(before)) as typeof before;
    expect(restored.rawClosingBalanceMinutes).toBe(
      before.rawClosingBalanceMinutes,
    );
  });
  it("maps dates to consecutive 28-day periods", () =>
    expect(periodBounds("2026-01-05", "2026-02-02")).toEqual({
      start: "2026-02-02",
      end: "2026-03-01",
    }));
  it("keeps a zero-work non-working day neutral", () =>
    expect(blank().confirmedBalanceChange).toBe(0));
});

describe("Working Time Regulations", () => {
  const days = (weeklyMinutes: number, complete = true) =>
    Array.from({ length: 119 }, () => ({
      date,
      actualWorkMinutes: weeklyMinutes / 7,
      complete,
    }));
  it("34. reports a 17-week average below 48 hours", () =>
    expect(calculateWtrAverage(days(44 * 60), date).averageWeeklyMinutes).toBe(
      44 * 60,
    ));
  it("35. warns when the 17-week average exceeds 48 hours", () =>
    expect(calculateWtrAverage(days(49 * 60), date).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "WTR_AVERAGE_EXCEEDED" }),
      ]),
    ));
  it("36. marks the result unreliable when records are incomplete", () =>
    expect(calculateWtrAverage(days(40 * 60, false), date).reliable).toBe(
      false,
    ));
  it("counts only seven-day groups whose records are all complete", () => {
    const records = days(40 * 60);
    records[8].complete = false;
    expect(calculateWtrAverage(records, date).completeWeeks).toBe(16);
  });
  it("uses the represented fraction of a week for a new record", () => {
    expect(
      calculateWtrAverage(
        [{ date, actualWorkMinutes: 8 * 60, complete: true }],
        date,
      ).averageWeeklyMinutes,
    ).toBe(56 * 60);
  });
});
