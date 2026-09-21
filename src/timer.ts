/**
 * Pure timestamp math for the round timer.
 *
 * This module is deliberately free of React and of the DOM. Timer accuracy
 * lives here, so it can be tested by calling functions rather than by rendering
 * something and watching it, and there is exactly one place that decides what
 * "time left" means.
 */

/** Length of one round, in milliseconds. Single-round timer for now. */
export const ROUND_MS = 5 * 60 * 1000;

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;

/**
 * Milliseconds left until `deadline`, measured against `now`.
 *
 * Both arguments are `Date.now()`-style epoch milliseconds. The caller holds the
 * deadline and re-derives the remainder on every tick, rather than storing a
 * counter and subtracting from it. That is what makes the countdown
 * self-correcting: a missed or late tick costs nothing, because the next tick
 * reads the clock again instead of accumulating a running total. If the machine
 * sleeps for thirty seconds mid-round, the next tick is simply right.
 *
 * Clamped at zero. Once the deadline has passed there is no such thing as
 * negative time left, and letting the value go negative would surface as a
 * "-0:01" on the display after a sleep mid-round.
 */
export function remainingMs(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

/**
 * Formats a remaining duration as "M:SS": minutes unpadded, seconds padded to
 * two digits, so a five minute round reads "5:00" and runs down to "0:00".
 *
 * Truncates rather than rounds. With 7.6 seconds left, "0:07" is honest, while
 * rounding would show "0:08" — a second that has not elapsed yet.
 *
 * Known cost of truncating, measured against this function rather than assumed:
 * a round reads "0:00" for its final 999 ms, so it looks finished about a second
 * early, and a fresh "5:00" is on screen for only about 1 ms. Rounding up with
 * Math.ceil would fix both, at the price of showing "0:08" when 7.6 s remain.
 * Deferred on purpose until there is an end-of-round signal (bell, flash), which
 * is the point where an early 0:00 starts to matter. Revisit then.
 */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
