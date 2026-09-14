"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderPlusIcon, PlusIcon } from "lucide-react";
import { cn } from "@momentum/ui/lib/utils";

import { Button } from "@momentum/ui/components/button";
import { ProjectDot } from "@momentum/ui/components/project-dot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@momentum/ui/components/tooltip";

import { ProjectMenu } from "@/features/projects/components/project-menu";
import { useProjectManager } from "@/features/projects/components/project-manager";
import type { ProjectSummaryWithCount } from "@/features/tasks/types";
import { taskHref } from "@/features/tasks/view-params";
import { useQuickAdd } from "@/features/tasks/components/quick-add";
import { PRIMARY_NAV, isActive } from "@/lib/nav";

const ITEM_CLASS =
  "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors duration-fast ease-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground";

/**
 * Shared by the desktop rail and the mobile drawer. `collapsed` only changes
 * presentation: every link keeps its accessible name, from a tooltip when the
 * label is hidden.
 */
export function SidebarNav({
  collapsed = false,
  projects,
  onNavigate,
}: {
  collapsed?: boolean;
  projects: readonly ProjectSummaryWithCount[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const quickAdd = useQuickAdd();

  const newProjectRef = React.useRef<HTMLButtonElement>(null);
  const manager = useProjectManager({
    projects,
    fallbackFocus: () => newProjectRef.current,
  });

  // The manager's list already holds a project created here that the layout's
  // refresh has yet to return; the server has counted nothing for it.
  const rows = React.useMemo<ProjectSummaryWithCount[]>(() => {
    const counted = new Map(projects.map((project) => [project.id, project]));
    return manager.projects.map(
      (project) => counted.get(project.id) ?? { ...project, openTasks: 0 },
    );
  }, [manager.projects, projects]);

  // An empty list offers one "New project" row in the header button's place.
  // The ref follows whichever is mounted, so archiving the last project still
  // has somewhere to send focus.
  const emptyRow = rows.length === 0 && !collapsed;

  const newProject = (
    <Button
      ref={newProjectRef}
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      title={collapsed ? undefined : "New project"}
      onClick={() => manager.createProject()}
    >
      <FolderPlusIcon aria-hidden="true" />
      <span className="sr-only">New project</span>
    </Button>
  );

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
      <ul className="flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => {
          const current = isActive(pathname, item.href);
          const link = (
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={cn(ITEM_CLASS, collapsed && "justify-center px-0")}
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
            </Link>
          );

          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-0.5">
        <div
          className={cn("flex items-center justify-between pb-1", collapsed && "justify-center")}
        >
          <h2
            className={cn(
              "px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase",
              collapsed && "sr-only",
            )}
          >
            Projects
          </h2>
          {emptyRow ? null : collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{newProject}</TooltipTrigger>
              <TooltipContent side="right">New project</TooltipContent>
            </Tooltip>
          ) : (
            newProject
          )}
        </div>
        <ul className="flex flex-col gap-0.5">
          {rows.map((project) => {
            const row = (
              <Link
                // The per-project view: the only one not reachable from the task page's own tabs.
                href={taskHref({ view: "project", projectId: project.id })}
                onClick={onNavigate}
                className={cn(ITEM_CLASS, "min-w-0 flex-1", collapsed && "justify-center px-0")}
              >
                <ProjectDot color={project.color} className="mx-0.5" />
                <span className={cn("flex-1 truncate", collapsed && "sr-only")}>
                  {project.name}
                </span>
                <span
                  data-slot="numeric"
                  className={cn("text-xs text-muted-foreground", collapsed && "sr-only")}
                >
                  {project.openTasks}
                </span>
              </Link>
            );

            return (
              <li key={project.id} className="group flex items-center">
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{row}</TooltipTrigger>
                    <TooltipContent side="right">
                      {project.name} · {project.openTasks} open
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <>
                    {row}
                    {/* Revealed on hover and focus, always on a coarse pointer, held while its menu is open. */}
                    <ProjectMenu
                      project={project}
                      onRename={manager.renameProject}
                      onArchive={manager.archiveProject}
                      className="shrink-0 opacity-0 transition-opacity duration-fast group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
                    />
                  </>
                )}
              </li>
            );
          })}
          {emptyRow ? (
            <li>
              <button
                ref={newProjectRef}
                type="button"
                onClick={() => manager.createProject()}
                className={cn(ITEM_CLASS, "w-full text-muted-foreground")}
              >
                <FolderPlusIcon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">New project</span>
              </button>
            </li>
          ) : null}
          <li>
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                quickAdd.open();
              }}
              className={cn(
                ITEM_CLASS,
                "w-full text-muted-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <PlusIcon className="size-4 shrink-0" aria-hidden="true" />
              <span className={cn("truncate", collapsed && "sr-only")}>New task</span>
            </button>
          </li>
        </ul>
      </div>
      {manager.dialogs}
    </nav>
  );
}
