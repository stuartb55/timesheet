# Requirements

## User interface

- Use the official `govuk-frontend` npm package pinned to version 6.4.0.
- Bundle GOV.UK Frontend CSS and JavaScript with the application.
- Serve package fonts and images locally; the application must not require a CDN or other third-party runtime connection.
- Use official GOV.UK component markup and classes for navigation, typography, forms, buttons, details, tables, tags, notification banners and error summaries.
- Keep application-specific CSS limited to layouts that GOV.UK Frontend does not provide.

## Purpose and scope

The application is a private personal record for one DTS staff member. It runs locally in Docker Compose on a MacBook, is available only through localhost, retains its PostgreSQL data across container rebuilds, and provides database and application-data backup and restore.

It has no authentication, accounts, permissions, manager screens, approval workflow, team features, HR/payroll integration, notifications, analytics or cloud dependency. External approvals are obtained elsewhere; the application records the user’s understanding of their state.

## Functional requirements

- Configure a name, conditioned time, independent standard day, irregular seven-day working pattern, 28-day anchor, policy profile and editable times, rota mode, warning threshold, entry preference and UK display formats.
- Record normal work, explicitly classified breaks, official travel, overtime and rota boot-up using a live clock or precise manual entries. Enforce one open segment, chronological non-overlapping times, travel confirmation and deletion confirmation.
- Record whole or partial authorised credits and flexi leave with external approval details. Keep pending credits out of confirmed balance and include them in provisional balance.
- Show daily, weekly, calendar, 28-day accounting-period and dashboard summaries. Mark days complete and flag later changes.
- Evaluate core-time, bandwidth, lunch, break, boot-up, approval, flexi-leave, carryover, incomplete-record and Working Time Regulations rules as structured findings without changing source records.
- Keep paid overtime outside flexitime and inside actual/WTR time. Keep official travel inside both when confirmed as official rather than ordinary commuting.
- Calculate three-standard-day credit and two-standard-day debit carryover limits; show excess separately; record externally approved exceptional carryover; and require confirmation of final carryover.
- Support open, complete, checked and locked periods. Unlock only with explicit confirmation and a reason.
- Maintain a source-linked balance ledger and local change history, including restoration of soft-deleted time, credit and leave records. Manual corrections require a reason.
- Provide monthly, annual, overtime, credit, flexi-leave and WTR reports; CSV downloads; complete JSON export/import; and a printable period statement.
- Supply optional example data without loading it in normal use.

## Quality requirements

The UI uses British English, UK dates, 24-hour time, hours and minutes, semantic headings/tables/forms, keyboard access, visible focus, labelled fields, status text as well as colour, responsive layouts, clear error summaries and confirmations. It targets WCAG 2.2 AA where practical.

The pure domain engine is deterministic, uses integer minutes and has fixed-clock unit coverage. Range reads batch database queries so normal views remain responsive with at least ten years of data. Server mutations validate input with Zod and Prisma uses parameterised queries. Security headers, same-origin Next.js Server Actions, a localhost-only web binding and a private database network limit local risk.
