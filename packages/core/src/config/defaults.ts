export const DEFAULT_CONFIG = {
  dataDir: "~/.tokenscore",
  dbFile: "tokenscore.db",
  tools: {
    "claude-code": { dataDir: "~/.claude" },
    "codex-cli": { dataDir: "~/.codex" },
  },
  scoring: {
    weights: { efficiency: 0.40, difficulty: 0.35, model: 0.25 },
  },
  scan: { autoScanInterval: 3600 },
} as const;

export type TokenScoreConfig = typeof DEFAULT_CONFIG;
