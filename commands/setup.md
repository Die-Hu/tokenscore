---
description: Set up TokenScore as your Claude Code statusline
allowed-tools: Bash, Read, Edit, Write
---

# TokenScore Setup

Pre-built plugin, zero compilation needed.

## Steps

1. Detect the platform and find the plugin path:
   ```bash
   ls "$HOME/.claude/plugins/marketplaces/tokenscore/packages/plugin/dist/index.js" 2>/dev/null || ls "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/cache/tokenscore/tokenscore/"*/packages/plugin/dist/index.js 2>/dev/null | tail -1
   ```

2. Read `~/.claude/settings.json` (on Windows: `%USERPROFILE%\.claude\settings.json`).

3. Add or update the `statusLine` field. Use `$HOME` (not `~`) for cross-platform compatibility:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "bash -c 'exec node \"$HOME/.claude/plugins/marketplaces/tokenscore/packages/plugin/dist/index.js\"'"
     }
   }
   ```
   Preserve all existing settings.

4. Tell the user: "TokenScore is ready. Restart Claude Code to see the statusline."

## Windows Note
Claude Code runs statusLine commands through Git Bash on Windows. The `bash -c` wrapper with `$HOME` works on both macOS/Linux and Windows (Git Bash).
