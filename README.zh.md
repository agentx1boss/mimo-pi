<h1 align="center">mimo-pi</h1>

<p align="center"><strong>在 Pi 内核上重建 MiMoCode 的核心能力——一个能跨会话记忆、自我进化的 AI 编程智能体。</strong></p>

<p align="center">
  <a href="README.md">English</a> | 中文
</p>

---

## 这是什么

`mimo-pi` 是一个实验性项目,目标是在 [Pi](https://github.com/earendil-works/pi) 的极简内核之上,重新实现 [MiMoCode](https://github.com/XiaomiMiMo/MiMo-Code) 的核心差异化能力。

它不重起炉灶,而是回答一个问题:

> **如果把 MiMoCode「跨会话记忆 + 智能上下文管理 + 自我进化」的全部能力,表达为一组 Pi Extension,会是什么样?**

Pi 提供了 agent loop、会话树持久化、上下文压缩(compaction)、扩展钩子这套硬基础设施;MiMoCode 贡献了记忆系统、检查点、Dream/Distill 这些让 agent「越用越懂你的项目」的设计思想。`mimo-pi` 把两者结合起来。

### 项目状态

> ⚠️ **早期开发中。** 目前本仓库是 Pi 的 fork,附带一份完整的开发计划([`MIMOCODE_PLAN.zh.md`](./MIMOCODE_PLAN.zh.md)),尚未开始功能实现。下文描述的是**目标能力**,而非已交付功能。

## 与上游的关系

| 上游 | 角色 | 链接 |
|------|------|------|
| **[earendil-works/pi](https://github.com/earendil-works/pi)** | 底层内核。本仓库 fork 自此,复用其 agent runtime、TUI、多 Provider LLM API、会话管理与扩展系统 | [pi.dev](https://pi.dev) |
| **[XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code)** | 设计蓝本。本项目的记忆、检查点、Compose、Dream/Distill 等核心能力,均以此为参照重新实现 | [mimo.xiaomi.com](https://mimo.xiaomi.com/zh/mimocode) |

衷心感谢这两个上游项目。没有 Pi 的工程基础和 MiMoCode 的产品洞察,这个实验无从谈起。

## 设计理念

**Pi 是「极简内核 + 可扩展 harness」**,MiMoCode 的全部差异化都可以表达为一组 Pi Extension。因此 `mimo-pi` 的策略是:

- **不改 Pi 内核**——所有 MiMo 能力都以 Extension 形式构建,保持与上游 merge 的能力。
- **借鉴而不照抄**——Pi 自带的示例扩展(`custom-compaction.ts` / `todo.ts` / `subagent/` / `handoff.ts`)已覆盖大量功能骨架,我们补齐的是 MiMoCode 的工程质量:SQLite FTS5、token 预算化注入、独立裁判模型、子智能体编排。
- **一个功能 = 一个 Extension**——每个能力独立可加载,也可在聚合入口一起启用。

```
packages/coding-agent/src/extensions/mimo/   ← 规划中的 MiMo 扩展层
├── memory/        # 持久化记忆(SQLite FTS5 + 预算化注入)
├── checkpoint/    # 检查点 + 上下文重建
├── tasks/         # 树状任务追踪
├── goal/          # Goal + 裁判模型停止条件
├── subagent/      # 子智能体编排
├── compose/       # specs-driven 编排模式
├── dream/         # Dream & Distill 自我进化
└── shared/        # 共享工具(store / token 计数 / prompt 模板)
```

## 目标能力(规划中)

下述能力均来自 MiMoCode 的设计,目标是作为 Pi Extension 重新实现:

### ⭐ 持久化记忆
基于 SQLite FTS5 全文检索的跨会话记忆,在会话恢复时按 token 预算将相关记忆注入上下文。包括项目记忆(`MEMORY.md`)、会话检查点、笔记暂存与逐任务进展。让 agent 无需每次重新理解项目背景。

### 检查点 + 上下文重建
在上下文压缩前由子模型生成结构化 checkpoint 快照;上下文接近上限时,从最新 checkpoint、项目记忆、任务进展重建上下文,让 agent 无缝继续当前任务。

### 任务追踪
树状任务系统(T1、T1.1、T1.2…),状态持久化在 session entry 中,天然支持分支(`/fork`)。自动与检查点联动,恢复会话时进度不丢失。

### Goal / 裁判停止条件
`/goal` 为会话设置停止条件。当 agent 想停下来时,由**独立裁判模型**评估对话内容,判断条件是否真正满足——防止自主工作中的"乐观停止"。

### 子智能体编排
主智能体按需生成子智能体,支持单任务、并行、链式三种模式,共享会话上下文,具备生命周期追踪与后台执行能力。

### Compose 编排模式
specs-driven 的结构化开发流程:规划 → 执行 → 代码审查 → TDD → 调试 → 验证 → 合并,编排从 spec 到交付的完整生命周期。

### ⭐ Dream & Distill(自我进化)
- **`/dream`**——扫描近期会话轨迹,提取持久知识到项目记忆,清理过时条目。
- **`/distill`**——发现近期工作中重复的手动工作流,将高置信度候选打包成可复用的 skill / subagent / command。

这是 MiMoCode 相对 Pi 生态最大的差异化——让 agent 真正「越用越强」。

## 路线图

详见 [`MIMOCODE_PLAN.zh.md`](./MIMOCODE_PLAN.zh.md)(含每个阶段的任务清单与验收标准)。精简概览:

| 阶段 | 内容 | 里程碑 |
|------|------|--------|
| P0 | 工程基线(骨架 / 构建 / 测试链路) | |
| P1 | ⭐ 持久化记忆(SQLite FTS5 + 预算化注入) | **M1** 可用原型 |
| P2 | 检查点 + 上下文重建 | |
| P3 | 任务追踪 + Goal 裁判停止 | **M2** 记忆闭环 |
| P4 | 子智能体编排 + Compose | **M3** 编排能力 |
| P5 | ⭐ Dream & Distill 自我进化 | **M4** 自我进化 |
| P6 | 多 mode 切换 / 收尾打磨 / 文档 | **M5** 可发布 |

## 开发

本仓库是 Pi monorepo 的 fork,开发方式与上游一致:

```bash
npm install --ignore-scripts   # 安装依赖
npm run build                  # 构建所有包
npm run check                  # lint / 格式化 / 类型检查
./test.sh                      # 运行测试
./pi-test.sh                   # 从源码运行 pi
```

各包文档见 [`packages/coding-agent/docs/`](./packages/coding-agent/docs/)。

## 许可证

MIT。继承自上游 Pi。

使用本仓库代码还须遵守 Pi 的相关使用限制与商标政策。
