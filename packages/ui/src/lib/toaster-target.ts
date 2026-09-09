/** Dialog and Sheet ask this before treating an interaction as "outside", so a toast's Retry does not dismiss them. */
function isInsideToaster(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const element = target instanceof Element ? target : target.parentElement;
  return Boolean(element?.closest("[data-sonner-toaster]"));
}

export { isInsideToaster };
