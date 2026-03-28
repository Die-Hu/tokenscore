import type { DifficultyTier, RawSession } from "../types/index.js";

/**
 * Estimates session difficulty from observable session metrics.
 * Returns a score 0-100.
 *
 * Dimensions:
 * 1. Conversation length (more back-and-forth = harder)
 * 2. Tool diversity (more different tools = more complex)
 * 3. Tool call density (tool calls per user message)
 * 4. Session duration (longer = harder)
 * 5. Token volume relative to message count
 * 6. Subagent usage (indicates multi-step complexity)
 */
export interface DifficultyBreakdown {
  score: number;
  tier: DifficultyTier;
  factors: {
    conversationDepth: number;   // 0-100
    toolDiversity: number;       // 0-100
    toolDensity: number;         // 0-100
    duration: number;            // 0-100
    tokenIntensity: number;      // 0-100
    subagentComplexity: number;  // 0-100
  };
}

const WEIGHTS = {
  conversationDepth: 0.20,
  toolDiversity: 0.15,
  toolDensity: 0.20,
  duration: 0.15,
  tokenIntensity: 0.15,
  subagentComplexity: 0.15,
};

export function estimateDifficulty(session: RawSession): DifficultyBreakdown {
  const factors = {
    conversationDepth: scoreConversationDepth(session.userMessageCount),
    toolDiversity: scoreToolDiversity(Object.keys(session.toolCalls).length),
    toolDensity: scoreToolDensity(session.toolCallCount, session.userMessageCount),
    duration: scoreDuration(session.durationMs),
    tokenIntensity: scoreTokenIntensity(
      session.tokenUsage.inputTokens + session.tokenUsage.outputTokens,
      session.messageCount,
    ),
    subagentComplexity: scoreSubagentComplexity(session.subagentCount),
  };

  const score =
    factors.conversationDepth * WEIGHTS.conversationDepth +
    factors.toolDiversity * WEIGHTS.toolDiversity +
    factors.toolDensity * WEIGHTS.toolDensity +
    factors.duration * WEIGHTS.duration +
    factors.tokenIntensity * WEIGHTS.tokenIntensity +
    factors.subagentComplexity * WEIGHTS.subagentComplexity;

  const clampedScore = Math.max(0, Math.min(100, score));

  return {
    score: clampedScore,
    tier: scoreToDifficultyTier(clampedScore),
    factors,
  };
}

// ── Factor scoring functions ─────────────────────────────────────

/** More user messages = deeper conversation = harder problem */
function scoreConversationDepth(userMessages: number): number {
  // 1 message = trivial (10), 5 = easy (30), 15 = medium (50), 30+ = hard (80+)
  return Math.min(100, Math.log2(userMessages + 1) * 18);
}

/** More diverse tool usage = more complex task */
function scoreToolDiversity(uniqueTools: number): number {
  // 0 tools = 0, 1-2 = simple, 3-4 = moderate, 5+ = complex
  if (uniqueTools === 0) return 5;
  return Math.min(100, uniqueTools * 16);
}

/** More tool calls per user message = more automated work */
function scoreToolDensity(toolCalls: number, userMessages: number): number {
  if (userMessages === 0) return 0;
  const density = toolCalls / userMessages;
  // density < 1 = simple Q&A, 2-5 = moderate, 10+ = heavy automation
  return Math.min(100, Math.sqrt(density) * 30);
}

/** Longer sessions typically mean harder problems */
function scoreDuration(durationMs: number): number {
  const minutes = durationMs / 60_000;
  // < 1 min = trivial, 5 min = easy, 30 min = medium, 2hr+ = expert
  if (minutes < 1) return 5;
  return Math.min(100, Math.log2(minutes + 1) * 15);
}

/** More tokens per message = more complex reasoning */
function scoreTokenIntensity(totalTokens: number, messageCount: number): number {
  if (messageCount === 0) return 0;
  const tokensPerMessage = totalTokens / messageCount;
  // < 500 = simple, 1000 = moderate, 5000+ = complex
  return Math.min(100, Math.log2(tokensPerMessage + 1) * 8);
}

/** Subagent usage indicates multi-step, decomposed problems */
function scoreSubagentComplexity(subagentCount: number): number {
  if (subagentCount === 0) return 0;
  // 1 subagent = 30, 3 = 60, 5+ = 80+
  return Math.min(100, subagentCount * 20);
}

function scoreToDifficultyTier(score: number): DifficultyTier {
  if (score >= 80) return "expert";
  if (score >= 60) return "hard";
  if (score >= 40) return "medium";
  if (score >= 20) return "easy";
  return "trivial";
}
