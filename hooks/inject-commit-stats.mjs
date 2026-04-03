#!/usr/bin/env node

/**
 * TokenScore PreToolUse Hook
 * Injects usage stats trailer into git commit messages.
 * Pure ASCII output — safe for all terminals worldwide.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STATS_PATH = join(homedir(), ".tokenscore", ".session-stats.json");

function fmtTok(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n) {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
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

  // Build trailer — pure ASCII, universally readable
  const cost = fmtCost(stats.cost ?? 0);
  const tokens = fmtTok(stats.tokens ?? 0);
  const models = Object.entries(stats.models ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, p]) => `${shortModel(m)} ${p}%`)
    .join(", ");

  const trailer = `TokenScore: ${cost} | ${tokens} tokens | ${models} - Die-Hu/tokenscore`;

  // Inject into commit message
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
