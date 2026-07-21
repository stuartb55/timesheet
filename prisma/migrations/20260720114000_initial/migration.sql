-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PolicyProfile" AS ENUM ('STANDARD_CORPORATE', 'SERVICE_SUPPORT', 'VOICE_CONTACT_CENTRE');

-- CreateEnum
CREATE TYPE "DefaultEntryMethod" AS ENUM ('LIVE_CLOCK', 'MANUAL');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'COMPLETE', 'CHECKED', 'LOCKED');

-- CreateEnum
CREATE TYPE "SegmentType" AS ENUM ('NORMAL_WORK', 'OFFICIAL_TRAVEL', 'OVERTIME', 'ROTA_BOOT_UP', 'LUNCH_BREAK', 'OTHER_UNPAID_BREAK');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REFUSED');

-- CreateEnum
CREATE TYPE "CreditType" AS ENUM ('ANNUAL_LEAVE', 'SICK_ABSENCE', 'PUBLIC_HOLIDAY', 'PRIVILEGE_DAY', 'TRAINING', 'TRADE_UNION_FACILITY_TIME', 'MEDICAL_APPOINTMENT', 'DOCTOR', 'DENTIST', 'HOSPITAL', 'OPTICIAN', 'PRE_NATAL_APPOINTMENT', 'OFFICIAL_TRAVEL', 'SIGNIFICANT_TRANSPORT_DISRUPTION', 'OTHER_AUTHORISED_ABSENCE');

-- CreateEnum
CREATE TYPE "FlexiLeaveKind" AS ENUM ('FULL_DAY', 'HALF_DAY', 'PARTIAL');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('OPENING_BALANCE', 'DAILY_WORK_BALANCE', 'AUTHORISED_CREDIT', 'FLEXI_LEAVE', 'CARRYOVER_ADJUSTMENT', 'CREDIT_LOST', 'EXCEPTIONAL_CARRYOVER', 'MANUAL_CORRECTION');

-- CreateEnum
CREATE TYPE "HistoryAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'LOCKED', 'UNLOCKED', 'IMPORTED');

