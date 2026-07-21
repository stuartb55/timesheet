Act as a senior full-stack developer. Build a personal flexitime recording application for one staff member.

The application will run locally in Docker on a MacBook Pro. It is not a shared service and will not be deployed publicly.

The application must accurately record working time, calculate flexitime balances and identify issues under the DTS Flexible Working Hours Scheme.

Keep the application simple. Do not introduce multi-user features, authentication, permissions, manager dashboards, email notifications or enterprise integrations.

## Core constraints

The application is:

- For one person only.
- Run locally using Docker Compose.
- Accessible only from the MacBook on localhost.
- Not exposed to the internet.
- Used to maintain a personal flexitime record.
- Based on the Europe/London timezone.
- Required to retain data between Docker container restarts.
- Required to support backup and restore.
- In British English

There must be:

- No login page.
- No authentication.
- No user accounts.
- No role-based access.
- No manager functionality.
- No approval workflow.
- No team management.
- No HR system integration.
- No payroll functionality.

Where the flexitime policy requires manager approval, allow the user to record that approval was obtained outside the application.

## Technical stack

Use:

- Next.js with the App Router.
- TypeScript with strict mode.
- React.
- PostgreSQL 18.
- Prisma ORM.
- Zod for validation.
- GOV.UK Frontend v6.4.0, installed from the official npm package and pinned exactly.
- Vitest for unit tests.
- React Testing Library for component tests.
- Playwright for end-to-end tests.
- Docker Compose.
- ESLint and Prettier.

Create two Docker services:

1. The web application.
2. PostgreSQL 18.

Bind the web application to localhost only.

Persist PostgreSQL data using a named Docker volume.

Store timestamps in UTC and display them in Europe/London time.

Use integer minutes for duration and balance calculations. Do not use floating-point numbers or decimal hours.

## Development approach

Before implementing the user interface:

1. Inspect the repository.
2. Describe the proposed application structure.
3. Create a concise implementation plan.
4. Create the database schema.
5. Implement the flexitime calculation engine.
6. Write unit tests for the calculation engine.
7. Build the user interface.
8. Add end-to-end tests.
9. Run linting, type checking, tests and the production build.

Create:

- `docs/requirements.md`
- `docs/flexitime-rules.md`
- `docs/data-model.md`
- `docs/assumptions.md`

Keep policy calculations in a dedicated domain service. Do not duplicate calculation logic in pages, components or database queries.

## Personal settings

Create a settings page for the single staff member.

The user must be able to configure:

- Name, optional.
- Weekly conditioned hours.
- Standard working day duration.
- Working days.
- Expected hours for each working day.
- Accounting period anchor date.
- Flexitime policy profile.
- Warning thresholds.
- Default entry method.
- Date display format.
- Time display format.

Support irregular and part-time working patterns.

Do not assume that weekly hours can always be divided equally across five days.

For example, the user may configure:

- Monday: 7 hours 24 minutes.
- Tuesday: 7 hours 24 minutes.
- Wednesday: 7 hours 24 minutes.
- Thursday: 7 hours 24 minutes.
- Friday: 7 hours 24 minutes.

Or:

- Monday: 8 hours.
- Tuesday: 8 hours.
- Wednesday: 6 hours.
- Thursday: non-working day.
- Friday: 8 hours.

The standard working day used for carryover limits may be configured separately from the expected hours for a specific day.

## Flexitime policy profiles

Allow the user to select one policy profile.

### Standard corporate policy

Configure:

- Starting bandwidth: 07:30 to 10:00.
- Morning core time: 10:00 to 11:30.
- Flexible lunch band: 11:30 to 14:30.
- Afternoon core time: 14:30 to 16:00.
- Finishing bandwidth: 16:00 to 19:30.

### Service Support exception

Configure:

- Starting bandwidth: 08:00 to 10:00.
- Morning core time: 10:00 to 11:30.
- Flexible lunch band: 11:30 to 14:30.
- Afternoon core time: 14:30 to 16:00.
- Finishing bandwidth: 16:00 to 18:30.
- Optional rota mode.
- Up to five minutes of boot-up time before a scheduled start may count as flexitime.

