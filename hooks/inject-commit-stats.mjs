#!/usr/bin/env node

/**
 * TokenScore PreToolUse Hook — Injects usage stats into git commit messages.
 *
 * Reads session stats from ~/.tokenscore/.session-stats.json (written by statusline plugin)
 * and appends a TokenScore trailer to the commit message.
 *
 * Input (stdin): { tool_name, tool_input: { command, description, timeout } }
 * Output (stdout): { hookSpecificOutput: { permissionDecision, updatedInput } }
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

function shortModel(mid) {
  const m = mid.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (m) return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2]}.${m[3]}`;
  return mid;
}

async function main() {
  // Read hook stdin
  const chunks = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(chunks.join(""));

  const cmd = input.tool_input?.command ?? "";

  // Only process git commit commands with -m flag
  if (!cmd.includes("git commit") || !cmd.includes("-m")) {
    // Pass through unchanged
    console.log(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } }));
    return;
  }

  // Read session stats
  let stats;
  try {
    stats = JSON.parse(readFileSync(STATS_PATH, "utf-8"));
  } catch {
    // No stats available, pass through
    console.log(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } }));
    return;
  }

  // Skip if stats are stale (>1 hour old)
  if (Date.now() - (stats.updatedAt ?? 0) > 3600000) {
    console.log(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } }));
    return;
  }

  // Build the trailer line
  const cost = `$${stats.cost < 1 ? stats.cost.toFixed(3) : stats.cost.toFixed(2)}`;
  const modelParts = Object.entries(stats.models ?? {})
    .sort((a, b) => (b[1]) - (a[1]))
    .slice(0, 3)
    .map(([m, pct]) => `${shortModel(m)}:${pct}%`)
    .join(" ");
  const tokens = fmtTok(stats.tokens ?? 0);
  const trailer = `TokenScore: ${cost} | ${modelParts} | ${tokens} tokens — github.com/Die-Hu/tokenscore`;

  // Inject trailer into the commit message
  // Find the -m "..." or -m '...' pattern and append the trailer
  let newCmd = cmd;

  // Handle heredoc pattern: $(cat <<'EOF' ... EOF)
  if (cmd.includes("<<'EOF'") || cmd.includes("<<EOF")) {
    // Insert trailer before the last EOF
    const eofMatch = cmd.match(/(EOF\s*\n\s*\)\s*"?\s*)$/);
    if (eofMatch) {
      const insertPos = cmd.lastIndexOf("EOF");
      newCmd = cmd.slice(0, insertPos) + `\n${trailer}\n` + cmd.slice(insertPos);
    }
  } else {
    // Handle -m "message" pattern
    const mFlagMatch = cmd.match(/-m\s+"((?:[^"\\]|\\.)*)"/);
    if (mFlagMatch) {
      const origMsg = mFlagMatch[1];
      const newMsg = `${origMsg}\\n\\n${trailer}`;
      newCmd = cmd.replace(mFlagMatch[0], `-m "${newMsg}"`);
    } else {
      // Handle -m 'message' pattern
      const mSingleMatch = cmd.match(/-m\s+'([^']*)'/);
      if (mSingleMatch) {
        const origMsg = mSingleMatch[1];
        const newMsg = `${origMsg}\n\n${trailer}`;
        newCmd = cmd.replace(mSingleMatch[0], `-m '${newMsg}'`);
      }
    }
  }

  if (newCmd === cmd) {
    // Could not inject, pass through
    console.log(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } }));
    return;
  }

  // Output updated command
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

main().catch(() => {
  console.log(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } }));
});
