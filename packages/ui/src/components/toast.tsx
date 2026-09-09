"use client";

import { toast as sonnerToast } from "sonner";

import { AchievementToast, type CelebrationKind } from "@momentum/ui/components/achievement-toast";
import { announceStandalone } from "@momentum/ui/components/announcer";
import { Toaster as SonnerToaster } from "@momentum/ui/components/sonner";
import { XPToast } from "@momentum/ui/components/xp-toast";

/**
 * Deliberately narrower than sonner. Message toasts announce through the
 * `Announcer` (sonner's own live region is switched off in `Toaster`); XP and
 * celebration toasts announce nothing, the caller does. An error with an
 * action does not auto-dismiss: a keyboard user may have to close a modal first.
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
  xp: (amount: number, reason?: string) =>
    sonnerToast.custom(() => <XPToast amount={amount} reason={reason} />, { duration: 2600 }),
  /** The only loud toast; show at most once per update, never a queue. */
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
 * Mount once, at the root. `pointer-events-auto` lets a Retry be pressed while
 * a modal has switched pointer events off on `body`. Sonner hard-codes
 * `aria-live="polite"` with no option to turn it off, so the ref does.
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
