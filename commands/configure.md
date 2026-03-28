---
description: Configure TokenScore statusline display options
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
---

# TokenScore Configuration

You are helping the user configure their TokenScore statusline display.

## Available Options

The config file is at `~/.claude/plugins/tokenscore/config.json`.

Options:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `showCost` | boolean | true | Show real-time cost calculation |
| `showModel` | boolean | true | Show model name and tier badge |
| `showRateLimit` | boolean | true | Show 5h/7d rate limit bars |
| `showTokenBreakdown` | boolean | true | Show input/output/cache breakdown when context > 50% |
| `showScore` | boolean | true | Show model intelligence score |
| `costWarningThreshold` | number | 5.0 | USD threshold for cost warning color change |

## Steps

1. Read the current config:
   ```bash
   cat ~/.claude/plugins/tokenscore/config.json 2>/dev/null || echo "No config file (using defaults)"
   ```

2. Ask the user what they want to change.

3. Write the updated config:
   ```bash
   cat > ~/.claude/plugins/tokenscore/config.json << 'EOF'
   {
     "showCost": true,
     "showModel": true,
     "showRateLimit": true,
     "showTokenBreakdown": true,
     "showScore": true,
     "costWarningThreshold": 5.0
   }
   EOF
   ```

4. Tell the user the changes will take effect immediately (no restart needed).
