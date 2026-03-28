import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig, getConfigPath, DEFAULT_CONFIG } from "@tokenscore/core";
import { header, kv } from "../helpers.js";

export function registerConfigCommand(program: Command): void {
  const cmd = program
    .command("config")
    .description("Manage TokenScore configuration");

  cmd
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const config = loadConfig();
      header("TokenScore Configuration");
      kv("Config file", getConfigPath());
      console.log();
      console.log(JSON.stringify(config, null, 2));
      console.log();
    });

  cmd
    .command("set <key> <value>")
    .description("Set a configuration value (dot-notation)")
    .action((key: string, value: string) => {
      const config = loadConfig() as Record<string, unknown>;

      // Parse dot-notation path
      const parts = key.split(".");
      let current = config;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }

      // Auto-parse numbers
      const lastKey = parts[parts.length - 1];
      const numVal = Number(value);
      current[lastKey] = isNaN(numVal) ? value : numVal;

      saveConfig(config);
      console.log(chalk.green(`Set ${key} = ${value}`));
    });

  cmd
    .command("reset")
    .description("Reset to default configuration")
    .action(() => {
      saveConfig(DEFAULT_CONFIG);
      console.log(chalk.green("Configuration reset to defaults."));
    });

  // Default action: show config
  cmd.action(() => {
    const config = loadConfig();
    header("TokenScore Configuration");
    kv("Config file", getConfigPath());
    console.log();
    console.log(JSON.stringify(config, null, 2));
    console.log();
  });
}
