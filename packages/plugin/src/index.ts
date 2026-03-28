/**
 * TokenScore — Claude Code Statusline Plugin
 *
 * Invoked by Claude Code every ~300ms via stdin/stdout protocol.
 * Reads real-time token usage from stdin JSON and enriches it
 * with TokenScore data (scoring, cost tracking, session stats).
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getModelPricing, getModelTier, getModelIntelligenceScore } from "@tokenscore/core";

// ── ANSI color helpers (zero-dependency) ─────────────────────────
const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const colors = {
  red: (s: string) => `${ESC}31m${s}${RESET}`,
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  yellow: (s: string) => `${ESC}33m${s}${RESET}`,
  blue: (s: string) => `${ESC}34m${s}${RESET}`,
  magenta: (s: string) => `${ESC}35m${s}${RESET}`,
  cyan: (s: string) => `${ESC}36m${s}${RESET}`,
  gray: (s: string) => `${ESC}90m${s}${RESET}`,
  white: (s: string) => `${ESC}37m${s}${RESET}`,
  bold: (s: string) => `${BOLD}${s}${RESET}`,
  dim: (s: string) => `${DIM}${s}${RESET}`,
  brightGreen: (s: string) => `${ESC}92m${s}${RESET}`,
  brightYellow: (s: string) => `${ESC}93m${s}${RESET}`,
  brightRed: (s: string) => `${ESC}91m${s}${RESET}`,
  brightMagenta: (s: string) => `${ESC}95m${s}${RESET}`,
  brightCyan: (s: string) => `${ESC}96m${s}${RESET}`,
};

// ── Types ────────────────────────────────────────────────────────
interface StdinData {
  transcript_path?: string;
  cwd?: string;
  model?: {
    id?: string;
    display_name?: string;
  };
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
  rate_limits?: {
    five_hour?: {
      used_percentage?: number | null;
      resets_at?: number | null;
    } | null;
    seven_day?: {
      used_percentage?: number | null;
      resets_at?: number | null;
    } | null;
  } | null;
}

interface PluginConfig {
  showCost: boolean;
  showModel: boolean;
  showRateLimit: boolean;
  showTokenBreakdown: boolean;
  showScore: boolean;
  costWarningThreshold: number;  // USD per session
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
  const configPath = join(homedir(), ".claude", "plugins", "tokenscore", "config.json");
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

// ── Token formatting ─────────────────────────────────────────────
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ── Progress bar ─────────────────────────────────────────────────
function progressBar(percent: number, width = 12): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  if (percent >= 90) return colors.brightRed(bar);
  if (percent >= 70) return colors.brightYellow(bar);
  return colors.brightGreen(bar);
}

// ── Cumulative cost tracker (file-based, survives restarts) ──────
interface CostCache {
  sessionCost: number;
  sessionId: string;
  lastUpdate: number;
}

function loadCostCache(transcriptPath: string): CostCache {
  const cachePath = join(homedir(), ".tokenscore", ".cost-cache.json");
  try {
    if (existsSync(cachePath)) {
      const data = JSON.parse(readFileSync(cachePath, "utf-8"));
      if (data.sessionId === transcriptPath) return data;
    }
  } catch {}
  return { sessionCost: 0, sessionId: transcriptPath, lastUpdate: 0 };
}

function saveCostCache(cache: CostCache): void {
  const dir = join(homedir(), ".tokenscore");
  const cachePath = join(dir, ".cost-cache.json");
  try {
    const { mkdirSync, writeFileSync } = require("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cache));
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  // Read stdin (Claude Code pipes JSON)
  if (process.stdin.isTTY) return;

  const chunks: string[] = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string);
  }

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

  // ── Model + Context Line ─────────────────────────────────────
  const modelId = stdin.model?.id ?? "unknown";
  const modelName = stdin.model?.display_name ?? modelId.split("-").slice(-2, -1)[0] ?? "?";
  const contextSize = stdin.context_window?.context_window_size ?? 200_000;
  const usedPercent = stdin.context_window?.used_percentage ?? 0;
  const usage = stdin.context_window?.current_usage;

  const inputTok = usage?.input_tokens ?? 0;
  const outputTok = usage?.output_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheCreate = usage?.cache_creation_input_tokens ?? 0;
  const totalTok = inputTok + outputTok + cacheRead + cacheCreate;

  // Model tier badge
  const tier = getModelTier(modelId);
  const tierBadge = tier === "S" ? colors.brightMagenta(`[${tier}]`)
    : tier === "A" ? colors.brightGreen(`[${tier}]`)
    : tier === "B" ? colors.blue(`[${tier}]`)
    : colors.gray(`[${tier}]`);

  // Context bar
  const bar = progressBar(usedPercent);
  const pctStr = `${Math.round(usedPercent)}%`;

  let line1 = `${tierBadge} ${colors.bold(modelName)} ${bar} ${pctStr}`;

  // Token breakdown when context is high
  if (config.showTokenBreakdown && usedPercent > 50) {
    line1 += colors.dim(` (in:${fmtTokens(inputTok)} out:${fmtTokens(outputTok)} cache:${fmtTokens(cacheRead)})`);
  }

  lines.push(line1);

  // ── Cost Line ────────────────────────────────────────────────
  if (config.showCost) {
    const pricing = getModelPricing(modelId);
    if (pricing) {
      const costNow =
        (inputTok / 1e6) * pricing.input +
        (outputTok / 1e6) * pricing.output +
        (cacheRead / 1e6) * pricing.cacheRead +
        (cacheCreate / 1e6) * pricing.cacheCreation;

      // Track cumulative cost
      const transcriptPath = stdin.transcript_path ?? "";
      const costCache = loadCostCache(transcriptPath);
      if (costNow > costCache.sessionCost) {
        costCache.sessionCost = costNow;
        costCache.lastUpdate = Date.now();
        saveCostCache(costCache);
      }

      const costColor = costNow >= config.costWarningThreshold
        ? colors.brightRed
        : costNow >= config.costWarningThreshold * 0.5
        ? colors.brightYellow
        : colors.green;

      let costLine = `  💰 ${costColor(fmtCost(costNow))}`;

      // Cache efficiency
      if (totalTok > 0) {
        const cacheRate = Math.round((cacheRead / totalTok) * 100);
        costLine += colors.dim(` | cache ${cacheRate}%`);
      }

      // Intelligence score
      if (config.showScore) {
        const intel = getModelIntelligenceScore(modelId);
        costLine += colors.dim(` | IQ ${intel}`);
      }

      lines.push(costLine);
    }
  }

  // ── Rate Limit Line ──────────────────────────────────────────
  if (config.showRateLimit && stdin.rate_limits) {
    const fiveHr = stdin.rate_limits.five_hour;
    const sevenDay = stdin.rate_limits.seven_day;
    const parts: string[] = [];

    if (fiveHr && typeof fiveHr.used_percentage === "number") {
      const pct = Math.round(fiveHr.used_percentage);
      const rateBar = progressBar(pct, 8);
      let ratePart = `  5h ${rateBar} ${pct}%`;

      if (fiveHr.resets_at) {
        const secsLeft = fiveHr.resets_at - Math.floor(Date.now() / 1000);
        if (secsLeft > 0) {
          ratePart += colors.dim(` ↻${fmtDuration(secsLeft)}`);
        }
      }
      parts.push(ratePart);
    }

    if (sevenDay && typeof sevenDay.used_percentage === "number" && sevenDay.used_percentage > 50) {
      const pct7 = Math.round(sevenDay.used_percentage);
      parts.push(colors.dim(`7d ${pct7}%`));
    }

    if (parts.length > 0) {
      lines.push(parts.join(" | "));
    }
  }

  // Output all lines
  for (const line of lines) {
    console.log(line);
  }
}

main().catch(() => {});
