import { Command } from "commander";
import { getDb, runMigrations, sessionRepo, projectRepo } from "@tokenscore/core";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export data to JSON or CSV")
    .option("--format <type>", "Output format: json, csv", "json")
    .option("--type <type>", "Data type: sessions, projects", "sessions")
    .action((opts) => {
      getDb();
      runMigrations();

      const format = opts.format as string;
      const dataType = opts.type as string;

      if (dataType === "projects") {
        const projects = projectRepo.findAll();
        if (format === "csv") {
          console.log("id,name,path,created_at,updated_at");
          for (const p of projects) {
            console.log(
              [csvEscape(p.id), csvEscape(p.name), csvEscape(p.path), p.createdAt, p.updatedAt].join(","),
            );
          }
        } else {
          console.log(JSON.stringify(projects, null, 2));
        }
        return;
      }

      // sessions
      const sessions = sessionRepo.findAll();

      if (format === "csv") {
        console.log(
          "id,external_id,tool_id,model_id,project_id,started_at,ended_at,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,total_tokens,message_count,user_message_count,tool_call_count,estimated_cost_usd",
        );
        for (const s of sessions) {
          console.log(
            [
              csvEscape(s.id),
              csvEscape(s.externalId),
              csvEscape(s.toolId),
              csvEscape(s.modelId),
              csvEscape(s.projectId),
              s.startedAt,
              s.endedAt ?? "",
              s.inputTokens ?? 0,
              s.outputTokens ?? 0,
              s.cacheReadTokens ?? 0,
              s.cacheCreationTokens ?? 0,
              s.totalTokens ?? 0,
              s.messageCount ?? 0,
              s.userMessageCount ?? 0,
              s.toolCallCount ?? 0,
              s.estimatedCostUsd ?? 0,
            ].join(","),
          );
        }
      } else {
        console.log(JSON.stringify(sessions, null, 2));
      }
    });
}
