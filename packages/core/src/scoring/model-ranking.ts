import type { ModelTier, ModelRanking } from "../types/index.js";

/**
 * Model intelligence rankings based on benchmarks (SWE-bench, Arena ELO, HumanEval).
 * Score 0-100 represents relative capability for coding tasks.
 */
const MODEL_RANKINGS: ModelRanking[] = [
  // S tier — frontier models
  { modelId: "claude-opus-4-6",   tier: "S", intelligenceScore: 95, costPerMToken: 25 },
  { modelId: "claude-opus-4-5",   tier: "S", intelligenceScore: 93, costPerMToken: 25 },
  { modelId: "claude-opus-4-1",   tier: "S", intelligenceScore: 90, costPerMToken: 75 },
  { modelId: "claude-opus-4",     tier: "S", intelligenceScore: 88, costPerMToken: 75 },
  { modelId: "o3",                tier: "S", intelligenceScore: 92, costPerMToken: 40 },

  // A tier — strong general purpose
  { modelId: "claude-sonnet-4-6", tier: "A", intelligenceScore: 82, costPerMToken: 15 },
  { modelId: "claude-sonnet-4-5", tier: "A", intelligenceScore: 80, costPerMToken: 15 },
  { modelId: "claude-sonnet-4",   tier: "A", intelligenceScore: 78, costPerMToken: 15 },
  { modelId: "gpt-4o",            tier: "A", intelligenceScore: 78, costPerMToken: 10 },
  { modelId: "gpt-4.1",           tier: "A", intelligenceScore: 80, costPerMToken: 8 },
  { modelId: "gpt-5.1",           tier: "A", intelligenceScore: 80, costPerMToken: 8 },

  // B tier — efficient models
  { modelId: "o4-mini",           tier: "B", intelligenceScore: 70, costPerMToken: 4.4 },
  { modelId: "claude-haiku-4-5",  tier: "B", intelligenceScore: 65, costPerMToken: 5 },
  { modelId: "codex-mini",        tier: "B", intelligenceScore: 68, costPerMToken: 6 },

  // C tier — lightweight
  { modelId: "claude-haiku-3-5",  tier: "C", intelligenceScore: 55, costPerMToken: 4 },
  { modelId: "claude-haiku-3",    tier: "C", intelligenceScore: 45, costPerMToken: 1.25 },
];

export function getModelRanking(modelId: string): ModelRanking | undefined {
  // Exact match
  const exact = MODEL_RANKINGS.find((r) => r.modelId === modelId);
  if (exact) return exact;

  // Prefix match
  for (const ranking of MODEL_RANKINGS) {
    if (modelId.startsWith(ranking.modelId)) return ranking;
  }
  return undefined;
}

export function getModelIntelligenceScore(modelId: string): number {
  const ranking = getModelRanking(modelId);
  return ranking?.intelligenceScore ?? 60; // default to B-tier if unknown
}

export function getModelTier(modelId: string): ModelTier {
  const ranking = getModelRanking(modelId);
  return ranking?.tier ?? "B";
}

export function getAllModelRankings(): ModelRanking[] {
  return [...MODEL_RANKINGS];
}
