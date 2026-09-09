"use client";

import Link from "next/link";
import { MenuIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { Separator } from "@momentum/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@momentum/ui/components/sheet";

import { SidebarNav } from "@/components/sidebar-nav";
import type { ProjectSummaryWithCount } from "@/features/tasks/types";
import { useSidebar } from "@/components/sidebar-context";
import { SETTINGS_NAV } from "@/lib/nav";

/**
 * Mobile navigation: the same registry as the desktop rail, in a drawer. The
 * trigger is the only navigation chrome a phone carries, which keeps the top
 * bar readable at 375px.
 */
export function MobileNav({ projects }: { projects: readonly ProjectSummaryWithCount[] }) {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const close = () => setMobileOpen(false);

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="md:hidden">
          <MenuIcon aria-hidden="true" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="max-w-(--sidebar-width) gap-0"
        // Radix skips links when it picks what to focus first, which would land
        // a screen-reader user on "New task" — a drawer that opens as
        // navigation starts on its first destination instead.
        onOpenAutoFocus={(event) => {
          const content = event.currentTarget;
          if (!(content instanceof HTMLElement)) return;
          const first = content.querySelector<HTMLElement>("nav a");
          if (first) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <SheetHeader className="h-(--top-bar-height) justify-center border-b">
          <SheetTitle className="text-sm font-semibold tracking-tight">Momentum</SheetTitle>
          <SheetDescription className="sr-only">Application navigation</SheetDescription>
        </SheetHeader>
        <SidebarNav projects={projects} onNavigate={close} />
        <Separator />
        <div className="p-2">
          <Link
            href={SETTINGS_NAV.href}
            onClick={close}
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors duration-fast ease-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
          >
            <SETTINGS_NAV.icon className="size-4" aria-hidden="true" />
            {SETTINGS_NAV.label}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
