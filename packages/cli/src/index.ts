import { Command } from "commander";
import { registerScanCommand } from "./commands/scan.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerProjectsCommand } from "./commands/projects.js";
import { registerProjectCommand } from "./commands/project.js";
import { registerExportCommand } from "./commands/export.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerScoreCommand } from "./commands/score.js";
import { registerStatsCommand } from "./commands/stats.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("tokenscore")
    .description("AI tool token consumption tracker & project scorer")
    .version("0.1.0");

  registerScanCommand(program);
  registerStatusCommand(program);
  registerProjectsCommand(program);
  registerProjectCommand(program);
  registerScoreCommand(program);
  registerStatsCommand(program);
  registerExportCommand(program);
  registerConfigCommand(program);

  return program;
}
