import type { Instant, Uuid } from "./scalars";

/**
 * Bounded palette for projects and calendar blocks. Names, not hex values: the
 * design system resolves each to light- and dark-theme block colors that meet
 * WCAG AA as block backgrounds (docs/DESIGN_SYSTEM.md).
 */
export const PROJECT_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "rose",
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export interface Project {
  id: Uuid;
  userId: Uuid;
  name: string;
  description: string | null;
  color: ProjectColor;
  /** Icon key from the icon library, or null for a plain color dot. */
  icon: string | null;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}
