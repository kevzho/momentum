"use client";

import * as React from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import type { Route } from "next";

import type { LocalDate } from "@momentum/core/types";
import { toast } from "@momentum/ui/components/toast";
import { useAnnounce } from "@momentum/ui/components/announcer";

import { CommandPalette } from "@/features/palette/components/command-palette";
import { paletteCommands } from "@/features/palette/registry";
import {
  NO_USAGE,
  readUsage,
  recordUse,
  writeUsage,
  type CommandUsageMap,
} from "@/features/palette/recents";
import {
  projectSections,
  rootSections,
  taskSections,
  type PaletteItem,
  type PaletteSection,
} from "@/features/palette/search";
import {
  ROOT_MODE,
  type CommandContext,
  type PaletteMode,
  type PaletteWork,
} from "@/features/palette/types";
import { useQuickAdd } from "@/features/tasks/components/quick-add";
import { taskHref } from "@/features/tasks/view-params";
import type { ProjectSummaryWithCount, TaskSummary } from "@/features/tasks/types";
import { failure, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";

// Mounted once in the shell; owns open/query/mode/usage state and delegates
// ranking to `features/palette/search`.

export interface PaletteContextValue {
  open: () => void;
}

const PaletteContext = React.createContext<PaletteContextValue | null>(null);

/** A no-op outside the shell, never a thrown error. */
export function usePalette(): PaletteContextValue {
  return React.useContext(PaletteContext) ?? { open: noop };
}

function noop() {}

export function PaletteProvider({
  tasks,
  projects,
  today,
  children,
}: {
  tasks: readonly TaskSummary[];
  projects: readonly ProjectSummaryWithCount[];
  /** Today in the profile timezone, resolved once per request. */
  today: LocalDate;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const quickAdd = useQuickAdd();
  const [pending, startTransition] = React.useTransition();

  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<PaletteMode>(ROOT_MODE);
  const [query, setQuery] = React.useState("");
  const [usage, setUsage] = React.useState<CommandUsageMap>(NO_USAGE);
  // Frozen when the palette opens: the recency bonus must not re-rank the list
  // between keystrokes, and a render-time timestamp would break hydration.
  const [openedAt, setOpenedAt] = React.useState(0);

  const close = React.useCallback(() => setOpen(false), []);

  // Usage is read on open, not on mount: per-browser state read during render
  // would break hydration, and this also picks up runs from other tabs.
  const openPalette = React.useCallback(() => {
    setUsage(readUsage(globalThis.localStorage));
    setMode(ROOT_MODE);
    setQuery("");
    setOpenedAt(Date.now());
    setOpen(true);
  }, []);

  // A rejection inside a transition would reach the route's error boundary, so
  // it is converted to a failed result. `unstable_rethrow` first: `redirect()`
  // and `notFound()` travel as thrown values.
  const perform = React.useCallback((work: PaletteWork) => {
    // Named so Retry can re-run the same attempt.
    function attempt(): void {
      startTransition(async () => {
        let result: ActionResult<unknown>;
        try {
          result = await work.action();
        } catch (thrown) {
          unstable_rethrow(thrown);
          reportError(thrown, { source: "commandPalette" });
          result = failure(
            "unavailable",
            "Momentum could not reach the server. Your change was not saved.",
          );
        }

        if (!result.ok) {
          toast.error(`${work.failure} ${result.error.message}`, {
            action: { label: "Retry", onClick: attempt },
          });
          return;
        }

        toast.success(work.success);
      });
    }

    attempt();
  }, []);

  const context = React.useMemo<CommandContext>(
    () => ({
      navigate: (href: Route) => {
        setOpen(false);
        router.push(href);
      },
      quickAdd: (defaults) => {
        // Closed first: two modal surfaces must not overlap.
        setOpen(false);
        quickAdd.open(defaults);
      },
      enter: (next) => {
        setMode(next);
        setQuery("");
      },
      close,
      announce,
      perform,
    }),
    [announce, close, perform, quickAdd, router],
  );

  const sections = React.useMemo<PaletteSection[]>(() => {
    if (mode.kind === "tasks") return taskSections(query, tasks, projects);
    if (mode.kind === "projects") return projectSections(query, projects);
    return rootSections({
      query,
      commands: paletteCommands(),
      tasks,
      projects,
      usage,
      now: openedAt,
    });
  }, [mode, openedAt, projects, query, tasks, usage]);

  const select = React.useCallback(
    (item: PaletteItem) => {
      if (item.kind === "command") {
        const now = Date.now();
        setUsage((current) => {
          const next = recordUse(current, item.command.id, now);
          writeUsage(globalThis.localStorage, next);
          return next;
        });
        item.command.run(context);
        return;
      }

      if (mode.kind === "tasks" && item.kind === "task") {
        mode.onSelect(item.task, context);
        return;
      }

      if (mode.kind === "projects" && item.kind === "project") {
        mode.onSelect(item.project, context);
        return;
      }

      // A task or project matched in the root list: open it.
      context.navigate(
        item.kind === "task"
          ? taskHref({ taskId: item.task.id })
          : taskHref({ view: "project", projectId: item.project.id }),
      );
    },
    [context, mode],
  );

  // ⌘K / Ctrl+K: fires while typing (a modifier chord is never text) but not
  // on top of another Radix dialog or sheet, which would be a focus trap.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "k" && event.key !== "K") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey) return;

      if (open) {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (document.querySelector("[role='dialog'], [data-slot='sheet-content']")) return;

      event.preventDefault();
      openPalette();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, openPalette]);

  const value = React.useMemo<PaletteContextValue>(() => ({ open: openPalette }), [openPalette]);

  return (
    <PaletteContext value={value}>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setMode(ROOT_MODE);
        }}
        mode={mode}
        query={query}
        onQueryChange={setQuery}
        onBack={() => {
          setMode(ROOT_MODE);
          setQuery("");
        }}
        sections={sections}
        today={today}
        onSelect={select}
        pending={pending}
      />
    </PaletteContext>
  );
}
