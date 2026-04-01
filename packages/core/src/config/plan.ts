import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

export type UserPlan = "free" | "pro" | "max_5x" | "max_20x" | "team" | "enterprise" | "api";

export interface PlanInfo {
  plan: UserPlan;
  label: string;
  monthlyPrice: number | null;  // null for API (pay-per-token) and enterprise
  isSubscription: boolean;
}

const PLAN_MAP: Record<UserPlan, PlanInfo> = {
  free:       { plan: "free",       label: "Free",       monthlyPrice: 0,    isSubscription: true },
  pro:        { plan: "pro",        label: "Pro",        monthlyPrice: 20,   isSubscription: true },
  max_5x:     { plan: "max_5x",     label: "Max 5x",    monthlyPrice: 100,  isSubscription: true },
  max_20x:    { plan: "max_20x",    label: "Max 20x",   monthlyPrice: 200,  isSubscription: true },
  team:       { plan: "team",       label: "Team",       monthlyPrice: 30,   isSubscription: true },
  enterprise: { plan: "enterprise", label: "Enterprise", monthlyPrice: null, isSubscription: true },
  api:        { plan: "api",        label: "API",        monthlyPrice: null, isSubscription: false },
};

/**
 * Detect user's Claude plan from local credentials.
 * Priority: credentials file -> keychain -> env var -> fallback
 */
export function detectPlan(): PlanInfo {
  // 1. Check credentials file
  const credPath = join(homedir(), ".claude", ".credentials.json");
  if (existsSync(credPath)) {
    try {
      const creds = JSON.parse(readFileSync(credPath, "utf-8"));
      const sub = creds?.claudeAiOauth?.subscriptionType as string | undefined;
      const tier = creds?.claudeAiOauth?.rateLimitTier as string | undefined;
      if (sub || tier) return resolvePlan(sub, tier);
    } catch {}
  }

  // 2. macOS: check Keychain
  if (process.platform === "darwin") {
    try {
      const out = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
        { timeout: 2000, encoding: "utf-8" },
      );
      const creds = JSON.parse(out);
      const sub = creds?.claudeAiOauth?.subscriptionType as string | undefined;
      const tier = creds?.claudeAiOauth?.rateLimitTier as string | undefined;
      if (sub || tier) return resolvePlan(sub, tier);
    } catch {}
  }

  // 3. Check for API key (indicates API billing)
  if (process.env.ANTHROPIC_API_KEY) {
    return PLAN_MAP.api;
  }

  // Default: pro (most common for Claude Code users)
  return PLAN_MAP.pro;
}

function resolvePlan(sub?: string, tier?: string): PlanInfo {
  const s = (sub ?? "").toLowerCase();
  const t = (tier ?? "").toLowerCase();

  if (t.includes("max_20x") || t.includes("20x")) return PLAN_MAP.max_20x;
  if (t.includes("max_5x") || t.includes("5x") || s.includes("max")) return PLAN_MAP.max_5x;
  if (s.includes("team")) return PLAN_MAP.team;
  if (s.includes("enterprise")) return PLAN_MAP.enterprise;
  if (s.includes("pro")) return PLAN_MAP.pro;
  if (s.includes("free") || s === "") return PLAN_MAP.pro; // Claude Code requires at least Pro
  if (s.includes("api")) return PLAN_MAP.api;

  return PLAN_MAP.pro;
}

export function getPlanInfo(plan: UserPlan): PlanInfo {
  return PLAN_MAP[plan];
}
