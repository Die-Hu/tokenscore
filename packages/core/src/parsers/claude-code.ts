import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { createInterface } from "node:readline";

import type { RawSession, TokenUsage } from "../types/index.js";
import type { ToolParser } from "./types.js";

export class ClaudeCodeParser implements ToolParser {
  readonly toolId = "claude-code" as const;

  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), ".claude", "projects");
  }

  getDataDir(): string {
    return this.baseDir;
  }

  async detect(): Promise<boolean> {
    try {
      const s = await stat(this.baseDir);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  async parseSessions(since?: Date): Promise<RawSession[]> {
    const sessions: RawSession[] = [];

    let projectDirs: string[];
    try {
      projectDirs = await readdir(this.baseDir);
    } catch {
      return sessions;
    }

    for (const dirName of projectDirs) {
      const dirPath = join(this.baseDir, dirName);
      const dirStat = await stat(dirPath).catch(() => null);
      if (!dirStat?.isDirectory()) continue;

      let files: string[];
      try {
        files = (await readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }

      for (const file of files) {
        const sessionId = file.replace(/\.jsonl$/, "");
        const filePath = join(dirPath, file);

        const session = await this.parseSessionFile(
          filePath,
          sessionId,
          dirPath,
        );
        if (!session) continue;
        if (since && session.endedAt < since) continue;

        // Parse subagent sessions and merge their token usage
        const subagentDir = join(dirPath, sessionId, "subagents");
        const subagentData = await this.parseSubagentDir(subagentDir);
        if (subagentData) {
          session.tokenUsage.inputTokens += subagentData.usage.inputTokens;
          session.tokenUsage.outputTokens += subagentData.usage.outputTokens;
          session.tokenUsage.cacheCreationInputTokens += subagentData.usage.cacheCreationInputTokens;
          session.tokenUsage.cacheReadInputTokens += subagentData.usage.cacheReadInputTokens;
          session.subagentCount = subagentData.count;
          session.toolCallCount += subagentData.toolCallCount;
          // Merge subagent model usage into session model usage
          for (const [model, tokens] of Object.entries(subagentData.modelTokens)) {
            session.modelTokens[model] = (session.modelTokens[model] ?? 0) + tokens;
          }
        }

        sessions.push(session);
      }
    }

    return sessions;
  }

  private async parseSessionFile(
    filePath: string,
    sessionId: string,
    dirPath: string,
  ): Promise<RawSession | null> {
    const userPrompts: string[] = [];
    const modelCounts = new Map<string, number>();
    const modelTokens: Record<string, number> = {};
    const toolCalls = new Map<string, number>();
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };

    let firstTimestamp: string | undefined;
    let lastTimestamp: string | undefined;
    let messageCount = 0;
    let userMessageCount = 0;
    let assistantMessageCount = 0;
    let toolCallCount = 0;
    let cwdFromSession: string | undefined;
    let sessionSlug: string | undefined;
    let claudeCodeVersion: string | undefined;
    let totalDurationMs = 0;

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const type = entry.type as string | undefined;
      const timestamp = entry.timestamp as string | undefined;

      // Track timestamps from all entry types
      if (timestamp) {
        if (!firstTimestamp) firstTimestamp = timestamp;
        lastTimestamp = timestamp;
      }

      // Extract session metadata
      if (!sessionSlug && typeof entry.slug === "string") {
        sessionSlug = entry.slug;
      }
      if (!claudeCodeVersion && typeof entry.version === "string") {
        claudeCodeVersion = entry.version;
      }

      // Handle system entries for turn duration
      if (type === "system") {
        const subtype = entry.subtype as string | undefined;
        if (subtype === "turn_duration") {
          const durationMs = entry.durationMs as number | undefined;
          if (typeof durationMs === "number") {
            totalDurationMs += durationMs;
          }
        }
        continue;
      }

      // Handle progress entries (subagent token usage)
      if (type === "progress") {
        const data = entry.data as Record<string, unknown> | undefined;
        if (data) {
          const msg = data.message as Record<string, unknown> | undefined;
          if (msg && msg.type === "assistant") {
            const u = msg.usage as Record<string, unknown> | undefined;
            if (u) {
              usage.inputTokens += asNum(u.input_tokens);
              usage.outputTokens += asNum(u.output_tokens);
              usage.cacheCreationInputTokens += asNum(u.cache_creation_input_tokens);
              usage.cacheReadInputTokens += asNum(u.cache_read_input_tokens);
            }
            const model = msg.model as string | undefined;
            if (model) {
              const outTok = asNum(u?.output_tokens);
              modelTokens[model] = (modelTokens[model] ?? 0) + outTok;
            }
          }
        }
        continue;
      }

      // Skip non-message entries
      if (type !== "user" && type !== "assistant") continue;

      messageCount++;

      if (type === "user") {
        // Extract cwd from user messages (most reliable project path)
        if (!cwdFromSession && typeof entry.cwd === "string") {
          cwdFromSession = entry.cwd;
        }

        // Filter out tool result messages - only count real user prompts
        const isToolResult = entry.toolUseResult !== undefined ||
          (entry.message && typeof entry.message === "object" &&
           hasToolResultContent(entry.message as Record<string, unknown>));

        if (!isToolResult) {
          userMessageCount++;
          const text = extractUserText(entry);
          if (text) userPrompts.push(text);
        }
      }

      if (type === "assistant") {
        assistantMessageCount++;
        const msg = entry.message as Record<string, unknown> | undefined;
        if (!msg) continue;

        // Track model
        const model = msg.model as string | undefined;
        if (model) {
          modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
        }

        // Aggregate token usage
        const u = msg.usage as Record<string, unknown> | undefined;
        if (u) {
          usage.inputTokens += asNum(u.input_tokens);
          usage.outputTokens += asNum(u.output_tokens);
          usage.cacheCreationInputTokens += asNum(u.cache_creation_input_tokens);
          usage.cacheReadInputTokens += asNum(u.cache_read_input_tokens);
        }

        // Track model output tokens
        if (model && u) {
          const outTok = asNum(u.output_tokens);
          modelTokens[model] = (modelTokens[model] ?? 0) + outTok;
        }

        // Count tool calls from content blocks
        const content = msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === "object" &&
                (block as Record<string, unknown>).type === "tool_use") {
              toolCallCount++;
              const toolName = (block as Record<string, unknown>).name as string;
              if (toolName) {
                toolCalls.set(toolName, (toolCalls.get(toolName) ?? 0) + 1);
              }
            }
          }
        }
      }
    }

    if (!firstTimestamp || messageCount === 0) return null;

    const startedAt = new Date(firstTimestamp);
    const endedAt = lastTimestamp ? new Date(lastTimestamp) : startedAt;
    const durationMs = totalDurationMs > 0
      ? totalDurationMs
      : endedAt.getTime() - startedAt.getTime();

    // Resolve project path: prefer cwd from session, otherwise leave as dirPath basename
    const projectPath = cwdFromSession ?? dirPath;

    return {
      toolId: "claude-code",
      sessionId,
      projectPath,
      modelId: topModel(modelCounts) ?? "unknown",
      startedAt,
      endedAt,
      durationMs,
      tokenUsage: usage,
      userPrompts,
      messageCount,
      userMessageCount,
      assistantMessageCount,
      toolCallCount,
      toolCalls: Object.fromEntries(toolCalls),
      modelTokens,
      subagentCount: 0,
      claudeCodeVersion,
      sessionSlug,
    };
  }

  private async parseSubagentDir(
    subagentDir: string,
  ): Promise<{
    usage: TokenUsage;
    count: number;
    toolCallCount: number;
    modelTokens: Record<string, number>;
  } | null> {
    let files: string[];
    try {
      files = (await readdir(subagentDir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return null;
    }

    if (files.length === 0) return null;

    const totalUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    let totalToolCallCount = 0;
    const modelTokens: Record<string, number> = {};

    for (const file of files) {
      const filePath = join(subagentDir, file);
      const rl = createInterface({
        input: createReadStream(filePath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) continue;
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        const type = entry.type as string | undefined;
        if (type !== "assistant") continue;

        const msg = entry.message as Record<string, unknown> | undefined;
        if (!msg) continue;

        const u = msg.usage as Record<string, unknown> | undefined;
        if (u) {
          totalUsage.inputTokens += asNum(u.input_tokens);
          totalUsage.outputTokens += asNum(u.output_tokens);
          totalUsage.cacheCreationInputTokens += asNum(u.cache_creation_input_tokens);
          totalUsage.cacheReadInputTokens += asNum(u.cache_read_input_tokens);
        }

        const model = msg.model as string | undefined;
        if (model && u) {
          const outTok = asNum(u.output_tokens);
          modelTokens[model] = (modelTokens[model] ?? 0) + outTok;
        }

        // Count tool calls
        const content = msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === "object" &&
                (block as Record<string, unknown>).type === "tool_use") {
              totalToolCallCount++;
            }
          }
        }
      }
    }

    return {
      usage: totalUsage,
      count: files.length,
      toolCallCount: totalToolCallCount,
      modelTokens,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────

/** Check if a user message content is actually a tool result */
function hasToolResultContent(msg: Record<string, unknown>): boolean {
  const content = msg.content;
  if (!Array.isArray(content)) return false;
  return content.some(
    (block) =>
      block &&
      typeof block === "object" &&
      (block as Record<string, unknown>).type === "tool_result",
  );
}

function extractUserText(entry: Record<string, unknown>): string | undefined {
  const msg = entry.message as Record<string, unknown> | undefined;
  if (!msg) return undefined;

  const content = msg.content;
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        parts.push(block);
      } else if (
        block &&
        typeof block === "object" &&
        "text" in block &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        parts.push((block as Record<string, unknown>).text as string);
      }
    }
    return parts.length > 0 ? parts.join("\n") : undefined;
  }

  return undefined;
}

function asNum(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function topModel(counts: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const [model, count] of counts) {
    if (count > bestCount) {
      best = model;
      bestCount = count;
    }
  }
  return best;
}