### Voice and Contact Centre Technology exception

Configure:

- Starting bandwidth: 07:30 to 10:00.
- Morning core time: 10:00 to 11:30.
- Flexible lunch band: 11:30 to 14:30.
- Afternoon core time: 14:30 to 16:00.
- Finishing bandwidth: 16:00 to 18:30.
- Optional rota mode.

Allow policy times to be edited in settings, but provide a reset-to-default option.

## Time recording

Support two ways of recording time.

### Live clocking

Provide controls to:

- Start work.
- Start a break.
- Resume work.
- Finish work.

Display:

- Current status.
- Time since the current activity started.
- Total work recorded today.
- Total break time today.
- Today’s expected hours.
- Current estimated balance for the day.

Prevent more than one open time segment.

Provide a clear warning when an open segment continues unusually long or remains open overnight.

### Manual entry

Allow the user to enter and edit precise start and finish times.

A day may contain multiple work periods.

Example:

- Work: 08:30 to 10:45.
- Medical appointment: 10:45 to 11:30.
- Work: 11:30 to 12:30.
- Lunch: 12:30 to 13:00.
- Work: 13:00 to 17:00.

Each time segment must contain:

- Date.
- Start time.
- End time.
- Segment type.
- Optional note.
- Whether external manager approval was required.
- Whether approval was obtained.
- Approval date, optional.
- Approval note or reference, optional.

Supported time segment types:

- Normal work.
- Official travel.
- Overtime.
- Rota boot-up time.
- Lunch break.
- Other unpaid break.

Prevent:

- Overlapping segments.
- End times before start times.
- Duplicate open segments.
- Overtime being counted as both overtime and normal flexitime.
- Accidental deletion without confirmation.

Allow a deleted entry to be restored from a simple change history.

## Daily record

Provide a daily record page showing:

- Expected working time.
- Work segments.
- Breaks.
- Authorised credits.
- Flexi leave.
- Overtime.
- Total actual work.
- Total flexitime-eligible work.
- Daily flexitime change.
- Policy warnings.
- Approval notes.

Allow the user to copy entries from another day, but require confirmation before saving them.

Provide a button to mark a day as complete.

A completed day may still be edited, but show that it was changed after completion.

## Lunch and break rules

Implement the following checks:

- Lunch may begin from 11:30.
- Lunch must normally end within two hours.
- Lunch must normally end by 14:30.
- A lunch outside these limits requires external manager approval.
- A shift lasting six hours or more must include a break of at least 30 minutes.
- A break during morning or afternoon core time requires external manager approval unless it is covered by an authorised absence.

Do not assume every gap between work segments is lunch.

The user must explicitly classify breaks.

Display clear results such as:

- Compliant.
- Warning.
- External approval required.
- Policy breach.
- Incomplete information.

The application must record actual times even when they fall outside the policy. Do not prevent accurate recording.

## Working outside core times and bandwidths

Identify when the record includes:

- Starting before the starting bandwidth.
- Starting after morning core time begins.
- Absence during morning core time.
- Absence during afternoon core time.
- Finishing before afternoon core time ends.
- Finishing after the finishing bandwidth.

For each issue, allow the user to record:

- Approval was not required.
- Approval is required and pending.
- Approval was obtained.
- Approval was refused.
- An explanatory note.

The application does not grant approval. It only records the user’s understanding of an approval obtained elsewhere.

## Accounting periods

Use consecutive 28-day accounting periods based on a configurable anchor date.

Document this as an interpretation of the scheme’s rolling four-week accounting period.

For each accounting period, calculate and display:

- Start date.
- End date.
- Opening balance.
- Expected conditioned hours.
- Normal work.
- Official travel counted as work.
- Authorised credits.
- Flexi leave taken.
- Overtime, shown separately.
- Daily balance changes.
- Raw closing balance.
- Normal permitted carryover.
- Exceptional carryover.
- Excess credit that would normally be lost.
- Excess debit above the normal limit.
- Final balance carried into the next period.

