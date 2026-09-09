import { CalendarPlusIcon } from "lucide-react";

import { NEW_EVENT_HREF } from "@/features/calendar/navigation";
import { defineCommands } from "@/features/palette/types";

/**
 * The calendar's one command.
 *
 * It navigates rather than opening an editor from here: the block editor needs
 * the week's items, the grid's spec and the profile's snap setting, all of
 * which are the calendar page's to resolve. `?new=event` is the intent, and the
 * page honours it once and drops it from the URL (specs/11-command-palette.md).
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
