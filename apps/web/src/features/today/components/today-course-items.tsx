import { GraduationCapIcon } from "lucide-react";

import { Checkbox } from "@momentum/ui/components/checkbox";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { cn } from "@momentum/ui/lib/utils";

import { TODAY_COPY } from "@/features/today/copy";
import { TodaySection } from "@/features/today/components/today-section";
import type { TodayCourseItem } from "@/features/today/types";

/**
 * The course readings, links and exercises planned for today, tickable in
 * one press. Rendered only when a course planned something for the day: an
 * account with no courses never sees an empty section for them.
 */
export function TodayCourseItems({
  rows,
  pendingIds,
  onToggle,
}: {
  rows: readonly TodayCourseItem[];
  pendingIds: ReadonlySet<string>;
  onToggle: (row: TodayCourseItem, done: boolean) => void;
}) {
  if (rows.length === 0) return null;
  const done = rows.filter((row) => row.item.completedAt !== null).length;

  return (
    <TodaySection
      title={
        <span className="inline-flex items-center gap-1.5">
          <GraduationCapIcon className="size-3.5" aria-hidden="true" />
          {TODAY_COPY.courses.title}
        </span>
      }
      count={TODAY_COPY.courses.count(done, rows.length)}
    >
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => {
          const isDone = row.item.completedAt !== null;
          const pending = pendingIds.has(row.item.id);
          return (
            <li
              key={row.item.id}
              data-pending={pending || undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-fast ease-standard",
                "hover:bg-muted/60 has-focus-visible:bg-muted/60",
                pending && "opacity-60",
              )}
            >
              <Checkbox
                checked={isDone}
                aria-label={`${row.item.title}${isDone ? ", done" : ""}`}
                onCheckedChange={(next) => onToggle(row, next === true)}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  isDone && "text-muted-foreground line-through",
                )}
              >
                {row.item.url === null ? (
                  row.item.title
                ) : (
                  <a
                    href={row.item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline-offset-2 hover:underline"
                  >
                    {row.item.title}
                  </a>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <ProjectDot color={row.color} className="size-2" />
                {row.courseCode ?? row.courseName}
              </span>
            </li>
          );
        })}
      </ul>
    </TodaySection>
  );
}
