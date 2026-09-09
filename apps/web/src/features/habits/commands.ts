import { RepeatIcon } from "lucide-react";

import { NEW_HABIT_HREF } from "@/features/habits/navigation";
import { defineCommands } from "@/features/palette/types";

/** Same shape as the calendar's: an intent in the URL, honoured by the page. */
export const habitCommands = defineCommands("habits", [
  {
    id: "habits.create",
    group: "create",
    label: "Add habit",
    icon: RepeatIcon,
    keywords: ["new", "routine", "streak", "daily"],
    run: (context) => context.navigate(NEW_HABIT_HREF),
  },
]);
