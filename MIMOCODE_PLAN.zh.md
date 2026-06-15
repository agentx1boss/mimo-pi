# MiMoCode on Pi 社区插件优先实施计划

> **目标**：在本地 fork 的 `pi/` 仓库上，先用 Pi 社区插件拼出类似 MiMoCode 的编码智能体能力，再只对社区生态未覆盖或不可信的差异化部分做自研。
>
> **核心判断**：原始“从零实现”蓝图仍然有价值，但它不应再作为默认工程路线。`pi.dev` 当前已经有大规模 Pi packages 生态，记忆、计划、任务、Goal、子智能体、上下文管理、spec-driven workflow 等能力都有多个实现。新的路线是：**插件优先、验收驱动、少量自研**。

---

## 0. 结论摘要

### 0.1 当前判断

- `MIMOCODE_PLAN.zh.md` 从“从零实现计划”重构为“社区插件优先的选型与差异化实施计划”。
- P1-P4 的大部分能力不再默认自研，先通过社区插件评测和组合获得。
- 仍建议自研的核心差异化：
  - **MiMo Provider**：接入 Xiaomi MiMo API Key / OAuth，作为模型通路和产品身份基础。
  - **Dream/Distill 自我进化闭环**：会话扫描、知识沉淀、重复 workflow 挖掘、生成 skill/subagent/command、人工审核应用。
- 旧计划中的架构设计和验收标准保留为 fallback 标准：如果社区插件无法通过验收，再按原设计补齐或重写。

### 0.2 非目标

- 不为了复刻而复刻，不重复实现社区已有的成熟插件。
- 不改 Pi 内核，除非后续 spike 证明 Extension API 无法表达关键能力。
- 不默认安装第三方包到全局配置。调研和试用优先用项目本地 `.pi/settings.json` 或一次性 `pi -e`。

### 0.3 安全前提

Pi packages 可以执行代码并影响 agent 行为，等同本机代码执行权限。所有第三方插件必须经过源码审查、版本固定、最小化启用和本地 smoke test 后才进入默认组合。

---

## 1. 调研结果

### 1.1 Pi 生态现状

调研时间：2026-06-15。

| 来源 | 观察 |
|------|------|
| `https://pi.dev/packages` | Package catalog 显示 `1-50 / 3979`，类型包括 `extension`、`skill`、`theme`、`prompt`、`package`。 |
| `https://pi.dev/` | Pi 官方定位是极简 harness：核心不内置 sub-agents、plan mode、todo、MCP 等能力，鼓励通过 extensions / skills / packages 构建或安装。 |
| `https://pi.dev/docs/latest/packages` | Pi packages 支持 npm、git、local path；可声明 extensions、skills、prompts、themes；项目本地安装可写入 `.pi/settings.json`。 |
| `https://pi.dev/docs/latest/extensions` | Extension 可注册 provider、tool、command、shortcut、flag，可监听 session/context/compaction 等事件，TypeScript 通过 `jiti` 直接加载。 |

结论：Pi 社区生态已经足够大，`mimo-pi` 不应先投入数周重写通用能力。正确路线是先做插件选型与验收。

### 1.2 能力覆盖矩阵

