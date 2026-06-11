#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "opencode-agent-memory-tools installer"
node "$ROOT/scripts/install-global.mjs"
echo ""
echo "Done! Restart OpenCode."
echo 'Verify: opencode run "call memoryList and show the result"'