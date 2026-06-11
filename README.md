# opencode-agent-memory-tools

[![OpenCode Plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai/docs/plugins/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Persistent, self-editable **memory blocks** and an append-only **journal** for [OpenCode](https://opencode.ai) — packaged as typed `memory*` / `journal*` plugin tools with LLM auto-guidance.

Wraps and extends [opencode-agent-memory](https://github.com/joshuadavidthomas/opencode-agent-memory) (Letta-style blocks), with patterns from **ChatGPT memory**, **Claude Code CLAUDE.md**, and **Codex project context**.

Repository: https://github.com/stevenke1981/opencode-agent-memory-tools-

---

## For humans — quick start

### What it does

- **Memory blocks** — markdown files the agent can read and edit across sessions (survives context compaction)
- **Journal** — append-only diary with local semantic search for decisions and discoveries
- **Plugin tools** — AI uses `memoryRemember`, `memoryGet`, `journalWrite`, etc. instead of bash-editing files
- **Auto-guidance** — plugin tells the LLM when to use memory tools (on "remember", "recall", etc.)

### Requirements

- [OpenCode](https://opencode.ai/) v1.0.115+
- Node.js (installer pulls plugin dependencies into `~/.config/opencode/`)

### Install

```bash
git clone https://github.com/stevenke1981/opencode-agent-memory-tools-.git
cd opencode-agent-memory-tools-
```

**Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

**macOS / Linux:**

```bash
bash install.sh
```

Restart OpenCode. First run seeds default memory blocks.

### Verify

```bash
opencode run "call memoryList and show the result"
```

### Slash commands

| Command | What it does |
|---------|--------------|
| `/memory-guide` | Load full when/how-to guide for the agent |
| `/memory-remember <fact>` | ChatGPT-style "remember this" |
| `/memory-recap` | Show everything stored in memory blocks |
| `/journal-search <query>` | Search past session notes |

### Where data lives

| Data | Path |
|------|------|
| Global memory (user prefs, persona) | `~/.config/opencode/memory/*.md` |
| Project memory (codebase notes) | `.opencode/memory/*.md` (gitignored) |
| Journal entries | `~/.config/opencode/journal/*.md` |
| Config | `~/.config/opencode/agent-memory.json` |

### Configuration

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

### Default memory blocks

| Block | Scope | Purpose |
|-------|-------|---------|
| `persona` | global | How the agent behaves |
| `human` | global | Facts about the user (ChatGPT-style) |
| `preferences` | global | Coding/tool preferences |
| `project` | project | Build commands, architecture (CLAUDE.md-style) |
| `conventions` | project | Discovered team/project rules |

### Credits

- [opencode-agent-memory](https://github.com/joshuadavidthomas/opencode-agent-memory) by Josh Thomas (MIT)
- Memory architecture from [Letta](https://github.com/letta-ai/letta)
- Plugin pattern from [opencode-git-tools](https://github.com/stevenke1981/opencode-git-tools)

### License

MIT

---

## For AI agents — operating instructions

<!-- AGENT_README: opencode-agent-memory-tools v1.0 -->

You have **memory\*** and **journal\*** plugin tools. **Prefer them** over editing `~/.config/opencode/memory/*.md` directly, over bash, or over stuffing facts into chat context.

### Decision: when to USE memory tools

Use memory tools if **any** of these is true:

| Signal | Tool |
|--------|------|
| User says "remember" / "記住" | `memoryRemember` |
| User says "forget" / "忘記" | `memoryForget` |
| User asks what you remember | `memoryRecap` |
| Need a specific stored fact | `memoryGet`, `memorySearch` |
| Save project convention / build cmd | `memoryAppend` on `scope: "project"` |
| Before complex task — recall history | `journalSearch`, `memorySearch` |
| After significant decision | `journalWrite` |

**Optional session start:** `memoryRecap` or `memoryList`
**After learning durable fact:** `memoryRemember` or `memoryAppend`

### Decision: when NOT to use

| Situation | Use instead |
|-----------|-------------|
| Passwords, API keys, tokens | Never store — refuse politely |
| Full file contents | `Read` / `Grep` |
| Ephemeral debug output | Do not persist |
| Git / shell / file edits | Other plugin tools |
| User did not ask for persistence | Skip memory write |

### Standard workflow

```
memoryList / memoryRecap
  → memoryGet / memorySearch / journalSearch   (recall)
  → memoryRemember / memoryAppend / memorySet  (update)
  → journalWrite                               (after big decisions)
```

### Tool reference

| Tool | When | Key args |
|------|------|----------|
| `memoryList` | See all blocks | `scope`: all / global / project |
| `memoryGet` | Read one block | `label`, `scope` |
| `memorySet` | Full overwrite | `label`, `value`, `scope` |
| `memoryReplace` | Surgical edit | `label`, `oldText`, `newText` |
| `memoryAppend` | Add without overwrite | `label`, `text`, `scope` |
| `memoryRemember` | "Remember X" | `fact`; default `global:human` |
| `memoryForget` | Remove lines | `text`, `label`, `scope` |
| `memoryDelete` | Delete block | `label`, `scope` |
| `memorySearch` | Grep blocks | `query`, `scope` |
| `memoryRecap` | Quick overview | `scope`, `maxChars` |
| `journalWrite` | Log decision | `title`, `body`, `tags` |
| `journalRead` | Read by ID | `id` |
| `journalSearch` | Semantic recall | `text`, `project`, `tags` |

**Scopes:**
- `global` — user prefs, persona (like ChatGPT memory)
- `project` — codebase notes (like CLAUDE.md); default for `memorySet`/`memoryAppend`

### Call examples

```javascript
// ChatGPT-style remember
memoryRemember({ fact: "User prefers pnpm and TypeScript strict mode" })

// Claude Code-style project note
memoryAppend({
  scope: "project",
  label: "project",
  text: "Build: pnpm build. Test: pnpm test. API routes in src/routes/"
})

// Recall before work
memorySearch({ query: "test command" })
journalSearch({ text: "authentication refactor" })

// Journal a decision
journalWrite({
  title: "Chose Zod over Yup",
  body: "Zod already in deps; better TS inference.",
  tags: "decision, architecture"
})
```

### Memory block map

| Block | Scope | Store here |
|-------|-------|------------|
| `persona` | global | Agent tone, expertise, workflow |
| `human` | global | User name, habits, constraints |
| `preferences` | global | Formatting, libs, commit style |
| `project` | project | Commands, architecture, gotchas |
| `conventions` | project | Naming, patterns, review rules |

### Plugin guidance layers (already active)

1. **System prompt** — memory block contents injected automatically
2. **config.instructions** — short decision rules every session
3. **Intent detection** — full guide injected on remember/recall keywords
4. **session.compacting** — workflow summary after context compression
5. **`/memory-guide`** — user can force-load this guide

### Rules

- Keep blocks **concise and high-signal** — not transcripts or file dumps
- Re-read with `memoryGet` before assuming context; blocks may have changed
- Journal is **append-only** — never edit old entries
- Never store secrets in memory or journal

<!-- END_AGENT_README -->

---

## More documentation

- [docs/LLM_USAGE.md](docs/LLM_USAGE.md) — extended LLM guide (中文)
- [agent-memory.json.example](agent-memory.json.example) — config template
- [opencode.json.example](opencode.json.example) — OpenCode plugin registration