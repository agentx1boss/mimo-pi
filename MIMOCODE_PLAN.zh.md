# MiMoCode 核心功能重写开发计划（基于 Pi fork）

> **目标**：在本地 fork 的 `pi/` 仓库上，用 Pi 的 Extension 机制重写 MiMoCode 的核心差异化能力（持久化记忆、检查点、上下文重建、任务追踪、子智能体、Goal 停止条件、Compose、Dream/Distill）。
>
> **核心判断**：Pi 是「极简内核 + 可扩展 harness」，MiMoCode 的全部差异化都可表达为一组 Pi Extension。Pi 自带的示例扩展（`custom-compaction.ts` / `handoff.ts` / `todo.ts` / `subagent/` / `summarize.ts`）已经覆盖了相当多的功能骨架，重写是「站在巨人肩膀上做增量」，而非从零开始。

---

## 0. 背景与定位

### 0.1 已确认的 Pi 能力边界

通过阅读 `pi/packages/coding-agent/` 的源码与文档，确认 Pi 提供以下基础设施，可直接复用：

| Pi 能力 | 复用方式 | 文档/示例 |
|--------|---------|----------|
| 会话树状持久化 | JSONL，`id`/`parentId`，`/fork`、`/tree` 原生分支 | `docs/session-format.md` |
| Compaction（上下文压缩） | 内建压缩 + `session_before_compact` 钩子可完全自定义 | `docs/compaction.md`, `examples/extensions/custom-compaction.ts` |
| 扩展状态持久化 | `appendCustomEntry()`（不进上下文）/ `appendCustomMessageEntry()`（进上下文） | `docs/extensions.md` §State Management |
| 自定义工具/命令/快捷键 | `registerTool` / `registerCommand` / `registerShortcut` | `docs/extensions.md` |
| 独立子会话 | `ctx.newSession({ parentSession })` + spawn `pi` 子进程 | `examples/extensions/handoff.ts`, `examples/extensions/subagent/` |
| 独立 LLM 调用 | `complete()` from `@earendil-works/pi-ai`，可用不同模型做裁判 | `examples/extensions/custom-compaction.ts` |
| 任务系统骨架 | `examples/extensions/todo.ts`（状态重建 + 树状分支感知） | `examples/extensions/todo.ts` |

### 0.2 重写策略

- **不改动 Pi 内核**（`packages/agent` / `packages/ai` / `packages/tui`），只在 `packages/coding-agent/src/extensions/mimo/` 下新增一组 MiMo 扩展包。
- **每个 MiMo 功能 = 一个独立 extension factory**，可单独 `pi -e` 加载，也可在聚合入口一起加载。
- **借鉴而不照抄** Pi 示例：示例是最小演示，我们要补齐的是 MiMoCode 的工程质量（SQLite FTS5、token budget、裁判模型、子智能体编排）。

### 0.3 目录结构约定

```
packages/coding-agent/src/extensions/mimo/
├── index.ts                 # 聚合入口：默认加载所有 MiMo 扩展
├── memory/                  # P1 持久化记忆
├── checkpoint/              # P2 检查点 + 上下文重建
├── tasks/                   # P2 任务追踪
├── dream/                   # P3 Dream & Distill（自我进化）
├── goal/                    # P3 Goal 停止条件
├── subagent/                # P4 子智能体编排
├── compose/                 # P4 Compose specs-driven 流程
└── shared/                  # 共享工具：SQLite store、token 计数、prompt 模板
```

测试与验收用的示例会话统一放在 `packages/coding-agent/test/mimo/`。

---

## P0 — 工程基线（预计 2~3 天）

### 目标
搭建开发闭环，确保后续每个阶段都能「改 → 编译 → 跑通 → 验收」。

### 任务