-- CreateTable
CREATE TABLE "PersonalSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT,
    "weeklyConditionedMinutes" INTEGER NOT NULL,
    "standardDayMinutes" INTEGER NOT NULL,
    "accountingAnchorDate" DATE NOT NULL,
    "warningThresholdMinutes" INTEGER NOT NULL DEFAULT 2700,
    "defaultEntryMethod" "DefaultEntryMethod" NOT NULL DEFAULT 'LIVE_CLOCK',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "timeFormat" TEXT NOT NULL DEFAULT '24h',
    "workingPatternId" TEXT NOT NULL,
    "flexitimePolicyId" TEXT NOT NULL,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingPattern" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Current working pattern',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingPatternDay" (
    "id" TEXT NOT NULL,
    "workingPatternId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT true,
    "expectedMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkingPatternDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlexitimePolicy" (
    "id" TEXT NOT NULL,
    "profile" "PolicyProfile" NOT NULL,
    "startBandwidthMinutes" INTEGER NOT NULL,
    "morningCoreStartMinutes" INTEGER NOT NULL,
    "morningCoreEndMinutes" INTEGER NOT NULL,
    "lunchStartMinutes" INTEGER NOT NULL,
    "lunchEndMinutes" INTEGER NOT NULL,
    "afternoonCoreStartMinutes" INTEGER NOT NULL,
    "afternoonCoreEndMinutes" INTEGER NOT NULL,
    "finishBandwidthMinutes" INTEGER NOT NULL,
    "rotaMode" BOOLEAN NOT NULL DEFAULT false,
    "bootUpAllowanceMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlexitimePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "openingBalanceMinutes" INTEGER NOT NULL DEFAULT 0,
    "finalCarryoverMinutes" INTEGER,
    "carryoverConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "checkedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "unlockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSegment" (
    "id" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "type" "SegmentType" NOT NULL,
    "note" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approvalDate" DATE,
    "approvalNote" TEXT,
    "officialTravelConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "agreedNormalFinishMinutes" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorisedCredit" (
    "id" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "type" "CreditType" NOT NULL,
    "note" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approvalDate" DATE,
    "approvalNote" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorisedCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlexiLeave" (
    "id" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "kind" "FlexiLeaveKind" NOT NULL,
    "note" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvalDate" DATE,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlexiLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionalCarryover" (
    "id" TEXT NOT NULL,
    "accountingPeriodId" TEXT NOT NULL,
    "approvedAmountMinutes" INTEGER NOT NULL,
    "approvalDate" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionalCarryover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCompletion" (
    "id" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChangedAfterAt" TIMESTAMP(3),

    CONSTRAINT "DailyCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceLedgerEntry" (
    "id" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "accountingPeriodId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "description" TEXT NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingResolution" (
    "id" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "ruleId" TEXT NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL,
    "note" TEXT,
    "approvalDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FindingResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeHistory" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" "HistoryAction" NOT NULL,
    "previousValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT,

    CONSTRAINT "ChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalSettings_workingPatternId_key" ON "PersonalSettings"("workingPatternId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalSettings_flexitimePolicyId_key" ON "PersonalSettings"("flexitimePolicyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingPatternDay_workingPatternId_weekday_key" ON "WorkingPatternDay"("workingPatternId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_startDate_key" ON "AccountingPeriod"("startDate");

-- CreateIndex
CREATE INDEX "AccountingPeriod_startDate_endDate_idx" ON "AccountingPeriod"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "AccountingPeriod_status_idx" ON "AccountingPeriod"("status");

-- CreateIndex
CREATE INDEX "TimeSegment_localDate_idx" ON "TimeSegment"("localDate");

-- CreateIndex
CREATE INDEX "TimeSegment_startAt_endAt_idx" ON "TimeSegment"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "TimeSegment_endAt_idx" ON "TimeSegment"("endAt");

-- CreateIndex
CREATE INDEX "TimeSegment_approvalStatus_idx" ON "TimeSegment"("approvalStatus");

-- CreateIndex
CREATE INDEX "TimeSegment_deletedAt_idx" ON "TimeSegment"("deletedAt");

-- CreateIndex
CREATE INDEX "AuthorisedCredit_localDate_idx" ON "AuthorisedCredit"("localDate");

-- CreateIndex
CREATE INDEX "AuthorisedCredit_approvalStatus_idx" ON "AuthorisedCredit"("approvalStatus");

-- CreateIndex
CREATE INDEX "AuthorisedCredit_deletedAt_idx" ON "AuthorisedCredit"("deletedAt");

-- CreateIndex
CREATE INDEX "FlexiLeave_localDate_idx" ON "FlexiLeave"("localDate");

-- CreateIndex
CREATE INDEX "FlexiLeave_approvalStatus_idx" ON "FlexiLeave"("approvalStatus");

-- CreateIndex
CREATE INDEX "FlexiLeave_deletedAt_idx" ON "FlexiLeave"("deletedAt");

-- CreateIndex
CREATE INDEX "ExceptionalCarryover_accountingPeriodId_idx" ON "ExceptionalCarryover"("accountingPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCompletion_localDate_key" ON "DailyCompletion"("localDate");

-- CreateIndex
CREATE INDEX "BalanceLedgerEntry_localDate_idx" ON "BalanceLedgerEntry"("localDate");

-- CreateIndex
CREATE INDEX "BalanceLedgerEntry_accountingPeriodId_idx" ON "BalanceLedgerEntry"("accountingPeriodId");

-- CreateIndex
CREATE INDEX "BalanceLedgerEntry_sourceType_sourceId_idx" ON "BalanceLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "BalanceLedgerEntry_provisional_idx" ON "BalanceLedgerEntry"("provisional");

-- CreateIndex
CREATE INDEX "FindingResolution_approvalStatus_idx" ON "FindingResolution"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "FindingResolution_localDate_ruleId_key" ON "FindingResolution"("localDate", "ruleId");

-- Domain integrity constraints that Prisma cannot express directly.
ALTER TABLE "WorkingPatternDay"
  ADD CONSTRAINT "WorkingPatternDay_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "WorkingPatternDay_expectedMinutes_check" CHECK ("expectedMinutes" >= 0);

ALTER TABLE "TimeSegment"
  ADD CONSTRAINT "TimeSegment_endAt_check" CHECK ("endAt" IS NULL OR "endAt" > "startAt"),
  ADD CONSTRAINT "TimeSegment_travel_confirmation_check" CHECK ("type" <> 'OFFICIAL_TRAVEL' OR "officialTravelConfirmed" = true);

ALTER TABLE "AuthorisedCredit"
  ADD CONSTRAINT "AuthorisedCredit_duration_check" CHECK ("durationMinutes" > 0),
  ADD CONSTRAINT "AuthorisedCredit_times_check" CHECK ("endAt" IS NULL OR ("startAt" IS NOT NULL AND "endAt" > "startAt"));

ALTER TABLE "FlexiLeave"
  ADD CONSTRAINT "FlexiLeave_duration_check" CHECK ("durationMinutes" > 0);

ALTER TABLE "ExceptionalCarryover"
  ADD CONSTRAINT "ExceptionalCarryover_note_check" CHECK (length(trim("note")) > 0);

ALTER TABLE "BalanceLedgerEntry"
  ADD CONSTRAINT "BalanceLedgerEntry_manual_reason_check"
  CHECK ("type" <> 'MANUAL_CORRECTION' OR length(trim(coalesce("reason", ''))) > 0);

-- Only one undeleted, open clock segment may exist at a time.
CREATE UNIQUE INDEX "TimeSegment_one_open_idx" ON "TimeSegment" ((true))
WHERE "endAt" IS NULL AND "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "ChangeHistory_occurredAt_idx" ON "ChangeHistory"("occurredAt");

-- CreateIndex
CREATE INDEX "ChangeHistory_recordType_recordId_idx" ON "ChangeHistory"("recordType", "recordId");

-- AddForeignKey
ALTER TABLE "PersonalSettings" ADD CONSTRAINT "PersonalSettings_workingPatternId_fkey" FOREIGN KEY ("workingPatternId") REFERENCES "WorkingPattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalSettings" ADD CONSTRAINT "PersonalSettings_flexitimePolicyId_fkey" FOREIGN KEY ("flexitimePolicyId") REFERENCES "FlexitimePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingPatternDay" ADD CONSTRAINT "WorkingPatternDay_workingPatternId_fkey" FOREIGN KEY ("workingPatternId") REFERENCES "WorkingPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionalCarryover" ADD CONSTRAINT "ExceptionalCarryover_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceLedgerEntry" ADD CONSTRAINT "BalanceLedgerEntry_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
