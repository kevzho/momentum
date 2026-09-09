/**
 * Whether an event target sits inside the toaster.
 *
 * A modal dialog or sheet dismisses on any interaction outside itself, and
 * the toaster is outside it — so a click on a failure toast's Retry would close
 * the surface the user is still in. Dialog and Sheet ask this before treating
 * an interaction as "outside" (docs/ARCHITECTURE.md §15).
 */
function isInsideToaster(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const element = target instanceof Element ? target : target.parentElement;
  return Boolean(element?.closest("[data-sonner-toaster]"));
}

export { isInsideToaster };
