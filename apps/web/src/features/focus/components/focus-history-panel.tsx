"use client";

import { TimerIcon } from "lucide-react";

import { formatDuration, formatLocalDate, formatTime, localDateOf } from "@momentum/core/time";
import type {
  FocusSessionStatus,
  IanaTimeZone,
  Instant,
  LocalDate,
  ProjectColor,
  Uuid,
} from "@momentum/core/types";

import { EmptyState } from "@momentum/ui/components/empty-state";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { Separator } from "@momentum/ui/components/separator";
import { StatTile } from "@momentum/ui/components/stat-tile";

import { FOCUS_COPY, describeTotals, describeXpInCapWindow } from "@/features/focus/copy";
import type { FocusPageData } from "@/features/focus/types";

/** Totals, by-project and recent sessions, all from one server read. The XP line never predicts what a running session will earn. */

export function FocusHistoryPanel({ data }: { data: FocusPageData }) {
  const { history, recent, timezone, today } = data;

  return (
    <section aria-label={FOCUS_COPY.historyRegionLabel} className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <StatTile
          label={FOCUS_COPY.focused}
          value={formatDuration(history.today.focusedMinutes)}
          hint={FOCUS_COPY.todayLabel}
        />
        <StatTile
          label={FOCUS_COPY.sessions}
          value={history.today.completedSessions}
          hint={FOCUS_COPY.todayLabel}
        />
        <StatTile
          label={FOCUS_COPY.focused}
          value={formatDuration(history.week.focusedMinutes)}
          hint={FOCUS_COPY.weekLabel}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {describeXpInCapWindow(data.focusXpInCapWindow)}
      </p>

      <Separator />

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {FOCUS_COPY.byProject}
        </h2>
        {history.byProject.length === 0 ? (
          <p className="text-sm text-muted-foreground">{FOCUS_COPY.noneToday}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {history.byProject.map((entry) => (
              <li key={entry.projectId ?? "none"} className="flex items-center gap-2 text-sm">
                <ProjectDot color={colorOf(data, entry.projectId)} />
                <span className="min-w-0 flex-1 truncate">{nameOf(data, entry.projectId)}</span>
                <span data-slot="numeric" className="shrink-0 text-muted-foreground">
                  {describeTotals(entry)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {FOCUS_COPY.recent}
        </h2>
        {recent.length === 0 ? (
          <EmptyState icon={TimerIcon} title={FOCUS_COPY.noneYet} compact />
        ) : (
          <ul className="flex flex-col divide-y">
            {recent.map((row) => (
              <li key={row.session.id} className="flex items-center gap-3 py-2">
                <TimerIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{row.taskTitle ?? FOCUS_COPY.noTask}</p>
                  <p data-slot="numeric" className="text-xs text-muted-foreground">
                    {when(row.session.startedAt, timezone, today)} ·{" "}
                    {statusLabel(row.session.status)}
                  </p>
                </div>
                <span data-slot="numeric" className="shrink-0 text-sm">
                  {row.session.actualMinutes === null
                    ? "—"
                    : formatDuration(row.session.actualMinutes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** "14:05" for today, "Mon 14:05" for any other day, using the server-resolved `today`. */
function when(startedAt: Instant, timezone: IanaTimeZone, today: LocalDate): string {
  const date = localDateOf(startedAt, timezone);
  const time = formatTime(startedAt, timezone);
  return date === today ? time : `${formatLocalDate(date, "monthDay")} ${time}`;
}

/** `abandoned` is a database enum value; a person reads "Ended early". */
function statusLabel(status: FocusSessionStatus): string {
  switch (status) {
    case "completed":
      return FOCUS_COPY.statusCompleted;
    case "abandoned":
      return FOCUS_COPY.statusEndedEarly;
    case "paused":
      return FOCUS_COPY.statusPaused;
    default:
      return FOCUS_COPY.statusRunning;
  }
}

function nameOf(data: FocusPageData, projectId: Uuid | null): string {
  if (projectId === null) return FOCUS_COPY.noProject;
  return data.projects.find((project) => project.id === projectId)?.name ?? FOCUS_COPY.noProject;
}

function colorOf(data: FocusPageData, projectId: Uuid | null): ProjectColor {
  if (projectId === null) return "slate";
  return data.projects.find((project) => project.id === projectId)?.color ?? "slate";
}
