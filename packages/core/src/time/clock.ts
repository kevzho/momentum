import type { Instant } from "../types/scalars";
import { epochOf, instantFromEpoch } from "./internal";

/** A source of epoch milliseconds; injected so tests can pin it. */
export type Clock = () => number;

/** `Date.now` by default; pass a stub in tests to make the result deterministic. */
export function nowInstant(clock: Clock = Date.now): Instant {
  return instantFromEpoch(clock());
}

/**
 * How far a local clock is from the server's, in milliseconds. Session
 * timestamps are stamped by the database, so a device clock that is minutes
 * out would render a wrong or negative timer; apply this through `offsetClock`.
 * Request latency is inside the number and is below display resolution.
 */
export function clockOffsetMs(serverNow: Instant, localNow: Instant): number {
  return epochOf(serverNow) - epochOf(localNow);
}

/** `Date.now` shifted by `offsetMs`. Pass it to `nowInstant`. */
export function offsetClock(offsetMs: number, clock: Clock = Date.now): Clock {
  return () => clock() + offsetMs;
}
