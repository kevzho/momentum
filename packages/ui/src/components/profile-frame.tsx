import * as React from "react";
import { cn } from "cn";

import { PROFILE_FRAME_KEYS, type ProfileFrameKey } from "@momentum/core/gamification";

/**
 * Exhaustive `Record`: Tailwind classes cannot be assembled at runtime, and a
 * key added to `PROFILE_FRAME_KEYS` without a style here is a type error.
 */
const FRAME_RING: Record<ProfileFrameKey, string> = {
  frame_copper: "ring-2 ring-[color-mix(in_oklab,var(--color-amber-600)_80%,transparent)]",
  frame_graphite: "ring-2 ring-[color-mix(in_oklab,var(--foreground)_45%,transparent)]",
};

/** Every frame this component can draw, so the shop and the renderer agree. */
const RENDERED_FRAMES: readonly ProfileFrameKey[] = PROFILE_FRAME_KEYS;

function ProfileFrame({
  frame,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { frame: ProfileFrameKey | null }) {
  return (
    <span
      data-slot="profile-frame"
      data-frame={frame ?? undefined}
      className={cn(
        "inline-flex rounded-full ring-offset-1 ring-offset-background",
        frame === null ? null : FRAME_RING[frame],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { ProfileFrame, FRAME_RING, RENDERED_FRAMES };
