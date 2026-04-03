/**
 * The Iron Law — Objective, timeless AI usage scoring.
 *
 * Three dimensionless ratios, geometrically combined.
 * No arbitrary weights. No external data. No decay over time.
 *
 * R1: Output Leverage    = outputTokens / inputTokens
 * R2: Cache Discipline   = cacheRead / totalInputSide
 * R3: Interaction Density = toolCalls / userMessages
 *
 * Each normalized to [0,1] via sigmoid, then geometric mean × 100.
 * A weakness in ANY dimension drags the whole score down (no hiding).
 */

export interface IronLawParams {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  toolCallCount: number;
  userMessageCount: number;
}

export interface IronLawResult {
  score: number;   // 0-100
  ratios: {
    outputLeverage: number;
    cacheDiscipline: number;
    interactionDensity: number;
  };
  normalized: { n1: number; n2: number; n3: number };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function calculateIronLaw(params: IronLawParams): IronLawResult {
  const {
    inputTokens, outputTokens,
    cacheReadInputTokens, cacheCreationInputTokens,
    toolCallCount, userMessageCount,
  } = params;

  // R1: Output Leverage — more output per unit of fresh input = better
  const r1 = outputTokens / (inputTokens + 1);

  // R2: Cache Discipline — higher cache reuse = smarter context management
  const totalInputSide = cacheReadInputTokens + inputTokens + cacheCreationInputTokens;
  const r2 = totalInputSide > 0
    ? cacheReadInputTokens / (totalInputSide + 1)
    : 0;

  // R3: Interaction Density — more tool calls per user message = more autonomous work
  const r3 = toolCallCount / (userMessageCount + 1);

  // Normalize to [0,1] via sigmoid
  const n1 = sigmoid(2.0 * (r1 - 1.0));     // centers at R1=1.0 (equal in/out)
  const n2 = sigmoid(6.0 * (r2 - 0.4));     // centers at 40% cache hit
  const n3 = sigmoid(1.5 * (Math.log(r3 + 1) - 1.5)); // centers at ~3.5 tools/msg

  // Geometric mean — no weights, weakness in any dimension is penalized
  const geoMean = Math.pow(Math.max(n1, 0.001) * Math.max(n2, 0.001) * Math.max(n3, 0.001), 1 / 3);
  const score = Math.max(0, Math.min(100, geoMean * 100));

  return {
    score,
    ratios: { outputLeverage: r1, cacheDiscipline: r2, interactionDensity: r3 },
    normalized: { n1, n2, n3 },
  };
}

// ── Tier mapping (from Iron Law score) ────────────────────────────
export type IronTier = "ARCHITECT" | "VIRTUOSO" | "PIONEER" | "ARTISAN" | "BUILDER" | "APPRENTICE" | "SPARK";

const TIERS: Array<{ min: number; name: IronTier; grade: string }> = [
  { min: 80, name: "ARCHITECT",  grade: "S+" },
  { min: 70, name: "VIRTUOSO",   grade: "S" },
  { min: 60, name: "PIONEER",    grade: "A" },
  { min: 50, name: "ARTISAN",    grade: "B" },
  { min: 40, name: "BUILDER",    grade: "C" },
  { min: 30, name: "APPRENTICE", grade: "D" },
  { min: 0,  name: "SPARK",      grade: "F" },
];

export function getIronTier(score: number): { name: IronTier; grade: string } {
  for (const t of TIERS) {
    if (score >= t.min) return { name: t.name, grade: t.grade };
  }
  return TIERS[TIERS.length - 1];
}
