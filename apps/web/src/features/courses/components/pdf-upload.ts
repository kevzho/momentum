import { unstable_rethrow } from "next/navigation";

import { failure, type ActionResult } from "@/lib/actions/result";
import { reportError } from "@/lib/report-error";

/**
 * What the syllabus and course-file panels share: a PDF goes from the
 * browser straight to storage on a signed upload URL the server mints, and
 * the server records it afterwards — a server action never carries the bytes.
 */

/** A rejected call becomes a failed result, so it never reaches the route's error boundary. */
export async function settle<T>(
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

/** PUTs the file to a signed upload URL; false when storage refused it or the network dropped. */
export async function putPdf(signedUrl: string, file: File): Promise<boolean> {
  try {
    const response = await fetch(signedUrl, {
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      body: file,
    });
    return response.ok;
  } catch (thrown) {
    reportError(thrown, { source: "putPdf" });
    return false;
  }
}

export function isPdfName(name: string): boolean {
  return /\.pdf$/iu.test(name);
}

/** "4.9 MB", "812 KB": how big a file is, to a glance. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