- [ ] **0.1 项目骨架**：新建 `packages/coding-agent/src/extensions/mimo/` 目录与 `index.ts` 聚合入口（先空实现，只 `export default function(pi){}`）。
- [ ] **0.2 构建链路验证**：跑通 `npm run build`（顶层 `packages/coding-agent`），确认 dist 产物正常。
- [ ] **0.3 扩展加载验证**：用 `pi -e ./src/extensions/mimo/index.ts` 启动，确认无报错；写一个 `session_start` 钩子打印日志验证事件通路。
- [ ] **0.4 测试基线**：在 `test/mimo/` 下放一个最小 vitest 用例，确认 `npm test` 能跑到。
- [ ] **0.5 配置位预留**：确认 Pi 的 `.pi/settings.json` 能承载 MiMo 配置（`memory.enabled`、`memory.budget` 等），预留 schema。

### 验收标准

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-0.1 | `mimo/` 目录与 `index.ts` 存在，`npm run build` 通过 | `npm run build` 退出码 0 |
| AC-0.2 | `pi -e ./mimo/index.ts` 能启动，`session_start` 日志可见 | 启动后发送任意消息，控制台打印 MiMo 加载日志 |
| AC-0.3 | `npm test` 跑通至少 1 个 mimo 用例 | 测试报告中 mimo 用例 pass |
| AC-0.4 | 配置 schema 落地在 settings 文档与代码中 | 代码里有类型定义 + docs 有说明 |

### 关键参考
- `pi/packages/coding-agent/docs/development.md`
- `pi/packages/coding-agent/docs/extensions.md` §Quick Start

---

## P1 — 持久化记忆（预计 1~2 周）⭐ 核心差异化

### 目标
复刻 MiMoCode 的「跨会话项目记忆」：基于 SQLite FTS5 全文检索，在 `session_start` 时按 token budget 将相关记忆注入上下文；agent 可主动保存记忆。

### 任务

- [ ] **1.1 SQLite FTS5 存储层**（`shared/memory-store.ts`）
  - 表结构：`memories(id, kind, title, body, tags, project, created_at, updated_at, hit_count)`
  - FTS5 虚拟表：`memories_fts` 索引 `title + body + tags`
  - 方法：`add() / search(query, limit) / update() / delete() / list() / vacuum()`
  - 数据库路径：`.mimo/memory.db`（项目级），可配置为全局
- [ ] **1.2 记忆注入钩子**（`memory/extension.ts`）
  - 监听 `session_start`（reason 为 `startup` / `resume`）
  - 从最近一条用户消息提取查询词，调 `memoryStore.search()` 取 top-K
  - **预算化注入**：用 `estimateTokens()` 累加，超 budget（默认 4000 token）就截断；按 `kind`（规则 > 决策 > 笔记）和 `hit_count` 排序
  - 用 `appendCustomMessageEntry("mimo-memory", ...)` 注入为系统上下文
- [ ] **1.3 记忆工具**（供 LLM 调用）
  - `memory_save`：保存一条记忆（kind/title/body/tags）
  - `memory_search`：检索记忆
  - `memory_update` / `memory_delete`
  - 每个工具的 `details` 持久化操作日志，支持分支重建
- [ ] **1.4 MEMORY.md 双向同步**
  - 启动时若 `.mimo/MEMORY.md` 存在则导入到 SQLite
  - 每次 `memory_save` / `memory_delete` 同步写回 `MEMORY.md`（人类可读）
- [ ] **1.5 测试**：单元测试覆盖 add/search/budget 截断；e2e 测试「保存记忆 → 新会话 → 记忆被注入」。

### 验收标准

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-1.1 | `.mimo/memory.db` 创建成功，FTS5 表可查 | `sqlite3 .mimo/memory.db ".tables"` 显示 `memories_fts` |
| AC-1.2 | 跨会话记忆生效：A 会话保存「项目用 Bun」，新开 B 会话问依赖管理，agent 知道用 Bun | 手动 e2e：save → `/new` → 提问 → 答案含 Bun |
| AC-1.3 | Token budget 生效：注入总 token 不超过配置上限（+10% 容差） | 注入后打印实际 token，断言 ≤ budget×1.1 |
| AC-1.4 | `MEMORY.md` 与 SQLite 内容一致 | save 后读 MEMORY.md，包含刚存的条目 |
| AC-1.5 | 分支安全：`/fork` 后两分支记忆状态独立 | fork → 一边 save → 切回另一边 → 不含该条目 |

