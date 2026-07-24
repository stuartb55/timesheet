import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

test.describe.configure({ mode: "serial" });

test("initial setup and record-management journeys", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/govuk-template/);
  await expect(page.locator("body")).toHaveClass(/govuk-template__body/);
  await expect(page.locator(".govuk-generic-header")).toBeVisible();
  await expect(page.locator(".govuk-service-navigation")).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByText("Data is stored locally on this device."),
  ).toBeVisible();
  await expect(page.locator("h1")).toHaveClass(/govuk-heading-xl/);
  const font = await page.request.get(
    "/assets/fonts/light-94a07e06a1-v2.woff2",
  );
  expect(font.ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Complete initial setup" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Set up the application" }).click();
  await page.getByLabel("Name (optional)").fill("Example staff member");
  await page.getByRole("button", { name: "Save and finish setup" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.goto("/day/2026-07-20");
  await page
    .locator("summary")
    .filter({ hasText: "Add a time segment" })
    .click();
  let segmentForm = page
    .locator("details")
    .filter({ hasText: "Add a time segment" });
  await segmentForm.getByLabel("Start time").fill("08:30");
  await segmentForm.getByLabel("Finish time").fill("12:30");
  await segmentForm.getByRole("button", { name: "Add time segment" }).click();
  await expect(page.getByText("Time segment saved")).toBeVisible();

  await page
    .locator("summary")
    .filter({ hasText: "Add an authorised credit" })
    .click();
  const creditForm = page
    .locator("details")
    .filter({ hasText: "Add an authorised credit" });
  await creditForm
    .getByLabel("Credit type")
    .selectOption("MEDICAL_APPOINTMENT");
  await creditForm.getByLabel("Duration in minutes").fill("45");
  await creditForm.getByLabel("Approval status").selectOption("APPROVED");
  await creditForm
    .getByRole("button", { name: "Add authorised credit" })
    .click();
  await expect(page.getByText("Authorised credit saved")).toBeVisible();

  await page
    .locator("summary")
    .filter({ hasText: "Record flexi leave" })
    .click();
  const leaveForm = page
    .locator("details")
    .filter({ hasText: "Record flexi leave" });
  await leaveForm.getByLabel("Leave type").selectOption("HALF_DAY");
  await leaveForm.getByLabel("Duration in minutes").fill("222");
  await leaveForm.getByLabel("Approval status").selectOption("APPROVED");
  await leaveForm.getByRole("button", { name: "Record flexi leave" }).click();
  await expect(page.getByText("Flexi leave saved")).toBeVisible();

  await page
    .locator("summary")
    .filter({ hasText: "Add a time segment" })
    .click();
  segmentForm = page
    .locator("details")
    .filter({ hasText: "Add a time segment" });
  await segmentForm.getByLabel("Start time").fill("17:00");
  await segmentForm.getByLabel("Finish time").fill("18:00");
  await segmentForm.getByLabel("Segment type").selectOption("OVERTIME");
  await segmentForm
    .getByLabel("Agreed normal finishing time (required for overtime)")
    .fill("17:00");
  await segmentForm.getByLabel("Approval status").selectOption("APPROVED");
  await segmentForm.getByRole("button", { name: "Add time segment" }).click();
  await expect(page.getByText("Time segment saved")).toBeVisible();
});

test("validation errors link to the field and retain submitted values", async ({
  page,
}) => {
  await page.goto("/day/2026-07-21");
  const section = page
    .locator("details")
    .filter({ hasText: "Add a time segment" });
  await section.locator(":scope > summary").click();
  await section.getByLabel("Start time").fill("12:00");
  await section.getByLabel("Finish time").fill("11:00");
  await section.getByLabel("Note (optional)").fill("Retain this explanation");
  await section.getByRole("button", { name: "Add time segment" }).click();

  const errorLink = page.getByRole("link", {
    name: /Finish time must be after start time/,
  });
  await expect(errorLink).toHaveAttribute("href", "#segment-new-finish");
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("flexitime-pending-form")),
    )
    .toContain("12:00");
  await expect(section).toHaveAttribute("open", "");
  await expect(section.getByLabel("Start time")).toHaveValue("12:00");
  await expect(section.getByLabel("Finish time")).toHaveValue("11:00");
  await expect(section.getByLabel("Note (optional)")).toHaveValue(
    "Retain this explanation",
  );
});

