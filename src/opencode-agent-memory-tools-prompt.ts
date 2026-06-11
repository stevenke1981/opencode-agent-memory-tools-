import type { MemoryBlock } from "./opencode-agent-memory-tools-memory.js";
import { MEMORY_INSTRUCTIONS } from "./opencode-agent-memory-tools-letta.js";

const LINE_NUMBER_WARNING =
  "# NOTE: Line numbers (1→) are editing aids. Do NOT include line prefixes in memory tool calls.";

function renderMemoryMetadata(blocks: MemoryBlock[]): string {
  const now = new Date();
  const lastModified = blocks.reduce(
    (latest, block) => (block.lastModified > latest ? block.lastModified : latest),
    new Date(0),
  );

  return `<memory_metadata>
- current_date: ${now.toISOString()}
- blocks_last_modified: ${lastModified.toISOString()}
- tools: memoryList, memoryGet, memorySet, memoryReplace, memoryAppend, memoryRemember, memoryForget, memorySearch, memoryRecap, journalWrite, journalSearch
</memory_metadata>`;
}

export function renderMemoryBlocks(blocks: MemoryBlock[]): string {
  if (blocks.length === 0) return "";

  const parts: string[] = [
    MEMORY_INSTRUCTIONS,
    "",
    "<memory_blocks>",
    "Active memory blocks:",
    "",
  ];

  for (const block of blocks) {
    const desc = block.description
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    const numberedValue = block.value
      ? block.value.split("\n").map((line, i) => `${i + 1}→ ${line}`).join("\n")
      : "";

    parts.push(`<${block.label}>
<description>${desc}</description>
<metadata>
- chars_current=${block.value.length}
- chars_limit=${block.limit}
- read_only=${block.readOnly}
- scope=${block.scope}
</metadata>
<warning>${LINE_NUMBER_WARNING}</warning>
<value>
${numberedValue}
</value>
</${block.label}>`);
  }

  parts.push("</memory_blocks>", "", renderMemoryMetadata(blocks));
  return parts.join("\n");
}