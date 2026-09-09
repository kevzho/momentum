import { TimerIcon } from "lucide-react";

import { defineCommands } from "@/features/palette/types";

/**
 * Focus is reached, not started, from here.
 *
 * A session's start is a measured timestamp the database writes, and the setup
 * panel is where the length and the task are chosen — so the command lands the
 * user on the page with everything ready and one button left to press. Nothing
 * in this product starts a timer as a side effect of navigation.
 */
export const focusCommands = defineCommands("focus", [
  {
    id: "focus.start",
    group: "create",
    label: "Start focus session",
    icon: TimerIcon,
    keywords: ["pomodoro", "timer", "deep work", "session"],
    run: (context) => context.navigate("/focus"),
  },
]);
