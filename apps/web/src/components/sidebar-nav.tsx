"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { cn } from "@momentum/ui/lib/utils";

import { ProjectDot } from "@momentum/ui/components/project-dot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@momentum/ui/components/tooltip";

import type { ProjectSummaryWithCount } from "@/features/tasks/types";
import { taskHref } from "@/features/tasks/view-params";
import { useQuickAdd } from "@/features/tasks/components/quick-add";
import { PRIMARY_NAV, isActive } from "@/lib/nav";

const ITEM_CLASS =
  "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors duration-fast ease-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground";

/**
 * The navigation itself, shared by the desktop rail and the mobile drawer so
 * the two can never drift. `collapsed` only changes presentation: every link
 * keeps its accessible name, from a tooltip when the label is hidden.
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
        <h2
          className={cn(
            "px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase",
            collapsed && "sr-only",
          )}
        >
          Projects
        </h2>
        <ul className="flex flex-col gap-0.5">
          {projects.map((project) => {
            const row = (
              <Link
                // The per-project view: the sixth view, and the only one not
                // reachable from the task page's own tabs.
                href={taskHref({ view: "project", projectId: project.id })}
                onClick={onNavigate}
                className={cn(ITEM_CLASS, collapsed && "justify-center px-0")}
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
              <li key={project.id}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{row}</TooltipTrigger>
                    <TooltipContent side="right">
                      {project.name} · {project.openTasks} open
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  row
                )}
              </li>
            );
          })}
          {projects.length === 0 && !collapsed ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">No projects yet.</li>
          ) : null}
          <li>
            {/* Creating a project is the project manager's, which no phase owns
                yet. Adding a task is this phase's and is what the button below
                it does, so this one stays a stub rather than pretending. */}
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
    </nav>
  );
}
