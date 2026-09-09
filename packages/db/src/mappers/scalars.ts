import { instant, localDate, localTime } from "@momentum/core/time";
import type { Instant, LocalDate, LocalTime } from "@momentum/core/types";

import type { Json } from "../types";

export function toInstant(value: string): Instant {
  return instant(value);
}

export function toInstantOrNull(value: string | null): Instant | null {
  return value === null ? null : instant(value);
}

export function toLocalDate(value: string): LocalDate {
  return localDate(value);
}

export function toLocalDateOrNull(value: string | null): LocalDate | null {
  return value === null ? null : localDate(value);
}

export function toLocalTimeOrNull(value: string | null): LocalTime | null {
  return value === null ? null : localTime(value);
}

export function isJsonObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonArray(value: Json | undefined): value is Json[] {
  return Array.isArray(value);
}

/** Narrows a loosely constrained column value to a domain union member; throws on a miss, which is a schema bug. */
export function oneOf<T>(members: readonly T[], value: unknown, context: string): T {
  if ((members as readonly unknown[]).includes(value)) {
    return value as T;
  }
  throw new TypeError(`${context}: unexpected value ${JSON.stringify(value)}`);
}
