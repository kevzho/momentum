import { TimerIcon } from "lucide-react";

import { defineCommands } from "@/features/palette/types";

/** Navigates to the setup panel; nothing starts a timer as a side effect of navigation. */
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
