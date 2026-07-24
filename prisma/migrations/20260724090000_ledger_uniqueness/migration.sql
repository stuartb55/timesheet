-- Keep the most recently created materialised row if an older application
-- version allowed concurrent period reads to create duplicates.
DELETE FROM "BalanceLedgerEntry" older
USING "BalanceLedgerEntry" newer
WHERE older."type" = 'OPENING_BALANCE'
  AND newer."type" = 'OPENING_BALANCE'
  AND older."accountingPeriodId" = newer."accountingPeriodId"
  AND (older."createdAt", older."id") < (newer."createdAt", newer."id");

DELETE FROM "BalanceLedgerEntry" older
USING "BalanceLedgerEntry" newer
WHERE older."type" = 'DAILY_WORK_BALANCE'
  AND newer."type" = 'DAILY_WORK_BALANCE'
  AND older."accountingPeriodId" = newer."accountingPeriodId"
  AND older."localDate" = newer."localDate"
  AND (older."createdAt", older."id") < (newer."createdAt", newer."id");

DELETE FROM "BalanceLedgerEntry" older
USING "BalanceLedgerEntry" newer
WHERE older."type" IN ('AUTHORISED_CREDIT', 'FLEXI_LEAVE')
  AND newer."type" = older."type"
  AND older."accountingPeriodId" = newer."accountingPeriodId"
  AND older."sourceType" = newer."sourceType"
  AND older."sourceId" = newer."sourceId"
  AND (older."createdAt", older."id") < (newer."createdAt", newer."id");

CREATE UNIQUE INDEX "BalanceLedgerEntry_one_opening_idx"
ON "BalanceLedgerEntry" ("accountingPeriodId")
WHERE "type" = 'OPENING_BALANCE';

CREATE UNIQUE INDEX "BalanceLedgerEntry_one_daily_balance_idx"
ON "BalanceLedgerEntry" ("accountingPeriodId", "localDate")
WHERE "type" = 'DAILY_WORK_BALANCE';

CREATE UNIQUE INDEX "BalanceLedgerEntry_one_source_entry_idx"
ON "BalanceLedgerEntry" ("accountingPeriodId", "type", "sourceType", "sourceId")
WHERE "type" IN ('AUTHORISED_CREDIT', 'FLEXI_LEAVE');

-- The UI and calculation engine support one approved exception per period.
DELETE FROM "ExceptionalCarryover" older
USING "ExceptionalCarryover" newer
WHERE older."accountingPeriodId" = newer."accountingPeriodId"
  AND (older."updatedAt", older."id") < (newer."updatedAt", newer."id");

CREATE UNIQUE INDEX "ExceptionalCarryover_accountingPeriodId_key"
ON "ExceptionalCarryover" ("accountingPeriodId");
