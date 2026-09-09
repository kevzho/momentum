import * as React from "react";
import { cn } from "cn";
import type { ProjectColor } from "@momentum/core/types";

/** The only place a `ProjectColor` maps to classes; exhaustive, so a new hue without a style here is a type error. */
const PROJECT_SURFACE: Record<ProjectColor, string> = {
  slate: "bg-project-slate text-project-slate-fg border-project-slate-border",
  red: "bg-project-red text-project-red-fg border-project-red-border",
  orange: "bg-project-orange text-project-orange-fg border-project-orange-border",
  amber: "bg-project-amber text-project-amber-fg border-project-amber-border",
  green: "bg-project-green text-project-green-fg border-project-green-border",
  teal: "bg-project-teal text-project-teal-fg border-project-teal-border",
  cyan: "bg-project-cyan text-project-cyan-fg border-project-cyan-border",
  blue: "bg-project-blue text-project-blue-fg border-project-blue-border",
  indigo: "bg-project-indigo text-project-indigo-fg border-project-indigo-border",
  violet: "bg-project-violet text-project-violet-fg border-project-violet-border",
  pink: "bg-project-pink text-project-pink-fg border-project-pink-border",
  rose: "bg-project-rose text-project-rose-fg border-project-rose-border",
};

const PROJECT_DOT: Record<ProjectColor, string> = {
  slate: "bg-project-slate-fg",
  red: "bg-project-red-fg",
  orange: "bg-project-orange-fg",
  amber: "bg-project-amber-fg",
  green: "bg-project-green-fg",
  teal: "bg-project-teal-fg",
  cyan: "bg-project-cyan-fg",
  blue: "bg-project-blue-fg",
  indigo: "bg-project-indigo-fg",
  violet: "bg-project-violet-fg",
  pink: "bg-project-pink-fg",
  rose: "bg-project-rose-fg",
};

/** Classes for a filled project surface (calendar block, badge). */
function projectSurface(color: ProjectColor): string {
  return PROJECT_SURFACE[color];
}

/** Always sits next to the project's name or carries one through `label`. */
function ProjectDot({
  color,
  label,
  className,
  ...props
}: React.ComponentProps<"span"> & { color: ProjectColor; label?: string }) {
  return (
    <span
      data-slot="project-dot"
      className={cn("inline-block size-2 shrink-0 rounded-full", PROJECT_DOT[color], className)}
      {...props}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export { ProjectDot, projectSurface };
