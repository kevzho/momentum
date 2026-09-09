"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftIcon } from "lucide-react";
import { cn } from "@momentum/ui/lib/utils";

import { Avatar, AvatarFallback } from "@momentum/ui/components/avatar";
import { Button } from "@momentum/ui/components/button";
import { Separator } from "@momentum/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@momentum/ui/components/tooltip";

import { SidebarNav } from "@/components/sidebar-nav";
import type { ProjectSummaryWithCount } from "@/features/tasks/types";
import { useSidebar } from "@/components/sidebar-context";
import type { Account } from "@/components/top-bar";
import { SETTINGS_NAV, isActive } from "@/lib/nav";

/**
 * The desktop rail: 240px expanded, 56px collapsed, persisted across reloads.
 * Hidden below `md`, where `MobileNav` presents the same navigation in a
 * drawer.
 */
export function Sidebar({
  account,
  projects,
}: {
  account: Account;
  projects: readonly ProjectSummaryWithCount[];
}) {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();
  const settingsActive = isActive(pathname, SETTINGS_NAV.href);

  return (
    <div
      data-collapsed={collapsed || undefined}
      className={cn(
        "hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-base ease-standard md:flex",
        collapsed ? "w-(--sidebar-width-collapsed)" : "w-(--sidebar-width)",
      )}
    >
      <div
        className={cn(
          "flex h-(--top-bar-height) shrink-0 items-center gap-2 px-2",
          collapsed && "justify-center",
        )}
      >
        {collapsed ? null : (
          <Link
            href="/today"
            className="flex-1 truncate rounded-md px-1 text-sm font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
          >
            Momentum
          </Link>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-controls="sidebar-navigation"
            >
              <PanelLeftIcon aria-hidden="true" />
              <span className="sr-only">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>

      <Separator />

      <div id="sidebar-navigation" className="flex min-h-0 flex-1 flex-col">
        <SidebarNav collapsed={collapsed} projects={projects} />
      </div>

      <Separator />

      <div className={cn("flex items-center gap-2 p-2", collapsed && "justify-center")}>
        <Avatar className="size-6 shrink-0">
          <AvatarFallback className="text-2xs">{account.initials}</AvatarFallback>
        </Avatar>
        {collapsed ? null : (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {account.displayName}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href={SETTINGS_NAV.href} aria-current={settingsActive ? "page" : undefined}>
                <SETTINGS_NAV.icon aria-hidden="true" />
                <span className="sr-only">{SETTINGS_NAV.label}</span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{SETTINGS_NAV.label}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
