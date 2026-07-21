import type { PolicyTimes } from "./types";

export type PolicyProfileName =
  "STANDARD_CORPORATE" | "SERVICE_SUPPORT" | "VOICE_CONTACT_CENTRE";

export const DEFAULT_POLICIES: Record<PolicyProfileName, PolicyTimes> = {
  STANDARD_CORPORATE: {
    startBandwidthMinutes: 7 * 60 + 30,
    morningCoreStartMinutes: 10 * 60,
    morningCoreEndMinutes: 11 * 60 + 30,
    lunchStartMinutes: 11 * 60 + 30,
    lunchEndMinutes: 14 * 60 + 30,
    afternoonCoreStartMinutes: 14 * 60 + 30,
    afternoonCoreEndMinutes: 16 * 60,
    finishBandwidthMinutes: 19 * 60 + 30,
    rotaMode: false,
    bootUpAllowanceMinutes: 0,
  },
  SERVICE_SUPPORT: {
    startBandwidthMinutes: 8 * 60,
    morningCoreStartMinutes: 10 * 60,
    morningCoreEndMinutes: 11 * 60 + 30,
    lunchStartMinutes: 11 * 60 + 30,
    lunchEndMinutes: 14 * 60 + 30,
    afternoonCoreStartMinutes: 14 * 60 + 30,
    afternoonCoreEndMinutes: 16 * 60,
    finishBandwidthMinutes: 18 * 60 + 30,
    rotaMode: false,
    bootUpAllowanceMinutes: 5,
  },
  VOICE_CONTACT_CENTRE: {
    startBandwidthMinutes: 7 * 60 + 30,
    morningCoreStartMinutes: 10 * 60,
    morningCoreEndMinutes: 11 * 60 + 30,
    lunchStartMinutes: 11 * 60 + 30,
    lunchEndMinutes: 14 * 60 + 30,
    afternoonCoreStartMinutes: 14 * 60 + 30,
    afternoonCoreEndMinutes: 16 * 60,
    finishBandwidthMinutes: 18 * 60 + 30,
    rotaMode: false,
    bootUpAllowanceMinutes: 0,
  },
};

export const DEFAULT_WEEKLY_PATTERN = [444, 444, 444, 444, 444, 0, 0] as const;
