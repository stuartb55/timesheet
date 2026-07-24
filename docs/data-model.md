# Data model

## Configuration

`PersonalSettings` is a singleton that points to one `WorkingPattern` and one editable `FlexitimePolicy`. Seven uniquely keyed `WorkingPatternDay` rows store Monday-to-Sunday expected integer minutes and allow zero-minute non-working days. `ApplicationSetting` holds small version/seed markers. There is intentionally no user or authentication table.

## Source records

`TimeSegment` stores a local calendar date, UTC start/end instants, one exclusive segment type, notes, approval details, official-travel confirmation, an overtime finishing agreement, a scheduled start for rota boot-up and a soft-delete timestamp. A partial unique index permits only one undeleted open segment globally; check constraints require a later finish, official-travel confirmation and the type-specific overtime or rota time. Date, instant, open, approval and deletion indexes support normal reads.

`AuthorisedCredit` stores its local date, positive integer duration, optional UTC interval, type and approval details. `FlexiLeave` stores a positive duration, full/half/partial kind and approval. Both are soft-deleted and indexed by date, approval and deletion state.

`FindingResolution` stores the user’s external-approval understanding once per date and rule. `DailyCompletion` stores completion time and whether a later source edit occurred.

## Period, ledger and history

`AccountingPeriod` stores unique start/end dates, opening and final carryover,
confirmation, lifecycle state, check/lock timestamps and unlock reason.
`ExceptionalCarryover` belongs uniquely to one period and requires an amount,
date and non-empty note.

`BalanceLedgerEntry` belongs to a period and contains date, type, signed minutes,
optional source record, description, provisional flag and reason. Database
uniqueness constraints allow one opening entry per period, one generated daily
entry per period/date and one generated entry per source. An opening entry,
work-minus-expectation entry and source-linked credit/leave entries make the
displayed result explainable. Manual correction rows have a database-enforced
non-empty reason. Confirmed source calculations plus manual corrections
reproduce raw balance; provisional rows are displayed but excluded.

`ChangeHistory` stores timestamp, record type/id, action, before/after JSON and an optional or required workflow reason. Soft-deleted time, credit and flexi-leave rows can be restored from the history page.

All durations and balances are PostgreSQL integers. Instants are `timestamp(3)` values supplied in UTC; policy times are minutes after midnight; local record/period dates use PostgreSQL `date`. Migrations add constraints Prisma cannot express and all named date, period, open-segment, start/end and approval indexes requested by the specification.
