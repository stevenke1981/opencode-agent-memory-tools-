---
description: Show what the agent remembers across memory blocks
agent: build
---

Call `memoryRecap` (scope all unless $ARGUMENTS specifies global or project).

Summarize for the user:
- What is stored in persona, human, preferences (global)
- What is stored in project, conventions (project scope)
- Suggest updates if blocks are empty or stale

Do not read memory .md files directly — use memory* tools.