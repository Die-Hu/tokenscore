import { getSqlite } from "./connection.js";

const INITIAL_MIGRATION = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  description TEXT,
  first_activity INTEGER,
  last_activity INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  user_message_count INTEGER DEFAULT 0,
  assistant_message_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  user_prompts TEXT,
  working_directory TEXT,
  files_modified TEXT,
  estimated_cost_usd REAL DEFAULT 0,
  source_file TEXT,
  imported_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tool_id ON sessions(tool_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_external_tool ON sessions(external_id, tool_id);

CREATE TABLE IF NOT EXISTS project_scores (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  calculated_at INTEGER,
  efficiency_score REAL,
  difficulty_score REAL,
  model_score REAL,
  composite_score REAL,
  grade TEXT,
  efficiency_details TEXT,
  difficulty_details TEXT,
  model_details TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS scan_log (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL,
  scanned_at INTEGER NOT NULL,
  sessions_imported INTEGER DEFAULT 0,
  tokens_imported INTEGER DEFAULT 0,
  last_session_date INTEGER
);
`;

export function runMigrations(): void {
  const sqlite = getSqlite();
  sqlite.exec(INITIAL_MIGRATION);
}
