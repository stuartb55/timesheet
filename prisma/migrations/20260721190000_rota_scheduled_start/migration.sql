ALTER TABLE "TimeSegment"
  ADD COLUMN "scheduledStartMinutes" INTEGER;

UPDATE "TimeSegment"
SET "scheduledStartMinutes" =
  (EXTRACT(HOUR FROM (COALESCE("endAt", "startAt") AT TIME ZONE 'Europe/London'))::INTEGER * 60) +
  EXTRACT(MINUTE FROM (COALESCE("endAt", "startAt") AT TIME ZONE 'Europe/London'))::INTEGER
WHERE "type" = 'ROTA_BOOT_UP';

UPDATE "TimeSegment"
SET "agreedNormalFinishMinutes" =
  (EXTRACT(HOUR FROM ("startAt" AT TIME ZONE 'Europe/London'))::INTEGER * 60) +
  EXTRACT(MINUTE FROM ("startAt" AT TIME ZONE 'Europe/London'))::INTEGER
WHERE "type" = 'OVERTIME' AND "agreedNormalFinishMinutes" IS NULL;

ALTER TABLE "TimeSegment"
  ADD CONSTRAINT "TimeSegment_agreed_finish_minutes_check"
    CHECK ("agreedNormalFinishMinutes" IS NULL OR "agreedNormalFinishMinutes" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "TimeSegment_scheduled_start_minutes_check"
    CHECK ("scheduledStartMinutes" IS NULL OR "scheduledStartMinutes" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "TimeSegment_overtime_finish_check"
    CHECK ("type" <> 'OVERTIME' OR "agreedNormalFinishMinutes" IS NOT NULL),
  ADD CONSTRAINT "TimeSegment_rota_start_check"
    CHECK ("type" <> 'ROTA_BOOT_UP' OR "scheduledStartMinutes" IS NOT NULL);

ALTER TABLE "PersonalSettings"
  ADD CONSTRAINT "PersonalSettings_weekly_minutes_check"
    CHECK ("weeklyConditionedMinutes" BETWEEN 0 AND 10080),
  ADD CONSTRAINT "PersonalSettings_standard_day_minutes_check"
    CHECK ("standardDayMinutes" BETWEEN 1 AND 1440),
  ADD CONSTRAINT "PersonalSettings_warning_minutes_check"
    CHECK ("warningThresholdMinutes" BETWEEN 1 AND 10080);

ALTER TABLE "WorkingPatternDay"
  ADD CONSTRAINT "WorkingPatternDay_expected_minutes_upper_check"
    CHECK ("expectedMinutes" <= 1440),
  ADD CONSTRAINT "WorkingPatternDay_working_state_check"
    CHECK ("isWorkingDay" = ("expectedMinutes" > 0));

ALTER TABLE "AuthorisedCredit"
  DROP CONSTRAINT "AuthorisedCredit_times_check",
  ADD CONSTRAINT "AuthorisedCredit_duration_upper_check"
    CHECK ("durationMinutes" <= 1440),
  ADD CONSTRAINT "AuthorisedCredit_times_check"
    CHECK (
      ("startAt" IS NULL AND "endAt" IS NULL) OR
      ("startAt" IS NOT NULL AND "endAt" IS NOT NULL AND "endAt" > "startAt")
    );

ALTER TABLE "FlexiLeave"
  ADD CONSTRAINT "FlexiLeave_duration_upper_check"
    CHECK ("durationMinutes" <= 1440);
