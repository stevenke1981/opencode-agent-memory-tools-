---
description: Search the append-only journal for past decisions and discoveries
agent: build
---

Search the journal using `journalSearch`.

Query: $ARGUMENTS (if empty, list recent entries with no text filter)

If results found:
1. Summarize relevant entries
2. Use `journalRead` for full content of the most relevant entry

Journal is global across projects but entries record which project they came from.