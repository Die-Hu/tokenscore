/**
 * TokenScore — Claude Code Statusline Plugin
 * Zero native dependencies. Cumulative cost via incremental JSONL parsing.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getModelPricing, getModelTier, getModelIntelligenceScore } from "./models.js";

// ── ANSI ─────────────────────────────────────────────────────────
const E = "\x1b[";
const R = `${E}0m`;
const c = {
  bold: (s: string) => `${E}1m${s}${R}`,
  dim: (s: string) => `${E}2m${s}${R}`,
  green: (s: string) => `${E}32m${s}${R}`,
  blue: (s: string) => `${E}34m${s}${R}`,
  gray: (s: string) => `${E}90m${s}${R}`,
  bGreen: (s: string) => `${E}92m${s}${R}`,
  bYellow: (s: string) => `${E}93m${s}${R}`,
  bRed: (s: string) => `${E}91m${s}${R}`,
  bMagenta: (s: string) => `${E}95m${s}${R}`,
};

// ── Types ────────────────────────────────────────────────────────
interface StdinData {
  transcript_path?: string;
  model?: { id?: string; display_name?: string };
  context_window?: {
    current_usage?: {
      input_tokens?: number; output_tokens?: number;
      cache_creation_input_tokens?: number; cache_read_input_tokens?: number;
    } | null;
    used_percentage?: number | null;
  };
  cost?: { total_cost_usd?: number } | null;
  rate_limits?: {
    five_hour?: { used_percentage?: number | null; resets_at?: number | null } | null;
    seven_day?: { used_percentage?: number | null; resets_at?: number | null } | null;
  } | null;
}

// ── Formatters ───────────────────────────────────────────────────
function fmtTok(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd < 0.001) return "$0.000";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtDur(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

function bar(pct: number, w = 8): string {
  const filled = Math.round((pct / 100) * w);
  const b = "█".repeat(filled) + "░".repeat(w - filled);
  if (pct >= 90) return c.bRed(b);
  if (pct >= 70) return c.bYellow(b);
  return c.bGreen(b);
}

// ── Incremental JSONL cost parser ────────────────────────────────
interface CostCache {
  sid: string;    // transcript_path
  cost: number;   // cumulative USD
  sz: number;     // file byte offset
}

const CACHE_DIR = join(homedir(), ".tokenscore");
const CACHE_PATH = join(CACHE_DIR, ".cost-cache.json");
const USAGE_NEEDLE = Buffer.from('"usage"');
const NL = 0x0A;

function loadCache(): CostCache | null {
  try { return JSON.parse(readFileSync(CACHE_PATH, "utf-8")); } catch { return null; }
}

function saveCache(cc: CostCache): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cc));
  } catch {}
}

function computeCost(tp: string, fallbackModel: string): number {
  if (!tp) return 0;

  let sz: number;
  try { sz = statSync(tp).size; } catch { return 0; }

  const cc = loadCache();

  // Fast path: same session, no new data
  if (cc && cc.sid === tp && sz === cc.sz) return cc.cost;

  let offset = 0;
  let cost = 0;
  if (cc && cc.sid === tp && sz > cc.sz) {
    offset = cc.sz;
    cost = cc.cost;
  }

  const len = sz - offset;
  if (len <= 0) return cost;

  try {
    const buf = Buffer.allocUnsafe(len);
    const fd = openSync(tp, "r");
    readSync(fd, buf, 0, len, offset);
    closeSync(fd);

    // Buffer scan: find "usage" needle, extract only those lines
    let pos = 0;
    while (pos < len) {
      const idx = buf.indexOf(USAGE_NEEDLE, pos);
      if (idx === -1) break;

      // Find line boundaries
      let ls = idx;
      while (ls > 0 && buf[ls - 1] !== NL) ls--;
      let le = idx;
      while (le < len && buf[le] !== NL) le++;

      try {
        const entry = JSON.parse(buf.toString("utf-8", ls, le));
        const u = entry.message?.usage;
        if (u) {
          const p = getModelPricing(entry.message.model ?? fallbackModel);
          if (p) {
            cost +=
              ((u.input_tokens ?? 0) / 1e6) * p.input +
              ((u.output_tokens ?? 0) / 1e6) * p.output +
              ((u.cache_read_input_tokens ?? 0) / 1e6) * p.cacheRead +
              ((u.cache_creation_input_tokens ?? 0) / 1e6) * p.cacheCreation;
          }
        }
      } catch {}

      pos = le + 1;
    }
  } catch {
    return cc?.cost ?? 0;
  }

  saveCache({ sid: tp, cost, sz });
  return cost;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  if (process.stdin.isTTY) return;

  // Async stdin — readFileSync(0) breaks on Windows (nodejs/node#19831)
  const timeout = setTimeout(() => process.exit(0), 200);
  const chunks: string[] = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(chunk as string);
  clearTimeout(timeout);

  const raw = chunks.join("");
  if (!raw.trim()) return;

  let d: StdinData;
  try { d = JSON.parse(raw); } catch { return; }

  const lines: string[] = [];
  const mid = d.model?.id ?? "unknown";
  const mname = d.model?.display_name ?? extractFamily(mid);
  const pct = Math.round(d.context_window?.used_percentage ?? 0);
  const u = d.context_window?.current_usage;
  const inTok = u?.input_tokens ?? 0;
  const outTok = u?.output_tokens ?? 0;
  const cacheRd = u?.cache_read_input_tokens ?? 0;
  const cacheCr = u?.cache_creation_input_tokens ?? 0;
  const totalTok = inTok + outTok + cacheRd + cacheCr;

  // ── Line 1: Model + Context (gray %) ────────────────────────
  const tier = getModelTier(mid);
  const badge = tier === "S" ? c.bMagenta(`[${tier}]`)
    : tier === "A" ? c.bGreen(`[${tier}]`)
    : tier === "B" ? c.blue(`[${tier}]`)
    : c.gray(`[${tier}]`);

  let l1 = `${badge} ${c.bold(mname)} ${c.gray(`${pct}%`)}`;
  if (pct > 50) {
    l1 += c.dim(` (in:${fmtTok(inTok)} out:${fmtTok(outTok)} cache:${fmtTok(cacheRd)})`);
  }
  lines.push(l1);

  // ── Line 2: Session cost (cumulative from JSONL) ────────────
  let sessionCost = computeCost(d.transcript_path ?? "", mid);
  if (sessionCost === 0) sessionCost = d.cost?.total_cost_usd ?? 0;

  const costFn = sessionCost >= 5 ? c.bRed : sessionCost >= 2.5 ? c.bYellow : c.green;

  let l2 = `  $ ${costFn(fmtCost(sessionCost))}`;
  if (totalTok > 0) {
    l2 += c.dim(` | cache ${Math.round((cacheRd / totalTok) * 100)}%`);
  }
  l2 += c.dim(` | IQ ${getModelIntelligenceScore(mid)}`);
  lines.push(l2);

  // ── Line 3: Rate limits (5h + 7d always shown) ─────────────
  if (d.rate_limits) {
    const parts: string[] = [];
    const fh = d.rate_limits.five_hour;
    if (fh && typeof fh.used_percentage === "number") {
      const p = Math.round(fh.used_percentage);
      let s = `5h ${bar(p)} ${p}%`;
      if (fh.resets_at) {
        const left = fh.resets_at - Math.floor(Date.now() / 1000);
        if (left > 0) s += c.dim(` ~${fmtDur(left)}`);
      }
      parts.push(s);
    }
    const sd = d.rate_limits.seven_day;
    if (sd && typeof sd.used_percentage === "number") {
      const p7 = Math.round(sd.used_percentage);
      let s7 = `7d ${bar(p7, 6)} ${p7}%`;
      if (sd.resets_at) {
        const left7 = sd.resets_at - Math.floor(Date.now() / 1000);
        if (left7 > 0) s7 += c.dim(` ~${fmtDur(left7)}`);
      }
      parts.push(s7);
    }
    if (parts.length > 0) lines.push(`  ${parts.join("  ")}`);
  }

  for (const l of lines) console.log(l);
}

function extractFamily(mid: string): string {
  const p = mid.split("-");
  if (p[0] === "claude" && p.length >= 3) return p[1].charAt(0).toUpperCase() + p[1].slice(1);
  return mid;
}

main().catch(() => {});
