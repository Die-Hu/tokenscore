import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../connection.js";
import { sessions } from "../schema.js";

export interface SessionFilters {
  projectId?: string;
  toolId?: string;
  limit?: number;
}

export function findAll(filters?: SessionFilters) {
  const db = getDb();
  let query = db.select().from(sessions).$dynamic();

  const conditions = [];
  if (filters?.projectId) {
    conditions.push(eq(sessions.projectId, filters.projectId));
  }
  if (filters?.toolId) {
    conditions.push(eq(sessions.toolId, filters.toolId));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  query = query.orderBy(desc(sessions.startedAt));
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  return query.all();
}

export function findById(id: string) {
  return getDb().select().from(sessions).where(eq(sessions.id, id)).get();
}

export function findByProjectId(projectId: string) {
  return getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, projectId))
    .orderBy(desc(sessions.startedAt))
    .all();
}

export function insert(session: typeof sessions.$inferInsert) {
  return getDb().insert(sessions).values(session).run();
}

export function existsByExternalId(
  externalId: string,
  toolId: string,
): boolean {
  const row = getDb()
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.externalId, externalId),
        eq(sessions.toolId, toolId),
      ),
    )
    .get();
  return row !== undefined;
}
