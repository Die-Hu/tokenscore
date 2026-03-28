import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".tokenscore");
const DEFAULT_DB_FILE = "tokenscore.db";

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _sqlite: Database.Database | null = null;

export function getDb(
  dbPath?: string,
): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  const resolvedPath =
    dbPath ?? path.join(DEFAULT_DATA_DIR, DEFAULT_DB_FILE);

  // Ensure parent directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _sqlite = new Database(resolvedPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");

  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

export function getSqlite(): Database.Database {
  if (!_sqlite) {
    throw new Error("Database not initialized. Call getDb() first.");
  }
  return _sqlite;
}
