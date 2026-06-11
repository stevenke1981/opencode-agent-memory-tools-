import { type Plugin, tool } from "@opencode-ai/plugin";
import {
  MEMORY_CONFIG_INSTRUCTION,
  MEMORY_TOOLS_GUIDANCE,
  GUIDANCE_MARKER,
  buildCompactContext,
  extractUserText,
  shouldInjectMemoryGuidance,
} from "./opencode-agent-memory-tools-guidance.js";
import {
  buildJournalSystemNote,
  createJournalStore,
  loadConfig,
} from "./opencode-agent-memory-tools-journal.js";
import {
  createMemoryStore,
  getMemoryPaths,
  type MemoryScope,
} from "./opencode-agent-memory-tools-memory.js";
import { renderMemoryBlocks } from "./opencode-agent-memory-tools-prompt.js";

type JournalContext = {
  directory: string;
  model: string;
  provider: string;
};

const scopeSchema = tool.schema.enum(["global", "project"]).optional();
const listScopeSchema = tool.schema.enum(["all", "global", "project"]).optional();

function formatBlockList(
  blocks: Awaited<ReturnType<ReturnType<typeof createMemoryStore>["listBlocks"]>>,
): string {
  if (blocks.length === 0) return "No memory blocks found.";
  return blocks
    .map(
      (b) =>
        `${b.scope}:${b.label}\n  read_only=${b.readOnly} chars=${b.value.length}/${b.limit}\n  ${b.description}`,
    )
    .join("\n\n");
}

