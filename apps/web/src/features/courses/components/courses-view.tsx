"use client";

import * as React from "react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { GraduationCapIcon, PlusIcon } from "lucide-react";

import { formatLocalDate } from "@momentum/core/time";
import type { Uuid, Weekday } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { toast } from "@momentum/ui/components/toast";
import { cn } from "@momentum/ui/lib/utils";

import { createCourse } from "@/features/courses/actions";
import { CourseFormDialog } from "@/features/courses/components/course-form-dialog";
import { courseHref } from "@/features/courses/navigation";
import type { CourseFormValues, CourseSummary, CoursesPageData } from "@/features/courses/types";
import { failure, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";

/**
 * The courses list over server-resolved data. Creating a course is a plain
 * round trip that lands on the new course's page; nothing here is optimistic.
 */

const STATUS_LABEL = { current: "In progress", upcoming: "Upcoming", past: "Finished" } as const;

/** A new course's ids are minted when the form opens, so a retry sends the same pair. */
interface NewCourse {
  id: Uuid;
  projectId: Uuid;
}

export function CoursesView({ data, weekStart }: { data: CoursesPageData; weekStart: Weekday }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [creating, setCreating] = React.useState<NewCourse | null>(null);

  function openNew(): void {
    setCreating({ id: crypto.randomUUID(), projectId: crypto.randomUUID() });
  }

  function submit(values: CourseFormValues): void {
    if (creating === null) return;
    const { id, projectId } = creating;
    startTransition(async () => {
      let result: ActionResult<unknown>;
      try {
        result = await createCourse({ id, projectId, ...values });
      } catch (thrown) {
        unstable_rethrow(thrown);
        reportError(thrown, { source: "createCourse" });
        result = failure("unavailable", "Momentum could not reach the server. Nothing was saved.");
      }
      if (!result.ok) {
        toast.error(result.error.message, {
          action: { label: "Retry", onClick: () => submit(values) },
        });
        return;
      }
      setCreating(null);
      toast.success(`Added “${values.name}”`);
      router.push(courseHref(id));
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Courses"
        description="Each course is a project with a term. Its assignments are tasks; its weeks hold what to cover."
        actions={
          <Button size="sm" onClick={openNew}>
            <PlusIcon aria-hidden="true" />
            New course
          </Button>
        }
      />

      <section className="flex flex-col">
        {data.courses.length === 0 ? (
          <EmptyState
            icon={GraduationCapIcon}
            title="No courses yet"
            description="Add a course with its term dates, then give each week its readings and assignments."
            action={
              <Button size="sm" onClick={openNew}>
                <PlusIcon aria-hidden="true" />
                New course
              </Button>
            }
          />
        ) : (
          <ul aria-label="Courses" className="flex flex-col divide-y">
            {data.courses.map((summary) => (
              <li key={summary.course.id}>
                <CourseRow summary={summary} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CourseFormDialog
        open={creating !== null}
        course={null}
        today={data.today}
        weekStart={weekStart}
        pending={pending}
        onSubmit={submit}
        onClose={() => {
          if (!pending) setCreating(null);
        }}
      />
    </PageContainer>
  );
}

function CourseRow({ summary }: { summary: CourseSummary }) {
  const { course } = summary;
  const term = `${formatLocalDate(course.termStart, "monthDay")} – ${formatLocalDate(course.termEnd, "medium")}`;
  const where =
    summary.status === "current" && summary.currentWeek !== null
      ? `Week ${summary.currentWeek} of ${summary.weekCount}`
      : `${summary.weekCount} weeks`;

  return (
    <Link
      href={courseHref(course.id)}
      className="flex items-center gap-3 px-2 py-2 transition-colors duration-fast ease-standard hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ProjectDot color={summary.color} className="size-2.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {course.code === null ? null : (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {course.code}
            </span>
          )}
          <span className="truncate text-sm font-medium">{summary.name}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[course.instructor, course.location, term].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span
        data-slot="numeric"
        className={cn(
          "hidden shrink-0 text-xs sm:block",
          summary.status === "current" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {where}
      </span>
      <span data-slot="numeric" className="w-20 shrink-0 text-right text-xs text-muted-foreground">
        {summary.openAssignments === 0 ? "Nothing open" : `${summary.openAssignments} open`}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground md:block">
        {STATUS_LABEL[summary.status]}
      </span>
    </Link>
  );
}
