import { Command } from "commander";
import chalk from "chalk";
import {
  getDb,
  runMigrations,
  sessionRepo,
  projectRepo,
  scanRepo,
} from "@tokenscore/core";
import {
  formatTokens,
  formatCost,
  formatRelativeTime,
  header,
  kv,
} from "../helpers.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show tracking overview")
    .action(() => {
      getDb();
      runMigrations();

      const allSessions = sessionRepo.findAll();
      const allProjects = projectRepo.findAll();

      if (allSessions.length === 0) {
        console.log(chalk.yellow("No data yet. Run `tokenscore scan` first."));
        return;
      }

      const totalTokens = allSessions.reduce(
        (sum, s) => sum + (s.totalTokens ?? 0),
        0,
      );
      const totalCost = allSessions.reduce(
        (sum, s) => sum + (s.estimatedCostUsd ?? 0),
        0,
      );

      // Today's stats
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayTs = todayStart.getTime();

      const todaySessions = allSessions.filter(
        (s) => s.startedAt >= todayTs,
      );
      const todayTokens = todaySessions.reduce(
        (sum, s) => sum + (s.totalTokens ?? 0),
        0,
      );
      const todayCost = todaySessions.reduce(
        (sum, s) => sum + (s.estimatedCostUsd ?? 0),
        0,
      );

      // This week's stats
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekTs = weekStart.getTime();

      const weekSessions = allSessions.filter(
        (s) => s.startedAt >= weekTs,
      );
      const weekTokens = weekSessions.reduce(
        (sum, s) => sum + (s.totalTokens ?? 0),
        0,
      );
      const weekCost = weekSessions.reduce(
        (sum, s) => sum + (s.estimatedCostUsd ?? 0),
        0,
      );

      // Model breakdown for today
      const modelMap = new Map<string, number>();
      for (const s of todaySessions) {
        modelMap.set(s.modelId, (modelMap.get(s.modelId) ?? 0) + (s.totalTokens ?? 0));
      }

      // Last scan info
      const lastClaudeScan = scanRepo.getLastScan("claude-code");
      const lastCodexScan = scanRepo.getLastScan("codex-cli");

      header("TokenScore Status");

      kv("Projects", allProjects.length);
      kv("Total sessions", allSessions.length);
      kv("Total tokens", formatTokens(totalTokens));
      kv("Total cost", formatCost(totalCost));

      if (lastClaudeScan) {
        kv("Last scan (Claude Code)", formatRelativeTime(lastClaudeScan.scannedAt));
      }
      if (lastCodexScan) {
        kv("Last scan (Codex CLI)", formatRelativeTime(lastCodexScan.scannedAt));
      }

      console.log();
      console.log(chalk.bold("  Today:"));
      kv("  Sessions", todaySessions.length);
      kv("  Tokens", formatTokens(todayTokens));
      kv("  Cost", formatCost(todayCost));
      if (modelMap.size > 0) {
        const modelParts = Array.from(modelMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([m, t]) => `${m}: ${formatTokens(t)}`)
          .join(", ");
        kv("  Models", modelParts);
      }

      console.log();
      console.log(chalk.bold("  This week:"));
      kv("  Sessions", weekSessions.length);
      kv("  Tokens", formatTokens(weekTokens));
      kv("  Cost", formatCost(weekCost));
      console.log();
    });
}
