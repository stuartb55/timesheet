# Flexitime rules

## Profiles

The standard profile uses a 07:30–10:00 starting bandwidth, 10:00–11:30 morning core, 11:30–14:30 lunch band, 14:30–16:00 afternoon core and 16:00–19:30 finishing bandwidth.

Service Support uses 08:00 as its earliest start and 18:30 as its latest finish. Optional rota mode can make up to five minutes of scheduled boot-up eligible. Voice and Contact Centre Technology uses 07:30 and 18:30 boundaries with optional rota mode. Every default can be edited and reset.

## Daily calculation

Confirmed eligible minutes are normal work, confirmed official travel,
confirmed/no-approval-required authorised credits and eligible rota boot-up.
Rota boot-up must be externally approved, end at the recorded scheduled start
and is capped across the whole day at the configured allowance. Pending credits
are added only to the provisional result. Lunch, unpaid breaks, paid overtime,
refused credits and absence without credit are excluded.

`daily balance change = eligible minutes − expected minutes for the calendar date`

Flexi leave is usage of an existing balance, not a credit. Its balance effect therefore comes from expected minutes that are not worked. Overtime remains separate but is part of actual working time.

## Daily policy evaluation

The engine checks early/late starts and finishes, full coverage of morning and afternoon core time, overlapping/open records, explicit lunch before 11:30, lunch over two hours, lunch after 14:30, and less than 30 minutes of explicit break in a shift lasting at least six hours. Timed approved absence can cover core time. A gap is never inferred to be lunch.

Source time is always retained. A finding is `COMPLIANT`, `WARNING`, `APPROVAL_REQUIRED`, `BREACH` or `INCOMPLETE` and records its rule identifier, date, explanation, approval state and affected times/duration. User-entered issue resolutions say approval was not required, is pending, was obtained or was refused; the software does not grant approval.

Significant transport disruption under 30 minutes is normally time to make up. A pending request of at least 30 minutes appears only provisionally and is never auto-approved.

## Accounting periods and carryover

Accounting periods are consecutive 28-day blocks relative to the configured anchor. Opening balance plus confirmed daily changes and reasoned manual corrections gives raw closing balance. The normal positive cap is three standard days; the negative cap is two standard days. The application displays the raw value, cap, proposed value, excess and any externally approved exception separately. It never silently deletes excess credit. Successive exceptional carryovers produce a warning.

Confirmed flexi leave usage over two standard days in one period is a breach finding. Full, half and partial records all contribute their configured integer-minute duration to the limit. Pending leave is shown separately as provisional and refused leave is excluded.

## Working Time Regulations

The rolling 119-day (17-week) window totals elapsed actual work: normal work, confirmed official travel, weekend work/travel, overtime and rota boot-up. Credits where no work occurred, breaks and flexi leave are excluded. Until 119 days are represented, the window begins at initial setup or the earliest earlier source record and the average uses that fraction of weeks. The standard early warning is 45 hours and a breach is over 48 hours. Missing completion records make the result explicitly unreliable.

The implemented structured identifiers are those listed in `plan.md`, including bandwidth, core, lunch, break, approval, leave-limit, carryover-limit, successive exception, WTR, boot-up, incomplete, overlap and open-segment findings.
