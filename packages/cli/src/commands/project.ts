import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import {
  getDb,
  runMigrations,
  projectRepo,
  sessionRepo,
} from "@tokenscore/core";
import { formatTokens, formatCost, formatDate, header, kv } from "../helpers.js";

export function registerProjectCommand(program: Command): void {
  program
    .command("project [path]")
    .description("Show project details and stats")
    .option("--sessions", "Show session breakdown")
    .option("--json", "Output as JSON")
    .action((pathArg, opts) => {
      getDb();
      runMigrations();

      const projectPath = pathArg ?? process.cwd();
      const project = projectRepo.findByPath(projectPath);

      if (!project) {
        // Try to find by name substring
        const all = projectRepo.findAll();
        const match = all.find(
          (p) => p.path.includes(projectPath) || p.name === projectPath,
        );
        if (!match) {
          console.log(chalk.yellow(`Project not found: ${projectPath}`));
          console.log(chalk.gray("Run `tokenscore projects` to see all tracked projects."));
          return;
        }
        showProject(match.id, match.name, match.path, opts);
        return;
      }

      showProject(project.id, project.name, project.path, opts);
    });
}

function showProject(
  id: string,
  name: string,
  path: string,
  opts: { sessions?: boolean; json?: boolean },
): void {
  const sessions = sessionRepo.findByProjectId(id);

  if (sessions.length === 0) {
    console.log(chalk.yellow(`No sessions found for project: ${name}`));
    return;
  }

  const totalTokens = sessions.reduce((s, se) => s + (se.totalTokens ?? 0), 0);
  const totalCost = sessions.reduce((s, se) => s + (se.estimatedCostUsd ?? 0), 0);
  const totalDuration = sessions.reduce((s, se) => s + (se.duration ?? 0), 0);

  // Model usage breakdown
  const modelUsage = new Map<string, { sessions: number; tokens: number; cost: number }>();
  for (const s of sessions) {
    const existing = modelUsage.get(s.modelId) ?? { sessions: 0, tokens: 0, cost: 0 };
    existing.sessions++;
    existing.tokens += s.totalTokens ?? 0;
    existing.cost += s.estimatedCostUsd ?? 0;
    modelUsage.set(s.modelId, existing);
  }

  // Tool usage breakdown
  const toolUsage = new Map<string, number>();
  for (const s of sessions) {
    toolUsage.set(s.toolId, (toolUsage.get(s.toolId) ?? 0) + 1);
  }

  if (opts.json) {
    console.log(JSON.stringify({
      name,
      path,
      sessions: sessions.length,
      totalTokens,
      totalCost,
      modelUsage: Object.fromEntries(modelUsage),
      toolUsage: Object.fromEntries(toolUsage),
    }, null, 2));
    return;
  }

  header(`Project: ${name}`);

  kv("Path", path);
  kv("Sessions", sessions.length);
  kv("Total tokens", formatTokens(totalTokens));
  kv("Total cost", formatCost(totalCost));
  kv("Duration", `${Math.round(totalDuration / 60_000)}min`);
  kv("Tools", Array.from(toolUsage.entries()).map(([t, c]) => `${t} (${c})`).join(", "));

  console.log();
  console.log(chalk.bold("  Model Usage:"));

  const modelTable = new Table({
    head: [chalk.gray("Model"), chalk.gray("Sessions"), chalk.gray("Tokens"), chalk.gray("Cost")],
    style: { head: [], border: [] },
  });

  for (const [model, usage] of Array.from(modelUsage.entries()).sort((a, b) => b[1].tokens - a[1].tokens)) {
    modelTable.push([model, String(usage.sessions), formatTokens(usage.tokens), formatCost(usage.cost)]);
  }

  console.log(modelTable.toString());

  if (opts.sessions) {
    console.log();
    console.log(chalk.bold("  Sessions:"));

    const sessTable = new Table({
      head: [
        chalk.gray("Date"),
        chalk.gray("Tool"),
        chalk.gray("Model"),
        chalk.gray("Tokens"),
        chalk.gray("Cost"),
        chalk.gray("Messages"),
      ],
      style: { head: [], border: [] },
    });

    for (const s of sessions.slice(0, 20)) {
      sessTable.push([
        formatDate(s.startedAt),
        s.toolId,
        s.modelId,
        formatTokens(s.totalTokens ?? 0),
        formatCost(s.estimatedCostUsd ?? 0),
        String(s.messageCount ?? 0),
      ]);
    }

    console.log(sessTable.toString());

    if (sessions.length > 20) {
      console.log(chalk.gray(`  ... and ${sessions.length - 20} more sessions`));
    }
  }

  console.log();
}