### 关键参考（Pi 现有资产）
- **直接借鉴**：`pi-memctx`（官方记忆包，Markdown packs 方式）——我们的 FTS5 是其增强版
- API：`session_start` 事件、`appendCustomMessageEntry`、`estimateTokens()`（from `core/compaction`）
- token 计数：`examples/extensions/custom-compaction.ts` 里 `tokensBefore` 的计算方式

---

## P2 — 检查点 + 上下文重建（预计 1~2 周）

### 目标
复刻 MiMoCode 的「自动检查点 + 上下文重建」：在 compaction 前由子 LLM 生成结构化 checkpoint 快照；上下文接近上限时，从 checkpoint + 项目记忆 + 任务进展重建上下文，让 agent 无缝继续任务。

### 任务

- [ ] **2.1 自定义 Compaction handler**（`checkpoint/extension.ts`）
  - 监听 `session_before_compact`，**接管压缩逻辑**
  - 借鉴 `examples/extensions/custom-compaction.ts`，但生成 MiMoCode 风格的结构化 checkpoint：
    - `## 当前目标` / `## 已完成` / `## 进行中` / `## 待决策` / `## 相关文件`
  - checkpoint 写入 `appendCustomEntry("mimo-checkpoint", {...})`（不进上下文）+ 同时落盘 `.mimo/checkpoint.md`
  - summary 部分仍用 `compaction.summary` 注入上下文
- [ ] **2.2 自动触发策略**
  - 复用 Pi 的 `shouldCompact()` 阈值（默认 80% 上下文窗口）
  - 额外：每 N 轮（默认 15）强制写一次 checkpoint（即使没触发 compaction）
- [ ] **2.3 上下文重建**
  - `session_start`（resume）时，若存在最新 checkpoint：
    - 把 checkpoint.md 内容作为 high-priority 上下文注入
    - 叠加 P1 的项目记忆 + P2.4 的任务进展
    - 全部走 budget 化排序（checkpoint 优先级最高）
- [ ] **2.4 任务进展注入**（依赖 P3 tasks，但此阶段先 stub）
  - 预留接口：`getTaskProgress()` 返回当前任务树状态摘要
  - P2 阶段返回空，P3 完成后接入

### 验收标准

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-2.1 | Compaction 触发时生成结构化 checkpoint.md，五段式结构完整 | 触发 `/compact` 或自动压缩，检查 `.mimo/checkpoint.md` |
| AC-2.2 | checkpoint 同时存在 session JSONL（custom entry）与磁盘文件 | `grep "mimo-checkpoint" session.jsonl` 有记录 |
| AC-2.3 | `/resume` 后 agent 能复述上次中断时的目标与进度 | 压缩 → 关闭 → resume → 问"我们刚做到哪了"，答案对得上 |
| AC-2.4 | 重建上下文总 token 在预算内（checkpoint + memory + tasks） | 打印注入明细，断言不超 budget |
| AC-2.5 | 压缩前后 token 下降比例可观测（对标 Pi ~46%） | 记录压缩前后 token，打印降幅 |

### 关键参考（Pi 现有资产）
- **直接借鉴**：`examples/extensions/custom-compaction.ts`（完整可运行，我们改 prompt + 加 checkpoint 落盘）
- API：`session_before_compact` 事件返回 `{ compaction: { summary, firstKeptEntryId, tokensBefore } }`
- token 估算：`estimateTokens()`、`shouldCompact()` from `core/compaction`

---

## P3 — 任务追踪 + Goal 停止条件（预计 1~2 周）

### 目标
- 复刻 MiMoCode 的「树状任务系统（T1, T1.1, T1.2）」，自动与检查点联动，恢复会话时进度不丢失。
- 复刻「`/goal` + 独立裁判模型」，防止自主工作中的"乐观停止"。

### 任务（任务追踪）

- [ ] **3.1 任务数据模型**：树状结构，每个任务 `{ id, title, status, parent_id, created_at, ... }`
  - ID 规则：`T1`, `T1.1`, `T1.2`, `T2`...（深度无限制）
