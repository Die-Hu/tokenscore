/**
 * Lightweight model pricing and ranking data for the statusline plugin.
 * Zero dependencies — no better-sqlite3, no drizzle, no fs.
 * This is a standalone copy to avoid pulling in @tokenscore/core's native deps.
 */

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6":   { input: 5,    output: 25,   cacheRead: 0.50, cacheCreation: 6.25 },
  "claude-sonnet-4-6": { input: 3,    output: 15,   cacheRead: 0.30, cacheCreation: 3.75 },
  "claude-opus-4-5":   { input: 5,    output: 25,   cacheRead: 0.50, cacheCreation: 6.25 },
  "claude-sonnet-4-5": { input: 3,    output: 15,   cacheRead: 0.30, cacheCreation: 3.75 },
  "claude-opus-4-1":   { input: 15,   output: 75,   cacheRead: 1.50, cacheCreation: 18.75 },
  "claude-opus-4":     { input: 15,   output: 75,   cacheRead: 1.50, cacheCreation: 18.75 },
  "claude-sonnet-4":   { input: 3,    output: 15,   cacheRead: 0.30, cacheCreation: 3.75 },
  "claude-haiku-4-5":  { input: 1,    output: 5,    cacheRead: 0.10, cacheCreation: 1.25 },
  "claude-haiku-3-5":  { input: 0.8,  output: 4,    cacheRead: 0.08, cacheCreation: 1.00 },
  "claude-haiku-3":    { input: 0.25, output: 1.25, cacheRead: 0.03, cacheCreation: 0.30 },
  "gpt-4o":            { input: 2.5,  output: 10,   cacheRead: 1.25, cacheCreation: 2.5 },
  "gpt-4.1":           { input: 2,    output: 8,    cacheRead: 0.50, cacheCreation: 2 },
  "gpt-5.1":           { input: 2,    output: 8,    cacheRead: 0.50, cacheCreation: 2 },
  "o3":                { input: 10,   output: 40,   cacheRead: 2.50, cacheCreation: 10 },
  "o4-mini":           { input: 1.1,  output: 4.4,  cacheRead: 0.275, cacheCreation: 1.1 },
  "codex-mini":        { input: 1.5,  output: 6,    cacheRead: 0.375, cacheCreation: 1.5 },
};

export function getModelPricing(modelId: string): ModelPricing | undefined {
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(key)) return pricing;
  }
  return undefined;
}

export type ModelTier = "S" | "A" | "B" | "C" | "D";

const MODEL_TIERS: Record<string, { tier: ModelTier; iq: number }> = {
  "claude-opus-4-6":   { tier: "S", iq: 95 },
  "claude-opus-4-5":   { tier: "S", iq: 93 },
  "claude-opus-4-1":   { tier: "S", iq: 90 },
  "claude-opus-4":     { tier: "S", iq: 88 },
  "o3":                { tier: "S", iq: 92 },
  "claude-sonnet-4-6": { tier: "A", iq: 82 },
  "claude-sonnet-4-5": { tier: "A", iq: 80 },
  "claude-sonnet-4":   { tier: "A", iq: 78 },
  "gpt-4o":            { tier: "A", iq: 78 },
  "gpt-4.1":           { tier: "A", iq: 80 },
  "gpt-5.1":           { tier: "A", iq: 80 },
  "o4-mini":           { tier: "B", iq: 70 },
  "claude-haiku-4-5":  { tier: "B", iq: 65 },
  "codex-mini":        { tier: "B", iq: 68 },
  "claude-haiku-3-5":  { tier: "C", iq: 55 },
  "claude-haiku-3":    { tier: "C", iq: 45 },
};

function matchModel(modelId: string): { tier: ModelTier; iq: number } | undefined {
  if (MODEL_TIERS[modelId]) return MODEL_TIERS[modelId];
  for (const [key, data] of Object.entries(MODEL_TIERS)) {
    if (modelId.startsWith(key)) return data;
  }
  return undefined;
}

export function getModelTier(modelId: string): ModelTier {
  return matchModel(modelId)?.tier ?? "B";
}

export function getModelIntelligenceScore(modelId: string): number {
  return matchModel(modelId)?.iq ?? 60;
}
