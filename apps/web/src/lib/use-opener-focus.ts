"use client";

import * as React from "react";

/**
 * Sends focus back to the element that opened a programmatically opened
 * surface when it closes. Radix only restores focus to a `DialogTrigger`, and
 * its modal content calls `preventDefault()` on close-auto-focus, so without
 * this a keyboard user lands on `<body>`. The opener and its tab-order
 * neighbours are read in `onOpenAutoFocus`, the last moment the opener is
 * still active, so focus has somewhere to go if the surface's own action
 * removes it. A caller that passes `open` gets focus restored in the closing
 * commit, before the Sheet's ~200ms exit animation, so a key pressed in that
 * window is not lost.
 */
export function useOpenerFocus(open?: boolean): {
  onOpenAutoFocus: (event: Event) => void;
  onCloseAutoFocus: (event: Event) => void;
} {
  const openerRef = React.useRef<FocusReturn | null>(null);

  const onOpenAutoFocus = React.useCallback((event: Event) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      openerRef.current = null;
      return;
    }
    const content = event.target instanceof Node ? event.target : null;
    openerRef.current = { opener: active, ...tabbableNeighbours(active, content) };
  }, []);

  const restore = React.useCallback(() => {
    const target = openerRef.current;
    openerRef.current = null;
    if (target !== null) focusFirstAvailable([target.opener, target.next, target.previous]);
  }, []);

  const onCloseAutoFocus = React.useCallback(
    (event: Event) => {
      event.preventDefault();
      restore();
    },
    [restore],
  );

  // Passive on purpose: runs after Radix's focus trap has released (its cleanup
  // is a child's effect), still inside the commit that closed the surface.
  const wasOpen = React.useRef(open === true);
  React.useEffect(() => {
    if (open === undefined) return;
    if (wasOpen.current && !open) restore();
    wasOpen.current = open;
  }, [open, restore]);

  return { onOpenAutoFocus, onCloseAutoFocus };
}

interface FocusReturn {
  opener: HTMLElement;
  next: HTMLElement | null;
  previous: HTMLElement | null;
}

/** Focuses the first candidate still in the document and visible; returns whether any was. */
export function focusFirstAvailable(candidates: readonly (HTMLElement | null)[]): boolean {
  for (const candidate of candidates) {
    if (candidate === null || !candidate.isConnected || !isVisible(candidate)) continue;
    candidate.focus();
    if (document.activeElement === candidate) return true;
  }
  return false;
}

/**
 * The elements before and after `element` in tab order, read now while it is
 * still in the document. Skips `exclude` (the surface that is opening) and any
 * dialog other than the one `element` is in: a neighbour is in the same layer.
 */
export function tabbableNeighbours(
  element: HTMLElement,
  exclude: Node | null = null,
): { next: HTMLElement | null; previous: HTMLElement | null } {
  const layer = element.closest(DIALOG);
  const all = tabbables(document.body).filter(
    (candidate) =>
      (exclude === null || !exclude.contains(candidate)) && candidate.closest(DIALOG) === layer,
  );
  const index = all.indexOf(element);
  if (index === -1) return { next: null, previous: null };
  return { next: all[index + 1] ?? null, previous: all[index - 1] ?? null };
}

const DIALOG = '[role="dialog"], [role="alertdialog"]';

const TABBABLE = "a[href], button, input, select, textarea, [tabindex]";

function tabbables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (candidate) =>
      candidate.tabIndex >= 0 && !candidate.hasAttribute("disabled") && isVisible(candidate),
  );
}

// `checkVisibility` answers for `display: none` ancestors. jsdom does not
// implement it, so there everything connected counts as visible.
function isVisible(element: HTMLElement): boolean {
  if (element.closest("[hidden]") !== null) return false;
  return typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
}
