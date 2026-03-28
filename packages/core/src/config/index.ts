import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { DEFAULT_CONFIG } from "./defaults.js";

export { DEFAULT_CONFIG } from "./defaults.js";
export type { TokenScoreConfig } from "./defaults.js";

function resolveHome(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export function getConfigPath(): string {
  return path.join(resolveHome(DEFAULT_CONFIG.dataDir), "config.json");
}

export function loadConfig(): typeof DEFAULT_CONFIG {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const userConfig = JSON.parse(raw);
  return deepMerge(structuredClone(DEFAULT_CONFIG), userConfig);
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  for (const key of Object.keys(source)) {
    const targetVal = target[key as keyof T];
    const sourceVal = source[key];
    if (
      targetVal && sourceVal &&
      typeof targetVal === "object" && !Array.isArray(targetVal) &&
      typeof sourceVal === "object" && !Array.isArray(sourceVal)
    ) {
      deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
    } else {
      (target as Record<string, unknown>)[key] = sourceVal;
    }
  }
  return target;
}

export function saveConfig(config: typeof DEFAULT_CONFIG): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