- [ ] **3.2 任务工具**（`tasks/extension.ts`，借鉴 `examples/extensions/todo.ts`）
  - `task_create` / `task_update` / `task_list` / `task_complete`
  - **状态持久化用 `details`**（分支安全），借鉴 todo.ts 的 `reconstructState`
  - 额外：`appendCustomEntry("mimo-task-progress", {taskId, log})` 记录逐任务日志
- [ ] **3.3 任务进展文件**：`.mimo/tasks/<id>/progress.md`，每次状态变更追加一行日志
- [ ] **3.4 与检查点联动**：P2 的 `getTaskProgress()` 接入，checkpoint 注入当前任务树快照
- [ ] **3.5 `/tasks` 命令**：TUI 渲染树状任务面板（借鉴 todo.ts 的 `TodoListComponent`）

### 任务（Goal 停止条件）

- [ ] **3.6 `/goal` 命令**：设置会话停止条件，存到 `appendCustomEntry("mimo-goal", {condition})`
- [ ] **3.7 裁判评估**：监听 `turn_end`，当 agent 表达停止意图时：
  - 用**独立裁判模型**（可配置，默认小模型）评估当前对话 vs goal 条件
  - 裁判 prompt：「以下对话中，agent 声称完成了任务。请判断 `[goal]` 是否真正满足，输出 JSON `{satisfied: bool, reason}`」
  - 不满足 → 注入 `ctx.ui.notify` + 追加一条 user 消息督促继续
  - 满足 → 正常结束

### 验收标准

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-3.1 | 创建树状任务后，`/tasks` 正确渲染层级（T1 / T1.1 缩进） | 创建多级任务，看 TUI 渲染 |
| AC-3.2 | 任务状态在 `/fork` 后两分支独立 | todo.ts 同款验证：fork → 一边 complete → 切回 → 状态未变 |
| AC-3.3 | `.mimo/tasks/<id>/progress.md` 记录状态变更历史 | 多次 update 后读文件，含时间线 |
| AC-3.4 | checkpoint 上下文重建包含任务树快照 | 压缩 → resume，注入内容含任务进度 |
| AC-3.5 | `/goal "所有测试通过"` 后，agent 擅自停止时被裁判驳回 | 故意让 agent 提前停，观察裁判注入继续消息 |
| AC-3.6 | 裁判用的是独立模型（可配置，非主模型） | 日志打印裁判模型 id |
| AC-3.7 | goal 真正满足时正常放行 | agent 确实跑通测试，裁判 satisfied=true |

### 关键参考（Pi 现有资产）
- **直接借鉴**：`examples/extensions/todo.ts`（状态重建 + 分支安全 + TUI 组件，几乎 1:1 可复用）
- **直接借鉴**：`examples/extensions/subagent/`（spawn 独立进程做裁判，或用 `complete()` 单次调用更轻量）
- API：`turn_end` 事件、`complete()` from `pi-ai`、`appendCustomEntry`

---

## P4 — 子智能体编排 + Compose（预计 2~3 周）

### 目标
- 复刻 MiMoCode「主智能体按需生成子智能体，共享上下文并行工作」。
- 复刻「Compose 编排模式」：specs-driven，内置规划→执行→审查→TDD→调试→验证→合并的完整开发生命周期。

### 任务（子智能体）

- [ ] **4.1 子智能体运行时**（`subagent/extension.ts`，借鉴 `examples/extensions/subagent/`）
  - **架构选择**：Pi 的 subagent 示例用「spawn 独立 `pi` 子进程 + JSON 输出」。我们采用此模式（隔离性强），但加编排层：
    - 单任务 / 并行多任务 / 链式（chain，前一个输出喂后一个）三种模式
    - 每个子 agent 配置：`{ name, task, tools[], model, systemPrompt }`
  - **生命周期追踪**：主 agent 通过 `tool_update` 回调实时看到子 agent 进度
  - **后台执行**：长任务可后台跑，主 agent 不阻塞
- [ ] **4.2 内置 agent 目录**（借鉴 subagent 示例的 `agents/` frontmatter 发现）
  - `checkpoint-writer`：P2 检查点的子 agent（生成结构化快照）
  - `code-reviewer`：Compose 的代码审查 agent
  - `test-writer`：TDD 的测试编写 agent
  - 放 `.mimo/agents/*.md`，frontmatter 定义 tools/model

