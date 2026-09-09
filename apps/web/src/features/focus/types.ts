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

/** A task the user can attribute a session to. */
export interface FocusTaskOption {
  id: Uuid;
  title: string;
  priority: TaskPriority;
  estimatedMinutes: Minutes | null;
  /** Measured so far, from earlier sessions. */
  actualMinutes: Minutes;
  projectId: Uuid | null;
  projectName: string | null;
  projectColor: ProjectColor | null;
}

/** The live session with its pauses: remaining time is a function of both. */
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
  /** The instant the server rendered at; the client corrects its own clock against it once. */
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
  /** Focus XP awarded over the cap's own rolling 24-hour window. */
  focusXpInCapWindow: number;
}
