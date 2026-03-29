#!/usr/bin/env node

// src/index.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
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
var ESC = "\x1B[";
var RESET = `${ESC}0m`;
var BOLD = `${ESC}1m`;
var DIM = `${ESC}2m`;
var c = {
  red: (s) => `${ESC}31m${s}${RESET}`,
  green: (s) => `${ESC}32m${s}${RESET}`,
  yellow: (s) => `${ESC}33m${s}${RESET}`,
  blue: (s) => `${ESC}34m${s}${RESET}`,
  magenta: (s) => `${ESC}35m${s}${RESET}`,
  cyan: (s) => `${ESC}36m${s}${RESET}`,
  gray: (s) => `${ESC}90m${s}${RESET}`,
  bold: (s) => `${BOLD}${s}${RESET}`,
  dim: (s) => `${DIM}${s}${RESET}`,
  bGreen: (s) => `${ESC}92m${s}${RESET}`,
  bYellow: (s) => `${ESC}93m${s}${RESET}`,
  bRed: (s) => `${ESC}91m${s}${RESET}`,
  bMagenta: (s) => `${ESC}95m${s}${RESET}`
};
var DEFAULT_CONFIG = {
  showCost: true,
  showModel: true,
  showRateLimit: true,
  showTokenBreakdown: true,
  showScore: true,
  costWarningThreshold: 5
};
function loadConfig() {
  try {
    const p = join(homedir(), ".claude", "plugins", "tokenscore", "config.json");
    if (existsSync(p)) return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(p, "utf-8")) };
  } catch {
  }
  return DEFAULT_CONFIG;
}
function fmtTok(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function fmtCost(usd) {
  if (usd < 0.01) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
function fmtDuration(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}
function bar(pct, w = 12) {
  const filled = Math.round(pct / 100 * w);
  const empty = w - filled;
  const b = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  if (pct >= 90) return c.bRed(b);
  if (pct >= 70) return c.bYellow(b);
  return c.bGreen(b);
}
function loadCostCache(sid) {
  try {
    const p = join(homedir(), ".tokenscore", ".cost-cache.json");
    if (existsSync(p)) {
      const d = JSON.parse(readFileSync(p, "utf-8"));
      if (d.sessionId === sid) return d;
    }
  } catch {
  }
  return { sessionCost: 0, sessionId: sid };
}
function saveCostCache(cache) {
  try {
    const dir = join(homedir(), ".tokenscore");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".cost-cache.json"), JSON.stringify(cache));
  } catch {
  }
}
async function main() {
  if (process.stdin.isTTY) return;
  const timeout = setTimeout(() => process.exit(0), 200);
  const chunks = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  clearTimeout(timeout);
  const raw = chunks.join("");
  if (!raw.trim()) return;
  let stdin;
  try {
    stdin = JSON.parse(raw);
  } catch {
    return;
  }
  const config = loadConfig();
  const lines = [];
  const modelId = stdin.model?.id ?? "unknown";
  const modelName = stdin.model?.display_name ?? extractModelFamily(modelId);
  const usedPct = Math.round(stdin.context_window?.used_percentage ?? 0);
  const usage = stdin.context_window?.current_usage;
  const inTok = usage?.input_tokens ?? 0;
  const outTok = usage?.output_tokens ?? 0;
  const cacheRd = usage?.cache_read_input_tokens ?? 0;
  const cacheCr = usage?.cache_creation_input_tokens ?? 0;
  const totalTok = inTok + outTok + cacheRd + cacheCr;
  const tier = getModelTier(modelId);
  const badge = tier === "S" ? c.bMagenta(`[${tier}]`) : tier === "A" ? c.bGreen(`[${tier}]`) : tier === "B" ? c.blue(`[${tier}]`) : c.gray(`[${tier}]`);
  let line1 = `${badge} ${c.bold(modelName)} ${bar(usedPct)} ${usedPct}%`;
  if (config.showTokenBreakdown && usedPct > 50) {
    line1 += c.dim(` (in:${fmtTok(inTok)} out:${fmtTok(outTok)} cache:${fmtTok(cacheRd)})`);
  }
  lines.push(line1);
  if (config.showCost) {
    let costNow = stdin.cost?.total_cost_usd ?? 0;
    if (costNow === 0 && totalTok > 0) {
      const pricing = getModelPricing(modelId);
      if (pricing) {
        costNow = inTok / 1e6 * pricing.input + outTok / 1e6 * pricing.output + cacheRd / 1e6 * pricing.cacheRead + cacheCr / 1e6 * pricing.cacheCreation;
      }
    }
    if (costNow > 0 || totalTok > 0) {
      const sid = stdin.transcript_path ?? "";
      const cc = loadCostCache(sid);
      if (costNow > cc.sessionCost) {
        cc.sessionCost = costNow;
        saveCostCache(cc);
      }
      const costFn = costNow >= config.costWarningThreshold ? c.bRed : costNow >= config.costWarningThreshold * 0.5 ? c.bYellow : c.green;
      let costLine = `  $ ${costFn(fmtCost(costNow))}`;
      if (totalTok > 0) {
        costLine += c.dim(` | cache ${Math.round(cacheRd / totalTok * 100)}%`);
      }
      if (config.showScore) {
        costLine += c.dim(` | IQ ${getModelIntelligenceScore(modelId)}`);
      }
      lines.push(costLine);
    }
  }
  if (config.showRateLimit && stdin.rate_limits) {
    const fh = stdin.rate_limits.five_hour;
    if (fh && typeof fh.used_percentage === "number") {
      const p = Math.round(fh.used_percentage);
      let rl = `  5h ${bar(p, 8)} ${p}%`;
      if (fh.resets_at) {
        const left = fh.resets_at - Math.floor(Date.now() / 1e3);
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
function extractModelFamily(modelId) {
  const parts = modelId.split("-");
  if (parts[0] === "claude" && parts.length >= 3) {
    return parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  if (parts[0] === "gpt") return modelId;
  return modelId;
}
main().catch(() => {
});
//# sourceMappingURL=index.js.map