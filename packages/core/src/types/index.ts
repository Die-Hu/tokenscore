// ── Tool identifiers ──────────────────────────────────────────────
export type ToolType = "claude-code" | "codex-cli";

// ── Difficulty & Model tiers ──────────────────────────────────────
export type DifficultyTier = "trivial" | "easy" | "medium" | "hard" | "expert";
export type ModelTier = "S" | "A" | "B" | "C" | "D";

// ── Token usage ───────────────────────────────────────────────────
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

// ── Raw session (parser output) ───────────────────────────────────
export interface RawSession {
  toolId: ToolType;
  sessionId: string;
  projectPath: string;
  modelId: string;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  tokenUsage: TokenUsage;
  userPrompts: string[];
  messageCount: number;
  // Enhanced fields
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  toolCalls: Record<string, number>;        // e.g. { "Bash": 20, "Read": 15 }
  modelTokens: Record<string, number>;      // per-model output token breakdown
  subagentCount: number;
  claudeCodeVersion?: string;
  sessionSlug?: string;
}

// ── Stored session (with DB id & scoring) ─────────────────────────
export interface Session extends RawSession {
  id: string;
  createdAt: Date;
  difficulty?: DifficultyTier;
  modelTier?: ModelTier;
  compositeScore?: number;
}

// ── Project aggregation ───────────────────────────────────────────
export interface Project {
  path: string;
  displayName: string;
  totalSessions: number;
  totalTokens: number;
  averageScore?: number;
  lastActiveAt: Date;
}

// ── Scoring ───────────────────────────────────────────────────────
export interface ScoringWeights {
  efficiency: number;   // default 0.40
  difficulty: number;   // default 0.35
  modelIntel: number;   // default 0.25
}

export interface CompositeResult {
  efficiency: number;      // 0-100
  difficulty: number;      // 0-100
  modelIntel: number;      // 0-100
  composite: number;       // weighted 0-100
  weights: ScoringWeights;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  efficiency: 0.4,
  difficulty: 0.35,
  modelIntel: 0.25,
};

// ── Model ranking ─────────────────────────────────────────────────
export interface ModelRanking {
  modelId: string;
  tier: ModelTier;
  intelligenceScore: number;  // 0-100
  costPerMToken: number;      // effective cost
}

// ── Stats cache (from ~/.claude/stats-cache.json) ─────────────────
export interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
    toolCallCount: number;
  }>;
  dailyModelTokens: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
  }>;
  totalSessions: number;
  totalMessages: number;
  longestSession: {
    sessionId: string;
    duration: number;
    messageCount: number;
    timestamp: string;
  };
  firstSessionDate: string;
  hourCounts: Record<string, number>;
}
