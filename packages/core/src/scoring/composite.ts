import type { ScoringWeights, CompositeResult } from "../types/index.js";

const DEFAULT_WEIGHTS: ScoringWeights = {
  efficiency: 0.4,
  difficulty: 0.35,
  modelIntel: 0.25,
};

export function calculateComposite(
  efficiency: number,
  difficulty: number,
  modelIntel: number,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): CompositeResult {
  const composite =
    efficiency * weights.efficiency +
    difficulty * weights.difficulty +
    modelIntel * weights.modelIntel;

  return {
    efficiency,
    difficulty,
    modelIntel,
    composite: Math.max(0, Math.min(100, composite)),
    weights,
  };
}