export const AgentMemoryToolsPlugin: Plugin = async ({ client, directory }) => {
  const store = createMemoryStore(directory);
  await store.ensureSeed();

  const paths = getMemoryPaths(directory);
  const config = await loadConfig();
  const journalEnabled = config.journal?.enabled !== false;

  const journalCtx: JournalContext = { directory, model: "", provider: "" };
  const journalStore = journalEnabled ? createJournalStore() : null;
  const journalSystemNote = journalEnabled
    ? buildJournalSystemNote(config.journal?.tags)
    : "";

  await client.app.log({
    body: {
      service: "opencode-agent-memory-tools",
      level: "info",
      message: `Memory tools active (journal=${journalEnabled ? "on" : "off"})`,
    },
  });

  return {
    config: async (cfg) => {
      cfg.instructions = cfg.instructions ?? [];
      if (!cfg.instructions.some((i) => typeof i === "string" && i.includes("opencode-agent-memory-tools"))) {
        cfg.instructions.push(MEMORY_CONFIG_INSTRUCTION);
      }
    },

    "chat.message": async (input) => {
      if (input.model) {
        journalCtx.model = input.model.modelID;
        journalCtx.provider = input.model.providerID;
      }
    },

    "experimental.chat.system.transform": async (_input, output) => {
      const blocks = await store.listBlocks("all");
      const xml = renderMemoryBlocks(blocks);
      if (xml) {
        const insertAt = output.system.length > 0 ? 1 : 0;
        output.system.splice(insertAt, 0, xml);
      }
      if (journalSystemNote) output.system.push(journalSystemNote);
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      if (!output.messages.length) return;
      const userText = extractUserText(output.messages);
      if (!shouldInjectMemoryGuidance(userText)) return;

      const firstUser = output.messages.find((m) => m.info.role === "user");
      if (!firstUser?.parts.length) return;
      if (firstUser.parts.some((p) => p.type === "text" && p.text.includes(GUIDANCE_MARKER))) return;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: "text", text: MEMORY_TOOLS_GUIDANCE });
    },

    "experimental.session.compacting": async (_input, output) => {
      output.context.push(buildCompactContext(paths));
    },

    tool: {
      memoryList: tool({
        description: "List memory blocks (labels, sizes, descriptions). Call to see what is stored before assuming context.",
        args: { scope: listScopeSchema },
        async execute(args) {
          const scope = (args.scope ?? "all") as MemoryScope | "all";
          return formatBlockList(await store.listBlocks(scope));
        },
      }),

      memoryGet: tool({
        description: "Read a single memory block by scope and label. Prefer over reading .md files directly.",
        args: {
          label: tool.schema.string().describe("Block label, e.g. human, project, preferences"),
          scope: scopeSchema,
        },
        async execute(args) {
          const scope = (args.scope ?? "project") as MemoryScope;
          const block = await store.getBlock(scope, args.label);
          return [
            `${block.scope}:${block.label}`,
            `chars=${block.value.length}/${block.limit} read_only=${block.readOnly}`,
            block.description,
            "",
            block.value || "(empty)",
          ].join("\n");
        },
      }),

      memorySet: tool({
        description: "Create or fully overwrite a memory block. Use memoryAppend/memoryReplace for partial edits.",
        args: {
          label: tool.schema.string(),
          value: tool.schema.string(),
          scope: scopeSchema,
          description: tool.schema.string().optional(),
          limit: tool.schema.number().int().positive().optional(),
        },
        async execute(args) {
          const scope = (args.scope ?? "project") as MemoryScope;
          await store.setBlock(scope, args.label, args.value, {
            description: args.description,
            limit: args.limit,
          });
          return `Updated ${scope}:${args.label}.`;
        },
      }),

      memoryReplace: tool({
        description: "Replace exact substring in a memory block (surgical edit).",
        args: {
          label: tool.schema.string(),
          oldText: tool.schema.string(),
          newText: tool.schema.string(),
          scope: scopeSchema,
        },
        async execute(args) {
          const scope = (args.scope ?? "project") as MemoryScope;
          await store.replaceInBlock(scope, args.label, args.oldText, args.newText);
          return `Updated ${scope}:${args.label}.`;
        },
      }),

      memoryAppend: tool({
        description: "Append text to a memory block without overwriting. Good for project notes and conventions.",
        args: {
          label: tool.schema.string(),
          text: tool.schema.string(),
          scope: scopeSchema,
        },
        async execute(args) {
          const scope = (args.scope ?? "project") as MemoryScope;
          await store.appendToBlock(scope, args.label, args.text);
          return `Appended to ${scope}:${args.label}.`;
        },
      }),

      memoryRemember: tool({
        description:
          'ChatGPT-style "remember this" — append a dated fact to human (global) or specified block. Call when user asks to remember preferences/facts.',
        args: {
          fact: tool.schema.string().describe("Durable fact to remember (no secrets)"),
          scope: scopeSchema.describe("Default global for user facts"),
          label: tool.schema.string().optional().default("human").describe("Target block label"),
        },
        async execute(args) {
          const scope = (args.scope ?? "global") as MemoryScope;
          const label = args.label ?? "human";
          const line = `- [${new Date().toISOString().slice(0, 10)}] ${args.fact.trim()}`;
          await store.appendToBlock(scope, label, line, "\n");
          return `Remembered in ${scope}:${label}.`;
        },
      }),

      memoryForget: tool({
        description: 'Remove lines containing text from a block. Call when user asks to forget something.',
        args: {
          text: tool.schema.string().describe("Text to find in lines to remove"),
          label: tool.schema.string().optional().default("human"),
          scope: scopeSchema,
        },
        async execute(args) {
          const scope = (args.scope ?? "global") as MemoryScope;
          const label = args.label ?? "human";
          const block = await store.getBlock(scope, label);
          const needle = args.text.toLowerCase();
          const kept = block.value
            .split("\n")
            .filter((line) => !line.toLowerCase().includes(needle));
          if (kept.length === block.value.split("\n").length) {
            return `No lines matched in ${scope}:${label}.`;
          }
          await store.setBlock(scope, label, kept.join("\n").trim());
          return `Removed matching lines from ${scope}:${label}.`;
        },
      }),

      memoryDelete: tool({
        description: "Delete an entire memory block file. Cannot delete read-only blocks.",
        args: {
          label: tool.schema.string(),
          scope: scopeSchema,
        },
        async execute(args) {
          const scope = (args.scope ?? "project") as MemoryScope;
          await store.deleteBlock(scope, args.label);
          return `Deleted ${scope}:${args.label}.`;
        },
      }),

      memorySearch: tool({
        description: "Search memory blocks for text (grep). Use before assuming no prior knowledge exists.",
        args: {
          query: tool.schema.string(),
          scope: listScopeSchema,
        },
        async execute(args) {
          const scope = (args.scope ?? "all") as MemoryScope | "all";
          const hits = await store.searchBlocks(args.query, scope);
          if (hits.length === 0) return `No matches for "${args.query}".`;
          return hits
            .map((h) => `${h.scope}:${h.label}:${h.line} ${h.text}`)
            .join("\n");
        },
      }),

      memoryRecap: tool({
        description: "Quick overview of all memory blocks with truncated previews. Use when user asks what you remember.",
        args: {
          scope: listScopeSchema,
          maxChars: tool.schema.number().optional().default(120),
        },
        async execute(args) {
          const scope = (args.scope ?? "all") as MemoryScope | "all";
          const blocks = await store.listBlocks(scope);
          if (blocks.length === 0) return "No memory stored yet.";
          return blocks
            .map((b) => {
              const preview = b.value
                ? b.value.slice(0, args.maxChars) + (b.value.length > args.maxChars ? "…" : "")
                : "(empty)";
              return `## ${b.scope}:${b.label} (${b.value.length}/${b.limit})\n${preview}`;
            })
            .join("\n\n");
        },
      }),

      ...(journalStore
        ? {
            journalWrite: tool({
              description:
                "Append-only journal entry for decisions, discoveries, gotchas. Like Codex/Claude session notes.",
              args: {
                title: tool.schema.string(),
                body: tool.schema.string(),
                tags: tool.schema.string().optional().describe('Comma-separated, e.g. "perf, debugging"'),
              },
              async execute(args, ctx) {
                const tags = args.tags
                  ?.split(",")
                  .map((t: string) => t.trim())
                  .filter(Boolean);
                const entry = await journalStore.write({
                  title: args.title,
                  body: args.body,
                  project: journalCtx.directory,
                  model: journalCtx.model,
                  provider: journalCtx.provider,
                  agent: ctx.agent,
                  sessionId: ctx.sessionID,
                  tags,
                });
                return `Journal entry: ${entry.id}\n  title: ${entry.title}\n  created: ${entry.created.toISOString()}`;
              },
            }),

            journalRead: tool({
              description: "Read a journal entry by ID from journalSearch results.",
              args: { id: tool.schema.string() },
              async execute(args) {
                const entry = await journalStore.read(args.id);
                const meta = [
                  `title: ${entry.title}`,
                  `created: ${entry.created.toISOString()}`,
                  entry.project ? `project: ${entry.project}` : null,
                  entry.tags.length ? `tags: ${entry.tags.join(", ")}` : null,
                ]
                  .filter(Boolean)
                  .join("\n");
                return `${meta}\n\n${entry.body}`;
              },
            }),

            journalSearch: tool({
              description:
                "Semantic + text search over journal. Call before complex tasks to recall past decisions.",
              args: {
                text: tool.schema.string().optional(),
                project: tool.schema.string().optional(),
                tags: tool.schema.string().optional(),
                limit: tool.schema.number().int().positive().optional(),
                offset: tool.schema.number().int().nonnegative().optional(),
              },
              async execute(args) {
                const tags = args.tags
                  ?.split(",")
                  .map((t: string) => t.trim())
                  .filter(Boolean);
                const result = await journalStore.search({
                  text: args.text,
                  project: args.project ?? journalCtx.directory,
                  tags,
                  limit: args.limit,
                  offset: args.offset,
                });
                if (result.entries.length === 0) {
                  const tagLine = result.allTags.length ? `\nTags: ${result.allTags.join(", ")}` : "";
                  return `No journal entries found.${tagLine}`;
                }
                const offset = args.offset ?? 0;
                const header = `Found ${result.total} (showing ${offset + 1}–${offset + result.entries.length}):`;
                const lines = result.entries.map((e) => {
                  const tagStr = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
                  return `${e.id}\n  ${e.title}${tagStr}\n  ${e.created.toISOString()}`;
                });
                return `${header}\n\n${lines.join("\n\n")}`;
              },
            }),
          }
        : {}),
    },
  };
};

export default AgentMemoryToolsPlugin;