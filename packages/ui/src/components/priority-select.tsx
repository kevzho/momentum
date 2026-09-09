"use client";

import * as React from "react";
import { FlagIcon } from "lucide-react";
import { cn } from "cn";

import { TASK_PRIORITIES, type TaskPriority } from "@momentum/core/types";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";

/** Shares its wording with `TaskRow`: P4 is "None", the default, not "lowest priority". */
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  1: "P1 · Urgent",
  2: "P2 · High",
  3: "P3 · Normal",
  4: "P4 · None",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  1: "text-destructive",
  2: "text-warning",
  3: "text-muted-foreground",
  4: "text-muted-foreground",
};

function PrioritySelect({
  value,
  onValueChange,
  id,
  className,
  disabled,
  "aria-label": ariaLabel = "Priority",
}: {
  value: TaskPriority;
  onValueChange: (value: TaskPriority) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => onValueChange(Number(next) as TaskPriority)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn("w-full", className)} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={String(priority)}>
            <span className="flex items-center gap-2">
              <FlagIcon className={cn("size-3.5", PRIORITY_TONE[priority])} aria-hidden="true" />
              {PRIORITY_LABELS[priority]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { PrioritySelect, PRIORITY_LABELS };
