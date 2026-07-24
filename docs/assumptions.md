# Assumptions

- The scheme’s rolling four-week accounting period is interpreted as consecutive 28-day periods using a configurable anchor date.
- Manager approvals occur outside the application. The application records only the user’s understanding of whether approval was required, pending, obtained or refused; the user is responsible for its accuracy.
- Paid overtime does not affect flexitime balance. It does count as elapsed actual work for Working Time Regulations.
- Flexi leave consumes balance through expected time not worked; it is not an authorised credit.
- Pending credits appear in a provisional calculation and do not affect confirmed balance. Refused credits affect neither.
- Working patterns and the independent standard-day duration are user configured; weekly hours are never divided automatically.
- Policy and working-pattern settings are not effective-dated. Edits intentionally recalculate unlocked historic views. A locked period prevents source-record edits but does not freeze a separate policy snapshot; retain a statement/export before material settings changes.
- A shift’s length for the six-hour break test runs from its first to last actual-work segment. Only explicitly recorded lunch/unpaid-break segments count toward the 30-minute break.
- Timed, approved authorised absence can cover core time. Approved credit and
  flexi-leave minutes are combined when deciding whether a completed day has a
  whole day of absence. Untimed partial credit contributes minutes to balance
  but cannot prove core-time coverage.
- Official travel recorded as a time segment counts as actual/WTR and flexitime-eligible work only after the required non-commute confirmation and any required approval. An `OFFICIAL_TRAVEL` credit represents authorised credited absence, not elapsed travel; actual travel should be a segment.
- Service Support rota boot-up eligibility is capped across the whole day at
  five minutes by its default profile. Editing the configured allowance
  deliberately changes that cap. Other profiles default to zero.
- A non-working day has zero expected minutes unless its configured working-pattern day says otherwise. There is no separate rota-expected-hours model; irregular rota expectations are represented by editing the working pattern and recording rota mode.
- A 17-week result uses the represented fraction of weeks from initial setup or the earliest earlier source record until 119 dates exist, and labels any missing working-day completion as unreliable. Complete non-working days do not require an explicit completion marker.
- Live dashboard totals include elapsed time in today’s open work or break segment. An overnight open segment is retained against its original date and must be finished or corrected explicitly.
- Detailed overtime rules from the separate Out of Hours Working document and detailed travel/subsistence rules are outside scope. The application does not calculate pay or expenses.
- The system accepts actual policy exceptions and reports findings rather than blocking accurate entry. It never grants approval or silently discards excess credit.
- No CSRF token is added to read-only export routes. Mutations use Next.js same-origin Server Actions or confirmed local CLI commands.
- The application is safe without authentication only because Docker binds it to `127.0.0.1`; changing that binding changes the security model and is unsupported.
