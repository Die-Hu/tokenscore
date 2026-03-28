---
description: Set up TokenScore as your Claude Code statusline
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
---

# TokenScore Setup

You are helping the user set up the TokenScore statusline plugin for Claude Code.

## Steps

1. Detect the OS and runtime:
   ```bash
   node --version
   ```
   Also check if this is Windows (look for `USERPROFILE` env) or macOS/Linux (look for `HOME` env).

2. Find the plugin path. Check in order:
   - `~/.claude/plugins/cache/` (marketplace install on macOS/Linux)
   - `%USERPROFILE%\.claude\plugins\cache\` (marketplace install on Windows)
   - The current working directory if running from source

3. Build the plugin if `packages/plugin/dist/index.js` does not exist:
   ```bash
   cd <plugin-path> && npm run build
   ```

4. Read the user's current settings:
   - macOS/Linux: `~/.claude/settings.json`
   - Windows: `%USERPROFILE%\.claude\settings.json`

5. Add the statusLine to settings.json. Use the full absolute path to avoid resolution issues:

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node <ABSOLUTE_PATH>/packages/plugin/dist/index.js"
     }
   }
   ```

   **Important:** On Windows, escape backslashes in the path or use forward slashes.

6. Create the config and data directories:
   - macOS/Linux: `mkdir -p ~/.claude/plugins/tokenscore && mkdir -p ~/.tokenscore`
   - Windows: Use `node -e "require('fs').mkdirSync(require('path').join(require('os').homedir(),'.claude','plugins','tokenscore'),{recursive:true})"` and similar for `.tokenscore`

7. Confirm setup is complete. The statusline will appear after restarting Claude Code.

## Prerequisites
- **Node.js 20+** is required
- The CLI tool (`@tokenscore/cli`) additionally requires C++ build tools for SQLite:
  - **macOS**: `xcode-select --install`
  - **Windows**: Visual Studio Build Tools with "Desktop development with C++" workload
  - **Linux**: `build-essential` package
- The **statusline plugin does NOT require** any native build tools (zero native dependencies)

## Notes
- Configuration: `~/.claude/plugins/tokenscore/config.json`
- Use `/tokenscore:configure` to customize display options
- The plugin is invoked every ~300ms by Claude Code and must respond within that window
