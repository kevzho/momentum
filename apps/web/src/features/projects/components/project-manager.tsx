"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";

import type { Project, Uuid } from "@momentum/core/types";
import { toast } from "@momentum/ui/components/toast";
import { useAnnounce } from "@momentum/ui/components/announcer";

import { archiveProject, createProject, updateProject } from "@/features/projects/actions";
import {
  ProjectDialog,
  type ProjectFormError,
  type ProjectFormValues,
} from "@/features/projects/components/project-dialog";
import { ConfirmDeleteDialog } from "@/features/tasks/components/confirm-delete-dialog";
import type { ProjectSummary, ProjectSummaryWithCount } from "@/features/tasks/types";
import { failure, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";
import { focusFirstAvailable } from "@/lib/use-opener-focus";

// Not optimistic: the list is server props read by the layout. Failures show
// inside the dialog while it is open (a toast behind a modal is unreachable).

type Editing = { project: ProjectSummary | null; id: Uuid };

export interface ProjectManager {
  pending: boolean;
  createProject: () => void;
  renameProject: (project: ProjectSummary) => void;
  /** Asks first only when the project still has open tasks. */
  archiveProject: (project: ProjectSummaryWithCount) => void;
  /** Rendered once, wherever the caller keeps its dialogs. */
  dialogs: React.ReactNode;
}

export function useProjectManager({
  projects,
  onCreated,
  fallbackFocus,
}: {
  /** A change in this list is when an archived row has left. */
  projects: readonly ProjectSummary[];
  onCreated?: (project: Project) => void;
  /** Where focus lands when the archived row's menu has gone with it. */
  fallbackFocus?: () => HTMLElement | null;
}): ProjectManager {
  const announce = useAnnounce();
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [confirming, setConfirming] = React.useState<ProjectSummaryWithCount | null>(null);
  const [error, setError] = React.useState<ProjectFormError | null>(null);

  const run = React.useCallback(
    (
      action: () => Promise<ActionResult<Project>>,
      settle: (result: ActionResult<Project>) => void,
    ) => {
      startTransition(async () => {
        let result: ActionResult<Project>;
        try {
          result = await action();
        } catch (thrown) {
          unstable_rethrow(thrown);
          reportError(thrown, { source: "projects" });
          result = failure(
            "unavailable",
            "Momentum could not reach the server. Your change was not saved.",
          );
        }
        settle(result);
      });
    },
    [],
  );

  const submit = React.useCallback(
    (values: ProjectFormValues) => {
      if (editing === null) return;
      const { id, project } = editing;
      setError(null);

      const action = () =>
        project === null ? createProject({ id, ...values }) : updateProject({ id, ...values });

      run(action, (result) => {
        if (!result.ok) {
          // Same id on Retry: a lost response is a row that may already exist.
          setError({
            ...result.error,
            ...(result.error.code === "validation" ? {} : { retry: () => submit(values) }),
          });
          return;
        }
        setEditing(null);
        announce(project === null ? `${values.name} created` : `${values.name} saved`);
        if (project === null) onCreated?.(result.data);
      });
    },
    [announce, editing, onCreated, run],
  );

  // Archiving removes the row whose menu was just used, in a later commit when
  // the layout re-renders; focus is rescued when `projects` changes.
  const handOff = React.useRef(false);
  const fallback = React.useRef(fallbackFocus);
  fallback.current = fallbackFocus;
  React.useEffect(() => {
    if (!handOff.current) return;
    handOff.current = false;
    const dropped = document.activeElement === null || document.activeElement === document.body;
    if (dropped) focusFirstAvailable([fallback.current?.() ?? null]);
  }, [projects]);

  const archive = React.useCallback(
    // Named, so Retry re-runs the same attempt.
    function archive(project: ProjectSummaryWithCount): void {
      run(
        () => archiveProject({ id: project.id, archived: true }),
        (result) => {
          if (!result.ok) {
            toast.error(
              result.error.message,
              result.error.code === "validation"
                ? undefined
                : { action: { label: "Retry", onClick: () => archive(project) } },
            );
            return;
          }
          handOff.current = true;
          toast.success(`Archived “${project.name}”`);
        },
      );
    },
    [run],
  );

  const dialogs = (
    <>
      <ProjectDialog
        open={editing !== null}
        project={editing?.project ?? null}
        pending={pending}
        error={error}
        onSubmit={submit}
        onClose={() => {
          setEditing(null);
          setError(null);
        }}
      />
      <ConfirmDeleteDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
        title={`Archive “${confirming?.name ?? ""}”?`}
        description={describeArchive(confirming?.openTasks ?? 0)}
        confirmLabel="Archive"
        confirmVariant="default"
        onConfirm={() => {
          if (confirming !== null) archive(confirming);
        }}
        fallbackFocus={fallbackFocus}
      />
    </>
  );

  return {
    pending,
    // Minted when the form opens, not per submit, so a retry sends the same id.
    createProject: () => setEditing({ project: null, id: crypto.randomUUID() }),
    renameProject: (project) => setEditing({ project, id: project.id }),
    archiveProject: (project) => {
      if (project.openTasks > 0) setConfirming(project);
      else archive(project);
    },
    dialogs,
  };
}

export function describeArchive(openTasks: number): string {
  const tasks =
    openTasks === 1
      ? "1 open task keeps the project and stays where it is"
      : `${openTasks} open tasks keep the project and stay where they are`;
  return `Its ${tasks}. The project leaves every list.`;
}