test("live clock journey", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start work" }).click();
  await expect(page.getByText("Working", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start a break" }).click();
  await expect(page.getByText("On a break", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume work" }).click();
  await page.getByRole("button", { name: "Finish work" }).click();
  await expect(page.getByText("Not clocked in", { exact: true })).toBeVisible();
});

test("period completion, exceptional carryover and statement export", async ({
  page,
}) => {
  await page.goto("/period?date=2026-07-20");
  await page.getByLabel("Status").selectOption("COMPLETE");
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(
    page.getByText("Accounting period status updated"),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Record externally approved exceptional carryover" })
    .click();
  await page.getByLabel("Approved carryover in minutes").fill("1400");
  await page.getByLabel("Approval date").last().fill("2026-07-20");
  await page
    .getByLabel("Reason or approval note")
    .fill("Approved outside the application");
  await page
    .getByRole("button", { name: "Save exceptional carryover" })
    .click();
  await expect(page.getByText("Exceptional carryover recorded")).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Confirm final carryover" })
    .click();
  await page.getByLabel("Final carryover in minutes").fill("1400");
  await page.getByRole("button", { name: "Confirm final carryover" }).click();
  await expect(page.getByText("Final carryover confirmed")).toBeVisible();
  await page
    .getByRole("link", { name: "Printable accounting-period statement" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accounting-period statement" }),
  ).toBeVisible();
  const response = await page.request.get("/api/export/json");
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).format).toBe("personal-flexitime-record");
  const wtrResponse = await page.request.get(
    "/api/export/csv?report=wtr&asOf=2026-07-20",
  );
  expect(wtrResponse.ok()).toBeTruthy();
  expect(await wtrResponse.text()).toContain("Average weekly minutes");

  await page.goto("/calendar?month=2026-07");
  await expect(page.getByRole("table", { name: "July 2026" })).toBeVisible();
});

test("a balance edit invalidates confirmed carryover and the next opening balance", async ({
  page,
}) => {
  await page.goto("/day/2026-07-20");
  await page
    .locator("summary")
    .filter({ hasText: "Add a time segment" })
    .click();
  const segmentForm = page
    .locator("details")
    .filter({ hasText: "Add a time segment" });
  await segmentForm.getByLabel("Start time").fill("13:00");
  await segmentForm.getByLabel("Finish time").fill("14:00");
  await segmentForm.getByRole("button", { name: "Add time segment" }).click();
  await expect(page.getByText("Time segment saved")).toBeVisible();

  const state = execFileSync("docker", [
    "compose",
    "-p",
    "flexitime-e2e",
    "-f",
    "docker-compose.test.yml",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "flexitime",
    "-d",
    "flexitime_test",
    "-Atc",
    `SELECT
       p."carryoverConfirmed",
       coalesce(p."finalCarryoverMinutes"::text, ''),
       next."openingBalanceMinutes"
     FROM "AccountingPeriod" p
     JOIN "AccountingPeriod" next
       ON next."startDate" = p."endDate" + 1
     WHERE DATE '2026-07-20' BETWEEN p."startDate" AND p."endDate";`,
  ])
    .toString()
    .trim()
    .split("|");
  expect(state).toEqual(["f", "", "0"]);
});

test("concurrent period reads keep one materialised ledger row per logical entry", async ({
  request,
}) => {
  const responses = await Promise.all(
    Array.from({ length: 12 }, () => request.get("/period?date=2030-01-15")),
  );
  expect(responses.every((response) => response.ok())).toBe(true);

  const counts = execFileSync("docker", [
    "compose",
    "-p",
    "flexitime-e2e",
    "-f",
    "docker-compose.test.yml",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "flexitime",
    "-d",
    "flexitime_test",
    "-Atc",
    `SELECT
       (SELECT count(*) FROM "BalanceLedgerEntry"
        WHERE "accountingPeriodId" = p."id"
          AND "type" = 'DAILY_WORK_BALANCE'),
       (SELECT count(*) FROM "BalanceLedgerEntry"
        WHERE "accountingPeriodId" = p."id"
          AND "type" = 'OPENING_BALANCE'),
       (SELECT coalesce(max(grouped.entries), 0)
        FROM (
          SELECT count(*) AS entries
          FROM "BalanceLedgerEntry"
          WHERE "accountingPeriodId" = p."id"
            AND "type" IN ('OPENING_BALANCE', 'DAILY_WORK_BALANCE')
          GROUP BY "type", "localDate"
        ) grouped)
     FROM "AccountingPeriod" p
     WHERE DATE '2030-01-15' BETWEEN p."startDate" AND p."endDate";`,
  ])
    .toString()
    .trim()
    .split("|")
    .map(Number);
  expect(counts).toEqual([28, 1, 1]);
});

test("rejects an unrecognised Host header", async ({ request }) => {
  const response = await request.get("/", {
    headers: { host: "attacker.example" },
  });
  expect(response.status()).toBe(421);
});

test("database backup and restore preserves records", async () => {
  const backup = path.resolve("test-results/e2e-backup.dump");
  const jsonExport = path.resolve("test-results/e2e-export.json");
  mkdirSync(path.dirname(backup), { recursive: true });
  if (existsSync(jsonExport)) unlinkSync(jsonExport);
  const environment = {
    ...process.env,
    DATABASE_URL:
      "postgresql://flexitime:flexitime_test@127.0.0.1:55432/flexitime_test?schema=public",
  };
  const ledgerBefore = execFileSync("docker", [
    "compose",
    "-p",
    "flexitime-e2e",
    "-f",
    "docker-compose.test.yml",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "flexitime",
    "-d",
    "flexitime_test",
    "-Atc",
    'SELECT coalesce(sum("durationMinutes"), 0) FROM "BalanceLedgerEntry" WHERE NOT "provisional";',
  ])
    .toString()
    .trim();
  execFileSync("npx", ["tsx", "scripts/export-data.ts", jsonExport], {
    env: environment,
  });
  execFileSync(
    "npx",
    ["tsx", "scripts/import-data.ts", jsonExport, "--confirm-replace"],
    { env: environment },
  );
  const ledgerAfter = execFileSync("docker", [
    "compose",
    "-p",
    "flexitime-e2e",
    "-f",
    "docker-compose.test.yml",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "flexitime",
    "-d",
    "flexitime_test",
    "-Atc",
    'SELECT coalesce(sum("durationMinutes"), 0) FROM "BalanceLedgerEntry" WHERE NOT "provisional";',
  ])
    .toString()
    .trim();
  expect(ledgerAfter).toBe(ledgerBefore);

  const dump = execFileSync("docker", [
    "compose",
    "-p",
    "flexitime-e2e",
    "-f",
    "docker-compose.test.yml",
    "exec",
    "-T",
    "db",
    "pg_dump",
    "-U",
    "flexitime",
    "-d",
    "flexitime_test",
    "-Fc",
  ]);
  writeFileSync(backup, dump);
  execFileSync("docker", [
    "compose",
    "-p",
    "flexitime-e2e",
    "-f",
    "docker-compose.test.yml",
    "exec",
    "-T",
    "db",
    "createdb",
    "-U",
    "flexitime",
    "flexitime_restore_test",
  ]);
  try {
    execFileSync(
      "docker",
      [
        "compose",
        "-p",
        "flexitime-e2e",
        "-f",
        "docker-compose.test.yml",
        "exec",
        "-T",
        "db",
        "pg_restore",
        "-U",
        "flexitime",
        "-d",
        "flexitime_restore_test",
      ],
      { input: dump },
    );
    const restoredCount = execFileSync("docker", [
      "compose",
      "-p",
      "flexitime-e2e",
      "-f",
      "docker-compose.test.yml",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "flexitime",
      "-d",
      "flexitime_restore_test",
      "-Atc",
      'SELECT count(*) FROM "TimeSegment";',
    ]);
    expect(Number(restoredCount.toString().trim())).toBeGreaterThan(0);
  } finally {
    execFileSync("docker", [
      "compose",
      "-p",
      "flexitime-e2e",
      "-f",
      "docker-compose.test.yml",
      "exec",
      "-T",
      "db",
      "dropdb",
      "-U",
      "flexitime",
      "flexitime_restore_test",
    ]);
  }
});
