"use client";

import { toast as sonnerToast } from "sonner";

import { AchievementToast, type CelebrationKind } from "@momentum/ui/components/achievement-toast";
import { announceStandalone } from "@momentum/ui/components/announcer";
import { Toaster as SonnerToaster } from "@momentum/ui/components/sonner";
import { XPToast } from "@momentum/ui/components/xp-toast";

/**
 * The one toast API and the one toast style.
 *
 * Deliberately narrower than sonner's surface: success / error / info /
 * warning, and `dismiss`. Errors carry the server's message and, when the
 * caller can retry, an action (docs/ARCHITECTURE.md §15). Custom renderers are
 * reserved for XP and achievements; nothing else gets its own visual.
 *
 * **One live region.** Sonner's own `aria-live` container is switched off in
 * `Toaster`, and each message toast speaks through the `Announcer` instead —
 * so a toast is announced exactly once, from the same place as every other
 * dynamic change. The XP and celebration toasts announce nothing here: the
 * caller that knows the event already announces it in better words.
 *
 * **An error the user can act on stays.** A failure toast with an action
 * (Retry) does not auto-dismiss: the surface it belongs to may be modal, and a
 * keyboard user has to close that surface before the action is reachable.
 */
type ToastOptions = {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
};

function spoken(message: string, options?: ToastOptions): string {
  return options?.description ? `${message} ${options.description}` : message;
}

type CelebrationOptions = {
  kind: CelebrationKind;
  title: string;
  description?: string;
  duration?: number;
};

const toast = {
  success: (message: string, options?: ToastOptions) => {
    announceStandalone(spoken(message, options));
    return sonnerToast.success(message, options);
  },
  error: (message: string, options?: ToastOptions) => {
    announceStandalone(spoken(message, options));
    return sonnerToast.error(message, {
      ...options,
      duration: options?.duration ?? (options?.action ? Infinity : undefined),
    });
  },
  info: (message: string, options?: ToastOptions) => {
    announceStandalone(spoken(message, options));
    return sonnerToast.info(message, options);
  },
  warning: (message: string, options?: ToastOptions) => {
    announceStandalone(spoken(message, options));
    return sonnerToast.warning(message, options);
  },
  /**
   * The subtle one: a number moved. Short, because it happens often and is
   * never the point of the interaction (docs/DESIGN_SYSTEM.md).
   */
  xp: (amount: number, reason?: string) =>
    sonnerToast.custom(() => <XPToast amount={amount} reason={reason} />, { duration: 2600 }),
  /**
   * The loud one, and the only loud one: a level up, an achievement, or a
   * weekly goal. Brief and skippable, and shown at most once per update — a
   * queue of celebrations is a listed failure mode.
   */
  celebrate: ({ kind, title, description, duration = 6000 }: CelebrationOptions) =>
    sonnerToast.custom(
      (id) => (
        <AchievementToast
          kind={kind}
          title={title}
          description={description}
          onDismiss={() => sonnerToast.dismiss(id)}
        />
      ),
      { duration },
    ),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};

/**
 * Mount once, at the root. Positioned bottom-right, above everything else.
 *
 * `pointer-events-auto`: a modal dialog switches pointer events off on `body`,
 * and the toaster is a child of `body`. Opting it back in is what lets a
 * failure toast's Retry be pressed while the surface that failed is still
 * open; Dialog and Sheet in turn do not treat that press as "outside".
 *
 * Sonner hard-codes `aria-live="polite"` on its container and exposes no way
 * to turn it off, so the ref does: the `Announcer` is the application's one
 * live region, and this container must not be a second one.
 */
function Toaster() {
  return (
    <SonnerToaster
      ref={silenceLiveRegion}
      position="bottom-right"
      gap={8}
      offset={16}
      duration={5000}
      className="pointer-events-auto z-toast"
      toastOptions={{ classNames: { toast: "cn-toast text-sm" } }}
    />
  );
}

function silenceLiveRegion(container: HTMLElement | null): void {
  container?.setAttribute("aria-live", "off");
}

export { toast, Toaster };
export type { ToastOptions };
