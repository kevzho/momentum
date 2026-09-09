/**
 * The one shape every server action returns. Actions never throw for an
 * expected failure: everything a user can legitimately cause comes back as
 * `{ ok: false }` with a code the UI can branch on and a message it can show verbatim.
 */

export type ActionErrorCode =
  "unauthenticated" | "forbidden" | "not_found" | "validation" | "conflict" | "unavailable";

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  /** Keyed by form field name. */
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
 * Flattens a zod error into `fieldErrors`. `message` is the first thing zod
 * said, whichever field it was about: surfaces without highlighted inputs show
 * it alone, and "check the highlighted fields" told them nothing.
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
