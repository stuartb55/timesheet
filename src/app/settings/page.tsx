import type { Metadata } from "next";
import { resetPolicyDefaults, saveSettings } from "@/app/actions";
import { FlashMessage } from "@/components/flash-message";
import { formatDuration, formatTime, isoDate } from "@/domain/time";
import { ensureSettings } from "@/lib/data";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    errorTarget?: string;
  }>;
}) {
  const [settings, messages] = await Promise.all([
    ensureSettings(),
    searchParams,
  ]);
  const days = [...settings.workingPattern.days].sort(
    (a, b) => a.weekday - b.weekday,
  );
  const policy = settings.flexitimePolicy;

  return (
    <>
      <FlashMessage {...messages} />
      <h1 className="govuk-heading-xl">
        {settings.setupComplete ? "Settings" : "Set up your flexitime record"}
      </h1>
      <p className="govuk-body-l">
        Configure your own conditioned hours and DTS policy profile. Times and
        durations use integer minutes internally.
      </p>
      <form action={saveSettings}>
        <section aria-labelledby="personal-heading">
          <h2 className="govuk-heading-l" id="personal-heading">
            Personal settings
          </h2>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="name">
              Name (optional)
            </label>
            <input
              className="govuk-input"
              id="name"
              name="name"
              defaultValue={settings.name ?? ""}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="weekly">
              Weekly conditioned time in minutes
            </label>
            <div className="govuk-hint">
              Currently {formatDuration(settings.weeklyConditionedMinutes)}.
            </div>
            <input
              className="govuk-input govuk-input--width-5"
              id="weekly"
              name="weeklyConditionedMinutes"
              type="number"
              min="0"
              max="10080"
              required
              defaultValue={settings.weeklyConditionedMinutes}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="standard-day">
              Standard working day in minutes
            </label>
            <div className="govuk-hint">
              Used for carryover and flexi leave limits. It can differ from a
              day’s expected hours.
            </div>
            <input
              className="govuk-input govuk-input--width-5"
              id="standard-day"
              name="standardDayMinutes"
              type="number"
              min="1"
              max="1440"
              required
              defaultValue={settings.standardDayMinutes}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="anchor">
              Accounting period anchor date
            </label>
            <div className="govuk-hint">
              This is the first day of a consecutive 28-day period.
            </div>
            <input
              className="govuk-input govuk-input--width-10"
              id="anchor"
              name="accountingAnchorDate"
              type="date"
              required
              defaultValue={isoDate(settings.accountingAnchorDate)}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="warning">
              Working-time early warning in minutes per week
            </label>
            <div className="govuk-hint">Default 2,700 minutes (45 hours).</div>
            <input
              className="govuk-input govuk-input--width-5"
              id="warning"
              name="warningThresholdMinutes"
              type="number"
              min="1"
              max="2880"
              required
              defaultValue={settings.warningThresholdMinutes}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="method">
              Default entry method
            </label>
            <select
              className="govuk-select"
              id="method"
              name="defaultEntryMethod"
              defaultValue={settings.defaultEntryMethod}
            >
              <option value="LIVE_CLOCK">Live clocking</option>
              <option value="MANUAL">Manual entry</option>
            </select>
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="date-format">
              Date display format
            </label>
            <select
              className="govuk-select"
              id="date-format"
              name="dateFormat"
              defaultValue={settings.dateFormat}
            >
              <option value="dd/MM/yyyy">20/07/2026</option>
              <option value="d MMMM yyyy">20 July 2026</option>
              <option value="yyyy-MM-dd">2026-07-20</option>
            </select>
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="time-format">
              Time display format
            </label>
            <div className="govuk-hint">
              This service records and displays times using the required 24-hour
              format.
            </div>
            <select
              className="govuk-select"
              id="time-format"
              defaultValue="24h"
              disabled
            >
              <option value="24h">24-hour time</option>
            </select>
          </div>
          <input type="hidden" name="timeFormat" value="24h" />
        </section>

        <section aria-labelledby="pattern-heading">
          <h2 className="govuk-heading-l" id="pattern-heading">
            Working pattern
          </h2>
          <p className="govuk-body">
            Enter zero for a non-working day. The total must equal weekly
            conditioned time.
          </p>
          <div className="app-table-scroll">
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th className="govuk-table__header">Day</th>
                  <th className="govuk-table__header">Expected minutes</th>
                  <th className="govuk-table__header">Current duration</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {weekdays.map((weekday, index) => {
                  const minutes =
                    days.find((day) => day.weekday === index)
                      ?.expectedMinutes ?? 0;
                  return (
                    <tr className="govuk-table__row" key={weekday}>
                      <th className="govuk-table__header" scope="row">
                        <label className="govuk-label" htmlFor={`day-${index}`}>
                          {weekday}
                        </label>
                      </th>
                      <td className="govuk-table__cell">
                        <input
                          className="govuk-input govuk-input--width-5"
                          id={`day-${index}`}
                          name={`expectedMinutes${index}`}
                          type="number"
                          min="0"
                          max="1440"
                          required
                          defaultValue={minutes}
                        />
                      </td>
                      <td className="govuk-table__cell">
                        {minutes ? formatDuration(minutes) : "Non-working day"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="policy-heading">
          <h2 className="govuk-heading-l" id="policy-heading">
            Flexitime policy
          </h2>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="profile">
              Policy profile
            </label>
            <select
              className="govuk-select"
              id="profile"
              name="profile"
              defaultValue={policy.profile}
            >
              <option value="STANDARD_CORPORATE">
                Standard corporate policy
              </option>
              <option value="SERVICE_SUPPORT">Service Support exception</option>
              <option value="VOICE_CONTACT_CENTRE">
                Voice and Contact Centre Technology exception
              </option>
            </select>
          </div>
          <div className="govuk-form-group">
            <div
              className="govuk-checkboxes govuk-checkboxes--small"
              data-module="govuk-checkboxes"
            >
              <div className="govuk-checkboxes__item">
                <input
                  className="govuk-checkboxes__input"
                  id="rota-mode"
                  name="rotaMode"
                  type="checkbox"
                  value="true"
                  defaultChecked={policy.rotaMode}
                />
                <label
                  className="govuk-label govuk-checkboxes__label"
                  htmlFor="rota-mode"
                >
                  Enable optional rota mode
                </label>
              </div>
            </div>
          </div>
          <div className="app-grid">
            {[
              [
                "startBandwidthMinutes",
                "Starting bandwidth",
                policy.startBandwidthMinutes,
              ],
              [
                "morningCoreStartMinutes",
                "Morning core starts",
                policy.morningCoreStartMinutes,
              ],
              [
                "morningCoreEndMinutes",
                "Morning core ends",
                policy.morningCoreEndMinutes,
              ],
              [
                "lunchStartMinutes",
                "Lunch band starts",
                policy.lunchStartMinutes,
              ],
              ["lunchEndMinutes", "Lunch band ends", policy.lunchEndMinutes],
              [
                "afternoonCoreStartMinutes",
                "Afternoon core starts",
                policy.afternoonCoreStartMinutes,
              ],
              [
                "afternoonCoreEndMinutes",
                "Afternoon core ends",
                policy.afternoonCoreEndMinutes,
              ],
              [
                "finishBandwidthMinutes",
                "Finishing bandwidth",
                policy.finishBandwidthMinutes,
              ],
            ].map(([name, label, minutes]) => (
              <div className="govuk-form-group" key={String(name)}>
                <label className="govuk-label" htmlFor={String(name)}>
                  {String(label)}
                </label>
                <input
                  className="govuk-input govuk-input--width-5"
                  id={String(name)}
                  name={String(name)}
                  type="time"
                  required
                  defaultValue={formatTime(Number(minutes))}
                />
              </div>
            ))}
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="boot-up">
              Rota boot-up allowance in minutes
            </label>
            <input
              className="govuk-input govuk-input--width-5"
              id="boot-up"
              name="bootUpAllowanceMinutes"
              type="number"
              min="0"
              max="60"
              required
              defaultValue={policy.bootUpAllowanceMinutes}
            />
          </div>
        </section>
        <button className="govuk-button" data-module="govuk-button">
          {settings.setupComplete ? "Save settings" : "Save and finish setup"}
        </button>
      </form>

      <details className="govuk-details">
        <summary className="govuk-details__summary">
          <span className="govuk-details__summary-text">
            Reset policy times to profile defaults
          </span>
        </summary>
        <div className="govuk-details__text">
          <form action={resetPolicyDefaults}>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="reset-profile">
                Profile to reset
              </label>
              <select
                className="govuk-select"
                id="reset-profile"
                name="profile"
                defaultValue={policy.profile}
              >
                <option value="STANDARD_CORPORATE">
                  Standard corporate policy
                </option>
                <option value="SERVICE_SUPPORT">
                  Service Support exception
                </option>
                <option value="VOICE_CONTACT_CENTRE">
                  Voice and Contact Centre Technology exception
                </option>
              </select>
            </div>
            <button
              className="govuk-button govuk-button--secondary"
              data-module="govuk-button"
            >
              Reset policy times
            </button>
          </form>
        </div>
      </details>
      <div className="govuk-inset-text">
        <strong>Local-only safety</strong>
        <p className="govuk-body">
          This application has no authentication. It is safe only while it
          remains bound to localhost on your device.
        </p>
      </div>
    </>
  );
}