Allow the user to mark an accounting period as:

- Open.
- Complete.
- Checked.
- Locked.

Locking a period should prevent accidental edits.

Allow the user to unlock it after confirming the action and entering a reason.

## Flexitime calculation

Use the following calculation.

Flexitime-eligible time equals:

- Normal work.
- Approved official travel.
- Approved authorised credits.
- Approved rota boot-up time.
- Other explicitly configured eligible time.

Do not include:

- Lunch.
- Unpaid breaks.
- Paid overtime.
- Unapproved credits.
- Non-working absence without credit.

Daily balance change equals:

`flexitime-eligible minutes - expected minutes for that date`

Examples:

- Expected time is 7 hours 24 minutes.
- Recorded eligible time is 8 hours.
- Daily balance change is plus 36 minutes.

Another example:

- Expected time is 7 hours 24 minutes.
- Recorded eligible time is 6 hours.
- Daily balance change is minus 1 hour 24 minutes.

A non-working day has zero expected hours unless a rota entry says otherwise.

## Flexitime carryover limits

At the end of each accounting period:

- Normal maximum credit carryover is three standard working days.
- Normal maximum debit carryover is two standard working days.

Convert the limits into minutes using the configured standard working day.

For example, if a standard day is 7 hours 24 minutes:

- Three-day credit limit is 22 hours 12 minutes.
- Two-day debit limit is 14 hours 48 minutes.

Display separately:

- Raw closing balance.
- Standard carryover limit.
- Proposed carryover.
- Excess credit.
- Excess debit.
- Exceptional carryover.

Allow the user to record that an exceptional carryover was externally approved.

Require:

- Approved amount.
- Approval date.
- Reason or note.

Warn when exceptional carryover is recorded in successive accounting periods.

Do not automatically delete excess credit. Show what would normally be lost and allow the user to confirm the final carryover.

## Authorised credits

Allow whole-day and partial-day credits.

Supported credit types:

- Annual leave.
- Sick absence.
- Public holiday.
- Privilege day.
- Training.
- Trade union facility time.
- Medical appointment.
- Doctor.
- Dentist.
- Hospital.
- Optician.
- Pre-natal appointment.
- Official travel.
- Significant transport disruption.
- Other authorised absence.

Each credit must include:

- Date.
- Duration or start and finish time.
- Type.
- Note.
- Whether external approval is required.
- Whether approval was obtained.
- Approval date, optional.
- Approval reference or note, optional.

Credits that require approval must not affect the confirmed balance until marked as approved.

Allow them to be included in a provisional balance so the user can see the expected result.

For travel disruption:

- Delays below 30 minutes should normally be shown as time to make up.
- Delays of 30 minutes or more may be entered as a requested credit.
- Do not automatically treat the delay as approved.

## Official travel

Allow official travel to be recorded as working time.

Support:

- Travel during a normal working day.
- Travel outside normal hours.
- Weekend official travel.
- Travel that requires external approval.

Normal home-to-office commuting must not count as working time.

Provide a required confirmation when recording travel:

“This was official travel and was not my normal journey between home and my usual office.”

Official travel must be included in Working Time Regulations calculations.

## Overtime

Keep overtime separate from flexitime.

Overtime entries must include:

- Date.
- Start time.
- End time.
- Agreed normal finishing time.
- Note.
- Whether external approval was obtained.
- Approval reference, optional.

Overtime must:

- Be excluded from the flexitime balance.
- Be included in total actual working time.
- Be included in Working Time Regulations calculations.
- Be displayed separately in reports.

Do not calculate overtime pay or rates.

## Flexi leave

Support:

- Full-day flexi leave.
- Half-day flexi leave.
- Partial flexi leave through a shorter working day.

Each flexi leave record must include:

- Date.
- Duration.
- Note.
- Whether external approval was obtained.
- Approval date, optional.

The user may take no more than two standard working days of flexi leave during one 28-day accounting period.

Convert the limit into minutes using the configured standard working day.

Flexi leave does not count as credited time.

