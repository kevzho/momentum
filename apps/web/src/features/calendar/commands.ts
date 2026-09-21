import { CalendarPlusIcon } from "lucide-react";

import { defineCommands } from "@/features/palette/types";

/**
 * Opens Quick Add on an event, the same two interactions as a task: a title
 * with a day and a time written into it, from any route. The calendar's own
 * editor (colour, description, a repeat rule) is a click on the block after.
 */
export const calendarCommands = defineCommands("calendar", [
  {
    id: "calendar.createEvent",
    group: "create",
    label: "Add event",
    icon: CalendarPlusIcon,
    keywords: ["new", "meeting", "appointment", "block", "exam", "test", "class"],
    run: (context) => context.quickAdd({ kind: "event" }),
  },
]);
