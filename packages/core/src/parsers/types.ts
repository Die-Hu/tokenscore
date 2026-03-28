import type { RawSession, ToolType } from "../types/index.js";

export interface ToolParser {
  readonly toolId: ToolType;
  detect(): Promise<boolean>;
  getDataDir(): string;
  parseSessions(since?: Date): Promise<RawSession[]>;
}