| MiMoCode 能力 | 社区候选 | 已观察到的能力 | 初步判断 |
|---------------|----------|----------------|----------|
| Persistent memory | `pi-hermes-memory`, `pi-memory`, `pi-memctx`, `@samfp/pi-memory`, `@pi-unipi/memory`, `pi-memory-md`, `pi-total-recall` | SQLite FTS5、Markdown memory、semantic/hybrid search、session search、background learning、auto-consolidation 等均已有实现。 | 不从零做 P1；先评测 `pi-hermes-memory`、`pi-memory`、`pi-memctx`。 |
| Context / compaction / checkpoint | `pi-context-manager`, `pi-vcc`, `pi-continue`, `pi-blackhole`, `pi-observational-memory`, `@remnic/plugin-pi` | tool result distillation、context aging、compaction ledger、algorithmic compaction、observational memory、Remnic checkpoint sync。 | 不从零做 P2；先选一个 context manager，再补 MiMo 语义层。 |
| Tasks / todo | `@juicesharp/rpiv-todo`, `@0xkobold/pi-task`, `pi-code-planner` | live todo overlay、SQLite task/kanban、persisted planning state。 | 不从零做 task system；评测是否满足分支和 compaction 生存。 |
| Goal / judge stop | `pi-until-done`, `@ricoyudog/pi-goal-hermes`, `@entelligentsia/pi-ralph`, `@capyup/pi-goal`, `pi-goal-x`, `pi-codex-goal` | `/goal` 或 `/until-done`、cross-model judge、autonomous continuation、预算/turn 管理。 | 不从零做 P3 goal；选型后只做 MiMo 命令别名或配置。 |
| Subagents | `pi-subagents`, `pi-agents-team`, `pi-crew`, `@gotgenes/pi-subagents`, `pi-fast-subagent`, `simple-subs`, `pi-mesh` | single/parallel/chain/background、RPC workers、live TUI、worktree/async orchestration、peer messaging。 | 不从零做 P4 subagent runtime；先选稳定实现。 |
| Compose / SDD workflow | `@gonrocca/zero-pi`, `@juicesharp/rpiv-pi`, `@capyup/pi-specs`, `@ifi/pi-spec`, `pi-code-planner`, `pi-mission-control`, `nightmanager` | explore -> plan -> build -> review/verdict、TDD evidence、spec store、PR/issue integration、resume。 | Compose 不从零写；优先评测 `zero-pi` 与 `rpiv-pi`。 |
| Dream / Distill | `pi-hermes-memory`, `pi-context-manager`, `@gonrocca/zero-pi`, `pk-pi-hermes-evolve`, `@cad0p/pi-napkin` | 有 auto-consolidation、tool result distill、skill auto-learning、反思式改进，但未确认完整 MiMo 式闭环。 | 保留为自研主线。社区插件只能作为参考或底层。 |
| Provider / OAuth | `pi-oauth`, `pi-supergrok`, `pi-vertex-ai-provider`, `tokenfactory-pi`, custom provider docs | 通用 OAuth / provider extension 模式存在。未确认 Xiaomi MiMo 专用 provider。 | 仍做 MiMo Provider。 |

### 1.3 重点候选插件

| 插件 | 角色 | 调研信号 | 需要验证 |
|------|------|----------|----------|
| `pi-hermes-memory` | 记忆主候选 | package 页描述含 SQLite FTS5、session search、secret scanning、auto-consolidation、background learning、procedural skills、368 tests。 | 是否能项目本地隔离；是否会保存敏感信息；Memory API 是否可被 Dream/Distill 复用。 |
| `pi-memory` | 轻量 memory 候选 | Markdown memory、daily log、scratchpad、qmd semantic search，核心无 qmd 也可用。 | qmd 依赖成本；是否适合团队同步；注入预算是否可控。 |
| `pi-memctx` | Markdown-native memory 候选 | local durable Markdown memory packs，before-prompt search/injection，after-turn learning。 | 与 Pi session tree、compaction 的交互；是否支持明确删除/更新。 |
| `pi-context-manager` | context 管理候选 | tool result processing、distillation、context aging、context panel、payload recording。 | distill 是否只作用于 tool result；是否会与 memory 插件重复压缩。 |
| `pi-subagents` | subagent 主候选 | 支持 chains、parallel execution、TUI clarification。 | 与最新版 Pi 兼容；后台任务、工具白名单、成本可观测性。 |
| `pi-agents-team` | multi-agent team 候选 | 背景 RPC workers，主 session 做 coordinator，带 live dashboard、steer、stop、copy、cost。 | 复杂度和稳定性；是否适合默认栈。 |
| `pi-until-done` | Goal/judge 候选 | `/until-done`，cross-model LLM judge，verifyCommand，防 premature done。 | 是否可换成 `/goal` 语义；是否能接入项目验证命令。 |
| `@gonrocca/zero-pi` | Compose/SDD 候选 | `/forge`，explore/plan/build/veredicto，TDD evidence，per-phase model autotune，run memory，skill auto-learning。 | 语言/流程是否符合本项目；与 MiMo Provider、记忆插件是否可组合。 |
| `@juicesharp/rpiv-pi` | Compose/SDD 候选 | discover/research/design/plan/implement/validate pipeline，12 个 specialist subagents。 | 依赖 `@tintinweb/pi-subagents` 版本；artifact 格式是否可复用。 |
| `pk-pi-hermes-evolve` | Self-evolution 参考 | Hermes Agent Self-Evolution 风格，反思改进 skills/prompts/instruction files。 | 是否真实覆盖 Dream/Distill；是否可借鉴 staging/apply 闸门。 |

