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
 * Formats a duration as "M:SS": minutes unpadded, seconds padded to two digits,
 * so a five minute round reads "5:00" and runs down to "0:00".
 *
 * Rounds UP to the next whole second, so the value shown is "seconds still to
 * come". That is what makes a countdown behave at both ends:
 *   - 300000 ms and 299999 ms both read "5:00", so a fresh five minute round is
 *     on screen for its whole first second instead of flipping to 4:59 at the
 *     first repaint
 *   - 1000 ms reads "0:01" and 1 ms still reads "0:01", so "0:00" appears only
 *     when the deadline has actually been reached
 *
 * The cost, stated plainly: 7.6 s remaining reads "0:08". That is the usual
 * countdown convention — the display never claims less time is left than there
 * really is. This replaced an earlier truncating version, which showed "0:00"
 * for the final 999 ms and lost "5:00" after one 250 ms tick.
 */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
