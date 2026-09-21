"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";
import { FileTextIcon, UploadIcon, XIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { toast } from "@momentum/ui/components/toast";

import { CommittedTextarea } from "@/components/committed-field";
import {
  beginSyllabusUpload,
  finishSyllabusUpload,
  removeSyllabusFile,
} from "@/features/courses/actions";
import { MAX_SYLLABUS_BYTES } from "@/features/courses/schemas";
import { failure, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";

/**
 * The syllabus: a PDF, typed notes, or both. The PDF goes straight from the
 * browser to storage on a signed upload URL the server mints, then the
 * server records it on the course — a server action never carries the bytes.
 */
export function SyllabusPanel({
  courseId,
  fileName,
  notes,
  onNotes,
  onFileChanged,
}: {
  courseId: string;
  /** The uploaded PDF's name, or null when there is none. */
  fileName: string | null;
  notes: string;
  onNotes: (next: string) => void;
  /** The page re-reads the course after an upload or removal. */
  onFileChanged: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<"uploading" | "removing" | null>(null);

  async function upload(file: File): Promise<void> {
    if (file.size > MAX_SYLLABUS_BYTES) {
      toast.error("A syllabus PDF is at most 10 MB.");
      return;
    }
    if (!/\.pdf$/iu.test(file.name)) {
      toast.error("The syllabus has to be a PDF.");
      return;
    }

    setBusy("uploading");
    try {
      const ticket = await settle(
        () => beginSyllabusUpload({ courseId, fileName: file.name, size: file.size }),
        "beginSyllabusUpload",
      );
      if (!ticket.ok) {
        toast.error(ticket.error.message);
        return;
      }

      const response = await fetch(ticket.data.signedUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: file,
      });
      if (!response.ok) {
        toast.error("The upload did not go through. Try again.");
        return;
      }

      const recorded = await settle(
        () => finishSyllabusUpload({ courseId, path: ticket.data.path, fileName: file.name }),
        "finishSyllabusUpload",
      );
      if (!recorded.ok) {
        toast.error(recorded.error.message);
        return;
      }
      toast.success(`Uploaded ${file.name}`);
      onFileChanged();
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(): Promise<void> {
    setBusy("removing");
    try {
      const result = await settle(() => removeSyllabusFile({ courseId }), "removeSyllabusFile");
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Syllabus PDF removed");
      onFileChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="course-syllabus-heading" className="flex flex-col gap-2">
      <h2
        id="course-syllabus-heading"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Syllabus
      </h2>

      {fileName === null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          aria-disabled={busy !== null || undefined}
          onClick={() => {
            if (busy === null) inputRef.current?.click();
          }}
        >
          <UploadIcon aria-hidden="true" />
          {busy === "uploading" ? "Uploading…" : "Upload PDF"}
        </Button>
      ) : (
        <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <a
            href={`/api/courses/${courseId}/syllabus`}
            target="_blank"
            rel="noreferrer noopener"
            className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
          >
            {fileName}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            aria-disabled={busy !== null || undefined}
            onClick={() => {
              if (busy === null) inputRef.current?.click();
            }}
          >
            {busy === "uploading" ? "Uploading…" : "Replace"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Remove syllabus PDF"
            aria-disabled={busy !== null || undefined}
            onClick={() => {
              if (busy === null) void remove();
            }}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* The real file input is hidden; the buttons above are its keyboard-reachable face. */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <CommittedTextarea
        aria-label="Syllabus notes"
        placeholder="Grading, office hours, exam dates, policies — what is worth keeping to hand."
        rows={fileName === null ? 10 : 6}
        value={notes}
        onCommit={onNotes}
      />
    </section>
  );
}

/** A rejected call becomes a failed result, so it never reaches the route's error boundary. */
async function settle<T>(
  call: () => Promise<ActionResult<T>>,
  source: string,
): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch (thrown) {
    unstable_rethrow(thrown);
    reportError(thrown, { source });
    return failure("unavailable", "Momentum could not reach the server. Nothing was saved.");
  }
}