### 1.4 关键差距

社区插件能覆盖“能力点”，但还不能直接等于 MiMoCode：

1. **统一产品语义缺失**：多个插件各自有命令、状态文件和 mental model，组合后不一定像一个产品。
2. **插件间状态不互通**：memory、goal、workflow、subagent 可能各写各的目录，Dream/Distill 需要统一读取。
3. **安全和质量不可默认信任**：社区包下载量不等于可纳入默认配置，必须审源码和 pin 版本。
4. **Dream/Distill 闭环未确认成熟实现**：已有 auto-consolidation、context distill、skill auto-learning，但缺少完整的“会话轨迹 -> 候选知识/流程 -> staging -> 人工审核 -> 生效 -> 后续调用”闭环。

---

## 2. 新路线图

### R0 — 插件调研与验收基线（预计 2~4 天）

目标：用同一套验收场景筛选社区插件，决定哪些集成、哪些自研。

任务：

- [ ] 建立候选清单：memory、context、goal、subagent、workflow/self-evolution 各选 2-3 个。
- [ ] 对每个候选做源码审查：
  - package manifest 是否明确；
  - 是否有 install scripts / lifecycle scripts；
  - 是否有不必要的网络访问；
  - 是否会上传会话、代码、memory；
  - 是否能项目本地启用和禁用。
- [ ] 用项目本地配置试用，不写全局默认：
  - `pi -e npm:<package>` 做一次性验证；
  - 或 `pi install -l npm:<package>@<version>` 写入 `.pi/settings.json`。
- [ ] 记录插件状态文件位置、命令、工具名、可配置项、冲突点。
- [ ] 用同一组 smoke scenarios 验证：
  - 新会话能召回“项目使用 npm / 禁止 build”之类规则；
  - compaction 后能回答“刚才做到哪一步”；
  - goal 未满足时不会提前停止；
  - subagent 能 read-only review；
  - SDD workflow 能产生可审查 artifacts；
  - 插件关闭后无残留副作用。

验收标准：

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-R0.1 | 每个候选插件有审查记录 | 文档列出版本、源码链接、权限、状态目录、风险。 |
| AC-R0.2 | 至少一个 memory 候选通过 smoke test | 新会话能召回上一会话保存的项目规则。 |
| AC-R0.3 | 至少一个 goal/judge 候选通过 smoke test | 故意提前结束时被 judge 拦住。 |
| AC-R0.4 | 至少一个 subagent/workflow 候选通过 smoke test | 能委派 read-only review，并返回可用结果。 |
| AC-R0.5 | 明确 build-vs-buy 决策 | 每个 MiMo 能力标注：集成、包装、自研、放弃。 |

交付物：

- 更新本文件的候选矩阵和决策。
- 如果需要单独沉淀，新增 `docs/research/pi-plugin-evaluation.md`。

### R1 — MiMo Provider 接入（预计 2~4 天）

目标：补齐社区生态缺口，把 Xiaomi MiMo 平台作为 Pi provider 接入。

任务：

- [ ] 阅读并确认当前 `docs/custom-provider.md`、`docs/providers.md` 和示例 provider。
- [ ] 实现项目本地 MiMo provider extension：
  - API Key 路径优先；
  - provider id 使用 `mimo`；
  - 模型列表尽量动态拉取，无法拉取时使用明确的最小 fallback；
  - 不硬编码用户凭证。
- [ ] OAuth 只在官方端点和授权流程确认后实现；未确认前不阻塞 R2。
- [ ] 写最小 provider 测试或 smoke script。

