import type { AuthorisedCredit, FlexiLeave, TimeSegment } from "@prisma/client";
import {
  deleteCredit,
  deleteFlexiLeave,
  deleteTimeSegment,
  saveCredit,
  saveFlexiLeave,
  saveTimeSegment,
} from "@/app/actions";
import { formatTime, localDateAndMinute } from "@/domain/time";
import { CREDIT_LABELS, SEGMENT_LABELS } from "@/lib/constants";

const approvalOptions = [
  ["NOT_REQUIRED", "Approval not required"],
  ["PENDING", "Approval required and pending"],
  ["APPROVED", "External approval obtained"],
  ["REFUSED", "External approval refused"],
] as const;

function ApprovalFields({
  prefix,
  status = "NOT_REQUIRED",
  approvalDate,
  approvalNote,
}: {
  prefix: string;
  status?: string;
  approvalDate?: Date | null;
  approvalNote?: string | null;
}) {
  return (
    <fieldset className="govuk-fieldset">
      <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
        External approval
      </legend>
      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor={`${prefix}-approval-status`}>
          Approval status
        </label>
        <select
          className="govuk-select"
          id={`${prefix}-approval-status`}
          name="approvalStatus"
          defaultValue={status}
        >
          {approvalOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor={`${prefix}-approval-date`}>
          Approval date (optional)
        </label>
        <input
          className="govuk-input govuk-input--width-10"
          id={`${prefix}-approval-date`}
          name="approvalDate"
          type="date"
          defaultValue={approvalDate?.toISOString().slice(0, 10)}
        />
      </div>
      <div className="govuk-form-group">
        <label className="govuk-label" htmlFor={`${prefix}-approval-note`}>
          Approval note or reference (optional)
        </label>
        <input
          className="govuk-input"
          id={`${prefix}-approval-note`}
          name="approvalNote"
          defaultValue={approvalNote ?? ""}
        />
      </div>
    </fieldset>
  );
}

export function TimeSegmentForm({
  date,
  segment,
}: {
  date: string;
  segment?: TimeSegment;
}) {
  const prefix = `segment-${segment?.id ?? "new"}`;
  const start = segment
    ? localDateAndMinute(segment.startAt).minute
    : undefined;
  const end = segment?.endAt
    ? localDateAndMinute(segment.endAt).minute
    : undefined;
  return (
    <div>
      <form action={saveTimeSegment}>
        <input type="hidden" name="date" value={date} />
        {segment && <input type="hidden" name="id" value={segment.id} />}
        <div className="app-grid">
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-start`}>
              Start time
            </label>
            <input
              className="govuk-input govuk-input--width-5"
              id={`${prefix}-start`}
              name="startTime"
              type="time"
              required
              defaultValue={start === undefined ? "" : formatTime(start)}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-finish`}>
              Finish time
            </label>
            <input
              className="govuk-input govuk-input--width-5"
              id={`${prefix}-finish`}
              name="endTime"
              type="time"
              required
              defaultValue={end === undefined ? "" : formatTime(end)}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-type`}>
              Segment type
            </label>
            <select
              className="govuk-select"
              id={`${prefix}-type`}
              name="type"
              defaultValue={segment?.type ?? "NORMAL_WORK"}
            >
              {Object.entries(SEGMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor={`${prefix}-note`}>
            Note (optional)
          </label>
          <textarea
            className="govuk-textarea"
            id={`${prefix}-note`}
            name="note"
            rows={2}
            defaultValue={segment?.note ?? ""}
          />
        </div>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor={`${prefix}-scheduled-start`}>
            Scheduled time on the rota (required for rota boot-up)
          </label>
          <input
            className="govuk-input govuk-input--width-5"
            id={`${prefix}-scheduled-start`}
            name="scheduledStart"
            type="time"
            defaultValue={
              segment?.scheduledStartMinutes === null ||
              segment?.scheduledStartMinutes === undefined
                ? ""
                : formatTime(segment.scheduledStartMinutes)
            }
          />
        </div>
        <div className="govuk-form-group">
          <div
            className="govuk-checkboxes govuk-checkboxes--small"
            data-module="govuk-checkboxes"
          >
            <div className="govuk-checkboxes__item">
              <input
                className="govuk-checkboxes__input"
                id={`${prefix}-official-travel`}
                name="officialTravelConfirmed"
                type="checkbox"
                value="true"
                defaultChecked={segment?.officialTravelConfirmed}
              />
              <label
                className="govuk-label govuk-checkboxes__label"
                htmlFor={`${prefix}-official-travel`}
              >
                This was official travel and was not my normal journey between
                home and my usual office.
              </label>
            </div>
          </div>
        </div>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor={`${prefix}-agreed-finish`}>
            Agreed normal finishing time (required for overtime)
          </label>
          <input
            className="govuk-input govuk-input--width-5"
            id={`${prefix}-agreed-finish`}
            name="agreedNormalFinish"
            type="time"
            defaultValue={
              segment?.agreedNormalFinishMinutes === null ||
              segment?.agreedNormalFinishMinutes === undefined
                ? ""
                : formatTime(segment.agreedNormalFinishMinutes)
            }
          />
        </div>
        <ApprovalFields
          prefix={prefix}
          status={segment?.approvalStatus}
          approvalDate={segment?.approvalDate}
          approvalNote={segment?.approvalNote}
        />
        <button className="govuk-button" data-module="govuk-button">
          {segment ? "Save changes" : "Add time segment"}
        </button>
      </form>
      {segment && (
        <form action={deleteTimeSegment}>
          <input type="hidden" name="id" value={segment.id} />
          <input type="hidden" name="date" value={date} />
          <div
            className="govuk-checkboxes govuk-checkboxes--small"
            data-module="govuk-checkboxes"
          >
            <div className="govuk-checkboxes__item">
              <input
                className="govuk-checkboxes__input"
                id={`${prefix}-confirm-delete`}
                name="confirm"
                type="checkbox"
                value="true"
              />
              <label
                className="govuk-label govuk-checkboxes__label"
                htmlFor={`${prefix}-confirm-delete`}
              >
                I confirm I want to remove this segment
              </label>
            </div>
          </div>
          <button
            className="govuk-button govuk-button--warning"
            data-module="govuk-button"
          >
            Remove segment
          </button>
        </form>
      )}
    </div>
  );
}

export function CreditForm({
  date,
  credit,
  expectedMinutes,
}: {
  date: string;
  credit?: AuthorisedCredit;
  expectedMinutes: number;
}) {
  const prefix = `credit-${credit?.id ?? "new"}`;
  const start = credit?.startAt
    ? localDateAndMinute(credit.startAt).minute
    : undefined;
  const end = credit?.endAt
    ? localDateAndMinute(credit.endAt).minute
    : undefined;
  return (
    <div>
      <form action={saveCredit}>
        <input type="hidden" name="date" value={date} />
        {credit && <input type="hidden" name="id" value={credit.id} />}
        <div className="app-grid">
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-type`}>
              Credit type
            </label>
            <select
              className="govuk-select"
              id={`${prefix}-type`}
              name="type"
              defaultValue={credit?.type ?? "ANNUAL_LEAVE"}
            >
              {Object.entries(CREDIT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-duration`}>
              Duration in minutes (optional when times are entered)
            </label>
            <input
              className="govuk-input govuk-input--width-5"
              id={`${prefix}-duration`}
              name="durationMinutes"
              type="number"
              min="1"
              max="1440"
              defaultValue={credit?.durationMinutes ?? (expectedMinutes || "")}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-start`}>
              Start time (optional)
            </label>
            <input
              className="govuk-input govuk-input--width-5"
              id={`${prefix}-start`}
              name="startTime"
              type="time"
              defaultValue={start === undefined ? "" : formatTime(start)}
            />
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-finish`}>
              Finish time (optional)
            </label>
            <input
              className="govuk-input govuk-input--width-5"
              id={`${prefix}-finish`}
              name="endTime"
              type="time"
              defaultValue={end === undefined ? "" : formatTime(end)}
            />
          </div>
        </div>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor={`${prefix}-note`}>
            Note
          </label>
          <textarea
            className="govuk-textarea"
            id={`${prefix}-note`}
            name="note"
            rows={2}
            defaultValue={credit?.note ?? ""}
          />
        </div>
        <ApprovalFields
          prefix={prefix}
          status={credit?.approvalStatus ?? "PENDING"}
          approvalDate={credit?.approvalDate}
          approvalNote={credit?.approvalNote}
        />
        <button className="govuk-button" data-module="govuk-button">
          {credit ? "Save credit changes" : "Add authorised credit"}
        </button>
      </form>
      {credit && (
        <form action={deleteCredit}>
          <input type="hidden" name="id" value={credit.id} />
          <input type="hidden" name="date" value={date} />
          <div
            className="govuk-checkboxes govuk-checkboxes--small"
            data-module="govuk-checkboxes"
          >
            <div className="govuk-checkboxes__item">
              <input
                className="govuk-checkboxes__input"
                id={`${prefix}-confirm-delete`}
                name="confirm"
                type="checkbox"
                value="true"
              />
              <label
                className="govuk-label govuk-checkboxes__label"
                htmlFor={`${prefix}-confirm-delete`}
              >
                I confirm I want to remove this credit
              </label>
            </div>
          </div>
          <button
            className="govuk-button govuk-button--warning"
            data-module="govuk-button"
          >
            Remove credit
          </button>
        </form>
      )}
    </div>
  );
}

export function FlexiLeaveForm({
  date,
  leave,
  expectedMinutes,
}: {
  date: string;
  leave?: FlexiLeave;
  expectedMinutes: number;
}) {
  const prefix = `leave-${leave?.id ?? "new"}`;
  return (
    <div>
      <form action={saveFlexiLeave}>
        <input type="hidden" name="date" value={date} />
        {leave && <input type="hidden" name="id" value={leave.id} />}
        <div className="app-grid">
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-type`}>
              Leave type
            </label>
            <select
              className="govuk-select"
              id={`${prefix}-type`}
              name="kind"
              defaultValue={leave?.kind ?? "FULL_DAY"}
            >
              <option value="FULL_DAY">Full day</option>
              <option value="HALF_DAY">Half day</option>
              <option value="PARTIAL">Partial or shorter working day</option>
            </select>
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-duration`}>
              Duration in minutes
            </label>
            <input
              className="govuk-input govuk-input--width-5"
              id={`${prefix}-duration`}
              name="durationMinutes"
              type="number"
              min="1"
              max="1440"
              required
              defaultValue={leave?.durationMinutes ?? expectedMinutes}
            />
          </div>
          <div className="govuk-form-group">
            <label
              className="govuk-label"
              htmlFor={`${prefix}-approval-status`}
            >
              Approval status
            </label>
            <select
              className="govuk-select"
              id={`${prefix}-approval-status`}
              name="approvalStatus"
              defaultValue={leave?.approvalStatus ?? "PENDING"}
            >
              <option value="PENDING">External approval pending</option>
              <option value="APPROVED">External approval obtained</option>
              <option value="REFUSED">External approval refused</option>
            </select>
          </div>
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor={`${prefix}-approval-date`}>
              Approval date (optional)
            </label>
            <input
              className="govuk-input govuk-input--width-10"
              id={`${prefix}-approval-date`}
              name="approvalDate"
              type="date"
              defaultValue={leave?.approvalDate?.toISOString().slice(0, 10)}
            />
          </div>
        </div>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor={`${prefix}-note`}>
            Note
          </label>
          <textarea
            className="govuk-textarea"
            id={`${prefix}-note`}
            name="note"
            rows={2}
            defaultValue={leave?.note ?? ""}
          />
        </div>
        <button className="govuk-button" data-module="govuk-button">
          {leave ? "Save flexi leave changes" : "Record flexi leave"}
        </button>
      </form>
      {leave && (
        <form action={deleteFlexiLeave}>
          <input type="hidden" name="id" value={leave.id} />
          <input type="hidden" name="date" value={date} />
          <div
            className="govuk-checkboxes govuk-checkboxes--small"
            data-module="govuk-checkboxes"
          >
            <div className="govuk-checkboxes__item">
              <input
                className="govuk-checkboxes__input"
                id={`${prefix}-confirm-delete`}
                name="confirm"
                type="checkbox"
                value="true"
              />
              <label
                className="govuk-label govuk-checkboxes__label"
                htmlFor={`${prefix}-confirm-delete`}
              >
                I confirm I want to remove this leave record
              </label>
            </div>
          </div>
          <button
            className="govuk-button govuk-button--warning"
            data-module="govuk-button"
          >
            Remove flexi leave
          </button>
        </form>
      )}
    </div>
  );
}
