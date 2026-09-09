"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { BellIcon, LogOutIcon, PlusIcon, SearchIcon, SettingsIcon } from "lucide-react";

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

/** Who is signed in, resolved on the server from the profile and the auth user. */
export interface Account {
  displayName: string;
  email: string | null;
  initials: string;
}

/**
 * The top bar never repeats the page's own heading: the section name here is
 * shown only at the widths where `PageHeader`'s title is visually hidden, and
 * it is hidden from assistive technology because the page's `h1` is still in
 * the accessibility tree (docs/DESIGN_SYSTEM.md).
 */
export function TopBar({
  account,
  progress,
  projects,
}: {
  account: Account;
  /** Level and XP, computed by the server from the ledger (Domain Rule 6). */
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

      {/* The palette's pointer route. The keyboard route is ⌘K from anywhere;
          this is here because a shortcut nobody has been told about is not a
          feature, and because the bar is where people look for search. */}
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
          <Button size="icon-sm" onClick={() => quickAdd.open()}>
            <PlusIcon aria-hidden="true" />
            <span className="sr-only">Quick add</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Quick add <Kbd>Q</Kbd>
        </TooltipContent>
      </Tooltip>

      {/* Compact, and a link: the indicator says where you are, and the page it
          points at says what got you there. The bar's width transition is the
          "progress movement" the spec asks for — the whole of the routine XP
          feedback, with celebration reserved for a level, an achievement and a
          weekly goal. */}
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <BellIcon aria-hidden="true" />
            <span className="sr-only">Notifications</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>No new notifications</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-full">
            {/* The one cosmetic this phase renders. It changes how the avatar
                looks and nothing else — coins never buy capability. */}
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
          {/* A form posting to a server action, not an onSelect handler:
              signing out is a mutation, so it belongs in a form and needs no
              client handler of its own. The menu itself still needs JavaScript
              — Radix mounts this content only once the menu opens — so this is
              not a no-JavaScript path; it is one less thing to hydrate. */}
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
