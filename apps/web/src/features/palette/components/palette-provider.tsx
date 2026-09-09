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

/**
 * The command palette, mounted once in the shell.
 *
 * It owns four things and delegates everything else: whether it is open, what
 * has been typed, which picker the user is in, and which commands they reach
 * for most. The list it shows is computed by `features/palette/search`; what
 * each entry does is declared by the feature that owns it
 * (`features/<feature>/commands.ts`).
 *
 * ⌘K on macOS, Ctrl+K everywhere else. Both are bound to the same handler and
 * neither is bound to a route, so the palette opens from all of them.
 */

export interface PaletteContextValue {
  open: () => void;
}

const PaletteContext = React.createContext<PaletteContextValue | null>(null);

/** `openPalette()` — a no-op outside the shell, never a thrown error. */
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
  /** Today in the profile timezone, resolved once per request (Domain Rule 4). */
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
  /*
   * Frozen when the palette opens rather than read on every render: the
   * recency bonus must not re-rank the list between two keystrokes, and a
   * timestamp read during render would differ between the server and the
   * client (docs/ARCHITECTURE.md §10).
   */
  const [openedAt, setOpenedAt] = React.useState(0);

  const close = React.useCallback(() => setOpen(false), []);

  /*
   * The stored ordering is read here, when the palette opens, rather than in an
   * effect on mount: it is per-browser state, so reading it during render would
   * make the server and client markup disagree — and an opening is the one
   * moment the ordering matters, which also means a command run in another tab
   * is reflected the next time this one opens.
   */
  const openPalette = React.useCallback(() => {
    setUsage(readUsage(globalThis.localStorage));
    setMode(ROOT_MODE);
    setQuery("");
    setOpenedAt(Date.now());
    setOpen(true);
  }, []);

  /*
   * A rejected call is not the same event as a returned `{ ok: false }`, but
   * the user has to experience it as one — and React re-throws a rejection out
   * of a transition, which would hand the route the user was on to an error
   * boundary over a command they ran from a menu. `unstable_rethrow` first,
   * because `redirect()` and `notFound()` travel as thrown values and are
   * control flow, not failure (Domain Rule 11, the rule Quick Add restates).
   */
  const perform = React.useCallback((work: PaletteWork) => {
    // Named, so Retry re-runs the same attempt without the callback having to
    // refer to itself through its own dependency list.
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
        // Closed first, then opened: two modal surfaces must not overlap, and
        // Quick Add's own opener-focus records where the user came from.
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

      // A task or a project matched in the root list: open it. Nothing is
      // mutated by finding something.
      context.navigate(
        item.kind === "task"
          ? taskHref({ taskId: item.task.id })
          : taskHref({ view: "project", projectId: item.project.id }),
      );
    },
    [context, mode],
  );

  /*
   * ⌘K / Ctrl+K, from every route.
   *
   * It fires while the user is typing — unlike Quick Add's bare `Q`, a modifier
   * chord is never part of what someone is writing — but not on top of another
   * modal: Radix marks the rest of the page `aria-hidden` while a dialog or a
   * sheet is open, and a palette stacked on that is a trap, not a shortcut.
   * When the palette is itself the open dialog, the chord closes it.
   */
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
