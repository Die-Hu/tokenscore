---
description: Set up TokenScore as your Claude Code statusline
allowed-tools: Bash, Read, Edit, Write
---

# TokenScore Setup

Pre-built plugin, zero compilation needed.

## Steps

1. Read `~/.claude/settings.json`.

2. Add or update the `statusLine` field using the **stable marketplaces path** (survives version updates):
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node ~/.claude/plugins/marketplaces/tokenscore/packages/plugin/dist/index.js"
     }
   }
   ```
   Preserve all existing settings.

3. Tell the user: "TokenScore is ready. Restart Claude Code to see the statusline."
