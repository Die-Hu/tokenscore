import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "../connection.js";
import { projects } from "../schema.js";

export function findAll() {
  return getDb().select().from(projects).all();
}

export function findById(id: string) {
  return getDb().select().from(projects).where(eq(projects.id, id)).get();
}

export function findByPath(projectPath: string) {
  return getDb()
    .select()
    .from(projects)
    .where(eq(projects.path, projectPath))
    .get();
}

export function upsertFromPath(projectPath: string) {
  const existing = findByPath(projectPath);
  if (existing) return existing;

  const now = Date.now();
  const name = path.basename(projectPath);
  const newProject = {
    id: uuid(),
    name,
    path: projectPath,
    description: null,
    firstActivity: null,
    lastActivity: null,
    createdAt: now,
    updatedAt: now,
  };

  getDb().insert(projects).values(newProject).run();
  return newProject;
}

export function updateActivity(
  projectId: string,
  sessionStartedAt: number,
  sessionEndedAt: number,
) {
  const db = getDb();
  db.update(projects)
    .set({
      firstActivity: sql`CASE WHEN first_activity IS NULL OR ${sessionStartedAt} < first_activity THEN ${sessionStartedAt} ELSE first_activity END`,
      lastActivity: sql`CASE WHEN last_activity IS NULL OR ${sessionEndedAt} > last_activity THEN ${sessionEndedAt} ELSE last_activity END`,
      updatedAt: Date.now(),
    })
    .where(eq(projects.id, projectId))
    .run();
}
