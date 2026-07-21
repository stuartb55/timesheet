const MINUTES_PER_DAY = 24 * 60;

export function parseTime(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time: ${value}`);
  return hours * 60 + minutes;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function formatTime(minutes: number): string {
  const normalised =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalised / 60)).padStart(2, "0")}:${String(normalised % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number, signed = false): string {
  const sign = minutes < 0 ? "−" : signed && minutes > 0 ? "+" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  if (hours === 0) return `${sign}${remainder} min`;
  if (remainder === 0) return `${sign}${hours} hr${hours === 1 ? "" : "s"}`;
  return `${sign}${hours} hr${hours === 1 ? "" : "s"} ${remainder} min`;
}

export function formatDate(
  value: string | Date,
  pattern: string = "dd/MM/yyyy",
): string {
  const date = typeof value === "string" ? dateAtUtcMidnight(value) : value;
  if (pattern === "yyyy-MM-dd") return isoDate(date);
  if (pattern === "d MMMM yyyy") {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: "Europe/London",
  }).format(value);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateAtUtcMidnight(value: string): Date {
  if (!isValidIsoDate(value)) throw new Error(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  const value = dateAtUtcMidnight(date);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

export function daysBetween(from: string, to: string): number {
  return Math.floor(
    (dateAtUtcMidnight(to).getTime() - dateAtUtcMidnight(from).getTime()) /
      86_400_000,
  );
}

export function weekdayIndex(date: string): number {
  const jsDay = dateAtUtcMidnight(date).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function periodBounds(
  anchorDate: string,
  date: string,
): { start: string; end: string } {
  const difference = daysBetween(anchorDate, date);
  const periodOffset = Math.floor(difference / 28) * 28;
  const start = addDays(anchorDate, periodOffset);
  return { start, end: addDays(start, 27) };
}

export function localDateAndMinute(
  date: Date,
  timeZone = "Europe/London",
): { date: string; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Convert a Europe/London wall-clock value to an instant, including DST. */
export function londonWallTimeToUtc(date: string, minute: number): Date {
  if (
    !isValidIsoDate(date) ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute >= MINUTES_PER_DAY
  ) {
    throw new Error("Enter a valid date and time");
  }
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  const nominalUtc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hour,
    min,
  );
  let candidate = new Date(nominalUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = localDateAndMinute(candidate);
    const dateDelta = daysBetween(local.date, date) * MINUTES_PER_DAY;
    const minuteDelta = minute - local.minute + dateDelta;
    if (minuteDelta === 0) return candidate;
    candidate = new Date(candidate.getTime() + minuteDelta * 60_000);
  }
  const converted = localDateAndMinute(candidate);
  if (converted.date !== date || converted.minute !== minute) {
    throw new Error(
      "That local time does not exist because the clocks change on this date",
    );
  }
  return candidate;
}
