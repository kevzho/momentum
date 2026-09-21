import type { Route } from "next";

import type { Uuid } from "@momentum/core/types";

export const COURSES_HREF = "/courses" as Route;

export function courseHref(id: Uuid): Route {
  return `/courses/${id}` as Route;
}
