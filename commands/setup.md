---
description: Set up TokenScore as your Claude Code statusline
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
---

# TokenScore Setup

You are helping the user set up the TokenScore statusline plugin for Claude Code.

## Steps

1. First, detect the user's runtime (Node.js or Bun):
   ```bash
   node --version 2>/dev/null || echo "no-node"
   bun --version 2>/dev/null || echo "no-bun"
   ```

2. Find the plugin installation path. Check these locations in order:
   - `~/.claude/plugins/cache/` (marketplace install)
   - The current directory if this is a local install

3. Build the plugin if not already built:
   ```bash
   cd <plugin-path>/packages/plugin && npm run build 2>/dev/null || pnpm build 2>/dev/null
   ```

4. Read the user's current settings.json:
   ```bash
   cat ~/.claude/settings.json 2>/dev/null || echo "{}"
   ```

5. Add the statusLine configuration to `~/.claude/settings.json`. Use the correct runtime:

   For Node.js:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node <plugin-path>/packages/plugin/dist/index.js"
     }
   }
   ```

   For Bun (preferred, faster):
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "bun <plugin-path>/packages/plugin/src/index.ts"
     }
   }
   ```

6. Create the config directory:
   ```bash
   mkdir -p ~/.claude/plugins/tokenscore
   ```

7. Create the initial TokenScore data directory:
   ```bash
   mkdir -p ~/.tokenscore
   ```

8. Confirm to the user that TokenScore is set up. They should see the statusline after restarting Claude Code.

## Notes
- The statusline shows: model tier, context usage, token cost, cache efficiency, and rate limits
- Configuration is stored at `~/.claude/plugins/tokenscore/config.json`
- Use `/tokenscore:configure` to customize the display
