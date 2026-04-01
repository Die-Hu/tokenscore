import { Command } from "commander";
import chalk from "chalk";
import {
  getDb,
  runMigrations,
  sessionRepo,
  projectRepo,
  getModelPricing,
} from "@tokenscore/core";
import { formatTokens, formatCost, header, kv } from "../helpers.js";

// Model display colors (GitHub-style language colors)
const MODEL_COLORS: Record<string, (s: string) => string> = {
  opus: chalk.hex("#A855F7"),     // purple
  sonnet: chalk.hex("#3B82F6"),   // blue
  haiku: chalk.hex("#22C55E"),    // green
  gpt: chalk.hex("#F97316"),      // orange
  o3: chalk.hex("#EF4444"),       // red
  codex: chalk.hex("#06B6D4"),    // cyan
};

function getModelColor(modelId: string): (s: string) => string {
  for (const [key, fn] of Object.entries(MODEL_COLORS)) {
    if (modelId.toLowerCase().includes(key)) return fn;
  }
  return chalk.gray;
}

function shortModelName(modelId: string): string {
  // claude-opus-4-6 -> Opus 4.6, claude-sonnet-4-5-20250929 -> Sonnet 4.5
  const m = modelId.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (m) return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2]}.${m[3]}`;
  return modelId;
}

export function registerContributorsCommand(program: Command): void {
  program
    .command("contributors")
    .description("Show model contributors per project (GitHub-style)")
    .argument("[path]", "Project path or name substring")
    .option("--all", "Show contributors across all projects")
    .option("--json", "Output as JSON")
    .action((pathArg, opts) => {
      getDb();
      runMigrations();

      const allProjects = projectRepo.findAll();
      const allSessions = sessionRepo.findAll();

      if (allSessions.length === 0) {
        console.log(chalk.yellow("No data. Run `tokenscore scan` first."));
        return;
      }

      // Determine target projects
      let targetProjects = allProjects;
      if (pathArg) {
        const q = pathArg.toLowerCase();
        targetProjects = allProjects.filter(
          (p) => p.path.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
        );
      } else if (!opts.all) {
        // Default: use current working directory
        const cwd = process.cwd();
        targetProjects = allProjects.filter((p) => p.path === cwd);
        if (targetProjects.length === 0) {
          // Fallback: show all
          targetProjects = allProjects;
        }
      }

      // Group sessions by project
      const projectSessions = new Map<string, typeof allSessions>();
      for (const s of allSessions) {
        const list = projectSessions.get(s.projectId) ?? [];
        list.push(s);
        projectSessions.set(s.projectId, list);
      }

      const results: Array<{
        projectName: string;
        projectPath: string;
        totalTokens: number;
        totalCost: number;
        sessions: number;
        contributors: Array<{
          model: string;
          shortName: string;
          tokens: number;
          cost: number;
          pct: number;
        }>;
      }> = [];

      for (const project of targetProjects) {
        const sessions = projectSessions.get(project.id);
        if (!sessions || sessions.length === 0) continue;

        // Aggregate per-model tokens across all sessions
        const modelAgg = new Map<string, { tokens: number; cost: number }>();
        let grandTokens = 0;
        let grandCost = 0;

        for (const s of sessions) {
          // Use stored modelTokens if available
          const mt = s.modelTokens ? JSON.parse(s.modelTokens as string) as Record<string, number> : null;
          const mc = s.modelCosts ? JSON.parse(s.modelCosts as string) as Record<string, number> : null;

          if (mt && Object.keys(mt).length > 0) {
            for (const [model, tokens] of Object.entries(mt)) {
              if (model === "<synthetic>") continue;
              const entry = modelAgg.get(model) ?? { tokens: 0, cost: 0 };
              entry.tokens += tokens;
              entry.cost += mc?.[model] ?? 0;
              modelAgg.set(model, entry);
              grandTokens += tokens;
              grandCost += mc?.[model] ?? 0;
            }
          } else {
            // Fallback: use session-level model_id
            const model = s.modelId;
            if (model === "<synthetic>") continue;
            const entry = modelAgg.get(model) ?? { tokens: 0, cost: 0 };
            const tok = (s.totalTokens ?? 0);
            entry.tokens += tok;
            entry.cost += s.estimatedCostUsd ?? 0;
            modelAgg.set(model, entry);
            grandTokens += tok;
            grandCost += s.estimatedCostUsd ?? 0;
          }
        }

        // Sort by token contribution descending
        const contributors = Array.from(modelAgg.entries())
          .map(([model, data]) => ({
            model,
            shortName: shortModelName(model),
            tokens: data.tokens,
            cost: data.cost,
            pct: grandTokens > 0 ? (data.tokens / grandTokens) * 100 : 0,
          }))
          .sort((a, b) => b.tokens - a.tokens);

        results.push({
          projectName: project.name,
          projectPath: project.path,
          totalTokens: grandTokens,
          totalCost: grandCost,
          sessions: sessions.length,
          contributors,
        });
      }

      // Sort projects by total cost descending
      results.sort((a, b) => b.totalCost - a.totalCost);

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      // Display
      for (const r of results) {
        console.log();
        console.log(chalk.bold(r.projectName));
        console.log(chalk.gray(r.projectPath));
        console.log();
        kv("Sessions", r.sessions);
        kv("Total tokens", formatTokens(r.totalTokens));
        kv("Total cost", formatCost(r.totalCost));

        // GitHub-style language bar
        if (r.contributors.length > 0) {
          console.log();
          const barWidth = 50;
          let barStr = "";
          for (const c of r.contributors) {
            const w = Math.max(1, Math.round((c.pct / 100) * barWidth));
            barStr += getModelColor(c.model)("█".repeat(w));
          }
          console.log(`  ${barStr}`);

          // Legend line
          const parts = r.contributors.map((c) => {
            const dot = getModelColor(c.model)("●");
            return `${dot} ${c.shortName} ${chalk.bold(c.pct.toFixed(1) + "%")}`;
          });
          console.log(`  ${parts.join("  ")}`);

          // Detail table
          console.log();
          for (const c of r.contributors) {
            const color = getModelColor(c.model);
            console.log(
              `  ${color("●")} ${c.shortName.padEnd(16)} ${formatTokens(c.tokens).padStart(8)}  ${formatCost(c.cost).padStart(9)}  ${chalk.gray(c.pct.toFixed(1) + "%")}`,
            );
          }
        }

        console.log();
        console.log(chalk.gray("─".repeat(50)));
      }
    });
}
