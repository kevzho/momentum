"use client";

import * as React from "react";

import { QUEST_TARGET_CAPS } from "@momentum/core/gamification";
import { QUEST_METRICS, type QuestMetric } from "@momentum/core/types";

import { Button } from "@momentum/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@momentum/ui/components/dialog";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";

import { METRIC_LABELS, PROGRESS_COPY } from "@/features/gamification/copy";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * Setting a weekly goal.
 *
 * The target field is bounded by the same number a *quest* on that metric is
 * bounded by, and the input says so before the server does — a goal that pushed
 * someone into an unhealthy week would be no better for having been self-set
 * (Domain Rule 7). The reward is flat and stated up front, so it is clear that
 * a bigger number buys nothing.
 *
 * The week is not a field. It is resolved from the profile when the action
 * runs, because a goal filed under a week the user is not in would be measured
 * against the wrong rows (Domain Rule 4).
 *
 * Opened from the "Set a goal" button rather than a `DialogTrigger`, so Radix
 * has nothing to return focus to on its own; `useOpenerFocus` sends it back to
 * that button on Escape, Cancel and "Set goal" alike, instead of dropping a
 * keyboard user on `<body>` (Domain Rule 10).
 */
export interface WeeklyGoalDraft {
  metric: QuestMetric;
  target: number;
  title: string | null;
}

export function WeeklyGoalDialog({
  open,
  onOpenChange,
  onSubmit,
  usedMetrics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: WeeklyGoalDraft) => void;
  /** Metrics already used this week: the schema allows one goal per metric. */
  usedMetrics: readonly QuestMetric[];
}) {
  const available = QUEST_METRICS.filter((metric) => !usedMetrics.includes(metric));
  const [chosen, setChosen] = React.useState<QuestMetric | null>(null);
  const [target, setTarget] = React.useState("5");
  const [title, setTitle] = React.useState("");
  const openerFocus = useOpenerFocus(open);

  /*
   * Derived rather than synchronised. The schema allows one goal per metric per
   * week, so `available` shrinks the moment a goal is created — and a metric
   * held in state would then name a row that can no longer be made. Falling
   * back during render keeps the two in step without an effect that corrects
   * itself a frame later.
   */
  const metric: QuestMetric =
    chosen !== null && available.includes(chosen) ? chosen : (available[0] ?? "tasks_completed");

  const cap = QUEST_TARGET_CAPS.weekly[metric];
  const parsed = Number(target);
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= cap;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={openerFocus.onOpenAutoFocus}
        onCloseAutoFocus={openerFocus.onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{PROGRESS_COPY.goals.addTitle}</DialogTitle>
          <DialogDescription>{PROGRESS_COPY.goals.reward(50, 20)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-metric">{PROGRESS_COPY.goals.metricLabel}</Label>
            <Select value={metric} onValueChange={(value) => setChosen(value as QuestMetric)}>
              <SelectTrigger id="goal-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {available.map((option) => (
                  <SelectItem key={option} value={option}>
                    {METRIC_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-target">{PROGRESS_COPY.goals.targetLabel}</Label>
            <Input
              id="goal-target"
              inputMode="numeric"
              value={target}
              max={cap}
              min={1}
              onChange={(event) => setTarget(event.target.value)}
              aria-describedby="goal-target-hint"
            />
            <span id="goal-target-hint" className="text-xs text-muted-foreground">
              {valid ? `At most ${cap}.` : PROGRESS_COPY.goals.tooBig}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-title">{PROGRESS_COPY.goals.titleLabel}</Label>
            <Input
              id="goal-title"
              value={title}
              placeholder={PROGRESS_COPY.goals.titlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {PROGRESS_COPY.goals.cancel}
          </Button>
          <Button
            disabled={!valid || available.length === 0}
            onClick={() => {
              onSubmit({
                metric,
                target: parsed,
                title: title.trim() === "" ? null : title.trim(),
              });
              setTitle("");
            }}
          >
            {PROGRESS_COPY.goals.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
