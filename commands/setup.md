---
description: Set up TokenScore as your Claude Code statusline
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
---

# TokenScore Setup

Set up the TokenScore statusline plugin. The plugin is **pre-built** — no compilation or npm install needed.

## Steps

1. Find the plugin installation path. Run this to locate it:
   ```bash
   find ~/.claude/plugins/cache/tokenscore -name "index.js" -path "*/plugin/dist/*" 2>/dev/null | head -1
   ```

   If that returns nothing, try the repo checkout location or the current directory:
   ```bash
   ls packages/plugin/dist/index.js 2>/dev/null
   ```

2. Read the user's current `~/.claude/settings.json`.

3. Add or update the `statusLine` field with the **absolute path** to the plugin:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node <ABSOLUTE_PATH_TO>/packages/plugin/dist/index.js"
     }
   }
   ```

   Make sure to preserve all existing settings (env, permissions, enabledPlugins, etc.).

4. Create the config directory:
   ```bash
   node -e "require('fs').mkdirSync(require('path').join(require('os').homedir(),'.claude','plugins','tokenscore'),{recursive:true})"
   ```

5. Tell the user: "TokenScore statusline is ready. Restart Claude Code to see it."

## Important Notes
- The plugin dist/ is **pre-built and committed to the repo** — NO build step needed
- The plugin has **zero native dependencies** — no C++ compiler, no Python, no node-gyp
- Only requires Node.js 20+
- Configuration at `~/.claude/plugins/tokenscore/config.json` (use `/tokenscore:configure`)
