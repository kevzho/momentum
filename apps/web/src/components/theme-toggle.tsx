"use client";

import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { SegmentedControl } from "@momentum/ui/components/segmented-control";
import { useIsHydrated } from "@momentum/ui/hooks/use-is-hydrated";

const THEMES = [
  { value: "light", label: <SunIcon />, ariaLabel: "Light" },
  { value: "dark", label: <MoonIcon />, ariaLabel: "Dark" },
  { value: "system", label: <MonitorIcon />, ariaLabel: "System" },
] as const;

type ThemeValue = (typeof THEMES)[number]["value"];

/**
 * Theme choice as a three-way segmented control: light, dark, and following the
 * system. Until the provider has read the stored choice, `theme` is undefined;
 * rendering "system" then would be a lie, so the control renders nothing
 * selected rather than the wrong thing.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();

  return (
    <SegmentedControl<ThemeValue>
      label="Theme"
      className={className}
      value={hydrated ? ((theme ?? "system") as ThemeValue) : ("" as ThemeValue)}
      onValueChange={setTheme}
      options={THEMES.map((item) => ({ ...item }))}
    />
  );
}
