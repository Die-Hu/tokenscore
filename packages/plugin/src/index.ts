/**
 * TokenScore — Claude Code Statusline Plugin
 *
 * Invoked by Claude Code every ~300ms via stdin/stdout protocol.
 * Zero native dependencies — does not import better-sqlite3.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getModelPricing, getModelTier, getModelIntelligenceScore } from "./models.js";

// ── ANSI color helpers (zero-dependency) ─────────────────────────
const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const c = {
  red: (s: string) => `${ESC}31m${s}${RESET}`,
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  yellow: (s: string) => `${ESC}33m${s}${RESET}`,
  blue: (s: string) => `${ESC}34m${s}${RESET}`,
  magenta: (s: string) => `${ESC}35m${s}${RESET}`,
  cyan: (s: string) => `${ESC}36m${s}${RESET}`,
  gray: (s: string) => `${ESC}90m${s}${RESET}`,
  bold: (s: string) => `${BOLD}${s}${RESET}`,
  dim: (s: string) => `${DIM}${s}${RESET}`,
  bGreen: (s: string) => `${ESC}92m${s}${RESET}`,
  bYellow: (s: string) => `${ESC}93m${s}${RESET}`,
  bRed: (s: string) => `${ESC}91m${s}${RESET}`,
  bMagenta: (s: string) => `${ESC}95m${s}${RESET}`,
};

// ── Types ────────────────────────────────────────────────────────
interface StdinData {
  transcript_path?: string;
  cwd?: string;
  model?: { id?: string; display_name?: string };
  context_window?: {
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
    used_percentage?: number | null;
  };
  cost?: { total_cost_usd?: number } | null;
  rate_limits?: {
    five_hour?: { used_percentage?: number | null; resets_at?: number | null } | null;
    seven_day?: { used_percentage?: number | null; resets_at?: number | null } | null;
  } | null;
}

interface PluginConfig {
  showCost: boolean;
  showModel: boolean;
  showRateLimit: boolean;
  showTokenBreakdown: boolean;
  showScore: boolean;
  costWarningThreshold: number;
}

// ── Config ───────────────────────────────────────────────────────
const DEFAULT_CONFIG: PluginConfig = {
  showCost: true,
  showModel: true,
  showRateLimit: true,
  showTokenBreakdown: true,
  showScore: true,
  costWarningThreshold: 5.0,
};

function loadConfig(): PluginConfig {
  try {
    const p = join(homedir(), ".claude", "plugins", "tokenscore", "config.json");
    if (existsSync(p)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(p, "utf-8")) };
  } catch {}
  return DEFAULT_CONFIG;
}

// ── Formatters ───────────────────────────────────────────────────
function fmtTok(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

// ── Progress bar ─────────────────────────────────────────────────
function bar(pct: number, w = 12): string {
  const filled = Math.round((pct / 100) * w);
  const empty = w - filled;
  const b = "█".repeat(filled) + "░".repeat(empty);
  if (pct >= 90) return c.bRed(b);
  if (pct >= 70) return c.bYellow(b);
  return c.bGreen(b);
}

// ── Cost cache (ESM-safe file I/O) ──────────────────────────────
interface CostCache {
  sessionCost: number;
  sessionId: string;
}

function loadCostCache(sid: string): CostCache {
  try {
    const p = join(homedir(), ".tokenscore", ".cost-cache.json");
    if (existsSync(p)) {
      const d = JSON.parse(readFileSync(p, "utf-8"));
      if (d.sessionId === sid) return d;
    }
  } catch {}
  return { sessionCost: 0, sessionId: sid };
}

function saveCostCache(cache: CostCache): void {
  try {
    const dir = join(homedir(), ".tokenscore");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".cost-cache.json"), JSON.stringify(cache));
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  if (process.stdin.isTTY) return;

  // Stdin timeout: bail if no data within 200ms
  const timeout = setTimeout(() => process.exit(0), 200);

  const chunks: string[] = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string);
  }
  clearTimeout(timeout);

  const raw = chunks.join("");
  if (!raw.trim()) return;

  let stdin: StdinData;
  try {
    stdin = JSON.parse(raw);
  } catch {
    return;
  }

  const config = loadConfig();
  const lines: string[] = [];

  // ── Model + Context ──────────────────────────────────────────
  const modelId = stdin.model?.id ?? "unknown";
  const modelName = stdin.model?.display_name ?? extractModelFamily(modelId);
  const usedPct = Math.round(stdin.context_window?.used_percentage ?? 0);
  const usage = stdin.context_window?.current_usage;

  const inTok = usage?.input_tokens ?? 0;
  const outTok = usage?.output_tokens ?? 0;
  const cacheRd = usage?.cache_read_input_tokens ?? 0;
  const cacheCr = usage?.cache_creation_input_tokens ?? 0;
  const totalTok = inTok + outTok + cacheRd + cacheCr;

  // Model tier badge
  const tier = getModelTier(modelId);
  const badge = tier === "S" ? c.bMagenta(`[${tier}]`)
    : tier === "A" ? c.bGreen(`[${tier}]`)
    : tier === "B" ? c.blue(`[${tier}]`)
    : c.gray(`[${tier}]`);

  let line1 = `${badge} ${c.bold(modelName)} ${bar(usedPct)} ${usedPct}%`;

  if (config.showTokenBreakdown && usedPct > 50) {
    line1 += c.dim(` (in:${fmtTok(inTok)} out:${fmtTok(outTok)} cache:${fmtTok(cacheRd)})`);
  }
  lines.push(line1);

  // ── Cost ─────────────────────────────────────────────────────
  if (config.showCost) {
    // Prefer Claude Code's native cost if available
    let costNow = stdin.cost?.total_cost_usd ?? 0;

    // Fallback: calculate from token usage
    if (costNow === 0 && totalTok > 0) {
      const pricing = getModelPricing(modelId);
      if (pricing) {
        costNow =
          (inTok / 1e6) * pricing.input +
          (outTok / 1e6) * pricing.output +
          (cacheRd / 1e6) * pricing.cacheRead +
          (cacheCr / 1e6) * pricing.cacheCreation;
      }
    }

    if (costNow > 0 || totalTok > 0) {
      // Persist cost
      const sid = stdin.transcript_path ?? "";
      const cc = loadCostCache(sid);
      if (costNow > cc.sessionCost) {
        cc.sessionCost = costNow;
        saveCostCache(cc);
      }

      const costFn = costNow >= config.costWarningThreshold ? c.bRed
        : costNow >= config.costWarningThreshold * 0.5 ? c.bYellow
        : c.green;

      let costLine = `  $ ${costFn(fmtCost(costNow))}`;

      // Cache efficiency
      if (totalTok > 0) {
        costLine += c.dim(` | cache ${Math.round((cacheRd / totalTok) * 100)}%`);
      }

      if (config.showScore) {
        costLine += c.dim(` | IQ ${getModelIntelligenceScore(modelId)}`);
      }

      lines.push(costLine);
    }
  }

  // ── Rate Limits ──────────────────────────────────────────────
  if (config.showRateLimit && stdin.rate_limits) {
    const fh = stdin.rate_limits.five_hour;
    if (fh && typeof fh.used_percentage === "number") {
      const p = Math.round(fh.used_percentage);
      let rl = `  5h ${bar(p, 8)} ${p}%`;
      if (fh.resets_at) {
        const left = fh.resets_at - Math.floor(Date.now() / 1000);
        if (left > 0) rl += c.dim(` ~${fmtDuration(left)}`);
      }

      const sd = stdin.rate_limits.seven_day;
      if (sd && typeof sd.used_percentage === "number" && sd.used_percentage > 50) {
        rl += c.dim(` | 7d ${Math.round(sd.used_percentage)}%`);
      }

      lines.push(rl);
    }
  }

  for (const l of lines) console.log(l);
}

/** Extract model family name from ID: claude-opus-4-6 -> Opus */
function extractModelFamily(modelId: string): string {
  const parts = modelId.split("-");
  // claude-opus-4-6 -> opus, claude-sonnet-4-5 -> sonnet, gpt-4o -> 4o
  if (parts[0] === "claude" && parts.length >= 3) {
    return parts[1].charAt(0).toUpperCase() + parts[1].slice(1); // "opus" -> "Opus"
  }
  if (parts[0] === "gpt") return modelId; // gpt-4o as-is
  return modelId;
}

main().catch(() => {});
