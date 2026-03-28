import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { RawSession, TokenUsage } from "../types/index.js";
import type { ToolParser } from "./types.js";

const CHARS_PER_TOKEN = 4;

export class CodexCliParser implements ToolParser {
  readonly toolId = "codex-cli" as const;

  private readonly baseDir: string;
  private readonly sessionsDir: string;
  private readonly configPath: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(homedir(), ".codex");
    this.sessionsDir = join(this.baseDir, "sessions");
    this.configPath = join(this.baseDir, "config.toml");
  }

  getDataDir(): string {
    return this.baseDir;
  }

  async detect(): Promise<boolean> {
    try {
      const s = await stat(this.sessionsDir);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  async parseSessions(since?: Date): Promise<RawSession[]> {
    const sessions: RawSession[] = [];
    const defaultModel = await this.readDefaultModel();

    let files: string[];
    try {
      files = (await readdir(this.sessionsDir)).filter(
        (f) => f.startsWith("rollout-") && f.endsWith(".json"),
      );
    } catch {
      return sessions;
    }

    for (const file of files) {
      const filePath = join(this.sessionsDir, file);
      const session = await this.parseSessionFile(filePath, defaultModel);
      if (!session) continue;
      if (since && session.endedAt < since) continue;
      sessions.push(session);
    }

    return sessions;
  }

  private async parseSessionFile(
    filePath: string,
    defaultModel: string,
  ): Promise<RawSession | null> {
    let data: Record<string, unknown>;
    try {
      const raw = await readFile(filePath, "utf-8");
      data = JSON.parse(raw);
    } catch {
      return null;
    }

    const sessionMeta = data.session as Record<string, unknown> | undefined;
    const items = data.items as unknown[] | undefined;
    if (!sessionMeta || !Array.isArray(items) || items.length === 0) {
      return null;
    }

    const sessionId = (sessionMeta.id as string) ?? filePath;
    const timestamp = sessionMeta.timestamp as string | undefined;
    const startedAt = timestamp ? new Date(timestamp) : new Date();

    const userPrompts: string[] = [];
    let totalChars = 0;
    let messageCount = 0;
    let userMessageCount = 0;
    let assistantMessageCount = 0;
    let toolCallCount = 0;
    const toolCalls = new Map<string, number>();
    let lastTimestamp = startedAt;

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;

      // Track timestamps from all items
      const itemTimestamp = entry.timestamp as string | undefined;
      if (itemTimestamp) {
        const t = new Date(itemTimestamp);
        if (t > lastTimestamp) lastTimestamp = t;
      }

      const role = entry.role as string | undefined;
      const type = entry.type as string | undefined;

      // Count function calls
      if (type === "function_call") {
        toolCallCount++;
        const name = entry.name as string | undefined;
        if (name) {
          toolCalls.set(name, (toolCalls.get(name) ?? 0) + 1);
        }
      }

      if (role !== "user" && role !== "assistant") continue;

      messageCount++;
      const text = extractText(entry);

      if (role === "user") {
        userMessageCount++;
        if (text) userPrompts.push(text);
      }

      if (role === "assistant") {
        assistantMessageCount++;
      }

      if (text) {
        totalChars += text.length;
      }
    }

    if (messageCount === 0) return null;

    // Estimate tokens from character count
    const estimatedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
    const inputTokens = Math.ceil(estimatedTokens * 0.4);
    const outputTokens = estimatedTokens - inputTokens;

    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };

    // Derive project path from cwd if present
    const projectPath = (sessionMeta.cwd as string) ?? "unknown";

    return {
      toolId: "codex-cli",
      sessionId,
      projectPath,
      modelId: defaultModel,
      startedAt,
      endedAt: lastTimestamp,
      durationMs: lastTimestamp.getTime() - startedAt.getTime(),
      tokenUsage: usage,
      userPrompts,
      messageCount,
      userMessageCount,
      assistantMessageCount,
      toolCallCount,
      toolCalls: Object.fromEntries(toolCalls),
      modelTokens: { [defaultModel]: outputTokens },
      subagentCount: 0,
    };
  }

  private async readDefaultModel(): Promise<string> {
    try {
      const content = await readFile(this.configPath, "utf-8");
      const match = content.match(/model\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    } catch {
      // config not found
    }
    return "codex-default";
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function extractText(entry: Record<string, unknown>): string | undefined {
  const content = entry.content;
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
