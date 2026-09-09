"use client";

import * as React from "react";
import { cn } from "cn";

import { ToggleGroup, ToggleGroupItem } from "@momentum/ui/components/toggle-group";

/**
 * Day / Week, 7 / 30 / 90. A single-select `toggle-group`, so the whole control
 * is one tab stop and the arrow keys move a roving tabstop — and, because the
 * group announces itself as a radiogroup, moving the tabstop also moves the
 * selection: a radio that only focuses on ArrowRight is not what the role
 * promises (WAI-ARIA radio group pattern).
 */
interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; ariaLabel?: string }[];
  /** The accessible name of the group as a whole ("Calendar range"). */
  label: string;
  className?: string;
}

function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        // A toggle-group can deselect; a segmented control always has a value.
        if (next) onValueChange(next as T);
      }}
      className={cn("shrink-0", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          // Selection follows focus, as in a radio group. Tabbing into the
          // group lands on the selected option (Radix's roving tabstop starts
          // on the pressed item), so this only ever changes anything when an
          // arrow, Home or End moved the focus — or a pointer, whose click is
          // then a no-op on an already selected option.
          onFocus={() => {
            if (option.value !== value) onValueChange(option.value);
          }}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export { SegmentedControl };
export type { SegmentedControlProps };
