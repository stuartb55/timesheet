import { z } from "zod";
import { isValidIsoDate } from "@/domain/time";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine(isValidIsoDate, "Enter a valid date");
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time in 24-hour format");
const optionalText = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((value) => value || undefined);

export const settingsSchema = z
  .object({
    name: z.string().trim().max(200).optional(),
    weeklyConditionedMinutes: z.coerce.number().int().min(0).max(10_080),
    standardDayMinutes: z.coerce.number().int().min(1).max(1440),
    accountingAnchorDate: date,
    warningThresholdMinutes: z.coerce.number().int().min(1).max(2880),
    defaultEntryMethod: z.enum(["LIVE_CLOCK", "MANUAL"]),
    dateFormat: z.enum(["dd/MM/yyyy", "d MMMM yyyy", "yyyy-MM-dd"]),
    timeFormat: z.literal("24h"),
    profile: z.enum([
      "STANDARD_CORPORATE",
      "SERVICE_SUPPORT",
      "VOICE_CONTACT_CENTRE",
    ]),
    rotaMode: z.boolean(),
    startBandwidthMinutes: z.coerce.number().int().min(0).max(1439),
    morningCoreStartMinutes: z.coerce.number().int().min(0).max(1439),
    morningCoreEndMinutes: z.coerce.number().int().min(0).max(1439),
    lunchStartMinutes: z.coerce.number().int().min(0).max(1439),
    lunchEndMinutes: z.coerce.number().int().min(0).max(1439),
    afternoonCoreStartMinutes: z.coerce.number().int().min(0).max(1439),
    afternoonCoreEndMinutes: z.coerce.number().int().min(0).max(1439),
    finishBandwidthMinutes: z.coerce.number().int().min(0).max(1439),
    bootUpAllowanceMinutes: z.coerce.number().int().min(0).max(60),
    expectedMinutes: z
      .array(z.coerce.number().int().min(0).max(1440))
      .length(7),
  })
  .superRefine((value, context) => {
    if (value.profile === "STANDARD_CORPORATE" && value.rotaMode) {
      context.addIssue({
        code: "custom",
        message: "Rota mode is available only for exception policy profiles",
        path: ["rotaMode"],
      });
    }
    const policyTimes = [
      value.startBandwidthMinutes,
      value.morningCoreStartMinutes,
      value.morningCoreEndMinutes,
      value.lunchStartMinutes,
      value.lunchEndMinutes,
      value.afternoonCoreStartMinutes,
      value.afternoonCoreEndMinutes,
      value.finishBandwidthMinutes,
    ];
    if (
      policyTimes.some(
        (item, index) => index > 0 && item < policyTimes[index - 1],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Policy times must be in chronological order",
      });
    }
    if (
      value.expectedMinutes.reduce((sum, minutes) => sum + minutes, 0) !==
      value.weeklyConditionedMinutes
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Expected minutes for the week must equal weekly conditioned minutes",
        path: ["expectedMinutes"],
      });
    }
  });

export const timeSegmentSchema = z
  .object({
    id: z.string().optional(),
    date,
    startTime: time,
    endTime: time,
    type: z.enum([
      "NORMAL_WORK",
      "OFFICIAL_TRAVEL",
      "OVERTIME",
      "ROTA_BOOT_UP",
      "LUNCH_BREAK",
      "OTHER_UNPAID_BREAK",
    ]),
    note: optionalText,
    approvalStatus: z.enum(["NOT_REQUIRED", "PENDING", "APPROVED", "REFUSED"]),
    approvalDate: date.optional().or(z.literal("")),
    approvalNote: optionalText,
    officialTravelConfirmed: z.boolean(),
    agreedNormalFinishMinutes: z.coerce
      .number()
      .int()
      .min(0)
      .max(1439)
      .optional(),
    scheduledStartMinutes: z.coerce.number().int().min(0).max(1439).optional(),
  })
  .superRefine((value, context) => {
    if (value.endTime <= value.startTime) {
      context.addIssue({
        code: "custom",
        message: "Finish time must be after start time",
        path: ["endTime"],
      });
    }
    if (value.type === "OFFICIAL_TRAVEL" && !value.officialTravelConfirmed) {
      context.addIssue({
        code: "custom",
        message: "Confirm that this was official travel",
        path: ["type"],
      });
    }
    if (
      value.type === "OVERTIME" &&
      value.agreedNormalFinishMinutes === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter the agreed normal finishing time",
        path: ["type"],
      });
    }
    if (
      value.type === "ROTA_BOOT_UP" &&
      value.scheduledStartMinutes === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter the scheduled rota start time",
        path: ["type"],
      });
    }
    if (value.type === "ROTA_BOOT_UP" && value.approvalStatus !== "APPROVED") {
      context.addIssue({
        code: "custom",
        message: "Record external approval for rota boot-up time",
        path: ["approvalStatus"],
      });
    }
  });

export const creditSchema = z
  .object({
    id: z.string().optional(),
    date,
    durationMinutes: z.preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z.coerce.number().int().positive().max(1440).optional(),
    ),
    startTime: time.optional().or(z.literal("")),
    endTime: time.optional().or(z.literal("")),
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
    note: optionalText,
    approvalStatus: z.enum(["NOT_REQUIRED", "PENDING", "APPROVED", "REFUSED"]),
    approvalDate: date.optional().or(z.literal("")),
    approvalNote: optionalText,
  })
  .superRefine((value, context) => {
    const hasStart = Boolean(value.startTime);
    const hasEnd = Boolean(value.endTime);
    if (hasStart !== hasEnd) {
      context.addIssue({
        code: "custom",
        message: "Enter both start and finish times, or leave both blank",
        path: [hasStart ? "endTime" : "startTime"],
      });
    }
    if (value.startTime && value.endTime && value.endTime <= value.startTime) {
      context.addIssue({
        code: "custom",
        message: "Finish time must be after start time",
        path: ["endTime"],
      });
    }
    if (!hasStart && value.durationMinutes === undefined) {
      context.addIssue({
        code: "custom",
        message: "Enter a duration or start and finish times",
        path: ["durationMinutes"],
      });
    }
  });

export const flexiLeaveSchema = z.object({
  id: z.string().optional(),
  date,
  durationMinutes: z.coerce.number().int().positive().max(1440),
  kind: z.enum(["FULL_DAY", "HALF_DAY", "PARTIAL"]),
  note: optionalText,
  approvalStatus: z.enum(["PENDING", "APPROVED", "REFUSED"]),
  approvalDate: date.optional().or(z.literal("")),
});
