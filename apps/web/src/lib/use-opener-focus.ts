"use client";

import * as React from "react";

/**
 * Sends focus back where it came from when a programmatically opened surface
 * closes. Returns the two Radix handlers that do it.
 *
 * Radix returns focus to a `DialogTrigger`; none of the surfaces that use this
 * has one — the block editor opens from a block in the grid, the scheduling
 * dialog from a row in the Plan panel, Today's reschedule dialog from a control
 * in Next Up — and Radix's modal content calls
 * `preventDefault()` on its own close-auto-focus event, so without this the
 * focus lands on `<body>` and a keyboard user is dropped at the top of the page
 * (Domain Rule 10: the keyboard route has to put the user back).
 *
 * The opener is read in `onOpenAutoFocus`, which Radix dispatches on the
 * content *before* it moves focus inside — the last moment the element the user
 * came from is still the active one. Its tab-order neighbours are read at the
 * same moment, for the case where the surface's own action removes the opener:
 * scheduling an UNSCHEDULED row takes the row out of the panel, and focus then
 * goes to the row that follows it rather than to `<body>`.
 *
 * **When focus moves back.** Radix dispatches close-auto-focus from the focus
 * scope's unmount, and a `Sheet` unmounts only after its exit animation — some
 * 200ms during which the element that had focus is already gone and the active
 * element is `<body>`, so a key pressed in that window (`M` on a block, right
 * after Escape) is lost. A caller that passes `open` gets focus restored in the
 * commit that closes the surface instead, and close-auto-focus is left as the
 * fallback for surfaces that close without the prop changing first.
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

  // A passive effect on purpose: it runs after Radix's focus trap has released
  // for the closing content (the trap's own cleanup is a child's effect and so
  // runs first), and still inside the commit that closed the surface.
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

/**
 * Focuses the first candidate that is still in the document and visible.
 * Returns whether any was.
 */
export function focusFirstAvailable(candidates: readonly (HTMLElement | null)[]): boolean {
  for (const candidate of candidates) {
    if (candidate === null || !candidate.isConnected || !isVisible(candidate)) continue;
    candidate.focus();
    if (document.activeElement === candidate) return true;
  }
  return false;
}

/**
 * The elements before and after `element` in the page's tab order, read now,
 * while `element` is still in the document. Anything inside `exclude` — the
 * surface that is opening — is skipped, since it is about to go away, and so
 * is anything in a dialog other than the one `element` is in: a neighbour is
 * something in the same layer, never a control of a surface stacked over it.
 * (The layer, not `aria-hidden`: a modal has already hidden the rest of the
 * page from assistive technology by the time it asks who opened it.)
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

/**
 * `checkVisibility` answers for `display: none` ancestors, which is what a
 * responsive `hidden lg:flex` panel is below `lg`. jsdom does not implement it
 * and lays nothing out, so there everything connected counts as visible.
 */
function isVisible(element: HTMLElement): boolean {
  if (element.closest("[hidden]") !== null) return false;
  return typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
}
