#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const PLUGIN_NAME = "opencode-agent-memory-tools";
const PLUGIN_FILE = `${PLUGIN_NAME}.ts`;
const ROOT = path.resolve(import.meta.dirname, "..");
const HOME = os.homedir();
const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR
  ? path.resolve(process.env.OPENCODE_CONFIG_DIR.replace(/^~/, HOME))
  : path.join(HOME, ".config", "opencode");

const PLUGINS_DIR = path.join(CONFIG_DIR, "plugins");
const COMMANDS_DIR = path.join(CONFIG_DIR, "commands");
const TARGET_PLUGIN = path.join(PLUGINS_DIR, PLUGIN_FILE);

const SUPPORT_FILES = [
  "opencode-agent-memory-tools-guidance.ts",
  "opencode-agent-memory-tools-memory.ts",
  "opencode-agent-memory-tools-journal.ts",
  "opencode-agent-memory-tools-frontmatter.ts",
  "opencode-agent-memory-tools-letta.ts",
  "opencode-agent-memory-tools-prompt.ts",
  "opencode-agent-memory-tools-embeddings.ts",
];

const DEPS = {
  "@opencode-ai/plugin": "1.16.2",
  "js-yaml": "^4.1.0",
  "zod": "^4.1.13",
  "@huggingface/transformers": "^3.8.1",
};

function toConfigPath(absPath) {
  const normalized = absPath.replace(/\\/g, "/");
  if (normalized.startsWith(HOME.replace(/\\/g, "/"))) {
    return `~${normalized.slice(HOME.replace(/\\/g, "/").length)}`;
  }
  if (process.platform === "win32" && /^[A-Za-z]:/.test(normalized)) {
    return `/${normalized[0].toLowerCase()}${normalized.slice(2)}`;
  }
  return normalized;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensurePackageJson() {
  const pkgFile = path.join(CONFIG_DIR, "package.json");
  let pkg = { dependencies: {} };
  let changed = false;
  if (await exists(pkgFile)) {
    pkg = JSON.parse(await fs.readFile(pkgFile, "utf8"));
    pkg.dependencies = pkg.dependencies ?? {};
  }
  for (const [name, version] of Object.entries(DEPS)) {
    if (!pkg.dependencies[name]) {
      pkg.dependencies[name] = version;
      changed = true;
      console.log(`Added ${name} to global package.json`);
    }
  }
  if (changed || !(await exists(path.join(CONFIG_DIR, "node_modules", "@opencode-ai", "plugin")))) {
    await fs.writeFile(pkgFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    await installDependencies();
  }
}

async function installDependencies() {
  console.log("Installing dependencies in global OpenCode config...");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["install", "--prefix", CONFIG_DIR], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.warn(`npm install failed. Run manually: npm install --prefix "${CONFIG_DIR}"`);
  }
}

async function ensureDefaultConfig() {
  const configPath = path.join(CONFIG_DIR, "agent-memory.json");
  if (await exists(configPath)) return;
  const defaultConfig = {
    journal: {
      enabled: true,
      tags: [
        { name: "decision", description: "Architecture or design decisions" },
        { name: "debugging", description: "Debugging sessions and root causes" },
        { name: "convention", description: "Discovered project conventions" },
      ],
    },
  };
  await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2) + "\n", "utf8");
  console.log(`Created ${configPath}`);
}

async function registerInConfig(pluginEntry) {
  const candidates = ["opencode.jsonc", "opencode.json"];
  let configFile = null;
  for (const name of candidates) {
    const p = path.join(CONFIG_DIR, name);
    if (await exists(p)) {
      configFile = p;
      break;
    }
  }

  if (!configFile) {
    configFile = path.join(CONFIG_DIR, "opencode.jsonc");
    await fs.writeFile(
      configFile,
      JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: [pluginEntry] }, null, 2) + "\n",
      "utf8",
    );
    console.log(`Created ${configFile}`);
    return;
  }

  const raw = await fs.readFile(configFile, "utf8");
  if (raw.includes(PLUGIN_NAME)) {
    console.log(`Plugin already referenced in ${configFile}`);
    return;
  }

  const pluginLine = `    "${pluginEntry}"`;
  let updated;
  if (/"plugin"\s*:\s*\[/.test(raw)) {
    updated = raw.replace(/("plugin"\s*:\s*\[)([\s\S]*?)(\])/m, (_m, open, inner, close) => {
      const sep = inner.trim() ? ",\n" : "\n";
      return `${open}${inner.replace(/\s*,\s*$/, "")}${sep}${pluginLine}\n  ${close}`;
    });
  } else {
    updated = raw.replace(/\{/, `{\n  "plugin": [\n${pluginLine}\n  ],`);
  }
  await fs.writeFile(configFile, updated, "utf8");
  console.log(`Registered plugin in ${configFile}`);
}

async function main() {
  console.log(`Installing ${PLUGIN_NAME} globally...`);
  console.log(`Config dir: ${CONFIG_DIR}`);

  await fs.mkdir(PLUGINS_DIR, { recursive: true });
  await fs.mkdir(COMMANDS_DIR, { recursive: true });
  await fs.mkdir(path.join(CONFIG_DIR, "memory"), { recursive: true });
  await fs.mkdir(path.join(CONFIG_DIR, "journal"), { recursive: true });

  await fs.copyFile(path.join(ROOT, "src", "index.ts"), TARGET_PLUGIN);
  console.log(`Plugin -> ${TARGET_PLUGIN}`);

  for (const file of SUPPORT_FILES) {
    const dest = path.join(PLUGINS_DIR, file);
    await fs.copyFile(path.join(ROOT, "src", file), dest);
    console.log(`Module -> ${dest}`);
  }

  if (await exists(path.join(ROOT, "commands"))) {
    for (const file of await fs.readdir(path.join(ROOT, "commands"))) {
      const dest = path.join(COMMANDS_DIR, file);
      await fs.copyFile(path.join(ROOT, "commands", file), dest);
      console.log(`Command -> ${dest}`);
    }
  }

  await ensureDefaultConfig();
  await ensurePackageJson();

  const pluginEntry = toConfigPath(TARGET_PLUGIN);
  await registerInConfig(pluginEntry);

  console.log("\nDone! Restart OpenCode to load the plugin.");
  console.log("Memory: ~/.config/opencode/memory/ (global) + .opencode/memory/ (project)");
  console.log("Journal: ~/.config/opencode/journal/ (semantic search, enabled by default)");
  console.log("Tools: memoryList, memoryGet, memorySet, memoryReplace, memoryAppend, memoryRemember, memoryForget, memoryDelete, memorySearch, memoryRecap, journalWrite, journalRead, journalSearch");
  console.log("Commands: /memory-guide, /memory-remember, /memory-recap, /journal-search");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});