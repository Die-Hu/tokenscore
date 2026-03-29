---
description: Set up TokenScore as your Claude Code statusline
allowed-tools: Bash, Read, Edit, Write
---

# TokenScore Setup

Set up the TokenScore statusline plugin. The plugin is **pre-built** — no compilation or npm install needed.

## Steps

1. Find the plugin path:
   ```bash
   find ~/.claude/plugins -name "index.js" -path "*/tokenscore*/plugin/dist/*" 2>/dev/null | head -1
   ```

2. Read `~/.claude/settings.json`.

3. Add or update the `statusLine` field using the **absolute path** found in step 1:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node <ABSOLUTE_PATH>/packages/plugin/dist/index.js"
     }
   }
   ```
   Preserve all existing settings.

4. Tell the user: "TokenScore is ready. Restart Claude Code to see the statusline."

## Notes
- Pre-built, zero native dependencies, only requires Node.js 20+
- Works with default configuration out of the box