验收标准：

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-R1.1 | `MIMO_API_KEY` 路径可用 | Pi 模型列表出现 `mimo` provider。 |
| AC-R1.2 | 可完成一次真实模型调用 | 用 MiMo 模型发一条低成本 prompt，得到回复。 |
| AC-R1.3 | provider 不影响其他 providers | 不设置 `MIMO_API_KEY` 时 Pi 正常启动，其他模型可用。 |
| AC-R1.4 | OAuth 状态明确 | 实现或记录“因官方端点不明确而暂缓”。 |

### R2 — 社区插件组合成可用原型（预计 3~5 天）

目标：用通过 R0 的插件组成“80% MiMoCode-like”体验，不自研通用能力。

任务：

- [ ] 固定项目本地插件栈：
  - memory：从 `pi-hermes-memory` / `pi-memory` / `pi-memctx` 中选一个；
  - context：从 `pi-context-manager` / `pi-vcc` / `pi-continue` 中选一个；
  - goal：从 `pi-until-done` / `pi-goal-*` / `pi-ralph` 中选一个；
  - subagent/workflow：从 `pi-subagents` / `pi-agents-team` / `zero-pi` / `rpiv-pi` 中选一到两个。
- [ ] 统一项目配置：
  - 使用 `.pi/settings.json` 记录项目本地 package；
  - 固定 npm version 或 git ref；
  - 禁用不需要的 resources；
  - 记录手动启用/禁用方法。
- [ ] 建立 smoke checklist：
  - memory recall；
  - context continuation；
  - goal judge；
  - subagent review；
  - workflow artifacts；
  - package disable/rollback。

验收标准：

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-R2.1 | 新用户可按 README 启动插件栈 | 从干净 Pi 配置启动，能看到已加载 package。 |
| AC-R2.2 | 插件组合无明显命令冲突 | `/` 命令列表可读，重复命令有明确取舍。 |
| AC-R2.3 | 完成一个小型代码任务闭环 | plan/goal/subagent/memory 至少各使用一次。 |
| AC-R2.4 | 可安全回滚 | 删除 `.pi/settings.json` 中 package 后 Pi 正常恢复。 |

### R3 — MiMo Compatibility Layer（预计 3~5 天）

目标：在不重写底层插件的前提下，把多个社区插件包装成一个 MiMo 风格入口。

任务：

- [ ] 新建 `packages/coding-agent/src/extensions/mimo/` 聚合入口。
- [ ] 实现轻量命令别名和状态检查：
  - `/mimo-status`：列出 MiMo provider、memory、goal、workflow 插件状态；
  - `/mimo-doctor`：检查必要包、版本、配置和状态目录；
  - `/mimo-memory`：桥接已选 memory 插件的常用操作；
  - `/mimo-goal`：桥接已选 goal 插件或提示安装。
- [ ] 不直接 fork 社区插件代码，除非 R0 证明必须修补。
- [ ] 所有包装层都要在插件缺失时 graceful degradation。

验收标准：

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-R3.1 | `/mimo-status` 能识别当前插件栈 | 输出 provider、memory、goal、workflow 状态。 |
| AC-R3.2 | 插件缺失不崩溃 | 卸载一个候选插件后，doctor 给出明确修复建议。 |
| AC-R3.3 | 包装层不复制第三方插件核心逻辑 | 代码只做检测、路由、配置和命令适配。 |

### R4 — Dream/Distill 自我进化闭环（预计 1.5~2.5 周）

目标：实现 MiMoCode 最核心的差异化，不只压缩上下文，而是让 agent 从历史工作中沉淀可复用能力。

架构原则：

- 读取 Pi session JSONL 和已选插件的状态文件。
- 优先复用已选 memory 插件作为长期记忆后端。
- 所有自动生成的 skill / prompt / subagent / command 先进入 staging，不直接生效。
- 删除、覆盖、安装新能力必须经过用户确认。

任务（Dream）：

- [ ] 会话扫描器：
  - 列出近 N 天 Pi sessions；
  - 解析有效 branch；
  - 提取用户目标、关键决策、失败修复、项目规则、验证命令。
