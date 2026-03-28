import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import {
  getDb,
  runMigrations,
  sessionRepo,
  projectRepo,
  estimateDifficulty,
  getModelIntelligenceScore,
  getModelTier,
  calculateEfficiency,
  calculateComposite,
  assignGrade,
} from "@tokenscore/core";
import type { RawSession } from "@tokenscore/core";
import { formatTokens, formatCost, gradeColor, header, kv } from "../helpers.js";

export function registerScoreCommand(program: Command): void {
  program
    .command("score")
    .description("Calculate and display scoring for projects")
    .option("--project <path>", "Score a specific project")
    .option("--all", "Score all projects")
    .option("--json", "Output as JSON")
    .action((opts) => {
      getDb();
      runMigrations();

      const allProjects = projectRepo.findAll();
      const allSessions = sessionRepo.findAll();

      if (allSessions.length === 0) {
        console.log(chalk.yellow("No data. Run `tokenscore scan` first."));
        return;
      }

      // Group sessions by project
      const projectSessions = new Map<string, typeof allSessions>();
      for (const s of allSessions) {
        const list = projectSessions.get(s.projectId) ?? [];
        list.push(s);
        projectSessions.set(s.projectId, list);
      }

      // Determine which projects to score
      let targetProjects = allProjects;
      if (opts.project) {
        const query = opts.project.toLowerCase();
        targetProjects = allProjects.filter(
          (p) =>
            p.path.toLowerCase().includes(query) ||
            p.name.toLowerCase().includes(query),
        );
        if (targetProjects.length === 0) {
          console.error(chalk.red(`No project matching: ${opts.project}`));
          process.exit(1);
        }
      }

      const results: Array<{
        name: string;
        sessions: number;
        tokens: string;
        cost: string;
        difficulty: number;
        modelIntel: number;
        efficiency: number;
        composite: number;
        grade: string;
        cacheHitRate: string;
      }> = [];

      for (const project of targetProjects) {
        const sessions = projectSessions.get(project.id);
        if (!sessions || sessions.length === 0) continue;

        // Aggregate project stats
        let totalInput = 0;
        let totalOutput = 0;
        let totalCacheRead = 0;
        let totalCacheCreation = 0;
        let totalToolCalls = 0;
        let totalUserMessages = 0;
        let totalMessages = 0;
        let totalCost = 0;
        let subagentCount = 0;
        const modelCounts = new Map<string, number>();

        for (const s of sessions) {
          totalInput += s.inputTokens ?? 0;
          totalOutput += s.outputTokens ?? 0;
          totalCacheRead += s.cacheReadTokens ?? 0;
          totalCacheCreation += s.cacheCreationTokens ?? 0;
          totalToolCalls += s.toolCallCount ?? 0;
          totalUserMessages += s.userMessageCount ?? 0;
          totalMessages += s.messageCount ?? 0;
          totalCost += s.estimatedCostUsd ?? 0;
          modelCounts.set(s.modelId, (modelCounts.get(s.modelId) ?? 0) + 1);
        }

        const totalTokens = totalInput + totalOutput;

        // Find primary model
        let primaryModel = "unknown";
        let maxCount = 0;
        for (const [model, count] of modelCounts) {
          if (count > maxCount) {
            primaryModel = model;
            maxCount = count;
          }
        }

        // Build a synthetic RawSession for difficulty estimation
        const syntheticSession: RawSession = {
          toolId: "claude-code",
          sessionId: "aggregate",
          projectPath: project.path,
          modelId: primaryModel,
          startedAt: new Date(sessions[sessions.length - 1].startedAt),
          endedAt: new Date(sessions[0].startedAt),
          durationMs: sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0),
          tokenUsage: {
            inputTokens: totalInput,
            outputTokens: totalOutput,
            cacheCreationInputTokens: totalCacheCreation,
            cacheReadInputTokens: totalCacheRead,
          },
          userPrompts: [],
          messageCount: totalMessages,
          userMessageCount: totalUserMessages,
          assistantMessageCount: totalMessages - totalUserMessages,
          toolCallCount: totalToolCalls,
          toolCalls: {},
          modelTokens: {},
          subagentCount,
        };

        const diffResult = estimateDifficulty(syntheticSession);
        const modelIntel = getModelIntelligenceScore(primaryModel);

        const effResult = calculateEfficiency({
          totalTokens,
          cacheReadTokens: totalCacheRead,
          cacheCreationTokens: totalCacheCreation,
          difficultyScore: diffResult.score,
          modelIntelligenceScore: modelIntel,
          toolCallCount: totalToolCalls,
          userMessageCount: totalUserMessages,
        });

        const comp = calculateComposite(
          effResult.score,
          diffResult.score,
          modelIntel,
        );

        const grade = assignGrade(comp.composite);

        results.push({
          name: project.name,
          sessions: sessions.length,
          tokens: formatTokens(totalTokens),
          cost: formatCost(totalCost),
          difficulty: Math.round(diffResult.score),
          modelIntel: Math.round(modelIntel),
          efficiency: Math.round(effResult.score),
          composite: Math.round(comp.composite),
          grade,
          cacheHitRate: `${Math.round(effResult.cacheHitRate * 100)}%`,
        });
      }

      // Sort by composite score descending
      results.sort((a, b) => b.composite - a.composite);

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      header("TokenScore Rankings");

      const table = new Table({
        head: [
          "Project",
          "Grade",
          "Score",
          "Efficiency",
          "Difficulty",
          "Model",
          "Cache Hit",
          "Sessions",
          "Tokens",
          "Cost",
        ],
        style: { head: ["cyan"] },
      });

      for (const r of results) {
        table.push([
          r.name,
          gradeColor(r.grade),
          String(r.composite),
          String(r.efficiency),
          String(r.difficulty),
          String(r.modelIntel),
          r.cacheHitRate,
          String(r.sessions),
          r.tokens,
          r.cost,
        ]);
      }

      console.log(table.toString());
    });
}
