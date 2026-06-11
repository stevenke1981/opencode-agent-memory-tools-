import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import {
  atomicWriteFile,
  buildFrontmatterDocument,
  splitFrontmatter,
} from "./opencode-agent-memory-tools-frontmatter.js";
import { getDefaultDescription } from "./opencode-agent-memory-tools-letta.js";

export type MemoryScope = "global" | "project";

export type MemoryBlock = {
  scope: MemoryScope;
  label: string;
  description: string;
  limit: number;
  readOnly: boolean;
  value: string;
  filePath: string;
  lastModified: Date;
};

export type MemorySearchHit = {
  scope: MemoryScope;
  label: string;
  line: number;
  text: string;
};

const FrontmatterSchema = z.looseObject({
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  limit: z.number().int().positive().optional(),
  read_only: z.boolean().optional(),
});

const DEFAULT_LIMIT = 5000;

function parseFrontmatter(frontmatterText: string | undefined) {
  if (!frontmatterText) return {};
  const loaded = yaml.load(frontmatterText);
  const parsed = FrontmatterSchema.safeParse(loaded);
  if (!parsed.success) {
    throw new Error(`Invalid frontmatter: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function readBlockFile(scope: MemoryScope, filePath: string): Promise<MemoryBlock> {
  const [raw, stats] = await Promise.all([
    fs.readFile(filePath, "utf-8"),
    fs.stat(filePath),
  ]);
  const { frontmatterText, body } = splitFrontmatter(raw);
  const fm = parseFrontmatter(frontmatterText);
  const label = (fm.label ?? path.basename(filePath, path.extname(filePath))).trim();

  return {
    scope,
    label,
    description: (fm.description?.trim() || getDefaultDescription(label)).trim(),
    limit: fm.limit ?? DEFAULT_LIMIT,
    readOnly: fm.read_only === true,
    value: body.trim(),
    filePath,
    lastModified: stats.mtime,
  };
}

async function writeBlockFile(
  filePath: string,
  block: Pick<MemoryBlock, "label" | "description" | "limit" | "readOnly" | "value">,
): Promise<void> {
  const content = buildFrontmatterDocument(
    {
      label: block.label,
      description: block.description,
      limit: block.limit,
      read_only: block.readOnly,
    },
    block.value,
  );
  await atomicWriteFile(filePath, content);
}

function validateLabel(label: string): string {
  const trimmed = label.trim();
  if (!/^[a-z0-9][a-z0-9-_]{1,60}$/i.test(trimmed)) {
    throw new Error(`Invalid label "${label}". Use letters/numbers/dash/underscore (2-61 chars).`);
  }
  return trimmed;
}

const SEED_BLOCKS: Array<{ scope: MemoryScope; label: string }> = [
  { scope: "global", label: "persona" },
  { scope: "global", label: "human" },
  { scope: "global", label: "preferences" },
  { scope: "project", label: "project" },
  { scope: "project", label: "conventions" },
];

function scopeDir(projectDirectory: string, scope: MemoryScope): string {
  return scope === "global"
    ? path.join(os.homedir(), ".config", "opencode", "memory")
    : path.join(projectDirectory, ".opencode", "memory");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureGitignore(projectDirectory: string): Promise<void> {
  const memoryDir = path.join(projectDirectory, ".opencode", "memory");
  const gitignorePath = path.join(memoryDir, ".gitignore");
  await fs.mkdir(memoryDir, { recursive: true });
  if (!(await exists(gitignorePath))) {
    await fs.writeFile(gitignorePath, "*\n", "utf-8");
  }
}

function stableSortBlocks(blocks: MemoryBlock[]): MemoryBlock[] {
  const priority = (block: MemoryBlock): [number, string] => {
    const order: Record<string, number> = {
      persona: 0,
      human: 1,
      preferences: 2,
      project: 3,
      conventions: 4,
    };
    const base = block.scope === "global" ? 0 : 10;
    return [base + (order[block.label] ?? 50), block.label];
  };

  return blocks.sort((a, b) => {
    const [pa, la] = priority(a);
    const [pb, lb] = priority(b);
    return pa !== pb ? pa - pb : la.localeCompare(lb);
  });
}

export type MemoryStore = {
  ensureSeed(): Promise<void>;
  listBlocks(scope: MemoryScope | "all"): Promise<MemoryBlock[]>;
  getBlock(scope: MemoryScope, label: string): Promise<MemoryBlock>;
  setBlock(
    scope: MemoryScope,
    label: string,
    value: string,
    opts?: { description?: string; limit?: number },
  ): Promise<void>;
  replaceInBlock(scope: MemoryScope, label: string, oldText: string, newText: string): Promise<void>;
  appendToBlock(scope: MemoryScope, label: string, text: string, separator?: string): Promise<void>;
  deleteBlock(scope: MemoryScope, label: string): Promise<void>;
  searchBlocks(query: string, scope?: MemoryScope | "all"): Promise<MemorySearchHit[]>;
};

export function createMemoryStore(projectDirectory: string): MemoryStore {
  return {
    async ensureSeed() {
      await ensureGitignore(projectDirectory);
      for (const seed of SEED_BLOCKS) {
        const dir = scopeDir(projectDirectory, seed.scope);
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, `${seed.label}.md`);
        if (await exists(filePath)) continue;
        await writeBlockFile(filePath, {
          label: seed.label,
          description: getDefaultDescription(seed.label),
          limit: DEFAULT_LIMIT,
          readOnly: false,
          value: "",
        });
      }
    },

    async listBlocks(scope) {
      const scopes: MemoryScope[] = scope === "all" ? ["global", "project"] : [scope];
      const blocks: MemoryBlock[] = [];

      for (const s of scopes) {
        const dir = scopeDir(projectDirectory, s);
        if (!(await exists(dir))) continue;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
          try {
            blocks.push(await readBlockFile(s, path.join(dir, entry.name)));
          } catch {
            // skip invalid files
          }
        }
      }

      return stableSortBlocks(blocks);
    },

    async getBlock(scope, label) {
      const safeLabel = validateLabel(label);
      const filePath = path.join(scopeDir(projectDirectory, scope), `${safeLabel}.md`);
      if (!(await exists(filePath))) {
        throw new Error(`Memory block not found: ${scope}:${safeLabel}`);
      }
      return readBlockFile(scope, filePath);
    },

    async setBlock(scope, label, value, opts) {
      const safeLabel = validateLabel(label);
      const dir = scopeDir(projectDirectory, scope);
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${safeLabel}.md`);
      const existing = (await exists(filePath)) ? await readBlockFile(scope, filePath) : undefined;

      if (existing?.readOnly) {
        throw new Error(`Memory block is read-only: ${scope}:${safeLabel}`);
      }

      const description = (opts?.description ?? existing?.description ?? getDefaultDescription(safeLabel)).trim();
      const limit = opts?.limit ?? existing?.limit ?? DEFAULT_LIMIT;

      if (value.length > limit) {
        throw new Error(`Value too large for ${scope}:${safeLabel} (${value.length}/${limit} chars).`);
      }

      await writeBlockFile(filePath, {
        label: safeLabel,
        description,
        limit,
        readOnly: existing?.readOnly ?? false,
        value,
      });
    },

    async replaceInBlock(scope, label, oldText, newText) {
      const block = await this.getBlock(scope, label);
      if (block.readOnly) throw new Error(`Memory block is read-only: ${scope}:${block.label}`);
      if (!block.value.includes(oldText)) {
        throw new Error(`Old text not found in ${scope}:${block.label}.`);
      }
      const next = block.value.replace(oldText, newText);
      if (next.length > block.limit) {
        throw new Error(`Replace exceeds limit (${next.length}/${block.limit} chars).`);
      }
      await writeBlockFile(block.filePath, { ...block, value: next });
    },

    async appendToBlock(scope, label, text, separator = "\n") {
      const safeLabel = validateLabel(label);
      const dir = scopeDir(projectDirectory, scope);
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${safeLabel}.md`);
      const existing = (await exists(filePath)) ? await readBlockFile(scope, filePath) : undefined;

      if (existing?.readOnly) {
        throw new Error(`Memory block is read-only: ${scope}:${safeLabel}`);
      }

      const base = existing?.value ?? "";
      const next = base ? `${base}${separator}${text.trim()}` : text.trim();
      await this.setBlock(scope, safeLabel, next, {
        description: existing?.description,
        limit: existing?.limit,
      });
    },

    async deleteBlock(scope, label) {
      const block = await this.getBlock(scope, label);
      if (block.readOnly) throw new Error(`Memory block is read-only: ${scope}:${block.label}`);
      await fs.unlink(block.filePath);
    },

    async searchBlocks(query, scope = "all") {
      const blocks = await this.listBlocks(scope);
      const needle = query.toLowerCase();
      const hits: MemorySearchHit[] = [];

      for (const block of blocks) {
        const lines = block.value.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (line.toLowerCase().includes(needle)) {
            hits.push({
              scope: block.scope,
              label: block.label,
              line: i + 1,
              text: line.trim(),
            });
          }
        }
      }

      return hits;
    },
  };
}

export function getMemoryPaths(projectDirectory: string): {
  global: string;
  project: string;
  journal: string;
  config: string;
} {
  const configRoot = path.join(os.homedir(), ".config", "opencode");
  return {
    global: path.join(configRoot, "memory"),
    project: path.join(projectDirectory, ".opencode", "memory"),
    journal: path.join(configRoot, "journal"),
    config: path.join(configRoot, "agent-memory.json"),
  };
}