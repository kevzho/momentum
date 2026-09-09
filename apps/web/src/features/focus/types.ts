import type { FocusHistory } from "@momentum/core/focus";
import type {
  FocusPause,
  FocusSession,
  IanaTimeZone,
  Instant,
  LocalDate,
  Minutes,
  Project,
  ProjectColor,
  TaskPriority,
  Uuid,
} from "@momentum/core/types";

/**
 * What `/focus` reads, resolved on the server.
 *
 * The client island renders this and nothing else: it fetches nothing, and the
 * only clock it reads is corrected against `serverNow` (Domain Rule 5).
 */

/** A task the user can attribute a session to. */
export interface FocusTaskOption {
  id: Uuid;
  title: string;
  priority: TaskPriority;
  estimatedMinutes: Minutes | null;
  /** Measured so far, from earlier sessions (Domain Rule 3). */
  actualMinutes: Minutes;
  projectId: Uuid | null;
  projectName: string | null;
  projectColor: ProjectColor | null;
}

/**
 * The live session, with everything the timer needs to derive its own numbers.
 *
 * The pauses travel with it deliberately: remaining time is a function of the
 * start and the pause spans, so a payload carrying one without the other would
 * be a payload the client had to guess from.
 */
export interface LiveFocusSession {
  session: FocusSession;
  pauses: FocusPause[];
  task: FocusTaskOption | null;
}

/** One row of the recent-sessions list. */
export interface FocusSessionRow {
  session: FocusSession;
  /** Resolved at read time from the task, so a renamed task renames its history. */
  taskTitle: string | null;
  projectName: string | null;
  projectColor: ProjectColor | null;
}

export interface FocusPageData {
  /**
   * The instant the server rendered at. The client measures its own clock
   * against this once, and applies the difference to every reading afterwards
   * — so a device whose clock is minutes out still shows the session the
   * database is timing.
   */
  serverNow: Instant;
  timezone: IanaTimeZone;
  today: LocalDate;
  /** The seven dates of the user's current week, in their week-start order. */
  week: LocalDate[];
  live: LiveFocusSession | null;
  history: FocusHistory;
  recent: FocusSessionRow[];
  projects: Project[];
  /** Open tasks a session can be attributed to, best candidates first. */
  tasks: FocusTaskOption[];
  /** From `?task=`: the task a session was launched for, if it is still open. */
  requestedTaskId: Uuid | null;
  /** From `?minutes=`: the length a calendar block suggested. */
  requestedMinutes: Minutes | null;
  /**
   * Focus XP in the ledger over the cap's own window — the last 24 hours,
   * rolling (docs/DOMAIN_RULES.md §21) — so the page can state the cap against
   * the number the database is actually holding it to.
   */
  focusXpInCapWindow: number;
}
