# LLM 使用說明 — opencode-agent-memory-tools

基於 [opencode-agent-memory](https://github.com/joshuadavidthomas/opencode-agent-memory)（Letta 風格），並參考 **ChatGPT Memory**、**Claude Code CLAUDE.md**、**Codex 專案脈絡** 模式擴充。

---

## 何時使用

| 情境 | 工具 |
|------|------|
| 使用者說「記住…」 | `memoryRemember` |
| 使用者說「忘記…」 | `memoryForget` |
| 問「你記得什麼」 | `memoryRecap` |
| 查特定事實 | `memoryGet` / `memorySearch` |
| 更新專案慣例 | `memoryAppend` on `project` |
| 任務前查歷史 | `journalSearch` |
| 任務後記錄決策 | `journalWrite` |

## 何時不要用

- 密碼、API key、token
- 完整檔案內容
- 一次性 debug 輸出
- 可用 Read/Grep 讀原始碼時

## Memory Blocks

| Block | Scope | 類比 |
|-------|-------|------|
| persona | global | Agent 行為風格 |
| human | global | ChatGPT 使用者記憶 |
| preferences | global | 編碼偏好 |
| project | project | CLAUDE.md 專案知識 |
| conventions | project | 團隊慣例 |

路徑：
- 全域：`~/.config/opencode/memory/`
- 專案：`.opencode/memory/`（自動 gitignore）

## 標準流程

```
memoryList → memoryGet/memorySearch → memoryRemember/memoryAppend
  → journalWrite（重大決策後）→ journalSearch（下次任務前）
```

## Plugin 引導層級

1. `config.instructions` — 決策規則
2. System prompt — memory blocks 自動注入
3. `chat.messages.transform` — 偵測 remember/recall 意圖
4. `session.compacting` — 壓縮後保留摘要
5. `/memory-guide` — 手動載入說明