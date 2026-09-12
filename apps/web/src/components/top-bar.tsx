"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOutIcon, PlusIcon, SearchIcon, SettingsIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@momentum/ui/components/avatar";
import { Button } from "@momentum/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@momentum/ui/components/dropdown-menu";
import { Kbd } from "@momentum/ui/components/kbd";
import { ProfileFrame } from "@momentum/ui/components/profile-frame";
import { XPBar } from "@momentum/ui/components/xp-bar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@momentum/ui/components/tooltip";

import { isProfileFrameKey } from "@momentum/core/gamification";

import { MobileNav } from "@/components/mobile-nav";
import { usePalette } from "@/features/palette/components/palette-provider";
import { PaletteShortcut } from "@/features/palette/components/palette-shortcut";
import type { ProgressBadge } from "@/features/gamification/types";
import { useQuickAdd } from "@/features/tasks/components/quick-add";
import type { ProjectSummaryWithCount } from "@/features/tasks/types";
import { signOut } from "@/features/auth/actions";
import { sectionLabel } from "@/lib/nav";

/** Who is signed in, resolved on the server. */
export interface Account {
  displayName: string;
  email: string | null;
  initials: string;
}

/**
 * The section name is shown only at widths where `PageHeader`'s title is
 * visually hidden, and hidden from assistive technology because the page's
 * `h1` is still in the tree.
 */
export function TopBar({
  account,
  progress,
  projects,
}: {
  account: Account;
  /** Level and XP, computed by the server from the ledger. */
  progress: ProgressBadge;
  projects: readonly ProjectSummaryWithCount[];
}) {
  const pathname = usePathname();
  const section = sectionLabel(pathname);
  const { theme, setTheme } = useTheme();
  const quickAdd = useQuickAdd();
  const palette = usePalette();

  return (
    <header className="flex h-(--top-bar-height) shrink-0 items-center gap-2 border-b bg-background px-2 md:px-4">
      <MobileNav projects={projects} />
      <span aria-hidden="true" className="truncate text-sm font-semibold tracking-tight md:hidden">
        {section}
      </span>

      <div className="flex-1" />

      {/* The palette's pointer route; the keyboard route is ⌘K. Both chrome controls stay
          quiet so each page's own action is the one primary in view. */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => palette.open()}
      >
        <SearchIcon aria-hidden="true" />
        <span className="hidden lg:inline">Search</span>
        <span className="sr-only lg:hidden">Search commands, tasks and projects</span>
        <PaletteShortcut className="hidden lg:inline-flex" />
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon-sm" onClick={() => quickAdd.open()}>
            <PlusIcon aria-hidden="true" />
            <span className="sr-only">Quick add</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Quick add <Kbd>Q</Kbd>
        </TooltipContent>
      </Tooltip>

      {/* The bar's width transition is the whole of the routine XP feedback. */}
      <Link
        href="/progress"
        aria-label={`Level ${progress.level}. ${progress.xpRemaining} XP to level ${progress.level + 1}.`}
        className="ml-1 hidden rounded-md px-1 py-0.5 hover:bg-accent sm:flex"
      >
        <XPBar
          level={progress.level}
          xpIntoLevel={progress.xpIntoLevel}
          xpForNextLevel={progress.xpForNextLevel}
        />
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-full">
            {/* Changes how the avatar looks and nothing else: coins never buy capability. */}
            <ProfileFrame frame={isProfileFrameKey(progress.frame) ? progress.frame : null}>
              <Avatar className="size-6">
                <AvatarFallback className="text-2xs">{account.initials}</AvatarFallback>
              </Avatar>
            </ProfileFrame>
            <span className="sr-only">Account menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{account.displayName}</span>
            {account.email ? (
              <span className="text-xs font-normal text-muted-foreground">{account.email}</span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <SettingsIcon aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenuItem>
          {/* A form posting to a server action: signing out is a mutation and needs no client handler. */}
          <form action={signOut}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOutIcon aria-hidden="true" />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