- [ ] 知识提取：
  - 用独立可配置模型；
  - 输出结构化候选：`kind/title/body/tags/sourceSession/sourceEntryIds/confidence`；
  - 与现有 memory 去重合并。
- [ ] Staging：
  - 写入 `.mimo/dream-staging/YYYY-MM-DD.jsonl`；
  - 用户确认后写入 memory 后端；
  - 拒绝项记录原因，避免重复推荐。
- [ ] 自动 Dream：
  - 时间门：距上次 dream >= 配置小时数；
  - 会话门：新增 session 数 >= 配置阈值；
  - 锁门：PID lock 防并发；
  - 默认只生成 staging，不自动 apply。

任务（Distill）：

- [ ] workflow miner：
  - 分析多会话工具调用序列；
  - 找出重复的 read/edit/test/review/release/debug 模式；
  - 结合 LLM 判断是否值得打包。
- [ ] packager：
  - 生成 Pi skill：`.mimo/distill-staging/skills/<name>/SKILL.md`；
  - 可选生成 prompt template；
  - 可选生成 subagent role definition；
  - 生成可审查 manifest，列出触发条件、权限、风险和来源 evidence。
- [ ] apply command：
  - `/distill-apply <id>` 复制到 `.pi/skills` / `.pi/prompts` / `.pi/agents`；
  - 不覆盖已有同名文件，除非用户确认；
  - 应用后运行 `/reload` 提示。

验收标准：

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-R4.1 | `/dream` 能扫描历史会话并生成候选知识 | staging JSONL 含 source session 和 confidence。 |
| AC-R4.2 | `/dream-apply` 写入已选 memory 后端 | 新会话能召回刚应用的知识。 |
| AC-R4.3 | 自动 Dream 不静默修改长期记忆 | 只写 staging，除非用户确认。 |
| AC-R4.4 | `/distill` 能发现重复 workflow | 构造重复会话后生成候选 workflow。 |
| AC-R4.5 | `/distill-apply` 生成的 skill 可被 Pi 加载 | `/reload` 后 skill 可见并可触发。 |
| AC-R4.6 | 删除/覆盖有明确闸门 | 取消确认后文件不变。 |

### R5 — 发布与文档（预计 3~5 天）

目标：把 `mimo-pi` 变成可安装、可解释、可回滚的 Pi enhancement layer。

任务：

- [ ] README 改为“插件优先”的真实状态描述。
- [ ] 写清楚默认推荐插件栈、可替代插件和版本 pin 策略。
- [ ] 写 `mimo-doctor` 的故障排查表。
- [ ] 写 Dream/Distill 数据安全说明。
- [ ] 跑 smoke checklist。

验收标准：

| 编号 | 验收项 | 验证方式 |
|------|--------|----------|
| AC-R5.1 | 新用户能按文档得到可用原型 | 从干净配置安装并跑通 smoke。 |
| AC-R5.2 | 用户能理解哪些是第三方能力 | README 明确列出 package 来源和风险。 |
| AC-R5.3 | 用户能禁用所有第三方插件 | 文档包含 rollback 步骤。 |

---

## 3. 旧从零实现计划的保留方式

旧 P0-P6 不删除其价值，但不再作为默认路线。

| 旧阶段 | 新定位 | 触发自研条件 |
|--------|--------|--------------|
| P0 工程基线 + Provider | 保留，其中 Provider 仍执行 | MiMo provider 无社区可用实现。 |
| P1 持久化记忆 | 降级为 fallback | 候选 memory 插件不能项目隔离、不能预算注入、不能通过安全审查。 |
| P2 检查点 + 上下文重建 | 降级为 fallback | context/compaction 插件不能在 compaction/resume 后稳定恢复任务状态。 |
| P3 任务追踪 + Goal | 降级为 fallback | goal/task 插件不能分支安全、不能独立 judge、不能配置验证命令。 |
| P4 子智能体 + Compose | 降级为 fallback | subagent/workflow 插件冲突严重、不可控或无法项目本地固定。 |
| P5 Dream & Distill | 提升为主线 | 社区插件只有局部能力，没有完整 self-evolution 闭环。 |
| P6 收尾打磨 | 保留 | 基于最终插件栈和自研能力重写文档。 |

