import { useEffect, useState } from "react";
import { formatClock } from "./clock";

/**
 * The header's local wall clock. It owns its own one-second interval, so its
 * updates cannot restart or perturb the timer effects in App.
 */
export function LiveClock({ locale }: { locale?: string } = {}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 1_000);

    return () => clearInterval(intervalId);
  }, []);

  const { date, time, period } = formatClock(now, locale);

  return (
    <div className="app-clock" aria-label="Current local date and time">
      <span className="app-clock__date">{date}</span>
      <span className="app-clock__time-row">
        <time className="app-clock__time" dateTime={now.toISOString()}>
          {time}
        </time>
        {period !== "" && (
          <span className="app-clock__period">{period}</span>
        )}
      </span>
    </div>
  );
}
