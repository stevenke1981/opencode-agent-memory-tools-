# opencode-agent-memory-tools

Global [OpenCode](https://opencode.ai) plugin wrapping [opencode-agent-memory](https://github.com/joshuadavidthomas/opencode-agent-memory) with **camelCase tools**, **LLM auto-guidance**, and enhancements inspired by **ChatGPT memory**, **Claude Code CLAUDE.md**, and **Codex project context**.

Based on the [opencode-git-tools](https://github.com/stevenke1981/opencode-git-tools) plugin pattern.

## Features

### Memory blocks (Letta-style, editable)

Persistent markdown blocks injected into the system prompt — survive sessions and context compaction.

| Block | Scope | Inspired by |
|-------|-------|-------------|
| `persona` | global | Agent behavior |
| `human` | global | ChatGPT user memory |
| `preferences` | global | Coding/tool preferences |
| `project` | project | CLAUDE.md / AGENTS.md |
| `conventions` | project | Discovered team rules |

### Tools (13 total)

| Tool | Description |
|------|-------------|
| `memoryList` | List all blocks |
| `memoryGet` | Read one block (**new**) |
| `memorySet` | Full overwrite |
| `memoryReplace` | Substring replace |
| `memoryAppend` | Append text (**new**) |
| `memoryRemember` | ChatGPT-style "remember this" (**new**) |
| `memoryForget` | Remove matching lines (**new**) |
| `memoryDelete` | Delete a block (**new**) |
| `memorySearch` | Grep across blocks (**new**) |
| `memoryRecap` | Quick overview (**new**) |
| `journalWrite` | Append-only session diary |
| `journalRead` | Read entry by ID |
| `journalSearch` | Semantic search (local embeddings) |

### LLM guidance (4 layers)

1. `config.instructions` — when to use / skip memory tools
2. System prompt — memory blocks always in context
3. Intent detection — injects full guide on "remember", "recall", etc.
4. `session.compacting` — workflow survives compression

## Requirements

- [OpenCode](https://opencode.ai/) v1.0.115+
- Node.js (for global plugin dependencies)

## Install

```bash
git clone https://github.com/stevenke1981/opencode-agent-memory-tools.git
cd opencode-agent-memory-tools
```

**Windows:**

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

**macOS / Linux:**

```bash
bash install.sh
```

Restart OpenCode after install. First run seeds default memory blocks.

## Verify

```bash
opencode run "call memoryList and show the result"
```

## Usage examples

### Remember a user preference (ChatGPT-style)

```
memoryRemember({ fact: "Prefers pnpm and TypeScript strict mode" })
```

### Save project knowledge (Claude Code-style)

```
memoryAppend({
  scope: "project",
  label: "project",
  text: "Build: pnpm build. Tests: pnpm test. Routes in src/routes/"
})
```

### Recall before work

```
memorySearch({ query: "build command" })
journalSearch({ text: "auth refactor" })
```

### Journal a decision

```
journalWrite({
  title: "Chose SQLite over Postgres for local dev",
  body: "Simpler setup; prod uses Postgres anyway.",
  tags: "decision, architecture"
})
```

## Configuration

`~/.config/opencode/agent-memory.json` (created on install):

```json
{
  "journal": {
    "enabled": true,
    "tags": [
      { "name": "decision", "description": "Architecture decisions" },
      { "name": "debugging", "description": "Debug findings" }
    ]
  }
}
```

Set `"journal.enabled": false` to disable journal tools.

## Slash commands

| Command | Description |
|---------|-------------|
| `/memory-guide` | Load when/how-to-use guide |
| `/memory-remember <fact>` | ChatGPT-style remember |
| `/memory-recap` | Show all stored memory |
| `/journal-search <query>` | Search past session notes |

## Storage locations

| Data | Path |
|------|------|
| Global memory | `~/.config/opencode/memory/*.md` |
| Project memory | `.opencode/memory/*.md` |
| Journal | `~/.config/opencode/journal/*.md` |
| Config | `~/.config/opencode/agent-memory.json` |

## Project structure

```
opencode-agent-memory-tools/
├── src/
│   ├── index.ts                              # Plugin entry
│   ├── opencode-agent-memory-tools-guidance.ts
│   ├── opencode-agent-memory-tools-memory.ts
│   ├── opencode-agent-memory-tools-journal.ts
│   └── ...
├── commands/
├── docs/LLM_USAGE.md
└── scripts/install-global.mjs
```

## Credits

- [opencode-agent-memory](https://github.com/joshuadavidthomas/opencode-agent-memory) by Josh Thomas (MIT)
- Memory architecture from [Letta](https://github.com/letta-ai/letta)
- Patterns from ChatGPT memory, Claude Code, OpenAI Codex

## License

MIT