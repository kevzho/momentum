"use client";

import * as React from "react";

/**
 * Moves focus to the form's message when a submission produces one. The
 * disabled submit button is blurred by the browser, so without this a
 * keyboard user lands on `<body>`.
 */
export function useResultFocus<State>(state: State): React.RefObject<HTMLParagraphElement | null> {
  const message = React.useRef<HTMLParagraphElement>(null);

  React.useEffect(() => {
    if (state === null || state === undefined) return;
    message.current?.focus();
  }, [state]);

  return message;
}
