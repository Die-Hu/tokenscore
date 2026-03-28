import chalk from "chalk";

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function gradeColor(grade: string): string {
  if (grade.startsWith("S")) return chalk.magentaBright(grade);
  if (grade.startsWith("A")) return chalk.greenBright(grade);
  if (grade.startsWith("B")) return chalk.blueBright(grade);
  if (grade.startsWith("C")) return chalk.yellow(grade);
  return chalk.red(grade);
}

export function toolIcon(toolId: string): string {
  switch (toolId) {
    case "claude-code": return chalk.cyan("CC");
    case "codex-cli": return chalk.green("CX");
    default: return chalk.gray("??");
  }
}

export function header(text: string): void {
  console.log(chalk.bold.underline(text));
  console.log();
}

export function kv(key: string, value: string | number): void {
  console.log(`  ${chalk.gray(key + ":")} ${value}`);
}
