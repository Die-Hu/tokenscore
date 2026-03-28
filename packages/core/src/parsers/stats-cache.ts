import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { StatsCache } from "../types/index.js";

const DEFAULT_PATH = join(homedir(), ".claude", "stats-cache.json");

export async function readStatsCache(
  path = DEFAULT_PATH,
): Promise<StatsCache | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as StatsCache;
  } catch {
    return null;
  }
}
