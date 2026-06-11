/**
 * Memory framing adapted from Letta + patterns from ChatGPT memory and Claude Code CLAUDE.md.
 * @see https://github.com/joshuadavidthomas/opencode-agent-memory
 * @see https://github.com/letta-ai/letta
 */

export const MEMORY_INSTRUCTIONS = `<memory_instructions>
<memory_editing>
You have persistent, self-editable memory blocks that survive across sessions and context compaction.
Treat memory like ChatGPT's saved facts + Claude Code's project notes: concise, durable, high-signal.
</memory_editing>

<memory_tools>
Prefer memory* plugin tools over editing markdown files directly or bash.
- memoryRemember: ChatGPT-style "remember this about me/the project"
- memoryGet / memoryList: read before assuming context
- memorySet: full overwrite; memoryReplace / memoryAppend: surgical edits
- memorySearch: find facts across blocks; memoryRecap: quick overview
- journalWrite / journalSearch: append-only session insights (like a dev diary)
</memory_tools>

<core_memory>
Memory blocks appear in your system prompt. Each block has label, description, value, limit, scope.
Scopes:
- global: user preferences, persona, cross-project facts (like ChatGPT memory)
- project: codebase conventions, commands, architecture (like CLAUDE.md / AGENTS.md)
</core_memory>

<when_to_update>
Update memory when you learn durable facts: user preferences, conventions, commands, gotchas, decisions.
Do NOT store: secrets/passwords/tokens, ephemeral debug output, full file contents, chat transcripts.
After completing a significant task, consider journaling key decisions via journalWrite.
</when_to_update>
</memory_instructions>`;

export const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  persona:
    "How the agent should behave and respond. Communication style, expertise level, workflow preferences.",
  human:
    "Facts about the user (ChatGPT-style memory): preferences, habits, constraints, name, timezone, tools they use.",
  project:
    "Project-specific knowledge (Claude Code / AGENTS.md style): build commands, architecture, conventions, gotchas.",
  preferences:
    "User coding preferences: formatting, test style, commit conventions, preferred libraries.",
  conventions:
    "Team/project conventions discovered during work: naming, patterns, review rules.",
};

export function getDefaultDescription(label: string): string {
  return DEFAULT_DESCRIPTIONS[label] ?? "Durable memory block. Keep concise and high-signal.";
}