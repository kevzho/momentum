"use client";

import * as React from "react";

/**
 * Moves focus to the form's message when a submission produces one.
 *
 * The submit button is natively disabled while the action runs, and the
 * browser blurs a disabled element — so after a failed sign-in, or after the
 * reset form replaces itself with its confirmation, a keyboard user was on
 * `<body>` at the top of the document. The message is `role="alert"` or
 * `role="status"`, so it is announced either way; focusing it puts the next
 * Tab where the user is looking (Domain Rule 10).
 */
export function useResultFocus<State>(state: State): React.RefObject<HTMLParagraphElement | null> {
  const message = React.useRef<HTMLParagraphElement>(null);

  React.useEffect(() => {
    if (state === null || state === undefined) return;
    message.current?.focus();
  }, [state]);

  return message;
}
