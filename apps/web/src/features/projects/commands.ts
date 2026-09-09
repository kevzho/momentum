import { FolderPlusIcon } from "lucide-react";

import { defineCommands } from "@/features/palette/types";
import { NEW_PROJECT_HREF } from "@/features/tasks/view-params";

export const projectCommands = defineCommands("projects", [
  {
    id: "projects.create",
    group: "create",
    label: "New project",
    icon: FolderPlusIcon,
    keywords: ["add", "folder", "area", "create project"],
    run: (context) => context.navigate(NEW_PROJECT_HREF),
  },
]);
