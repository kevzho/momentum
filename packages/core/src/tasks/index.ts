/**
 * `@momentum/core/tasks` — the task manager's domain logic, framework-free.
 *
 * The six views, the toolbar's filters, list ordering, manual reordering and
 * the coverage maths. Everything here is pure and takes "today" as a parameter,
 * so the same functions answer for the server render and for the optimistic
 * client overlay without either of them consulting a clock (Domain Rules 4, 5).
 */
export * from "./coverage";
export * from "./views";
export * from "./sorting";
