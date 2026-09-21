import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDate } from "@momentum/core/time";

import * as courses from "../src/repositories/courses";
import * as projects from "../src/repositories/projects";
import {
  DB_TESTS_ENABLED,
  SEED_USERS,
  adminClient,
  signIn,
  userIdOf,
  type TestClient,
} from "./support/harness";

/**
 * Courses against a real database: a course is a project with a term, weeks
 * are one row each at most, and neither can point at another account's
 * rows. Run with `MOMENTUM_DB_TESTS=1 pnpm test`. Everything minted is
 * removed by id in `afterAll`.
 */

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

/** SQLSTATE `insufficient_privilege`: what a cross-owner reference comes back with. */
const DENIED = "42501";
/** SQLSTATE `check_violation`. */
const CHECK = "23514";
/** SQLSTATE `unique_violation`. */
const UNIQUE = "23505";

const TERM_START = localDate("2031-01-06");
const TERM_END = localDate("2031-04-13");

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

describeDb("courses", () => {
  let owner: TestClient;
  let neighbour: TestClient;
  let admin: TestClient;
  let ownerId: string;
  let neighbourId: string;
  const projectIds: string[] = [];
  const courseIds: string[] = [];

  async function mintProject(client: TestClient, userId: string): Promise<string> {
    const project = await projects.insert(client, { userId, name: "Fixture: course project" });
    projectIds.push(project.id);
    return project.id;
  }

  beforeAll(async () => {
    owner = await signIn(SEED_USERS.owner);
    neighbour = await signIn(SEED_USERS.neighbour);
    admin = adminClient();
    ownerId = await userIdOf(owner);
    neighbourId = await userIdOf(neighbour);
  });

  afterAll(async () => {
    // Courses cascade to weeks; projects go last (a course also cascades from its project).
    if (courseIds.length > 0) await admin.from("courses").delete().in("id", courseIds);
    if (projectIds.length > 0) await admin.from("projects").delete().in("id", projectIds);
  });

  it("creates a course on the owner's project, writes a week once, and reads both back", async () => {
    const projectId = await mintProject(owner, ownerId);
    const course = await courses.insert(owner, {
      userId: ownerId,
      projectId,
      code: "TEST 101",
      termStart: TERM_START,
      termEnd: TERM_END,
    });
    courseIds.push(course.id);

    expect(course.termStart).toBe(TERM_START);
    expect(course.syllabus).toBeNull();

    const first = await courses.upsertWeek(owner, {
      userId: ownerId,
      courseId: course.id,
      weekNumber: 3,
      topic: "Kinetics",
      materials: null,
    });
    const second = await courses.upsertWeek(owner, {
      userId: ownerId,
      courseId: course.id,
      weekNumber: 3,
      topic: "Kinetics",
      materials: "Chapter 5",
    });

    // The same row, replaced, not a second one.
    expect(second.id).toBe(first.id);
    const weeks = await courses.listWeeksFor(owner, course.id);
    expect(weeks.map((week) => [week.weekNumber, week.materials])).toEqual([[3, "Chapter 5"]]);

    const listed = await courses.listFor(owner, ownerId);
    expect(listed.some((row) => row.id === course.id)).toBe(true);
  });

  it("refuses a course on another account's project, and a week on another account's course", async () => {
    const ownersProject = await mintProject(owner, ownerId);
    const planted = await neighbour
      .from("courses")
      .insert({
        user_id: neighbourId,
        project_id: ownersProject,
        term_start: TERM_START,
        term_end: TERM_END,
      })
      .select("id")
      .maybeSingle();
    expect(planted.error?.code).toBe(DENIED);

    const course = await courses.insert(owner, {
      userId: ownerId,
      projectId: ownersProject,
      termStart: TERM_START,
      termEnd: TERM_END,
    });
    courseIds.push(course.id);

    const plantedWeek = await neighbour
      .from("course_weeks")
      .insert({ user_id: neighbourId, course_id: course.id, week_number: 1, topic: "planted" })
      .select("id")
      .maybeSingle();
    expect(plantedWeek.error?.code).toBe(DENIED);

    // The neighbour cannot see it either way.
    const { data } = await neighbour.from("courses").select("id").eq("id", course.id);
    expect(data).toEqual([]);
  });

  it("holds the term to a year, ending after it starts, and a week to 1..53", async () => {
    const projectId = await mintProject(owner, ownerId);

    await expect(
      courses.insert(owner, {
        userId: ownerId,
        projectId,
        termStart: TERM_END,
        termEnd: TERM_START,
      }),
    ).rejects.toSatisfy((error) => codeOf(error) === CHECK);

    await expect(
      courses.insert(owner, {
        userId: ownerId,
        projectId,
        termStart: TERM_START,
        termEnd: localDate("2032-01-07"),
      }),
    ).rejects.toSatisfy((error) => codeOf(error) === CHECK);

    const course = await courses.insert(owner, {
      userId: ownerId,
      projectId,
      termStart: TERM_START,
      termEnd: TERM_END,
    });
    courseIds.push(course.id);

    await expect(
      courses.upsertWeek(owner, {
        userId: ownerId,
        courseId: course.id,
        weekNumber: 54,
        topic: null,
        materials: null,
      }),
    ).rejects.toSatisfy((error) => codeOf(error) === CHECK);

    // One course per project.
    await expect(
      courses.insert(owner, {
        userId: ownerId,
        projectId,
        termStart: TERM_START,
        termEnd: TERM_END,
      }),
    ).rejects.toSatisfy((error) => codeOf(error) === UNIQUE);
  });

  it("deleting a course removes its weeks and leaves the project", async () => {
    const projectId = await mintProject(owner, ownerId);
    const course = await courses.insert(owner, {
      userId: ownerId,
      projectId,
      termStart: TERM_START,
      termEnd: TERM_END,
    });
    await courses.upsertWeek(owner, {
      userId: ownerId,
      courseId: course.id,
      weekNumber: 1,
      topic: "Intro",
      materials: null,
    });

    await courses.remove(owner, course.id);

    const { data: weeks } = await admin
      .from("course_weeks")
      .select("id")
      .eq("course_id", course.id);
    expect(weeks).toEqual([]);
    expect(await projects.findById(owner, projectId)).not.toBeNull();
    expect(await courses.findById(owner, course.id)).toBeNull();
  });
});
