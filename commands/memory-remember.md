---
description: Remember a fact using memoryRemember (ChatGPT-style memory)
agent: build
---

The user wants you to remember: **$ARGUMENTS**

1. Call `memoryRemember` with the fact from $ARGUMENTS (or ask if empty)
2. Confirm what was stored and in which block (default: global:human)
3. Do NOT store secrets, passwords, or API keys

If the fact is project-specific (build commands, architecture), use:
- `scope: "project"` and `label: "project"` or `"conventions"`