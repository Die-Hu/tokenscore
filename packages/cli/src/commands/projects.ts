import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import {
  getDb,
  runMigrations,
  projectRepo,
  sessionRepo,
} from "@tokenscore/core";
import { formatTokens, formatCost, formatRelativeTime } from "../helpers.js";

export function registerProjectsCommand(program: Command): void {
  program
    .command("projects")
    .description("List all tracked projects")
    .option("--sort <field>", "Sort by: tokens, cost, sessions, recent", "recent")
    .option("--json", "Output as JSON")
    .action((opts) => {
      getDb();
      runMigrations();

      const projects = projectRepo.findAll();

      if (projects.length === 0) {
        console.log(chalk.yellow("No projects found. Run `tokenscore scan` first."));
        return;
      }

      // Aggregate session data per project
      interface ProjectSummary {
        id: string;
        name: string;
        path: string;
        sessions: number;
        tokens: number;
        cost: number;
        lastActive: number;
        models: Set<string>;
      }

      const summaries: ProjectSummary[] = [];

      for (const project of projects) {
        const sessions = sessionRepo.findByProjectId(project.id);
        const tokens = sessions.reduce((s, se) => s + (se.totalTokens ?? 0), 0);
        const cost = sessions.reduce((s, se) => s + (se.estimatedCostUsd ?? 0), 0);
        const lastActive = sessions.length > 0
          ? Math.max(...sessions.map((se) => se.startedAt))
          : project.createdAt;
        const models = new Set(sessions.map((se) => se.modelId));

        summaries.push({
          id: project.id,
          name: project.name,
          path: project.path,
          sessions: sessions.length,
          tokens,
          cost,
          lastActive,
          models,
        });
      }

      // Sort
      switch (opts.sort) {
        case "tokens":
          summaries.sort((a, b) => b.tokens - a.tokens);
          break;
        case "cost":
          summaries.sort((a, b) => b.cost - a.cost);
          break;
        case "sessions":
          summaries.sort((a, b) => b.sessions - a.sessions);
          break;
        default:
          summaries.sort((a, b) => b.lastActive - a.lastActive);
      }

      if (opts.json) {
        console.log(JSON.stringify(summaries.map((s) => ({
          ...s,
          models: Array.from(s.models),
        })), null, 2));
        return;
      }

      console.log(chalk.bold.underline(`Projects (${summaries.length})`));
      console.log();

      const table = new Table({
        head: [
          chalk.gray("Project"),
          chalk.gray("Sessions"),
          chalk.gray("Tokens"),
          chalk.gray("Cost"),
          chalk.gray("Models"),
          chalk.gray("Last Active"),
        ],
        style: { head: [], border: [] },
      });

      for (const s of summaries) {
        table.push([
          chalk.white(s.name),
          String(s.sessions),
          formatTokens(s.tokens),
          formatCost(s.cost),
          Array.from(s.models).join(", "),
          formatRelativeTime(s.lastActive),
        ]);
      }

      console.log(table.toString());
      console.log();
    });
}
