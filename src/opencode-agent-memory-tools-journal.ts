import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import {
  cosineSimilarity,
  generateEmbedding,
} from "./opencode-agent-memory-tools-embeddings.js";
import {
  atomicWriteFile,
  buildFrontmatterDocument,
  splitFrontmatter,
} from "./opencode-agent-memory-tools-frontmatter.js";

const TagSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().min(1),
});

const ConfigSchema = z.looseObject({
  journal: z
    .looseObject({
      enabled: z.boolean().optional(),
      tags: z.array(TagSchema).optional(),
    })
    .optional(),
});

export type AgentMemoryConfig = z.infer<typeof ConfigSchema>;
export type JournalTag = { name: string; description: string };

export async function loadConfig(configDir?: string): Promise<AgentMemoryConfig> {
  const dir = configDir ?? path.join(os.homedir(), ".config", "opencode");
  const configPath = path.join(dir, "agent-memory.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = ConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { journal: { enabled: true } };
    const config = parsed.data;
    if (config.journal?.enabled === undefined) {
      config.journal = { ...config.journal, enabled: true };
    }
    return config;
  } catch {
    return { journal: { enabled: true } };
  }
}

const EntryFrontmatterSchema = z.looseObject({
  title: z.string().min(1),
  project: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  agent: z.string().optional(),
  session_id: z.string().optional(),
  created: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
});

export type JournalEntry = {
  id: string;
  title: string;
  project: string;
  model: string;
  provider: string;
  agent: string;
  sessionId: string;
  created: Date;
  tags: string[];
  body: string;
  filePath: string;
};

