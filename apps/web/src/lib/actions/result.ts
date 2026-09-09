/**
 * The one shape every server action returns.
 *
 * Actions never throw for an expected failure: a thrown error is a bug and
 * belongs to an error boundary. Everything a user can legitimately cause —
 * invalid input, a row that is not theirs, a conflicting write, an offline
 * device — comes back as `{ ok: false }` with a code the UI can branch on and a
 * message it can show verbatim (docs/ARCHITECTURE.md §6).
 */

export type ActionErrorCode =
  "unauthenticated" | "forbidden" | "not_found" | "validation" | "conflict" | "unavailable";

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  /** Keyed by form field name, ready to render next to the input that failed. */
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function failure(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } };
}

/**
 * Flattens a zod error into the `fieldErrors` shape forms expect.
 *
 * The message is the first thing zod said, whichever field it said it about.
 * A surface that owns the form renders `fieldErrors` next to its inputs; every
 * other surface — a toast after a sheet's commit, a dialog with one field —
 * shows `message` alone, and "check the highlighted fields" with nothing
 * highlighted told those users nothing. The generic sentence is kept only for
 * the case with no message at all.
 */
export function validationError(issues: readonly StandardIssue[]): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  let firstFieldMessage: string | undefined;

  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key === "") {
      formErrors.push(issue.message);
    } else {
      (fieldErrors[key] ??= []).push(issue.message);
      firstFieldMessage ??= issue.message;
    }
  }

  return failure(
    "validation",
    formErrors[0] ?? firstFieldMessage ?? "Please check the highlighted fields.",
    Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
  );
}

/** The part of a zod issue this module needs; keeps zod out of the type surface. */
interface StandardIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}
