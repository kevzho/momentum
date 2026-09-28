"use client";

import * as React from "react";
import { FileTextIcon, UploadIcon, XIcon } from "lucide-react";

import type { CourseFile } from "@momentum/core/types";
import { Button } from "@momentum/ui/components/button";
import { toast } from "@momentum/ui/components/toast";

import {
  beginCourseFileUpload,
  finishCourseFileUpload,
  removeCourseFile,
} from "@/features/courses/actions";
import {
  formatFileSize,
  isPdfName,
  putPdf,
  settle,
} from "@/features/courses/components/pdf-upload";
import { MAX_COURSE_FILE_BYTES } from "@/features/courses/schemas";

/** Where a course file opens; `#page=N` after it opens the PDF at that page. */
export function courseFileHref(courseId: string, fileId: string): string {
  return `/api/courses/${courseId}/files/${fileId}`;
}

/**
 * The course's PDFs beside the syllabus — textbooks, notes. Each opens in a
 * new tab through the owner-only route; uploads go straight to storage like
 * the syllabus does. Several files can be picked at once.
 */
export function CourseFilesPanel({
  courseId,
  files,
  onFilesChanged,
}: {
  courseId: string;
  files: readonly CourseFile[];
  /** The page re-reads the course after an upload or removal. */
  onFilesChanged: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const busy = uploading !== null || removing !== null;

  async function uploadOne(file: File, sortOrder: number): Promise<boolean> {
    if (file.size > MAX_COURSE_FILE_BYTES) {
      toast.error(`${file.name} is over 50 MB.`);
      return false;
    }
    if (!isPdfName(file.name)) {
      toast.error(`${file.name} is not a PDF.`);
      return false;
    }

    const fileId = crypto.randomUUID();
    const ticket = await settle(
      () => beginCourseFileUpload({ courseId, fileId, fileName: file.name, size: file.size }),
      "beginCourseFileUpload",
    );
    if (!ticket.ok) {
      toast.error(ticket.error.message);
      return false;
    }
    if (!(await putPdf(ticket.data.signedUrl, file))) {
      toast.error(`${file.name} did not upload. Try again.`);
      return false;
    }
    const recorded = await settle(
      () =>
        finishCourseFileUpload({
          courseId,
          fileId,
          fileName: file.name,
          size: file.size,
          sortOrder,
        }),
      "finishCourseFileUpload",
    );
    if (!recorded.ok) {
      toast.error(recorded.error.message);
      return false;
    }
    return true;
  }

  async function upload(picked: readonly File[]): Promise<void> {
    let sortOrder = files.reduce((max, file) => Math.max(max, file.sortOrder), 0);
    let uploaded = 0;
    try {
      for (const file of picked) {
        setUploading(file.name);
        sortOrder += 1;
        if (await uploadOne(file, sortOrder)) uploaded += 1;
      }
    } finally {
      setUploading(null);
      if (inputRef.current) inputRef.current.value = "";
    }
    if (uploaded > 0) {
      toast.success(uploaded === 1 ? "File uploaded" : `${uploaded} files uploaded`);
      onFilesChanged();
    }
  }

  async function remove(file: CourseFile): Promise<void> {
    setRemoving(file.id);
    try {
      const result = await settle(() => removeCourseFile({ id: file.id }), "removeCourseFile");
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Removed ${file.fileName}`);
      onFilesChanged();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section aria-labelledby="course-files-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="course-files-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Files
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7"
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
        >
          <UploadIcon aria-hidden="true" />
          {uploading === null ? "Add PDF" : "Uploading…"}
        </Button>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Textbooks and notes, up to 50 MB each.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a
                href={courseFileHref(courseId, file.id)}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
                title={file.fileName}
              >
                {file.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatFileSize(file.sizeBytes)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Remove ${file.fileName}`}
                aria-disabled={busy || undefined}
                onClick={() => {
                  if (!busy) void remove(file);
                }}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {uploading === null ? null : (
        <p className="truncate text-xs text-muted-foreground" aria-live="polite">
          Uploading {uploading}…
        </p>
      )}

      {/* The real file input is hidden; "Add PDF" is its keyboard-reachable face. */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          if (picked.length > 0) void upload(picked);
        }}
      />
    </section>
  );
}
