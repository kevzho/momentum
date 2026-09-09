"use client";

import * as React from "react";
import {
  ArrowDownNarrowWideIcon,
  ArrowUpNarrowWideIcon,
  FilterIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import {
  EMPTY_FILTER,
  TASK_SORT_LABELS,
  TASK_SORTS,
  isEmptyFilter,
  isTaskSort,
  type ScheduledFilter,
  type SortDirection,
  type TaskFilter,
  type TaskPriorityFilter,
  type TaskSort,
} from "@momentum/core/tasks";

import { Button } from "@momentum/ui/components/button";
import { Input } from "@momentum/ui/components/input";
import { Label } from "@momentum/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@momentum/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@momentum/ui/components/select";

import type { ProjectSummary } from "@/features/tasks/types";

const ANY = "__any__";

/**
 * Sort, filter and search over the current view.
 *
 * A filter narrows a view and never widens it (`selectTasks`), which is why
 * this sits under the view tabs rather than beside them: the tabs choose the
 * question, this narrows the answer. Both persist for the session.
 */
export function TaskToolbar({
  sort,
  direction,
  filter,
  projects,
  matchCount,
  totalCount,
  onSortChange,
  onDirectionChange,
  onFilterChange,
}: {
  sort: TaskSort;
  direction: SortDirection;
  filter: TaskFilter;
  projects: readonly ProjectSummary[];
  matchCount: number;
  totalCount: number;
  onSortChange: (sort: TaskSort) => void;
  onDirectionChange: (direction: SortDirection) => void;
  onFilterChange: (filter: TaskFilter) => void;
}) {
  const active = !isEmptyFilter(filter);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-64">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={filter.search}
          placeholder="Filter by title"
          aria-label="Filter tasks by title"
          className="pl-8"
          onChange={(event) => onFilterChange({ ...filter, search: event.target.value })}
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant={active ? "secondary" : "outline"} size="sm">
            <FilterIcon aria-hidden="true" />
            Filter
            {active ? (
              <span data-slot="numeric" className="text-xs text-muted-foreground">
                {matchCount}/{totalCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-priority">Priority</Label>
              <Select
                value={filter.priority === null ? ANY : String(filter.priority)}
                onValueChange={(value) =>
                  onFilterChange({
                    ...filter,
                    priority: value === ANY ? null : (Number(value) as TaskPriorityFilter),
                  })
                }
              >
                <SelectTrigger id="filter-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any priority</SelectItem>
                  <SelectItem value="1">P1 · Urgent</SelectItem>
                  <SelectItem value="2">P2 · High</SelectItem>
                  <SelectItem value="3">P3 · Normal</SelectItem>
                  <SelectItem value="4">P4 · None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-project">Project</Label>
              <Select
                value={filter.projectId ?? ANY}
                onValueChange={(value) =>
                  onFilterChange({ ...filter, projectId: value === ANY ? null : value })
                }
              >
                <SelectTrigger id="filter-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* "Scheduled" is answered by whether the task owns a work block —
                never by a column on the task (Domain Rule 2). */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-scheduled">Scheduled</Label>
              <Select
                value={filter.scheduled}
                onValueChange={(value) =>
                  onFilterChange({ ...filter, scheduled: value as ScheduledFilter })
                }
              >
                <SelectTrigger id="filter-scheduled" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="scheduled">Has work blocks</SelectItem>
                  <SelectItem value="unscheduled">No work blocks</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {active ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => onFilterChange(EMPTY_FILTER)}
              >
                <XIcon aria-hidden="true" />
                Clear filters
              </Button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex items-center gap-1">
        <Select
          value={sort}
          onValueChange={(value) => {
            if (isTaskSort(value)) onSortChange(value);
          }}
        >
          <SelectTrigger aria-label="Sort by" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_SORTS.map((option) => (
              <SelectItem key={option} value={option}>
                {TASK_SORT_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onDirectionChange(direction === "asc" ? "desc" : "asc")}
        >
          {direction === "asc" ? (
            <ArrowUpNarrowWideIcon aria-hidden="true" />
          ) : (
            <ArrowDownNarrowWideIcon aria-hidden="true" />
          )}
          <span className="sr-only">
            {direction === "asc" ? "Sorted ascending" : "Sorted descending"} — reverse the order
          </span>
        </Button>
      </div>
    </div>
  );
}
