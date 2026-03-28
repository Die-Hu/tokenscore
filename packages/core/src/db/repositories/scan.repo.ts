import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb } from "../connection.js";
import { scanLog } from "../schema.js";

export function getLastScan(toolId: string) {
  return getDb()
    .select()
    .from(scanLog)
    .where(eq(scanLog.toolId, toolId))
    .orderBy(desc(scanLog.scannedAt))
    .limit(1)
    .get();
}

export function recordScan(
  toolId: string,
  sessionsImported: number,
  tokensImported: number,
  lastSessionDate: number | null,
) {
  const entry = {
    id: uuid(),
    toolId,
    scannedAt: Date.now(),
    sessionsImported,
    tokensImported,
    lastSessionDate,
  };

  getDb().insert(scanLog).values(entry).run();
  return entry;
}
