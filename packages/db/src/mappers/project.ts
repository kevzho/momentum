import { PROJECT_COLORS, type Project, type ProjectColor } from "@momentum/core/types";

import type { Row } from "../types";
import { oneOf, toInstant, toInstantOrNull } from "./scalars";

export function rowToProject(row: Row<"projects">): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    color: oneOf<ProjectColor>(PROJECT_COLORS, row.color, "projects.color"),
    icon: row.icon,
    archivedAt: toInstantOrNull(row.archived_at),
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}
