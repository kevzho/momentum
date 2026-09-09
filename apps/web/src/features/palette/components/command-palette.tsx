"use client";

import * as React from "react";
import { ArrowLeftIcon, CornerDownLeftIcon } from "lucide-react";

import { formatLocalDate } from "@momentum/core/time";
import type { LocalDate } from "@momentum/core/types";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@momentum/ui/components/command";
import { Kbd } from "@momentum/ui/components/kbd";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { useAnnounce } from "@momentum/ui/components/announcer";

import { countItems, type PaletteItem, type PaletteSection } from "@/features/palette/search";
import type { PaletteMode } from "@/features/palette/types";
import { useOpenerFocus } from "@/lib/use-opener-focus";

// Renders `sections` and calls `onSelect`; knows nothing about what entries mean.
// `useOpenerFocus` restores focus because there is no Radix trigger to return to.

/** Long enough that a fast typist is announced once, not once per keystroke. */
const ANNOUNCE_DELAY_MS = 350;

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PaletteMode;
  query: string;
  onQueryChange: (query: string) => void;
  /** Leaves a picker for the root list. */
  onBack: () => void;
  sections: readonly PaletteSection[];
  /** Resolved on the server, in the profile timezone, for due-date labels. */
  today: LocalDate;
  onSelect: (item: PaletteItem) => void;
  /** A command's write is in flight; the list stays usable, the row says so. */
  pending: boolean;
}

export function CommandPalette({
  open,
  onOpenChange,
  mode,
  query,
  onQueryChange,
  onBack,
  sections,
  today,
  onSelect,
  pending,
}: CommandPaletteProps) {
  const openerFocus = useOpenerFocus();
  const picking = mode.kind !== "root";

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={picking ? mode.heading : "Command palette"}
      description={
        picking
          ? mode.placeholder
          : "Search commands, tasks and projects. Use the arrow keys to choose and Enter to run."
      }
      className="sm:max-w-xl"
      content={{
        onOpenAutoFocus: openerFocus.onOpenAutoFocus,
        onCloseAutoFocus: openerFocus.onCloseAutoFocus,
      }}
    >
      {/* `shouldFilter={false}`: the ranking is `features/palette/search`. */}
      <Command shouldFilter={false} loop label={picking ? mode.heading : "Command palette"}>
        {picking ? (
          <div className="flex items-center gap-2 px-2 pt-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ArrowLeftIcon className="size-3" aria-hidden="true" />
              All commands
            </button>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-foreground">{mode.heading}</span>
          </div>
        ) : null}

        <CommandInput
          value={query}
          onValueChange={onQueryChange}
          placeholder={picking ? mode.placeholder : "Search commands, tasks and projects…"}
          aria-label={picking ? mode.heading : "Search commands, tasks and projects"}
          onKeyDown={(event) => {
            // Backspace on an empty picker query is "up one level".
            if (event.key !== "Backspace" || query !== "" || !picking) return;
            event.preventDefault();
            onBack();
          }}
        />

        <ResultAnnouncer sections={sections} query={query} mode={mode} />

        <CommandList>
          <CommandEmpty className="text-muted-foreground">
            {picking ? mode.empty : "Nothing matches that."}
          </CommandEmpty>

          {sections.map((section) => (
            <CommandGroup key={section.id} heading={section.heading}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.key}
                  value={item.key}
                  disabled={pending}
                  onSelect={() => onSelect(item)}
                >
                  <ItemContent item={item} today={today} />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>

        <div className="flex items-center justify-end gap-3 border-t px-3 py-1.5 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>
              <CornerDownLeftIcon className="size-2.5" aria-hidden="true" />
            </Kbd>
            to run
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> to close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}

function ItemContent({ item, today }: { item: PaletteItem; today: LocalDate }) {
  if (item.kind === "command") {
    const Icon = item.command.icon;
    return (
      <>
        <Icon aria-hidden="true" className="text-muted-foreground" />
        <span className="truncate">{item.command.label}</span>
        {item.command.shortcut ? (
          <CommandShortcut className="flex items-center gap-1">
            {item.command.shortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </CommandShortcut>
        ) : null}
      </>
    );
  }

  if (item.kind === "project") {
    return (
      <>
        <ProjectDot color={item.project.color} className="ml-1" />
        <span className="truncate">{item.project.name}</span>
        <CommandShortcut>{item.project.openTasks} open</CommandShortcut>
      </>
    );
  }

  const { task, project } = item;
  return (
    <>
      {project === null ? (
        <span className="ml-1 size-2 shrink-0 rounded-full border border-muted-foreground/40" />
      ) : (
        <ProjectDot color={project.color} label={project.name} className="ml-1" />
      )}
      <span className="truncate">{task.title}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {task.priority < 4 ? <span>P{task.priority}</span> : null}
        {project === null ? null : <span className="truncate">{project.name}</span>}
        {task.dueDate === null ? null : <span>{dueLabel(task.dueDate, today)}</span>}
      </span>
    </>
  );
}

function dueLabel(dueDate: LocalDate, today: LocalDate): string {
  return dueDate === today ? "Today" : formatLocalDate(dueDate, "monthDay");
}

// `cmdk`'s `aria-activedescendant` reads the current option but says nothing
// about the list changing size; debounced so a fast typist hears one announcement.
function ResultAnnouncer({
  sections,
  query,
  mode,
}: {
  sections: readonly PaletteSection[];
  query: string;
  mode: PaletteMode;
}) {
  const announce = useAnnounce();
  const count = countItems(sections);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (count === 0) {
        announce(query === "" ? "No commands available." : `No results for ${query}.`);
        return;
      }
      announce(
        `${count} ${count === 1 ? "result" : "results"}${query === "" ? "" : ` for ${query}`}.`,
      );
    }, ANNOUNCE_DELAY_MS);

    return () => clearTimeout(handle);
  }, [announce, count, query, mode]);

  return null;
}
