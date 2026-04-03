#!/usr/bin/env node

/**
 * TokenScore PreToolUse Hook
 * 1. Injects usage stats trailer into git commit messages
 * 2. Writes .tokenscore/badge.json for shields.io README badge
 * Pure ASCII — safe for all terminals worldwide.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STATS_PATH = join(homedir(), ".tokenscore", ".session-stats.json");

function fmtTok(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n) {
  if (n >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

function fmtCostBadge(n) {
  // Badge shows rounded dollars — confident, not penny-counting
  if (n >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (n < 1) return `<$1`;
  return `$${Math.round(n)}`;
}

function badgeColor(n) {
  if (n >= 500) return "FF6B6B";  // red-coral — serious investment
  if (n >= 200) return "DAA520";  // gold
  if (n >= 50) return "8A2BE2";   // purple
  return "007EC6";                // blue — getting started
}

function shortModel(mid) {
  const m = mid.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return mid;
}

const allow = JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } });

async function main() {
  const chunks = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(chunks.join(""));

  const cmd = input.tool_input?.command ?? "";
  if (!cmd.includes("git commit") || !cmd.includes("-m")) {
    console.log(allow);
    return;
  }

  let stats;
  try { stats = JSON.parse(readFileSync(STATS_PATH, "utf-8")); } catch { console.log(allow); return; }
  if (Date.now() - (stats.updatedAt ?? 0) > 3600000) { console.log(allow); return; }

  const cost = stats.cost ?? 0;

  // ── Write .tokenscore/badge.json in the project directory ────
  const cwd = input.tool_input?.cwd ?? input.cwd ?? process.cwd();
  try {
    const badgeDir = join(cwd, ".tokenscore");
    if (!existsSync(badgeDir)) mkdirSync(badgeDir, { recursive: true });
    writeFileSync(join(badgeDir, "badge.json"), JSON.stringify({
      schemaVersion: 1,
      label: "AI Built",
      message: fmtCostBadge(cost),
      color: badgeColor(cost),
    }, null, 2) + "\n");
  } catch {}

  // ── Build commit trailer ─────────────────────────────────────
  const costStr = fmtCost(cost);
  const tokens = fmtTok(stats.tokens ?? 0);
  const models = Object.entries(stats.models ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, p]) => `${shortModel(m)} ${p}%`)
    .join(", ");

  const trailer = `TokenScore: ${costStr} | ${tokens} tokens | ${models} - Die-Hu/tokenscore`;

  // ── Inject trailer + stage badge.json ────────────────────────
  let newCmd = cmd;

  // Handle heredoc: $(cat <<'EOF' ... EOF)
  if (cmd.includes("<<'EOF'") || cmd.includes("<<EOF")) {
    const lastEof = cmd.lastIndexOf("EOF");
    if (lastEof > 0) {
      newCmd = cmd.slice(0, lastEof) + `\n${trailer}\n` + cmd.slice(lastEof);
    }
  } else {
    // Handle -m "message"
    const dq = cmd.match(/-m\s+"((?:[^"\\]|\\.)*)"/);
    if (dq) {
      newCmd = cmd.replace(dq[0], `-m "${dq[1]}\\n\\n${trailer}"`);
    } else {
      // Handle -m 'message'
      const sq = cmd.match(/-m\s+'([^']*)'/);
      if (sq) {
        newCmd = cmd.replace(sq[0], `-m '${sq[1]}\n\n${trailer}'`);
      }
    }
  }

  if (newCmd === cmd) { console.log(allow); return; }

  // Prepend: stage badge.json before commit
  newCmd = `git add .tokenscore/badge.json 2>/dev/null; ${newCmd}`;

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: {
        command: newCmd,
        description: input.tool_input.description ?? "",
        timeout: input.tool_input.timeout ?? 120000,
      },
    },
  }));
}

main().catch(() => { console.log(allow); });
