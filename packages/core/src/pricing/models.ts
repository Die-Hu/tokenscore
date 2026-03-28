export interface ModelPricing {
  input: number;           // USD per 1M tokens
  output: number;          // USD per 1M tokens
  cacheRead: number;       // USD per 1M tokens (cache hit)
  cacheCreation: number;   // USD per 1M tokens (5min cache write)
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude 4.6
  "claude-opus-4-6":   { input: 5,    output: 25,   cacheRead: 0.50, cacheCreation: 6.25 },
  "claude-sonnet-4-6": { input: 3,    output: 15,   cacheRead: 0.30, cacheCreation: 3.75 },
  // Claude 4.5
  "claude-opus-4-5":   { input: 5,    output: 25,   cacheRead: 0.50, cacheCreation: 6.25 },
  "claude-sonnet-4-5": { input: 3,    output: 15,   cacheRead: 0.30, cacheCreation: 3.75 },
  // Claude 4.1 / 4
  "claude-opus-4-1":   { input: 15,   output: 75,   cacheRead: 1.50, cacheCreation: 18.75 },
  "claude-opus-4":     { input: 15,   output: 75,   cacheRead: 1.50, cacheCreation: 18.75 },
  "claude-sonnet-4":   { input: 3,    output: 15,   cacheRead: 0.30, cacheCreation: 3.75 },
  // Claude 3.x
  "claude-haiku-4-5":  { input: 1,    output: 5,    cacheRead: 0.10, cacheCreation: 1.25 },
  "claude-haiku-3-5":  { input: 0.8,  output: 4,    cacheRead: 0.08, cacheCreation: 1.00 },
  "claude-haiku-3":    { input: 0.25, output: 1.25, cacheRead: 0.03, cacheCreation: 0.30 },
  // OpenAI
  "gpt-4o":            { input: 2.5,  output: 10,   cacheRead: 1.25, cacheCreation: 2.5 },
  "gpt-4.1":           { input: 2,    output: 8,    cacheRead: 0.50, cacheCreation: 2 },
  "gpt-5.1":           { input: 2,    output: 8,    cacheRead: 0.50, cacheCreation: 2 },
  "o3":                { input: 10,   output: 40,   cacheRead: 2.50, cacheCreation: 10 },
  "o4-mini":           { input: 1.1,  output: 4.4,  cacheRead: 0.275, cacheCreation: 1.1 },
  "codex-mini":        { input: 1.5,  output: 6,    cacheRead: 0.375, cacheCreation: 1.5 },
};

export function getModelPricing(modelId: string): ModelPricing | undefined {
  // Try exact match first, then prefix match
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];

  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(key)) return pricing;
  }
  return undefined;
}

export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheCreationTokens = 0,
): number {
  const pricing = getModelPricing(modelId);
  if (!pricing) return 0;

  const perM = 1_000_000;
  const inputCost = (inputTokens / perM) * pricing.input;
  const outputCost = (outputTokens / perM) * pricing.output;
  const cacheReadCost = (cacheReadTokens / perM) * pricing.cacheRead;
  const cacheCreationCost = (cacheCreationTokens / perM) * pricing.cacheCreation;

  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}
