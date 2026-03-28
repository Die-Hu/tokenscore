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
 * Redesigned formula with better discrimination:
 * - Uses log10 instead of log2 for wider spread
 * - Separate difficulty and model contributions
 * - Cache bonus scales with actual savings
 * - Tool productivity factor (more tool calls per message = more work done)
 */
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

  // Zero-token sessions get zero efficiency
  if (totalTokens === 0 && cacheReadTokens === 0 && cacheCreationTokens === 0) {
    return { score: 0, cacheHitRate: 0, tokensPerPrompt: 0, toolEfficiency: 0 };
  }

  // Effective tokens: weighted by cost impact
  const effectiveTokens = totalTokens +
    cacheReadTokens * 0.1 +
    cacheCreationTokens * 1.25;

  // Cache hit rate
  const totalAllTokens = totalTokens + cacheReadTokens + cacheCreationTokens;
  const cacheHitRate = totalAllTokens > 0 ? cacheReadTokens / totalAllTokens : 0;

  // Tokens per user prompt
  const tokensPerPrompt = userMessageCount > 0
    ? totalTokens / userMessageCount
    : totalTokens;

  // Tool efficiency
  const toolEfficiency = userMessageCount > 0
    ? toolCallCount / userMessageCount
    : 0;

  // === Core scoring ===

  // 1. Token efficiency base: penalize high token use, reward low token use
  //    log10 gives better spread: 1K->3, 10K->4, 100K->5, 1M->6
  const logTok = Math.log10(effectiveTokens + 1);
  // Normalize to 0-100: fewer tokens = higher score
  // At 100 tokens (log=2) -> ~83, at 10K (log=4) -> ~50, at 1M (log=6) -> ~16
  const tokenScore = Math.max(0, 100 - (logTok * 16.7));

  // 2. Difficulty bonus: harder tasks deserve more credit
  const diffBonus = (difficultyScore / 100) * 25;

  // 3. Model cost-efficiency: using cheaper model for the job = more efficient
  //    Higher intelligence means more expensive, so slightly penalize
  const modelPenalty = (modelIntelligenceScore / 100) * 5;

  // 4. Cache efficiency bonus
  const cacheBonus = cacheHitRate * 15;

  // 5. Tool productivity: more tool calls per message = more automation
  const toolBonus = Math.min(10, Math.sqrt(toolEfficiency) * 5);

  const score = Math.max(0, Math.min(100,
    tokenScore + diffBonus + cacheBonus + toolBonus - modelPenalty
  ));

  return {
    score,
    cacheHitRate,
    tokensPerPrompt,
    toolEfficiency,
  };
}
