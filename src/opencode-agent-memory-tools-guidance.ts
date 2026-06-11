export const GUIDANCE_MARKER = "<AGENT_MEMORY_PLUGIN>";

export const MEMORY_CONFIG_INSTRUCTION = `opencode-agent-memory-tools decision rules:
USE memory* tools when: user says remember/forget/recall, saving preferences, updating project conventions, before assuming past context, after significant decisions.
USE journal* when: capturing session insights, debugging findings, architecture decisions (append-only diary).
DO NOT store secrets/tokens/passwords. DO NOT use bash to edit ~/.config/opencode/memory/*.md — use memory* tools.
Blocks: global (ChatGPT-style user facts) + project (CLAUDE.md-style codebase notes). Flow: memoryList → memoryGet → memorySet/memoryRemember → journalWrite.`;

export const MEMORY_TOOLS_GUIDANCE = `${GUIDANCE_MARKER}
# Persistent Memory Tools (opencode-agent-memory-tools)

Letta-style editable memory + append-only journal. Inspired by **ChatGPT memory**, **Claude Code CLAUDE.md**, and **Codex project context**.

---

## 1. When to USE memory tools

| Signal | Example | Tool |
|--------|---------|------|
| User says "remember" | "remember I prefer pnpm" | memoryRemember |
| User says "forget" | "forget my old email" | memoryForget |
| Recall past facts | "what do you know about me?" | memoryRecap, memoryGet |
| Update project notes | "save build command" | memoryAppend / memorySet on project:project |
| Before complex work | need prior conventions | memoryList, memorySearch, journalSearch |
| After big task | capture decision | journalWrite |
| User preferences | coding style, tools | memoryRemember → global:human or preferences |

**Session start (optional):** memoryRecap or memoryList
**After learning durable fact:** memoryRemember or memoryAppend
**After significant work:** journalWrite

---

## 2. When NOT to use

| Situation | Use instead |
|-----------|-------------|
| Secrets / API keys | Never store in memory |
| Full file contents | Read tool |
| Ephemeral debug logs | Don't persist |
| One-off chat context | Normal conversation |
| Git operations | git* tools |

---

## 3. Memory blocks (scopes)

| Block | Scope | Purpose (like…) |
|-------|-------|-----------------|
| persona | global | Agent behavior style |
| human | global | ChatGPT memory — user facts |
| preferences | global | Coding/tool preferences |
| project | project | CLAUDE.md — codebase knowledge |
| conventions | project | Discovered patterns/rules |

Locations:
- Global: ~/.config/opencode/memory/*.md
- Project: .opencode/memory/*.md (gitignored)

---

## 4. Tool reference

| Tool | When | Key args |
|------|------|----------|
| memoryList | See all blocks | scope: all/global/project |
| memoryGet | Read one block | scope, label |
| memorySet | Full overwrite | scope, label, value |
| memoryReplace | Surgical edit | scope, label, oldText, newText |
| memoryAppend | Add text | scope, label, text |
| memoryRemember | ChatGPT "remember X" | fact, scope?, label? |
| memoryForget | Remove matching lines | scope, label, text |
| memoryDelete | Delete entire block | scope, label |
| memorySearch | Grep across blocks | query, scope? |
| memoryRecap | Quick overview | scope?, maxChars? |
| journalWrite | Log decision/insight | title, body, tags? |
| journalSearch | Semantic recall | text?, project?, tags? |
| journalRead | Read entry by ID | id |

---

## 5. Call examples

### Remember user preference (ChatGPT-style)
\`\`\`
memoryRemember({ fact: "Prefers TypeScript strict mode and pnpm over npm" })
\`\`\`

### Save project convention (Claude Code-style)
\`\`\`
memoryAppend({
  scope: "project",
  label: "project",
  text: "Build: pnpm build. Test: pnpm test. API routes in src/routes/"
})
\`\`\`

### Recall before work
\`\`\`
memorySearch({ query: "test command" })
journalSearch({ text: "authentication refactor", project: "<cwd>" })
\`\`\`

### Journal a decision
\`\`\`
journalWrite({
  title: "Chose Zod over Yup for validation",
  body: "Zod already in deps; better TS inference.",
  tags: "architecture, decision"
})
\`\`\`

</AGENT_MEMORY_PLUGIN>`;

export function buildCompactContext(paths: {
  global: string;
  project: string;
  journal: string;
}): string {
  return `
## Memory Tools (opencode-agent-memory-tools)
Use memoryRemember for "remember X"; memoryGet/memoryRecap to recall; journalWrite after decisions.
Global: ${paths.global} | Project: ${paths.project} | Journal: ${paths.journal}
Never store secrets. Prefer memory* tools over editing .md files directly.
`.trim();
}

const MEMORY_INTENT_PATTERNS = [
  /\b(remember|memorize|memorise|don't forget|keep in mind|記住|記得|記憶)\b/i,
  /\b(forget|remove from memory|刪除記憶|忘記)\b/i,
  /\b(what do you (know|remember)|recall|之前說過|你記得)\b/i,
  /\b(memory|journal|偏好|preference|convention)\b/i,
  /\b(memoryList|memoryGet|memoryRemember|memoryRecap|journalWrite|journalSearch)\b/,
  /\b(save this|store this|update (your )?memory|CLAUDE\.md|AGENTS\.md)\b/i,
];

export function shouldInjectMemoryGuidance(text: string): boolean {
  return MEMORY_INTENT_PATTERNS.some((p) => p.test(text.slice(0, 4000)));
}

export function extractUserText(
  messages: Array<{ info: { role: string }; parts: Array<{ type: string; text?: string }> }>,
): string {
  const users = messages.filter((m) => m.info.role === "user");
  const last = users[users.length - 1];
  if (!last) return "";
  return last.parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n");
}