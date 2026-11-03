export interface ClockParts {
  readonly date: string;
  readonly time: string;
  readonly period: string;
}

/**
 * Formats the device's local date and a 12-hour time with seconds.
 * `locale` is optional so the app follows the device and tests can pin one.
 */
export function formatClock(date: Date, locale?: string): ClockParts {
  const dateText = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
    .format(date)
    .toUpperCase();

  const parts = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return {
    date: dateText,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
    period: part("dayPeriod").toUpperCase(),
  };
}