### 任务（Compose 模式）

- [ ] **4.3 Compose mode 注册**：研究 Pi 的 `modes/` 机制，注册 `compose` 为一个 mode
- [ ] **4.4 specs-driven 流程**：`/compose <spec>` 触发编排：
  1. **规划**：子 agent 读 spec，拆成任务树（复用 P3 任务系统）
  2. **执行**：按任务树顺序，每个任务 spawn 子 agent 实现
  3. **审查**：`code-reviewer` agent 审查每个变更
  4. **TDD**：`test-writer` 先写测试，执行 agent 让测试过
  5. **调试**：失败时循环修复（带最大重试次数）
  6. **验证**：全量测试 + 类型检查
  7. **合并**：git 操作（借鉴 `git-merge-and-resolve.ts`）
- [ ] **4.5 Compose UI**：展示当前编排阶段、各子 agent 状态、任务树进度

### 验收标准

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-4.1 | `subagent` 工具可并行 spawn 多个 agent，结果聚合返回 | 调用并行模式跑 2 个独立任务，结果都返回 |
| AC-4.2 | 链式模式：前一个 agent 输出被 `{previous}` 占位替换 | chain 模式跑 A→B，B 的输入含 A 输出 |
| AC-4.3 | 主 agent 在子 agent 执行时收到 `tool_update` 实时进度 | 子 agent 输出时，主 agent TUI 显示增量 |
| AC-4.4 | 后台子 agent 不阻塞主 agent | 启动后台子任务，主 agent 可继续对话 |
| AC-4.5 | `/compose` 能跑通一个最小 spec（单文件改动） | 给一个"添加 hello() 函数"的 spec，全流程跑通且测试过 |
| AC-4.6 | Compose 各阶段有明确 UI 反馈 | TUI 显示当前阶段（规划/执行/审查...） |
| AC-4.7 | checkpoint-writer 子 agent 与 P2 集成 | Compose 流程中途断开，resume 后能续上 |

### 关键参考（Pi 现有资产）
- **直接借鉴**：`examples/extensions/subagent/`（完整子进程编排，含 single/parallel/chain 三模式）
- **直接借鉴**：`examples/extensions/git-merge-and-resolve.ts`（Compose 合并阶段）
- **直接借鉴**：`examples/extensions/plan-mode/`（mode 注册范例）
- API：`spawn` from `node:child_process`、`registerFlag`、`ctx.ui.custom`（自定义 UI 组件）

---

## P5 — Dream & Distill 自我进化（预计 1.5~2.5 周）⭐ 最大差异化

### 目标
复刻 MiMoCode 最独特的两个命令：
- `/dream`：扫描近期会话轨迹，提取持久知识到项目记忆，清理过时条目。
- `/distill`：发现近期工作中重复的手动工作流，将高置信度候选打包成可复用的 skill/subagent/command。

这是 MiMoCode 相对 Pi 最大的差异化，Pi 生态里没有对应物，**完全靠我们从零实现**。但因为 Pi 的 session JSONL 是结构化可扫描数据，实现路径清晰。

### 任务（Dream）

- [ ] **5.1 会话扫描器**（`dream/scanner.ts`）
  - 调 `SessionManager` 列出近 N 天的 session 文件（借鉴 `static listing methods`）
  - 解析每个 JSONL：用 `getBranch()` 提取有效分支消息
  - 复用 P2 的 `serializeConversation` / `convertToLlm`
- [ ] **5.2 知识提取**（`dream/extractor.ts`）
  - 用独立 LLM（默认小模型省 token）处理会话轨迹，prompt：
    - 「从以下开发会话中提取：①值得持久化的项目知识 ②架构决策及理由 ③踩过的坑 ④可复用的模式」
    - 输出结构化 JSON：`[{title, body, kind, tags}]`
  - **去重 + 合并**：与现有 memory 比对（FTS5 相似度），相似则合并，全新的插入