---

## 4. 当前推荐执行顺序

1. **先做 R0，不写功能代码。**
   目标是用 evidence 决定插件栈，避免重复造轮子。

2. **并行推进 R1 的 MiMo API Key provider。**
   这是明确缺口，且后续所有 smoke 都能用真实 MiMo 模型验证。

3. **R2 只做项目本地组合，不做全局默认安装。**
   所有包必须 pin version 或 git ref。

4. **R3 做薄包装，不 fork 社区插件。**
   包装层只提供 MiMo 风格入口、doctor、状态检查和少量命令别名。

5. **R4 集中投入 Dream/Distill。**
   这是 `mimo-pi` 相对普通 Pi 插件栈的主要差异化。

---

## 5. 风险登记册

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 第三方插件有全系统权限 | 高 | 高 | 源码审查、版本 pin、项目本地安装、最小化 resources、记录状态目录。 |
| 插件之间命令/状态冲突 | 中 | 中 | R0 smoke test 覆盖组合场景；R3 doctor 检测冲突。 |
| 社区插件更新导致破坏 | 高 | 中 | 固定版本；升级必须重新跑 R0 smoke。 |
| 社区插件下载量虚高或质量不稳 | 中 | 中 | 不以下载量作为唯一依据；检查测试、源码、issue、release 频率。 |
| Dream/Distill 误提取错误知识 | 中 | 高 | staging-first、source evidence、confidence、人工 apply、可回滚。 |
| 自动 Dream 打扰主任务 | 中 | 中 | 三重门控、后台锁、默认只 staging、不自动写长期记忆。 |
| MiMo OAuth 官方细节不清 | 中 | 中 | API Key 先落地；OAuth 明确端点后再做。 |

---

## 6. 开发与验证规则

- 文档改动不需要跑 `npm run check`。
- 代码改动后跑 `npm run check`，不要跑 `npm run build`，除非用户明确要求。
- 新增或修改测试文件时，运行对应测试并迭代到通过。
- 第三方 package 试用优先：
  - 一次性：`pi -e npm:<package>@<version>`
  - 项目本地：`pi install -l npm:<package>@<version>`
- 不用 `git add -A`；提交前只 stage 本次会话修改的明确文件。

---

## 7. 参考来源

- Pi package catalog: `https://pi.dev/packages`
- Pi homepage: `https://pi.dev/`
- Pi packages docs: `https://pi.dev/docs/latest/packages`
- Pi extensions docs: `https://pi.dev/docs/latest/extensions`
- `pi-hermes-memory`: `https://pi.dev/packages/pi-hermes-memory`
- `pi-memory`: `https://pi.dev/packages/pi-memory`
- `pi-memctx`: `https://pi.dev/packages/pi-memctx`
- `pi-context-manager`: `https://pi.dev/packages/pi-context-manager`
- `pi-subagents`: `https://pi.dev/packages/pi-subagents`
- `pi-agents-team`: `https://pi.dev/packages/pi-agents-team`
- `pi-until-done`: `https://pi.dev/packages/pi-until-done`
- `@gonrocca/zero-pi`: `https://pi.dev/packages/%40gonrocca/zero-pi`
- `@juicesharp/rpiv-pi`: `https://pi.dev/packages/%40juicesharp/rpiv-pi`
- `@capyup/pi-specs`: `https://pi.dev/packages/%40capyup/pi-specs`
- `pk-pi-hermes-evolve`: `https://www.npmjs.com/package/pk-pi-hermes-evolve`

---

*文档版本：v2.0*
*更新记录：*
- *v2.0：根据 Pi 社区插件调研，把路线从“从零实现”重构为“插件优先 + MiMo Provider + Dream/Distill 自研”。*
- *v1.2：P0 新增 MiMo Provider 接入（API Key + OAuth）作为前置任务；M1 交付物含 Provider。*
- *v1.1：合入 `XIAOMI-MiMo-code` 调研成果（P1 双 backend + 增量提取、P4 worktree+Coordinator、P5 自动 Dream）。*