It reduces the flexitime balance because the employee works fewer than their expected hours.

Example:

- Expected day is 7 hours 24 minutes.
- No work is recorded.
- Full-day flexi leave is recorded.
- Daily balance change is minus 7 hours 24 minutes.
- The period’s flexi leave total increases by one day.

## Working Time Regulations

Calculate average actual working time over a rolling 17-week period.

Include:

- Normal work.
- Official travel counted as work.
- Weekend work or official travel.
- Overtime.
- Rota boot-up time.

Exclude:

- Annual leave credits.
- Sick leave credits.
- Public holiday credits.
- Other credits where no actual work occurred.
- Lunch and unpaid breaks.
- Flexi leave.

Display:

- Total actual working time during the 17-week window.
- Average weekly working time.
- Number of complete weeks.
- Number of incomplete days.
- Warning when the average approaches 48 hours.
- Breach warning when the average exceeds 48 hours.

Make the early-warning level configurable, with a default of 45 hours.

Clearly state when the result may be unreliable because records are incomplete.

## Policy evaluation engine

Create a pure, testable policy engine.

It must return structured findings containing:

- Rule identifier.
- Date.
- Severity.
- Message.
- Whether external approval is required.
- Whether approval has been recorded.
- Affected times or duration.

Use rule identifiers including:

- `OUTSIDE_START_BANDWIDTH`
- `OUTSIDE_FINISH_BANDWIDTH`
- `MISSING_MORNING_CORE_TIME`
- `MISSING_AFTERNOON_CORE_TIME`
- `LUNCH_STARTED_EARLY`
- `LUNCH_TOO_LONG`
- `LUNCH_ENDED_LATE`
- `INSUFFICIENT_BREAK`
- `APPROVAL_REQUIRED`
- `APPROVAL_NOT_RECORDED`
- `FLEXI_LEAVE_LIMIT_EXCEEDED`
- `CREDIT_CARRYOVER_LIMIT_EXCEEDED`
- `DEBIT_CARRYOVER_LIMIT_EXCEEDED`
- `SUCCESSIVE_EXCEPTIONAL_CARRYOVER`
- `WTR_AVERAGE_WARNING`
- `WTR_AVERAGE_EXCEEDED`
- `BOOT_UP_LIMIT_EXCEEDED`
- `INCOMPLETE_TIME_RECORD`
- `OVERLAPPING_TIME_SEGMENTS`
- `OPEN_TIME_SEGMENT`

Policy findings must not alter recorded time automatically.

## Data model

Create a simple single-user relational model containing at least:

- PersonalSettings
- WorkingPattern
- WorkingPatternDay
- FlexitimePolicy
- AccountingPeriod
- TimeSegment
- AuthorisedCredit
- FlexiLeave
- ExceptionalCarryover
- DailyCompletion
- BalanceLedgerEntry
- ChangeHistory
- ApplicationSetting

There is no User table unless technically required by a library. Do not create authentication or permission tables.

Use database constraints where practical.

Create indexes for:

- Date.
- Accounting period.
- Open time segments.
- Segment start and end times.
- Approval status.
- Credit date.
- Flexi leave date.

## Balance ledger

Use a balance ledger so that balance calculations are explainable.

Each ledger entry should contain:

- Date.
- Accounting period.
- Entry type.
- Duration in minutes.
- Source record.
- Description.
- Whether the amount is provisional or confirmed.

Entry types may include:

- Opening balance.
- Daily work balance.
- Authorised credit.
- Flexi leave.
- Carryover adjustment.
- Credit lost.
- Exceptional carryover.
- Manual correction.

A manual correction must require a reason.

The balance shown to the user must be reproducible from the ledger and source records.

## Main pages

### Dashboard

Show:

- Current clock status.
- Clock in, break, resume and finish controls.
- Today’s work.
- Today’s breaks.
- Today’s expected hours.
- Today’s balance.
- Current accounting-period balance.
- Current credit or debit limit.
- Flexi leave used.
- Pending approval notes.
- Missing records.
- Policy warnings.
- 17-week working-time average.

