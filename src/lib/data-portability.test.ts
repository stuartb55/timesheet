import { describe, expect, it } from "vitest";
import { parsePortableData } from "./data-portability";

const instant = "2026-07-24T12:00:00.000Z";

function validPayload() {
  return {
    format: "personal-flexitime-record",
    version: 1,
    exportedAt: instant,
    data: {
      workingPatterns: [
        {
          id: "pattern",
          name: "Current working pattern",
          createdAt: instant,
          updatedAt: instant,
        },
      ],
      workingPatternDays: Array.from({ length: 7 }, (_, weekday) => ({
        id: `day-${weekday}`,
        workingPatternId: "pattern",
        weekday,
        isWorkingDay: weekday < 5,
        expectedMinutes: weekday < 5 ? 444 : 0,
      })),
      flexitimePolicies: [
        {
          id: "policy",
          profile: "STANDARD_CORPORATE",
          startBandwidthMinutes: 450,
          morningCoreStartMinutes: 600,
          morningCoreEndMinutes: 720,
          lunchStartMinutes: 690,
          lunchEndMinutes: 870,
          afternoonCoreStartMinutes: 840,
          afternoonCoreEndMinutes: 960,
          finishBandwidthMinutes: 1140,
          rotaMode: false,
          bootUpAllowanceMinutes: 0,
          createdAt: instant,
          updatedAt: instant,
        },
      ],
      personalSettings: [
        {
          id: 1,
          name: null,
          weeklyConditionedMinutes: 2220,
          standardDayMinutes: 444,
          accountingAnchorDate: "2026-07-06T00:00:00.000Z",
          warningThresholdMinutes: 2700,
          defaultEntryMethod: "LIVE_CLOCK",
          dateFormat: "dd/MM/yyyy",
          timeFormat: "24h",
          workingPatternId: "pattern",
          flexitimePolicyId: "policy",
          setupComplete: true,
          createdAt: instant,
          updatedAt: instant,
        },
      ],
      accountingPeriods: [],
      timeSegments: [],
      authorisedCredits: [],
      flexiLeave: [],
      exceptionalCarryovers: [],
      dailyCompletions: [],
      ledgerEntries: [],
      findingResolutions: [],
      changeHistory: [],
      applicationSettings: [],
    },
  };
}

describe("portable data validation", () => {
  it("accepts a complete internally consistent export", () => {
    expect(parsePortableData(validPayload()).version).toBe(1);
  });

  it("rejects unknown fields instead of passing them to Prisma", () => {
    const payload = validPayload();
    Object.assign(payload.data.personalSettings[0], {
      unexpectedDatabaseField: "unsafe",
    });
    expect(() => parsePortableData(payload)).toThrow();
  });

  it("rejects broken relationships before replacing current data", () => {
    const payload = validPayload();
    payload.data.personalSettings[0].workingPatternId = "missing";
    expect(() => parsePortableData(payload)).toThrow(/missing working pattern/);
  });
});
