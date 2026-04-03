#!/usr/bin/env node

// src/index.ts
import { readFileSync, writeFileSync, mkdirSync, statSync, openSync, readSync, closeSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// src/models.ts
var MODEL_PRICING = {
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  "claude-opus-4-5": { input: 5, output: 25, cacheRead: 0.5, cacheCreation: 6.25 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  "claude-opus-4-1": { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  "claude-opus-4": { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  "claude-sonnet-4": { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheCreation: 1.25 },
  "claude-haiku-3-5": { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1 },
  "claude-haiku-3": { input: 0.25, output: 1.25, cacheRead: 0.03, cacheCreation: 0.3 },
  "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25, cacheCreation: 2.5 },
  "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5, cacheCreation: 2 },
  "gpt-5.1": { input: 2, output: 8, cacheRead: 0.5, cacheCreation: 2 },
  "o3": { input: 10, output: 40, cacheRead: 2.5, cacheCreation: 10 },
  "o4-mini": { input: 1.1, output: 4.4, cacheRead: 0.275, cacheCreation: 1.1 },
  "codex-mini": { input: 1.5, output: 6, cacheRead: 0.375, cacheCreation: 1.5 }
};
function getModelPricing(modelId) {
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(key)) return pricing;
  }
  return void 0;
}
var MODEL_TIERS = {
  "claude-opus-4-6": { tier: "S", iq: 95 },
  "claude-opus-4-5": { tier: "S", iq: 93 },
  "claude-opus-4-1": { tier: "S", iq: 90 },
  "claude-opus-4": { tier: "S", iq: 88 },
  "o3": { tier: "S", iq: 92 },
  "claude-sonnet-4-6": { tier: "A", iq: 82 },
  "claude-sonnet-4-5": { tier: "A", iq: 80 },
  "claude-sonnet-4": { tier: "A", iq: 78 },
  "gpt-4o": { tier: "A", iq: 78 },
  "gpt-4.1": { tier: "A", iq: 80 },
  "gpt-5.1": { tier: "A", iq: 80 },
  "o4-mini": { tier: "B", iq: 70 },
  "claude-haiku-4-5": { tier: "B", iq: 65 },
  "codex-mini": { tier: "B", iq: 68 },
  "claude-haiku-3-5": { tier: "C", iq: 55 },
  "claude-haiku-3": { tier: "C", iq: 45 }
};
function matchModel(modelId) {
  if (MODEL_TIERS[modelId]) return MODEL_TIERS[modelId];
  for (const [key, data] of Object.entries(MODEL_TIERS)) {
    if (modelId.startsWith(key)) return data;
  }
  return void 0;
}
function getModelTier(modelId) {
  return matchModel(modelId)?.tier ?? "B";
}
function getModelIntelligenceScore(modelId) {
  return matchModel(modelId)?.iq ?? 60;
}

// src/index.ts
var E = "\x1B[";
var R = `${E}0m`;
var c = {
  bold: (s) => `${E}1m${s}${R}`,
  dim: (s) => `${E}2m${s}${R}`,
  green: (s) => `${E}32m${s}${R}`,
  blue: (s) => `${E}34m${s}${R}`,
  gray: (s) => `${E}90m${s}${R}`,
  bGreen: (s) => `${E}92m${s}${R}`,
  bYellow: (s) => `${E}93m${s}${R}`,
  bRed: (s) => `${E}91m${s}${R}`,
  bMagenta: (s) => `${E}95m${s}${R}`
};
function fmtTok(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function fmtCost(usd) {
  if (usd < 1e-3) return "$0.000";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
function fmtDur(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}
function bar(pct, w = 8) {
  const filled = Math.round(pct / 100 * w);
  const b = "\u2588".repeat(filled) + "\u2591".repeat(w - filled);
  if (pct >= 90) return c.bRed(b);
  if (pct >= 70) return c.bYellow(b);
  return c.bGreen(b);
}
var CACHE_DIR = join(homedir(), ".tokenscore");
var CACHE_PATH = join(CACHE_DIR, ".cost-cache.json");
var STATS_PATH = join(CACHE_DIR, ".session-stats.json");
var USAGE_NEEDLE = Buffer.from('"usage"');
var NL = 10;
function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    return null;
  }
}
function saveState(cc) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cc));
    const totalOut = Object.values(cc.models).reduce((a, b) => a + b, 0) || 1;
    const modelPcts = {};
    for (const [m, t] of Object.entries(cc.models)) {
      modelPcts[m] = Math.round(t / totalOut * 100);
    }
    writeFileSync(STATS_PATH, JSON.stringify({
      cost: cc.cost,
      tokens: cc.tokens,
      outputTokens: totalOut,
      inputTokens: cc.inputTokens ?? 0,
      cacheReadTokens: cc.cacheReadTokens ?? 0,
      cacheCreationTokens: cc.cacheCreationTokens ?? 0,
      toolCallCount: cc.toolCallCount ?? 0,
      userMessageCount: cc.userMessageCount ?? 0,
      models: modelPcts,
      updatedAt: Date.now()
    }));
  } catch {
  }
}
function computeCost(tp, fallbackModel) {
  const empty = { sid: tp, cost: 0, sz: 0, models: {}, tokens: 0, inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, toolCallCount: 0, userMessageCount: 0 };
  if (!tp) return empty;
  let sz;
  try {
    sz = statSync(tp).size;
  } catch {
    return empty;
  }
  const cc = loadCache();
  if (cc && cc.sid === tp && sz === cc.sz) return cc;
  let offset = 0;
  let cost = 0;
  let models = {};
  let tokens = 0;
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let toolCallCount = 0;
  let userMessageCount = 0;
  if (cc && cc.sid === tp && sz > cc.sz) {
    offset = cc.sz;
    cost = cc.cost;
    models = { ...cc.models };
    tokens = cc.tokens;
    inputTokens = cc.inputTokens ?? 0;
    cacheReadTokens = cc.cacheReadTokens ?? 0;
    cacheCreationTokens = cc.cacheCreationTokens ?? 0;
    toolCallCount = cc.toolCallCount ?? 0;
    userMessageCount = cc.userMessageCount ?? 0;
  }
  const len = sz - offset;
  if (len <= 0) return cc ?? empty;
  try {
    const buf = Buffer.allocUnsafe(len);
    const fd = openSync(tp, "r");
    readSync(fd, buf, 0, len, offset);
    closeSync(fd);
    let pos = 0;
    while (pos < len) {
      const idx = buf.indexOf(USAGE_NEEDLE, pos);
      if (idx === -1) break;
      let ls = idx;
      while (ls > 0 && buf[ls - 1] !== NL) ls--;
      let le = idx;
      while (le < len && buf[le] !== NL) le++;
      try {
        const entry = JSON.parse(buf.toString("utf-8", ls, le));
        if (entry.type === "user" && !entry.toolUseResult) {
          userMessageCount++;
        }
        const u = entry.message?.usage;
        if (u) {
          const model = entry.message.model ?? fallbackModel;
          const p = getModelPricing(model);
          if (p) {
            const inT = u.input_tokens ?? 0;
            const outT = u.output_tokens ?? 0;
            const cRd = u.cache_read_input_tokens ?? 0;
            const cCr = u.cache_creation_input_tokens ?? 0;
            cost += inT / 1e6 * p.input + outT / 1e6 * p.output + cRd / 1e6 * p.cacheRead + cCr / 1e6 * p.cacheCreation;
            models[model] = (models[model] ?? 0) + outT;
            tokens += inT + outT;
            inputTokens += inT;
            cacheReadTokens += cRd;
            cacheCreationTokens += cCr;
          }
        }
        const content = entry.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === "tool_use") toolCallCount++;
          }
        }
      } catch {
      }
      pos = le + 1;
    }
  } catch {
    return cc ?? empty;
  }
  const result = { sid: tp, cost, sz, models, tokens, inputTokens, cacheReadTokens, cacheCreationTokens, toolCallCount, userMessageCount };
  saveState(result);
  return result;
}
async function main() {
  if (process.stdin.isTTY) return;
  const timeout = setTimeout(() => process.exit(0), 200);
  const chunks = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(chunk);
  clearTimeout(timeout);
  const raw = chunks.join("");
  if (!raw.trim()) return;
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    return;
  }
  const lines = [];
  const mid = d.model?.id ?? "unknown";
  const mname = d.model?.display_name ?? extractFamily(mid);
  const pct = Math.round(d.context_window?.used_percentage ?? 0);
  const u = d.context_window?.current_usage;
  const inTok = u?.input_tokens ?? 0;
  const outTok = u?.output_tokens ?? 0;
  const cacheRd = u?.cache_read_input_tokens ?? 0;
  const cacheCr = u?.cache_creation_input_tokens ?? 0;
  const totalTok = inTok + outTok + cacheRd + cacheCr;
  const tier = getModelTier(mid);
  const badge = tier === "S" ? c.bMagenta(`[${tier}]`) : tier === "A" ? c.bGreen(`[${tier}]`) : tier === "B" ? c.blue(`[${tier}]`) : c.gray(`[${tier}]`);
  let l1 = `${badge} ${c.bold(mname)} ${c.gray(`${pct}%`)}`;
  if (pct > 50) {
    l1 += c.dim(` (in:${fmtTok(inTok)} out:${fmtTok(outTok)} cache:${fmtTok(cacheRd)})`);
  }
  lines.push(l1);
  const stats = computeCost(d.transcript_path ?? "", mid);
  let sessionCost = stats.cost;
  if (sessionCost === 0) sessionCost = d.cost?.total_cost_usd ?? 0;
  const costFn = sessionCost >= 5 ? c.bRed : sessionCost >= 2.5 ? c.bYellow : c.green;
  let l2 = `  $ ${costFn(fmtCost(sessionCost))}`;
  if (totalTok > 0) {
    l2 += c.dim(` | cache ${Math.round(cacheRd / totalTok * 100)}%`);
  }
  l2 += c.dim(` | IQ ${getModelIntelligenceScore(mid)}`);
  lines.push(l2);
  if (d.rate_limits) {
    const parts = [];
    const fh = d.rate_limits.five_hour;
    if (fh && typeof fh.used_percentage === "number") {
      const p = Math.round(fh.used_percentage);
      let s = `5h ${bar(p)} ${p}%`;
      if (fh.resets_at) {
        const left = fh.resets_at - Math.floor(Date.now() / 1e3);
        if (left > 0) s += c.dim(` ~${fmtDur(left)}`);
      }
      parts.push(s);
    }
    const sd = d.rate_limits.seven_day;
    if (sd && typeof sd.used_percentage === "number") {
      const p7 = Math.round(sd.used_percentage);
      let s7 = `7d ${bar(p7, 6)} ${p7}%`;
      if (sd.resets_at) {
        const left7 = sd.resets_at - Math.floor(Date.now() / 1e3);
        if (left7 > 0) s7 += c.dim(` ~${fmtDur(left7)}`);
      }
      parts.push(s7);
    }
    if (parts.length > 0) lines.push(`  ${parts.join("  ")}`);
  }
  for (const l of lines) console.log(l);
}
function extractFamily(mid) {
  const p = mid.split("-");
  if (p[0] === "claude" && p.length >= 3) return p[1].charAt(0).toUpperCase() + p[1].slice(1);
  return mid;
}
main().catch(() => {
});
//# sourceMappingURL=index.js.map