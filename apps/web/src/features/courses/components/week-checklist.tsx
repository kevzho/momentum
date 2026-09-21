"use client";

import * as React from "react";
import { ExternalLinkIcon, XIcon } from "lucide-react";

import { daysOfSpan, type CourseWeekSpan } from "@momentum/core/courses";
import { formatLocalDate } from "@momentum/core/time";
import { COURSE_ITEM_KINDS } from "@momentum/core/types";
import type { CourseItem, CourseItemKind, LocalDate } from "@momentum/core/types";

import { Checkbox } from "@momentum/ui/components/checkbox";
import { Input } from "@momentum/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";
import { cn } from "@momentum/ui/lib/utils";

import type { NewCourseItemDraft } from "@/features/courses/types";

/**
 * A week's readings, links and exercises as a checklist. Each entry can be
 * planned for one day of the week; Today lists it on that day. Ticking an
 * entry earns nothing — it is a note, not a task. The composer at the foot
 * adds one on Enter; a pasted URL becomes the link and the rest the title.
 */

export const KIND_LABEL: Record<CourseItemKind, string> = {
  reading: "Reading",
  link: "Link",
  exercise: "Exercise",
};

/** Radix models "no selection" as the empty string, so "any day" needs a value of its own. */
const ANY_DAY = "any";

const URL_IN_TEXT = /https?:\/\/\S+/iu;

export interface WeekChecklistProps {
  span: CourseWeekSpan;
  items: readonly CourseItem[];
  today: LocalDate;
  pending: boolean;
  onAdd: (draft: NewCourseItemDraft) => void;
  onToggle: (item: CourseItem, done: boolean) => void;
  onPlan: (item: CourseItem, plannedOn: LocalDate | null) => void;
  onKind: (item: CourseItem, kind: CourseItemKind) => void;
  onRemove: (item: CourseItem) => void;
}

export function WeekChecklist({
  span,
  items,
  today,
  pending,
  onAdd,
  onToggle,
  onPlan,
  onKind,
  onRemove,
}: WeekChecklistProps) {
  const days = React.useMemo(() => daysOfSpan(span), [span]);
  const [draft, setDraft] = React.useState("");
  const [draftKind, setDraftKind] = React.useState<CourseItemKind>("reading");
  const [draftDay, setDraftDay] = React.useState<LocalDate | null>(null);

  // Select speaks strings; a day is looked up among the week's own, never cast.
  function dayOf(value: string): LocalDate | null {
    return days.find((day) => day === value) ?? null;
  }
  const listLabel = `Week ${span.number} checklist`;

  function submit(): void {
    const parsed = splitLink(draft);
    if (parsed === null || pending) return;
    onAdd({
      id: crypto.randomUUID(),
      weekNumber: span.number,
      // A pasted link is a link unless the user said otherwise.
      kind: draftKind === "reading" && parsed.url !== null ? "link" : draftKind,
      title: parsed.title,
      url: parsed.url,
      plannedOn: draftDay,
    });
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1">
      {items.length === 0 ? null : (
        <ul aria-label={listLabel} className="flex flex-col gap-0.5">
          {items.map((item) => {
            const done = item.completedAt !== null;
            return (
              <li
                key={item.id}
                className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60 has-focus-visible:bg-muted/60"
              >
                <Checkbox
                  checked={done}
                  aria-label={`${item.title}${done ? ", done" : ""}`}
                  onCheckedChange={(next) => onToggle(item, next === true)}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    done && "text-muted-foreground line-through",
                  )}
                >
                  {item.url === null ? (
                    item.title
                  ) : (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                    >
                      {item.title}
                      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden="true" />
                    </a>
                  )}
                </span>

                <Select value={item.kind} onValueChange={(kind) => onKind(item, asKind(kind))}>
                  <SelectTrigger
                    size="sm"
                    aria-label={`${item.title}: kind`}
                    className="h-6 border-transparent px-1.5 text-xs text-muted-foreground hover:border-input"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COURSE_ITEM_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {KIND_LABEL[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={item.plannedOn ?? ANY_DAY}
                  onValueChange={(value) => onPlan(item, dayOf(value))}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`${item.title}: day`}
                    className={cn(
                      "h-6 border-transparent px-1.5 text-xs hover:border-input",
                      item.plannedOn === null ? "text-muted-foreground" : "text-foreground",
                      item.plannedOn === today && !done && "text-warning",
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_DAY}>Any day</SelectItem>
                    {days.map((day) => (
                      <SelectItem key={day} value={day}>
                        {dayLabel(day, today)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  type="button"
                  aria-label={`Remove ${item.title}`}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => onRemove(item)}
                >
                  <XIcon className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-1">
        <Input
          value={draft}
          readOnly={pending}
          aria-label={`Add to week ${span.number}`}
          placeholder="Add a reading, link or exercise"
          className="h-8 min-w-0 flex-1"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submit();
          }}
        />
        <Select value={draftKind} onValueChange={(kind) => setDraftKind(asKind(kind))}>
          <SelectTrigger size="sm" aria-label="Kind" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COURSE_ITEM_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draftDay ?? ANY_DAY} onValueChange={(value) => setDraftDay(dayOf(value))}>
          <SelectTrigger size="sm" aria-label="Day" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_DAY}>Any day</SelectItem>
            {days.map((day) => (
              <SelectItem key={day} value={day}>
                {dayLabel(day, today)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** "Today" · "Tue 15". */
export function dayLabel(day: LocalDate, today: LocalDate): string {
  if (day === today) return "Today";
  return `${formatLocalDate(day, "weekday")} ${formatLocalDate(day, "dayOfMonth")}`;
}

/** The first URL in the text becomes the link; what remains is the title, or the link's host when nothing does. */
export function splitLink(text: string): { title: string; url: string | null } | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const match = URL_IN_TEXT.exec(trimmed);
  if (match === null) return { title: trimmed, url: null };

  const url = match[0].replace(/[),.;]+$/u, "");
  const rest = trimmed.replace(match[0], "").replace(/\s+/gu, " ").trim();
  if (rest !== "") return { title: rest, url };

  try {
    return { title: new URL(url).hostname.replace(/^www\./u, ""), url };
  } catch {
    return { title: url, url };
  }
}

function asKind(value: string): CourseItemKind {
  return COURSE_ITEM_KINDS.find((kind) => kind === value) ?? "reading";
}