- [ ] **5.3 过时清理**
  - LLM 判断现有记忆中哪些已过时（如「用了 React 16」但代码已是 18）
  - 输出候选删除清单，**需用户确认**（`ctx.ui.confirm`）后删除
- [ ] **5.4 `/dream` 命令**：聚合上述，带进度 UI，输出「新增 N 条 / 合并 M 条 / 清理 K 条」

### 任务（Distill）

- [ ] **5.5 工作流挖掘**（`distill/miner.ts`）
  - 跨会话分析**重复的工具调用序列**（如多次出现 `read → edit → bash test`）
  - 启发式 + LLM 结合：先用算法找高频子序列，再让 LLM 判断是否构成"有意义的 workflow"
- [ ] **5.6 Skill 打包**（`distill/packager.ts`）
  - 高置信度候选 → 生成 Pi skill（参考 `docs/skills.md` 的格式）
  - 生成 subagent 定义（参考 subagent 示例的 frontmatter 格式）
  - 生成 slash command（参考 `registerCommand`）
  - **人工审核闸门**：所有打包结果默认进 `.mimo/distill-staging/`，用户 `/distill-apply` 才生效
- [ ] **5.7 `/distill` 命令**：展示挖掘到的候选工作流，用户选择性打包

### 验收标准

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-5.1 | `/dream` 能扫描近 7 天会话，输出提取到的知识条目 | 在有历史会话的项目跑 `/dream`，有合理输出 |
| AC-5.2 | 提取的知识写入 memory.db 且 MEMORY.md 同步 | dream 后查 SQLite + MEMORY.md，条目新增 |
| AC-5.3 | 相似知识被合并而非重复插入 | 先手动 save 一条类似记忆，dream 后该条被更新而非新增 |
| AC-5.4 | 过时清理需用户确认，不会静默删除 | dream 触发清理时弹 confirm，取消则不删 |
| AC-5.5 | `/distill` 能识别重复工具调用序列 | 构造多次相同工作流的测试会话，distill 能发现 |
| AC-5.6 | 打包出的 skill 落在 staging，`/distill-apply` 后才进 `.pi/skills/` | 打包后检查 staging，apply 后检查 skills 目录 |
| AC-5.7 | 生成的 skill 可被 Pi 正常加载调用 | apply 后新会话能触发该 skill |
| AC-5.8 | 所有 LLM 调用用独立可配置模型（避免烧主模型 token） | 配置 `dream.model` / `distill.model`，日志验证 |

### 关键参考（Pi 现有资产）
- **无直接对应**（这是 MiMoCode 独有）——但可复用：
  - `SessionManager` 的静态列举方法（扫描历史会话）
  - `examples/extensions/handoff.ts` 的 `getHandoffMessages` / `serializeConversation`（会话解析）
  - `complete()` from `pi-ai`（独立 LLM 调用）
  - `docs/skills.md`（skill 格式规范）
  - `examples/extensions/subagent/agents.ts`（agent frontmatter 格式）

---

## P6 — 收尾打磨（预计 1~2 周）

### 目标
完成 MiMoCode 宣传但尚未实现的功能，达到可对外发布的完整度。

### 任务

- [ ] **6.1 多智能体 mode 切换**：build / plan / compose 三个 mode 的 `Tab` 切换（借鉴 `plan-mode/` 示例 + P4 的 compose mode）
- [ ] **6.2 语音输入**（`voice/extension.ts`）：封装 TenVAD + MiMo ASR，`/voice` 激活，流式转写追加到编辑器
- [ ] **6.3 Max Mode**（实验）：配置 `experimental.maxMode`，并行 best-of-N 推理 + 裁判选优（复用 P3 的裁判模型机制）
- [ ] **6.4 统一配置**：`.mimo/mimocode.json` 汇总所有 MiMo 扩展的配置（memory.budget / checkpoint.interval / goal.judgeModel / dream.model ...）
- [ ] **6.5 聚合入口完善**：`mimo/index.ts` 按 config 开关加载各扩展，未启用的扩展不加载
- [ ] **6.6 文档**：README 更新、各扩展的 docs、迁移指南（从 MiMoCode 迁配置）

