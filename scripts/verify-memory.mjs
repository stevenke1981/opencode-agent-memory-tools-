#!/usr/bin/env node
import { createMemoryStore } from "../src/opencode-agent-memory-tools-memory.ts";

const store = createMemoryStore(process.cwd());
await store.ensureSeed();
const blocks = await store.listBlocks("all");
console.log("blocks:", blocks.map((b) => `${b.scope}:${b.label}`).join(", "));
await store.appendToBlock("project", "project", "verify: opencode-agent-memory-tools ok");
const hits = await store.searchBlocks("verify");
console.log("search:", hits.length > 0 ? "ok" : "fail");
console.log("done");