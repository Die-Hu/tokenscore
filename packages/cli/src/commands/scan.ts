import { Command } from "commander";
import { randomUUID } from "node:crypto";
import chalk from "chalk";
import ora from "ora";
import {
  getDb,
  runMigrations,
  getAvailableParsers,
  getParser,
  projectRepo,
  sessionRepo,
  scanRepo,
  estimateCost,
  estimateDifficulty,
  getModelIntelligenceScore,
  calculateEfficiency,
  calculateComposite,
  assignGrade,
} from "@tokenscore/core";
import type { RawSession } from "@tokenscore/core";
import { formatTokens, formatCost } from "../helpers.js";

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan and import data from AI tools")
    .option("--tool <name>", "Scan specific tool only (claude-code, codex-cli)")
    .option("--since <date>", "Only import sessions after this date")
    .option("--force", "Force full rescan, ignoring last scan timestamp")
    .option("--dry-run", "Show what would be imported without importing")
    .action(async (opts) => {
      // Initialize database
      getDb();
      runMigrations();

      const since = opts.since ? new Date(opts.since) : undefined;
      const dryRun = opts.dryRun ?? false;

      // Get parsers
      let parsers;
      if (opts.tool) {
        const parser = getParser(opts.tool);
        if (!parser) {
          console.error(chalk.red(`Unknown tool: ${opts.tool}`));
          process.exit(1);
        }
        const available = await parser.detect();
        if (!available) {
          console.error(chalk.red(`Tool ${opts.tool} not found on this machine`));
          process.exit(1);
        }
        parsers = [parser];
      } else {
        parsers = await getAvailableParsers();
      }

      if (parsers.length === 0) {
        console.log(chalk.yellow("No AI tools detected on this machine."));
        return;
      }

      console.log(chalk.bold("TokenScore Scan"));
      console.log(chalk.gray(`Detected tools: ${parsers.map((p) => p.toolId).join(", ")}`));
      console.log();

      let totalImported = 0;
      let totalTokens = 0;

      for (const parser of parsers) {
        const spinner = ora(`Scanning ${parser.toolId}...`).start();

        // Determine scan-since date
        let scanSince = since;
        if (!scanSince && !opts.force) {
          const lastScan = scanRepo.getLastScan(parser.toolId);
          if (lastScan?.lastSessionDate) {
            scanSince = new Date(lastScan.lastSessionDate);
          }
        }

        let sessions: RawSession[];
        try {
          sessions = await parser.parseSessions(scanSince);
        } catch (err) {
          spinner.fail(`Error scanning ${parser.toolId}: ${err}`);
          continue;
        }

        let imported = 0;
        let skipped = 0;
        let toolTokens = 0;

        for (const raw of sessions) {
          // Skip synthetic/internal sessions with no real content
          if (raw.modelId === "<synthetic>" || raw.modelId === "unknown") {
            skipped++;
            continue;
          }

          // Skip already imported sessions
          if (sessionRepo.existsByExternalId(raw.sessionId, raw.toolId)) {
            skipped++;
            continue;
          }

          if (dryRun) {
            imported++;
            toolTokens += raw.tokenUsage.inputTokens + raw.tokenUsage.outputTokens;
            continue;
          }

          // Ensure project exists
          const project = projectRepo.upsertFromPath(raw.projectPath);

          // Calculate cost with cache token pricing
          const cost = estimateCost(
            raw.modelId,
            raw.tokenUsage.inputTokens,
            raw.tokenUsage.outputTokens,
            raw.tokenUsage.cacheReadInputTokens,
            raw.tokenUsage.cacheCreationInputTokens,
          );

          const totalTok =
            raw.tokenUsage.inputTokens + raw.tokenUsage.outputTokens;

          // Insert session
          sessionRepo.insert({
            id: randomUUID(),
            externalId: raw.sessionId,
            toolId: raw.toolId,
            modelId: raw.modelId,
            projectId: project.id,
            startedAt: raw.startedAt.getTime(),
            endedAt: raw.endedAt.getTime(),
            duration: raw.durationMs,
            inputTokens: raw.tokenUsage.inputTokens,
            outputTokens: raw.tokenUsage.outputTokens,
            cacheReadTokens: raw.tokenUsage.cacheReadInputTokens,
            cacheCreationTokens: raw.tokenUsage.cacheCreationInputTokens,
            totalTokens: totalTok,
            messageCount: raw.messageCount,
            userMessageCount: raw.userMessageCount,
            assistantMessageCount: raw.assistantMessageCount,
            toolCallCount: raw.toolCallCount,
            userPrompts: JSON.stringify(raw.userPrompts.slice(0, 5)),
            workingDirectory: raw.projectPath,
            estimatedCostUsd: cost,
            sourceFile: "",
            importedAt: Date.now(),
          });

          // Update project activity timestamps
          projectRepo.updateActivity(
            project.id,
            raw.startedAt.getTime(),
            raw.endedAt.getTime(),
          );

          imported++;
          toolTokens += totalTok;
        }

        // Record scan
        if (!dryRun && imported > 0) {
          const latestDate = sessions.length > 0
            ? Math.max(...sessions.map((s) => s.endedAt.getTime()))
            : null;
          scanRepo.recordScan(parser.toolId, imported, toolTokens, latestDate);
        }

        totalImported += imported;
        totalTokens += toolTokens;

        const prefix = dryRun ? "[dry-run] " : "";
        spinner.succeed(
          `${parser.toolId}: ${prefix}${imported} sessions imported, ${skipped} skipped (${formatTokens(toolTokens)} tokens)`,
        );
      }

      console.log();
      if (dryRun) {
        console.log(chalk.yellow(`Dry run complete. Would import ${totalImported} sessions (${formatTokens(totalTokens)} tokens)`));
      } else {
        console.log(chalk.green(`Scan complete. Imported ${totalImported} sessions (${formatTokens(totalTokens)} tokens)`));
      }
    });
}