### 验收标准

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-6.1 | `Tab` 在 build/plan/compose 间切换，权限正确（plan 只读） | 切到 plan 后 edit 工具被禁用 |
| AC-6.2 | `/voice` 启动后说话能转写进编辑器（需 MiMo 登录） | 手动语音测试 |
| AC-6.3 | Max Mode 开启后并行 N 路，裁判选最优输出 | 配置开启，观察日志有 N 路推理 |
| AC-6.4 | 单一配置文件控制所有行为 | 改 budget → 重启 → 注入量变化 |
| AC-6.5 | 未启用的扩展完全不加载（无副作用） | 关闭 memory → 重启 → memory.db 不被读写 |
| AC-6.6 | 文档完整，新用户能按 README 跑通 | 找人按文档走一遍 |

---

## 总览：阶段依赖与里程碑

```
P0 工程基线 (2-3天)
  │
  ▼
P1 持久化记忆 (1-2周) ──────────────┐ ⭐核心
  │                                  │
  ▼                                  │
P2 检查点+上下文重建 (1-2周)         │
  │   └─(stub getTaskProgress)       │
  ▼                                  │
P3 任务追踪+Goal (1-2周) ────────────┤
  │   └─(接入 P2 getTaskProgress)    │
  ▼                                  │
P4 子智能体+Compose (2-3周) ─────────┤
  │   └─(checkpoint-writer 接 P2)    │
  ▼                                  │
P5 Dream & Distill (1.5-2.5周) ──────┘ ⭐最大差异化
  │   └─(依赖 P1 memory + P3 tasks)
  ▼
P6 收尾打磨 (1-2周)
```

### 里程碑

| 里程碑 | 完成阶段 | 交付物 | 累计预计 |
|--------|---------|--------|----------|
| **M1 可用原型** | P0 + P1 | 「带跨会话记忆的 Pi」 | ~2.5 周 |
| **M2 记忆闭环** | + P2 + P3 | 记忆 + 检查点 + 任务 + Goal | ~6 周 |
| **M3 编排能力** | + P4 | 子智能体 + Compose | ~8.5 周 |
| **M4 自我进化** | + P5 | Dream + Distill（完整差异化） | ~11 周 |
| **M5 可发布** | + P6 | 全功能，文档齐全 | ~13 周 |

---

## 风险登记册

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| Pi 的 Extension API 在 0.x 版本可能 breaking change | 高 | 中 | 把依赖收敛到 `ExtensionAPI` / `SessionManager` / `complete()` 几个稳定接口；锁定 pi 版本；每次升级跑全量测试 |
| 子智能体用 spawn 子进程模式开销大 | 中 | 中 | P4 优先验证；备选：用 SDK 的 `createAgentSession` in-process（牺牲隔离性换性能） |
| Compose 与 Pi 的 mode 系统耦合深，可能需改内核 | 中 | 高 | P4 早期 spike；若必须改内核，评估是否接受 fork 维护成本 |
| Dream/Distill 的 LLM 调用成本高 | 中 | 中 | 默认用便宜小模型；加 dry-run 模式只扫描不调 LLM；用户确认后才提取 |
| SQLite 在某些环境（容器/只读 fs）不可用 | 低 | 中 | memory-store 抽象接口，备选纯 JSON 文件实现（无 FTS5，降级为线性检索） |
| Pi 的 token 计数（`estimateTokens`）不够准 | 中 | 低 | 预算化注入留 10% 容差；关键场景用真实 tokenizer 校准 |

---

## 开发原则

1. **每阶段都要有可演示的闭环**，不要积累太多未验证代码。
2. **优先借鉴 Pi 自带示例**，它们是官方维护的、跟版本同步的，比自己造轮子更稳。
3. **SQLite FTS5 和裁判模型是 MiMoCode 的护城河**，这两块要重点打磨，不能图省事降级。
4. **不改 Pi 内核**。所有功能通过 Extension 实现，保持与上游 merge 的能力。
5. **验收标准必须可自动验证的就自动化**（vitest），只能手动验证的写清操作步骤。

---

*文档版本：v1.0 · 基于本地 `pi/` fork（`@earendil-works/pi-coding-agent@0.79.3`）*
