import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ── Projects ─────────────────────────────────────────────────────
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull().unique(),
    description: text("description"),
    firstActivity: integer("first_activity"),
    lastActivity: integer("last_activity"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_projects_path").on(table.path),
  ],
);

// ── Sessions ─────────────────────────────────────────────────────
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id").notNull(),
    toolId: text("tool_id").notNull(),
    modelId: text("model_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    duration: integer("duration"),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    cacheReadTokens: integer("cache_read_tokens").default(0),
    cacheCreationTokens: integer("cache_creation_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    messageCount: integer("message_count").default(0),
    userMessageCount: integer("user_message_count").default(0),
    assistantMessageCount: integer("assistant_message_count").default(0),
    toolCallCount: integer("tool_call_count").default(0),
    userPrompts: text("user_prompts"),
    workingDirectory: text("working_directory"),
    filesModified: text("files_modified"),
    estimatedCostUsd: real("estimated_cost_usd").default(0),
    modelTokens: text("model_tokens"),          // JSON: { "claude-opus-4-6": 12345, ... }
    modelCosts: text("model_costs"),             // JSON: { "claude-opus-4-6": 1.23, ... }
    subagentCount: integer("subagent_count").default(0),
    sourceFile: text("source_file"),
    importedAt: integer("imported_at").notNull(),
  },
  (table) => [
    index("idx_sessions_project_id").on(table.projectId),
    index("idx_sessions_tool_id").on(table.toolId),
    index("idx_sessions_started_at").on(table.startedAt),
    uniqueIndex("idx_sessions_external_tool").on(
      table.externalId,
      table.toolId,
    ),
  ],
);

// ── Project Scores ───────────────────────────────────────────────
export const projectScores = sqliteTable("project_scores", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  calculatedAt: integer("calculated_at"),
  efficiencyScore: real("efficiency_score"),
  difficultyScore: real("difficulty_score"),
  modelScore: real("model_score"),
  compositeScore: real("composite_score"),
  grade: text("grade"),
  efficiencyDetails: text("efficiency_details"),
  difficultyDetails: text("difficulty_details"),
  modelDetails: text("model_details"),
  summary: text("summary"),
});

// ── Scan Log ─────────────────────────────────────────────────────
export const scanLog = sqliteTable("scan_log", {
  id: text("id").primaryKey(),
  toolId: text("tool_id").notNull(),
  scannedAt: integer("scanned_at").notNull(),
  sessionsImported: integer("sessions_imported").default(0),
  tokensImported: integer("tokens_imported").default(0),
  lastSessionDate: integer("last_session_date"),
});
