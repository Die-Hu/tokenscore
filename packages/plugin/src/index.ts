/**
 * TokenScore — Claude Code Statusline Plugin
 *
 * Invoked by Claude Code every ~300ms via stdin/stdout protocol.
 * Zero native dependencies — does not import better-sqlite3.
 *
 * Cost tracking: Parses session JSONL incrementally (byte offset cache)
 * because stdin.cost.total_cost_usd resets on session resume.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getModelPricing, getModelTier, getModelIntelligenceScore } from "./models.js";

// ── ANSI ─────────────────────────────────────────────────────────
const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const c = {
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  gray: (s: string) => `${ESC}90m${s}${RESET}`,
  blue: (s: string) => `${ESC}34m${s}${RESET}`,
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

// ── Config ───────────────────────────────────────────────────────
const COST_WARN = 5.0;

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

function fmtDur(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

function bar(pct: number, w = 12): string {
  const filled = Math.round((pct / 100) * w);
  const b = "█".repeat(filled) + "░".repeat(w - filled);
  if (pct >= 90) return c.bRed(b);
  if (pct >= 70) return c.bYellow(b);
  return c.bGreen(b);
}

// ── Incremental JSONL cost parser ────────────────────────────────
interface CostCache {
  sessionId: string;   // transcript_path
  totalCost: number;   // cumulative USD
  fileSize: number;    // byte offset for incremental parse
}

const CACHE_DIR = join(homedir(), ".tokenscore");
const CACHE_PATH = join(CACHE_DIR, ".cost-cache.json");

function loadCache(): CostCache | null {
  try {
    if (existsSync(CACHE_PATH)) return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  } catch {}
  return null;
}

function saveCache(cache: CostCache): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch {}
}

/**
 * Compute cumulative session cost by incrementally parsing the JSONL transcript.
 * - First call: parses entire file (~30ms for 100MB)
 * - Subsequent calls: only parses new bytes since last read (<5ms)
 * - No change: just statSync + cache read (<1ms)
 */
function computeCost(transcriptPath: string, fallbackModel: string): number {
  if (!transcriptPath) return 0;

  let fileSize: number;
  try {
    fileSize = statSync(transcriptPath).size;
  } catch {
    return 0;
  }

  const cache = loadCache();

  // Fast path: same session, no new data
  if (cache && cache.sessionId === transcriptPath && fileSize === cache.fileSize) {
    return cache.totalCost;
  }

  // Determine start position
  let offset = 0;
  let cost = 0;
  if (cache && cache.sessionId === transcriptPath && fileSize > cache.fileSize) {
    offset = cache.fileSize;
    cost = cache.totalCost;
  }

  // Read only new bytes
  const len = fileSize - offset;
  if (len <= 0) return cost;

  try {
    const buf = Buffer.alloc(len);
    const fd = openSync(transcriptPath, "r");
    readSync(fd, buf, 0, len, offset);
    closeSync(fd);

    for (const line of buf.toString("utf-8").split("\n")) {
      if (!line.includes('"usage"')) continue; // fast skip non-usage lines
      try {
        const entry = JSON.parse(line);
        const u = entry.message?.usage;
        if (!u) continue;
        const p = getModelPricing(entry.message.model ?? fallbackModel);
        if (!p) continue;
        cost +=
          ((u.input_tokens ?? 0) / 1e6) * p.input +
          ((u.output_tokens ?? 0) / 1e6) * p.output +
          ((u.cache_read_input_tokens ?? 0) / 1e6) * p.cacheRead +
          ((u.cache_creation_input_tokens ?? 0) / 1e6) * p.cacheCreation;
      } catch {}
    }
  } catch {
    return cache?.totalCost ?? 0;
  }

  saveCache({ sessionId: transcriptPath, totalCost: cost, fileSize });
  return cost;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  if (process.stdin.isTTY) return;

  const timeout = setTimeout(() => process.exit(0), 200);
  const chunks: string[] = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(chunk as string);
  clearTimeout(timeout);

  const raw = chunks.join("");
  if (!raw.trim()) return;

  let stdin: StdinData;
  try { stdin = JSON.parse(raw); } catch { return; }

  const lines: string[] = [];
  const modelId = stdin.model?.id ?? "unknown";
  const modelName = stdin.model?.display_name ?? extractModelFamily(modelId);
  const usedPct = Math.round(stdin.context_window?.used_percentage ?? 0);
  const usage = stdin.context_window?.current_usage;
  const inTok = usage?.input_tokens ?? 0;
  const outTok = usage?.output_tokens ?? 0;
  const cacheRd = usage?.cache_read_input_tokens ?? 0;
  const cacheCr = usage?.cache_creation_input_tokens ?? 0;
  const totalTok = inTok + outTok + cacheRd + cacheCr;

  // ── Line 1: Model + Context ─────────────────────────────────
  const tier = getModelTier(modelId);
  const badge = tier === "S" ? c.bMagenta(`[${tier}]`)
    : tier === "A" ? c.bGreen(`[${tier}]`)
    : tier === "B" ? c.blue(`[${tier}]`)
    : c.gray(`[${tier}]`);

  let line1 = `${badge} ${c.bold(modelName)} ${bar(usedPct)} ${usedPct}%`;
  if (usedPct > 50) {
    line1 += c.dim(` (in:${fmtTok(inTok)} out:${fmtTok(outTok)} cache:${fmtTok(cacheRd)})`);
  }
  lines.push(line1);

  // ── Line 2: Cost (from JSONL, accurate cumulative) ──────────
  let costNow = computeCost(stdin.transcript_path ?? "", modelId);

  // Fallback for brand new session (no JSONL yet)
  if (costNow === 0) {
    costNow = stdin.cost?.total_cost_usd ?? 0;
  }

  const costFn = costNow >= COST_WARN ? c.bRed
    : costNow >= COST_WARN * 0.5 ? c.bYellow
    : c.green;

  let line2 = `  $ ${costFn(fmtCost(costNow))}`;
  if (totalTok > 0) {
    line2 += c.dim(` | cache ${Math.round((cacheRd / totalTok) * 100)}%`);
  }
  line2 += c.dim(` | IQ ${getModelIntelligenceScore(modelId)}`);
  lines.push(line2);

  // ── Line 3: Rate Limits ─────────────────────────────────────
  if (stdin.rate_limits) {
    const fh = stdin.rate_limits.five_hour;
    if (fh && typeof fh.used_percentage === "number") {
      const p = Math.round(fh.used_percentage);
      let rl = `  5h ${bar(p, 8)} ${p}%`;
      if (fh.resets_at) {
        const left = fh.resets_at - Math.floor(Date.now() / 1000);
        if (left > 0) rl += c.dim(` ~${fmtDur(left)}`);
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

function extractModelFamily(modelId: string): string {
  const parts = modelId.split("-");
  if (parts[0] === "claude" && parts.length >= 3) {
    return parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return modelId;
}

main().catch(() => {});
