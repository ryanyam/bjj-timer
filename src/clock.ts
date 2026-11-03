export interface ClockParts {
  readonly date: string;
  readonly time: string;
  readonly period: string;
}

/**
 * Formats the device's local short date ("Tue, Nov 3") and 12-hour time with
 * hour and minutes. `locale` is optional so the app follows the device and
 * tests can pin one.
 */
export function formatClock(date: Date, locale?: string): ClockParts {
  const dateText = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);

  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return {
    date: dateText,
    time: `${part("hour")}:${part("minute")}`,
    period: part("dayPeriod").toUpperCase(),
  };
}