### Day view

Show:

- All time segments.
- Credits.
- Flexi leave.
- Overtime.
- Expected hours.
- Actual hours.
- Flexitime-eligible hours.
- Daily balance.
- Policy findings.
- Approval details.

Allow records to be added, edited, copied and removed.

### Weekly view

Show a row for each day containing:

- First start.
- Last finish.
- Work duration.
- Break duration.
- Credits.
- Overtime.
- Expected hours.
- Daily balance.
- Completion status.
- Warning status.

### Accounting-period view

Show:

- Opening balance.
- Expected hours.
- Credited hours.
- Flexi leave.
- Overtime.
- Daily balances.
- Raw closing balance.
- Carryover limits.
- Exceptional carryover.
- Proposed next-period balance.
- Unresolved warnings.

### Calendar view

Show each day with a status indicator for:

- Complete.
- Incomplete.
- Non-working day.
- Credit recorded.
- Flexi leave.
- Warning.
- Policy breach.

### Reports and exports

Provide:

- Accounting-period statement.
- Monthly summary.
- Annual summary.
- Flexi leave report.
- Overtime report.
- Authorised credit report.
- Working Time Regulations report.
- Full data export.

Support CSV export.

Provide a printable accounting-period statement suitable for saving as PDF from the browser.

The statement should include:

- Staff member name, when configured.
- Accounting-period dates.
- Opening balance.
- Daily start and finish information.
- Daily credited hours.
- Daily balance.
- Credits and flexi leave.
- Closing balance.
- Carryover decision.
- Approval notes.
- Date the statement was checked.

## Change history

Maintain a simple local history of important changes.

Record:

- Time segments added, edited or removed.
- Credits added or changed.
- Flexi leave added or changed.
- Periods locked or unlocked.
- Manual balance corrections.
- Policy setting changes.
- Working pattern changes.
- Exceptional carryovers.

Each history record must contain:

- Timestamp.
- Record type.
- Record identifier.
- Action.
- Previous values.
- New values.
- Reason, where required.

The history is intended to help the user understand previous changes. It is not an enterprise audit system.

## Accessibility and usability

Meet WCAG 2.2 AA where practical.

Use:

- Keyboard-accessible controls.
- Clear labels.
- Accessible validation.
- Error summaries.
- Correct heading structure.
- Plain English.
- UK dates.
- 24-hour times.
- Hours and minutes rather than decimal hours.
- Responsive layouts.
- Clear confirmation messages.

Do not rely on colour alone.

Avoid dense dashboards and unnecessary charts.

## Local security

Although the application has no authentication:

- Bind the application to `127.0.0.1`.
- Do not expose PostgreSQL outside the Docker network.
- Do not include secrets in the repository.
- Validate all input on the server.
- Use secure headers.
- Protect against SQL injection.
- Protect against cross-site scripting.
- Protect against cross-site request forgery where relevant.
- Do not load third-party scripts unless necessary.
- Do not send usage or analytics data externally.
- Do not use cloud services.
- Do not include telemetry.

Document that removing authentication is safe only while the application remains local to the user’s device.

## Backup and restore

Provide commands or scripts for:

- Creating a PostgreSQL backup.
- Restoring a PostgreSQL backup.
- Exporting all application data as JSON.
- Importing a JSON export.
- Resetting the local database after confirmation.

Store backups outside the database Docker volume.

Document the backup location and recommended backup process.

## Testing

Write unit tests covering at least:

