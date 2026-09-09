import type { Instant } from "../types/scalars";
import { epochOf, instantFromEpoch } from "./internal";

/**
 * A source of epoch milliseconds. Everything time-dependent in the product
 * takes the current instant as an argument rather than reaching for
 * `Date.now()` itself, so a test can pin the clock and a server component can
 * resolve "today" once per request (docs/ARCHITECTURE.md §10).
 */
export type Clock = () => number;

/** `Date.now` by default; pass a stub in tests to make the result deterministic. */
export function nowInstant(clock: Clock = Date.now): Instant {
  return instantFromEpoch(clock());
}

/**
 * How far a local clock is from the server's, in milliseconds.
 *
 * Every timestamp a focus session is derived from was stamped by the database
 * (Domain Rule 15), but the browser subtracts them from *its own* `Date.now()`
 * — and a device whose clock is a few minutes out would render a timer that is
 * a few minutes out, or a negative one. The server hands the client the instant
 * it rendered at; the difference between that and the client's reading at the
 * same moment is the correction, applied through `offsetClock` below.
 *
 * It corrects a *wrong clock*, not a slow network: the request's own latency is
 * inside this number and is worth a second at most, which is below the
 * resolution anything here is displayed at. Sleeping the machine does not
 * invalidate it, because wall-clock time keeps running across sleep — which is
 * the whole reason the timer reads a clock instead of counting ticks.
 */
export function clockOffsetMs(serverNow: Instant, localNow: Instant): number {
  return epochOf(serverNow) - epochOf(localNow);
}

/** `Date.now` shifted by `offsetMs`. Pass it to `nowInstant`. */
export function offsetClock(offsetMs: number, clock: Clock = Date.now): Clock {
  return () => clock() + offsetMs;
}
