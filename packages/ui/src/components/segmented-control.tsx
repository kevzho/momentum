"use client";

import * as React from "react";
import { cn } from "cn";

import { ToggleGroup, ToggleGroupItem } from "@momentum/ui/components/toggle-group";

/**
 * A single-select toggle-group announced as a radiogroup, so selection must
 * follow focus (WAI-ARIA radio group pattern).
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
          // Selection follows focus. Tabbing in lands on the selected option
          // (Radix's roving tabstop starts on the pressed item), so this only
          // fires for arrow/Home/End moves or a pointer.
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
