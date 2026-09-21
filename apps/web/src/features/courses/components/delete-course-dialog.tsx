"use client";

import * as React from "react";

import { Button } from "@momentum/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@momentum/ui/components/dialog";

import type { CourseSummary } from "@/features/courses/types";
import { useOpenerFocus } from "@/lib/use-opener-focus";

/**
 * Confirmation before deleting a course. Cancel takes default focus so Enter
 * does nothing irreversible. The project and its tasks are not touched, and
 * the copy says so.
 */
export function DeleteCourseDialog({
  course,
  pending,
  onConfirm,
  onClose,
}: {
  course: CourseSummary | null;
  pending: boolean;
  onConfirm: (course: CourseSummary) => void;
  onClose: () => void;
}) {
  const openerFocus = useOpenerFocus();
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <Dialog
      open={course !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {course === null ? null : (
        <DialogContent
          className="sm:max-w-md"
          onOpenAutoFocus={(event) => {
            openerFocus.onOpenAutoFocus(event);
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={openerFocus.onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>Delete “{course.name}”?</DialogTitle>
            <DialogDescription>
              The syllabus and every week&rsquo;s notes go with it. The project and its tasks stay
              where they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              size="sm"
              aria-disabled={pending || undefined}
              onClick={() => {
                if (!pending) onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-disabled={pending || undefined}
              onClick={() => {
                if (!pending) onConfirm(course);
              }}
            >
              Delete course
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