1. A normal compliant working day.
2. Multiple work periods in one day.
3. Starting before the permitted bandwidth.
4. Starting after morning core time begins.
5. Finishing before afternoon core time ends.
6. Finishing after the permitted bandwidth.
7. Absence during morning core time.
8. Absence during afternoon core time.
9. Lunch before 11:30.
10. Lunch longer than two hours.
11. Lunch ending after 14:30.
12. A six-hour shift with less than a 30-minute break.
13. A shift just below six hours.
14. A full-day authorised credit.
15. A partial medical appointment credit.
16. An unapproved credit.
17. Travel disruption below 30 minutes.
18. Travel disruption of 30 minutes.
19. Official weekday travel.
20. Weekend official travel.
21. Overtime excluded from flexitime.
22. Overtime included in Working Time Regulations.
23. Full-day flexi leave.
24. Half-day flexi leave.
25. More than two days of flexi leave in one period.
26. Credit carryover exactly at three days.
27. Credit carryover above three days.
28. Debit carryover exactly at two days.
29. Debit carryover above two days.
30. Exceptional carryover.
31. Exceptional carryover in successive periods.
32. A part-time working pattern.
33. An irregular working pattern.
34. A 17-week average below 48 hours.
35. A 17-week average above 48 hours.
36. Incomplete records affecting the 17-week calculation.
37. Five minutes of rota boot-up time.
38. More than five minutes of rota boot-up time.
39. Overlapping time entries.
40. An open segment continuing overnight.
41. Europe/London daylight-saving changes.
42. Unlocking a completed accounting period.
43. A manual balance correction.
44. Export and import preserving balances.

Use a fixed clock in tests.

Create Playwright journeys covering:

- Initial application setup.
- Recording a normal working day.
- Using the live clock.
- Adding a medical appointment credit.
- Recording flexi leave.
- Recording overtime.
- Completing an accounting period.
- Recording exceptional carryover.
- Exporting an accounting-period statement.
- Backing up and restoring data.

## Seed data

Create optional example data for development containing:

- A standard five-day working pattern.
- Standard DTS policy settings.
- One complete compliant week.
- One day with an authorised medical appointment.
- One flexi leave day.
- One overtime entry.
- One accounting period with a positive balance.

Do not load example data automatically in normal use.

## Docker and operating instructions

The README must include:

- Prerequisites.
- How to start the application.
- How to stop it.
- How to update it.
- How to view logs.
- How to run database migrations.
- How to back up the database.
- How to restore the database.
- How to export and import data.
- How to reset the application.
- Where Docker volumes are stored.
- How to change the local port.

Starting the application should require no more than:

`docker compose up -d`

The application should be available at:

`http://localhost:3000`

## Non-functional requirements

The application should:

- Start quickly.
- Work without an internet connection.
- Handle at least ten years of personal timesheet data.
- Load normal pages in under one second on a modern MacBook Pro.
- Avoid unnecessary dependencies.
- Use database migrations.
- Fail safely if the database is unavailable.
- Display useful error messages.
- Preserve data when the web container is rebuilt.
- Provide deterministic and explainable calculations.

## Policy assumptions

Record these assumptions in `docs/assumptions.md`:

- The four-week accounting period is implemented as consecutive 28-day periods using an anchor date.
- Manager approvals occur outside the application.
- The application only records whether an approval was obtained.
- The user is responsible for the accuracy of approval information.
- Paid overtime does not count towards the flexitime balance.
- Paid overtime does count towards actual working time.
- Flexi leave reduces the existing flexitime balance and is not an authorised credit.
- Unapproved credits are displayed provisionally but do not affect the confirmed balance.
- Working patterns and standard-day duration are configured by the user.
- Detailed overtime rules from the separate Out of Hours Working document are outside scope.
- Detailed travel rules from the HMCTS travel and subsistence policy are outside scope.
- The application is safe without authentication only because it is bound to localhost.

Do not embed undocumented policy assumptions in the code.

## Final delivery

The final repository must include:

- Application source code.
- PostgreSQL schema and migrations.
- Docker Compose configuration.
- Persistent database volume configuration.
- Automated tests.
- Example environment file.
- Backup and restore scripts.
- README.
- Requirements documentation.
- Flexitime rules documentation.
- Data model documentation.
- Assumptions documentation.

Before completing the task, run:

- Linting.
- Formatting checks.
- Type checking.
- Unit tests.
- Component tests.
- End-to-end tests.
- Production build.

Fix failures before reporting completion.

Provide a final summary containing:

- What was implemented.
- How to run it.
- Test results.
- Any unresolved assumptions.
- Any features deliberately left outside scope.