function entryFilename(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return [
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    "-",
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`,
    "-",
    `${pad(date.getUTCMilliseconds(), 3)}`,
    ".md",
  ].join("");
}

function embeddingPath(entryPath: string): string {
  return entryPath.replace(/\.md$/, ".embedding");
}

async function readEntryFile(filePath: string): Promise<JournalEntry> {
  const raw = await fs.readFile(filePath, "utf-8");
  const { frontmatterText, body } = splitFrontmatter(raw);
  if (!frontmatterText) throw new Error(`Journal entry missing frontmatter: ${filePath}`);

  const parsed = EntryFrontmatterSchema.safeParse(yaml.load(frontmatterText));
  if (!parsed.success) {
    throw new Error(`Invalid journal frontmatter: ${parsed.error.message}`);
  }

  const fm = parsed.data;
  return {
    id: path.basename(filePath, ".md"),
    title: fm.title,
    project: fm.project ?? "",
    model: fm.model ?? "",
    provider: fm.provider ?? "",
    agent: fm.agent ?? "",
    sessionId: fm.session_id ?? "",
    created: fm.created ? new Date(fm.created) : new Date(),
    tags: fm.tags ?? [],
    body: body.trim(),
    filePath,
  };
}

async function loadEmbedding(entryPath: string): Promise<number[] | undefined> {
  try {
    return JSON.parse(await fs.readFile(embeddingPath(entryPath), "utf-8")) as number[];
  } catch {
    return undefined;
  }
}

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function validateId(id: string): string {
  const trimmed = id.trim();
  if (!SAFE_ID.test(trimmed)) throw new Error(`Invalid journal entry ID: "${id}"`);
  return trimmed;
}

export type JournalStore = {
  write(entry: {
    title: string;
    body: string;
    project?: string;
    model?: string;
    provider?: string;
    agent?: string;
    sessionId?: string;
    tags?: string[];
  }): Promise<JournalEntry>;
  read(id: string): Promise<JournalEntry>;
  search(query: {
    text?: string;
    project?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ entries: JournalEntry[]; total: number; allTags: string[] }>;
};

export function createJournalStore(configDir?: string): JournalStore {
  const journalDir = path.join(
    configDir ?? path.join(os.homedir(), ".config", "opencode"),
    "journal",
  );

  return {
    async write(entry) {
      await fs.mkdir(journalDir, { recursive: true });
      const created = new Date();
      const filePath = path.join(journalDir, entryFilename(created));

      const frontmatter: Record<string, unknown> = {
        title: entry.title,
        created: created.toISOString(),
      };
      if (entry.project) frontmatter.project = entry.project;
      if (entry.model) frontmatter.model = entry.model;
      if (entry.provider) frontmatter.provider = entry.provider;
      if (entry.agent) frontmatter.agent = entry.agent;
      if (entry.sessionId) frontmatter.session_id = entry.sessionId;
      if (entry.tags?.length) frontmatter.tags = entry.tags;

      await atomicWriteFile(filePath, buildFrontmatterDocument(frontmatter, entry.body));

      try {
        const embedding = await generateEmbedding(`${entry.title}\n${entry.body}`);
        await fs.writeFile(embeddingPath(filePath), JSON.stringify(embedding), "utf-8");
      } catch {
        // text search fallback remains available
      }

      return {
        id: path.basename(filePath, ".md"),
        title: entry.title,
        project: entry.project ?? "",
        model: entry.model ?? "",
        provider: entry.provider ?? "",
        agent: entry.agent ?? "",
        sessionId: entry.sessionId ?? "",
        created,
        tags: entry.tags ?? [],
        body: entry.body,
        filePath,
      };
    },

    async read(id) {
      const safeId = validateId(id);
      const filePath = path.join(journalDir, `${safeId}.md`);
      if (!(await fs.access(filePath).then(() => true).catch(() => false))) {
        throw new Error(`Journal entry not found: ${safeId}`);
      }
      return readEntryFile(filePath);
    },

    async search(query) {
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
      const offset = Math.max(query.offset ?? 0, 0);
      let scored: { entry: JournalEntry; score: number }[] = [];

      let files: string[];
      try {
        const dirEntries = await fs.readdir(journalDir, { withFileTypes: true });
        files = dirEntries
          .filter((e) => e.isFile() && e.name.endsWith(".md"))
          .map((e) => e.name)
          .sort()
          .reverse();
      } catch {
        return { entries: [], total: 0, allTags: [] };
      }

      let queryEmbedding: number[] | undefined;
      if (query.text) {
        try {
          queryEmbedding = await generateEmbedding(query.text);
        } catch {
          // fallback to text
        }
      }

      const tagSet = new Set<string>();

      for (const file of files) {
        const filePath = path.join(journalDir, file);
        let entry: JournalEntry;
        try {
          entry = await readEntryFile(filePath);
        } catch {
          continue;
        }

        for (const tag of entry.tags) tagSet.add(tag);
        if (query.project && entry.project !== query.project) continue;
        if (query.tags?.length) {
          const entryTags = entry.tags.map((t) => t.toLowerCase());
          if (!query.tags.every((t) => entryTags.includes(t.toLowerCase()))) continue;
        }

        let score = 0;
        if (query.text) {
          if (queryEmbedding) {
            const emb = await loadEmbedding(filePath);
            score = emb ? cosineSimilarity(queryEmbedding, emb) : 0;
            if (score <= 0) {
              const hay = `${entry.title}\n${entry.body}`.toLowerCase();
              score = hay.includes(query.text.toLowerCase()) ? 0.5 : 0;
            }
          } else {
            const hay = `${entry.title}\n${entry.body}`.toLowerCase();
            score = hay.includes(query.text.toLowerCase()) ? 1 : 0;
          }
          if (score <= 0) continue;
        } else {
          score = entry.created.getTime();
        }

        scored.push({ entry, score });
      }

      const total = scored.length;
      scored.sort((a, b) => b.score - a.score);
      scored = scored.slice(offset, offset + limit);

      return {
        entries: scored.map((s) => s.entry),
        total,
        allTags: Array.from(tagSet).sort(),
      };
    },
  };
}

export function buildJournalSystemNote(tags?: readonly JournalTag[]): string {
  const tagSection =
    tags?.length
      ? `\nSuggested tags:\n${tags.map((t) => `- ${t.name}: ${t.description}`).join("\n")}`
      : "";

  return `<journal_instructions>
Append-only dev journal (Claude Code / Codex session notes style). Record decisions, discoveries, gotchas.
Use journalSearch before complex tasks to recall past context. journalWrite after significant work.${tagSection}
</journal_instructions>`;
}