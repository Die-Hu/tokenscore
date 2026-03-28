import type { ToolType } from "../types/index.js";
import { ClaudeCodeParser } from "./claude-code.js";
import { CodexCliParser } from "./codex-cli.js";
import type { ToolParser } from "./types.js";

const parsers: ToolParser[] = [
  new ClaudeCodeParser(),
  new CodexCliParser(),
];

export function getAllParsers(): ToolParser[] {
  return parsers;
}

export async function getAvailableParsers(): Promise<ToolParser[]> {
  const results = await Promise.all(
    parsers.map(async (p) => ({ parser: p, available: await p.detect() })),
  );
  return results.filter((r) => r.available).map((r) => r.parser);
}

export function getParser(toolId: ToolType): ToolParser | undefined {
  return parsers.find((p) => p.toolId === toolId);
}
