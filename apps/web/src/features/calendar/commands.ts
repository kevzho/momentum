import { CalendarPlusIcon } from "lucide-react";

import { NEW_EVENT_HREF } from "@/features/calendar/navigation";
import { defineCommands } from "@/features/palette/types";

/**
 * Navigates rather than opening the editor here: the editor needs the week's
 * items, grid spec and snap setting, which only the calendar page resolves.
 */
export const calendarCommands = defineCommands("calendar", [
  {
    id: "calendar.createEvent",
    group: "create",
    label: "Add event",
    icon: CalendarPlusIcon,
    keywords: ["new", "meeting", "appointment", "block"],
    run: (context) => context.navigate(NEW_EVENT_HREF),
  },
]);
