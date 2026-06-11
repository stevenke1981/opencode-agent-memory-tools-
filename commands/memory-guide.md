---
description: Load memory tool usage guide — when and how to use memory* and journal* tools
agent: build
---

Follow the memory plugin decision rules. Use **memory* and journal* tools only** (never bash-edit markdown memory files).

## Should I use memory tools?

**YES** when:
- User says remember / forget / recall
- Saving preferences, conventions, build commands
- Before assuming prior context exists
- After significant decisions (journal)

**NO** when:
- Storing secrets, tokens, passwords
- Reading local source files
- Ephemeral one-off context

## Workflow

1. `memoryRecap` or `memoryList` — see what's stored
2. `memoryRemember` — if user asks to remember something ($ARGUMENTS)
3. `memoryGet` / `memorySearch` — recall specific facts
4. `journalSearch` — find past session notes before complex work
5. `journalWrite` — log decisions after completing tasks

See docs/LLM_USAGE.md for full reference.