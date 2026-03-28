export interface EfficiencyParams {
  totalTokens: number;            // input + output (excluding cache)
  cacheReadTokens: number;
  cacheCreationTokens: number;
  difficultyScore: number;        // 0-100
  modelIntelligenceScore: number; // 0-100
  toolCallCount: number;
  userMessageCount: number;
}

export interface EfficiencyResult {
  score: number;           // 0-100
  cacheHitRate: number;    // 0-1
  tokensPerPrompt: number;
  toolEfficiency: number;  // tool calls per user message
}

/**
 * Efficiency = how well tokens were used relative to task difficulty and model capability.
 *
 * High efficiency: hard problem solved with few tokens using a smart model
 * Low efficiency:  easy problem that wasted many tokens
 *
 * Formula: (difficulty * modelIntel) / log2(effectiveTokens) * SCALE
 * - effectiveTokens adjusts for cache efficiency (cache reads are cheap)
 * - Higher cache hit rate = lower effective tokens = higher efficiency
 */
const SCALE_FACTOR = 4.5;

export function calculateEfficiency(params: EfficiencyParams): EfficiencyResult {
  const {
    totalTokens,
    cacheReadTokens,
    cacheCreationTokens,
    difficultyScore,
    modelIntelligenceScore,
    toolCallCount,
    userMessageCount,
  } = params;

  // Effective tokens: full weight for input/output, reduced for cache
  // Cache reads cost 10% of input, cache creation costs 125%
  const effectiveTokens = totalTokens +
    cacheReadTokens * 0.1 +
    cacheCreationTokens * 1.25;

  // Cache hit rate
  const totalAllTokens = totalTokens + cacheReadTokens + cacheCreationTokens;
  const cacheHitRate = totalAllTokens > 0
    ? cacheReadTokens / totalAllTokens
    : 0;

  // Tokens per user prompt
  const tokensPerPrompt = userMessageCount > 0
    ? totalTokens / userMessageCount
    : totalTokens;

  // Tool efficiency
  const toolEfficiency = userMessageCount > 0
    ? toolCallCount / userMessageCount
    : 0;

  // Core efficiency score
  // difficulty and modelIntel are 0-100; normalize to 0-1 for multiplication
  const diffNorm = difficultyScore / 100;
  const modelNorm = modelIntelligenceScore / 100;

  const logTokens = Math.log2(Math.max(effectiveTokens, 1) + 1);
  const rawScore = ((diffNorm * 0.6 + modelNorm * 0.4) * 100 / logTokens) * SCALE_FACTOR;

  // Bonus for high cache hit rate (efficient context reuse)
  const cacheBonus = cacheHitRate * 10;

  const score = Math.max(0, Math.min(100, rawScore + cacheBonus));

  return {
    score,
    cacheHitRate,
    tokensPerPrompt,
    toolEfficiency,
  };
}
