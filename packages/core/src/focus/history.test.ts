import { describe, expect, it } from "vitest";

import { instant, ianaTimeZone, localDate } from "../time/scalars";
import { weekOf } from "../time/calendar-date";
import type { FocusSession, FocusSessionStatus } from "../types/focus";
import type { Instant, LocalDate, Uuid } from "../types/scalars";
import { summariseFocus } from "./history";

const NEW_YORK = ianaTimeZone("America/New_York");
const TODAY = localDate("2026-09-07");
const WEEK = weekOf(TODAY, 1).days;
const PROJECT_A: Uuid = "11111111-1111-4111-8111-111111111111";
const PROJECT_B: Uuid = "22222222-2222-4222-8222-222222222222";

let counter = 0;

function session(over: {
  startedAt: Instant;
  actualMinutes?: number | null;
  status?: FocusSessionStatus;
  projectId?: Uuid | null;
}): FocusSession {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    userId: "99999999-9999-4999-8999-999999999999",
    taskId: null,
    projectId: over.projectId ?? null,
    plannedMinutes: 25,
    actualMinutes: over.actualMinutes === undefined ? 25 : over.actualMinutes,
    startedAt: over.startedAt,
    endedAt: over.startedAt,
    status: over.status ?? "completed",
    interruptionCount: 0,
    createdAt: over.startedAt,
  };
}

function summarise(sessions: FocusSession[], today: LocalDate = TODAY) {
  return summariseFocus({ sessions, timezone: NEW_YORK, today, week: WEEK });
}

describe("summariseFocus", () => {
  it("counts nothing when there is nothing", () => {
    const result = summarise([]);

    expect(result.today).toEqual({ focusedMinutes: 0, completedSessions: 0 });
    expect(result.week).toEqual({ focusedMinutes: 0, completedSessions: 0 });
    expect(result.byProject).toEqual([]);
  });

  it("sums today's finished sessions", () => {
    const result = summarise([
      session({ startedAt: instant("2026-09-07T13:00:00.000Z"), actualMinutes: 25 }),
      session({ startedAt: instant("2026-09-07T18:30:00.000Z"), actualMinutes: 48 }),
    ]);

    expect(result.today).toEqual({ focusedMinutes: 73, completedSessions: 2 });
  });

  it("attributes a session to the local date it started on, not the UTC one", () => {
    // 23:40 on Monday in New York is 03:40 Tuesday in UTC.
    const result = summarise([
      session({ startedAt: instant("2026-09-08T03:40:00.000Z"), actualMinutes: 30 }),
    ]);

    expect(result.today).toEqual({ focusedMinutes: 30, completedSessions: 1 });
  });

  it("ignores a session that has not recorded any minutes yet", () => {
    const result = summarise([
      session({
        startedAt: instant("2026-09-07T13:00:00.000Z"),
        actualMinutes: null,
        status: "running",
      }),
    ]);

    expect(result.today.focusedMinutes).toBe(0);
    expect(result.today.completedSessions).toBe(0);
  });

  it("counts an abandoned session's minutes but not as a completed session", () => {
    const result = summarise([
      session({
        startedAt: instant("2026-09-07T13:00:00.000Z"),
        actualMinutes: 9,
        status: "abandoned",
      }),
    ]);

    expect(result.today).toEqual({ focusedMinutes: 9, completedSessions: 0 });
  });

  it("sums the week and leaves out what falls outside it", () => {
    const result = summarise([
      session({ startedAt: instant("2026-09-01T13:00:00.000Z"), actualMinutes: 60 }),
      session({ startedAt: instant("2026-09-07T13:00:00.000Z"), actualMinutes: 25 }),
      session({ startedAt: instant("2026-09-11T13:00:00.000Z"), actualMinutes: 40 }),
      session({ startedAt: instant("2026-09-20T13:00:00.000Z"), actualMinutes: 90 }),
    ]);

    expect(result.week).toEqual({ focusedMinutes: 65, completedSessions: 2 });
    expect(result.today.focusedMinutes).toBe(25);
  });

  it("totals the week by project, largest first, with no project as its own bucket", () => {
    const result = summarise([
      session({
        startedAt: instant("2026-09-07T13:00:00.000Z"),
        actualMinutes: 25,
        projectId: PROJECT_A,
      }),
      session({
        startedAt: instant("2026-09-08T13:00:00.000Z"),
        actualMinutes: 50,
        projectId: PROJECT_B,
      }),
      session({
        startedAt: instant("2026-09-09T13:00:00.000Z"),
        actualMinutes: 40,
        projectId: PROJECT_A,
      }),
      session({ startedAt: instant("2026-09-10T13:00:00.000Z"), actualMinutes: 10 }),
    ]);

    expect(result.byProject).toEqual([
      { projectId: PROJECT_A, focusedMinutes: 65, completedSessions: 2 },
      { projectId: PROJECT_B, focusedMinutes: 50, completedSessions: 1 },
      { projectId: null, focusedMinutes: 10, completedSessions: 1 },
    ]);
  });
});
