import { describe, expect, it } from "vitest";
import { creditSchema, timeSegmentSchema } from "./validation";

const baseCredit = {
  date: "2026-07-20",
  type: "MEDICAL_APPOINTMENT" as const,
  note: "",
  approvalStatus: "APPROVED" as const,
  approvalDate: "",
  approvalNote: "",
};

describe("record validation", () => {
  it("accepts a credit duration without times", () => {
    expect(
      creditSchema.safeParse({
        ...baseCredit,
        durationMinutes: "45",
        startTime: "",
        endTime: "",
      }).success,
    ).toBe(true);
  });

  it("accepts ordered credit times without a separate duration", () => {
    expect(
      creditSchema.safeParse({
        ...baseCredit,
        durationMinutes: "",
        startTime: "10:45",
        endTime: "11:30",
      }).success,
    ).toBe(true);
  });

  it("rejects reversed or incomplete credit times", () => {
    expect(
      creditSchema.safeParse({
        ...baseCredit,
        durationMinutes: "",
        startTime: "11:30",
        endTime: "10:45",
      }).success,
    ).toBe(false);
    expect(
      creditSchema.safeParse({
        ...baseCredit,
        durationMinutes: "",
        startTime: "10:45",
        endTime: "",
      }).success,
    ).toBe(false);
  });

  it("requires a scheduled start and approval for rota boot-up", () => {
    const result = timeSegmentSchema.safeParse({
      date: "2026-07-20",
      startTime: "07:55",
      endTime: "08:00",
      type: "ROTA_BOOT_UP",
      note: "",
      approvalStatus: "NOT_REQUIRED",
      approvalDate: "",
      approvalNote: "",
      officialTravelConfirmed: false,
    });
    expect(result.success).toBe(false);
  });
});
