---
layout: ../../layouts/DocsLayout.astro
title: ZCode 开源了：对 Z-Buddy 意味着什么
description: ZCode 全量开源（Apache-2.0）后，我们把 hook 协议与插件市场的源码核对了一遍——这篇讲清楚确认到的事实、它给 Z-Buddy 带来的升级方向，以及接下来的开发规划。
---

# ZCode 开源了：对 Z-Buddy 意味着什么

发布于 2026-09-25

> 2026-09-20，ZCode 正式开源：[github.com/zai-org/ZCode](https://github.com/zai-org/ZCode)。
> Apache-2.0 协议，TypeScript monorepo，Agent CLI、hook 引擎与插件系统均为完整源码（仓库历史经过重写，仅保留初始发布提交）。

Z-Buddy 的核心链路完全建立在 ZCode 的 hooks 与插件机制之上。过去我们对齐协议靠的是官方文档加实测；开源之后，这些都可以直接读源码钉死。这篇文章记录我们核对到的结论，以及它们如何改变 Z-Buddy 的开发规划——也是给所有好奇"桌宠为什么这样做"的用户和贡献者的一份技术备忘。

## 一、源码里确认到的事实

### 1. Hook 事件就是 7 种，我们的状态机已经覆盖全部

`apps/zcode-cli/packages/contracts/src/hooks/index.ts` 中的 `HookEventName` 枚举恰好是 Z-Buddy 插件挂载的那 7 种，没有 `SessionEnd`、没有额外事件：

| Hook 事件 | ZCode 触发时机 | Z-Buddy 状态机映射 |
|---|---|---|
| `SessionStart` | 会话启动 | → idle |
| `UserPromptSubmit` | 用户发请求 | → thinking |
| `PreToolUse` | 工具调用前 | → working |
| `PermissionRequest` | 权限请求 | → permission |
| `PostToolUse` | 工具调用后 | → working |
| `PostToolUseFailure` | 工具失败 | → error |
| `Stop` | 一轮结束 | → idle |

结论：**桌宠的状态机不需要改动**，它已经覆盖了 ZCode 开放的全部生命周期表面。

### 2. Hook 输入远比我们用到的丰富

这是本次核对最大的收获。`core/src/hooks/configured-runner-input.ts` 显示，每个 hook 的 stdin JSON 都携带完整上下文（`...input` 全量展开，另附一组 snake_case 别名）：

| 字段 | 含义 | Z-Buddy 现状 |
|---|---|---|
| `sessionId` / `session_id` | 会话 ID | 已读（存入事件流） |
| `cwd` | 当前工作目录（即正在干活的项目） | **未用，可白拿** |
| `timestamp` | 事件发生时间 | 未用（目前自己取 `Date.now()`） |
| `turnId` / `traceId` | 轮次与调用链 ID | 未用，可做活动页按轮次分组 |
| `agentName` / `agent_type` | Agent 名称（可区分子 agent） | 未用 |
| `mode` / `permission_mode` | 协作模式 | 未用 |
| `toolName` / `tool_input` / `tool_use_id` | 工具信息 | 已读（状态明细 + 预览） |
| `tool_response`（仅 PostToolUse） | 工具结果 | 未用，可做结果预览 |
| `last_assistant_message`（仅 Stop） | 助手最后一条回复 | 未用，可做"刚完成了什么"摘要 |
| `error_details` / `is_interrupt`（仅 PostToolUseFailure） | 错误与打断标记 | 已读 |
| `transcript_path` | 本轮对话记录的临时文件 | 建议不依赖（运行后即清理） |

hook 进程同时注入环境变量：`ZCODE_SESSION_ID`、`ZCODE_PROJECT_DIR`、`ZCODE_PLUGIN_ROOT`、`ZCODE_PLUGIN_DATA`、`ZCODE_PLUGIN_ID`、`ZCODE_PLUGIN_NAME`。

### 3. Hook 输出协议比我们用的宽

我们目前只用了 `permissionDecision: "deny"`（暂停拦截）和 `additionalContext`（轻量回写）。完整协议还包括：

- `decision: "approve" | "block"`、`continue: false` + `stopReason`——更强的干预能力；
- `systemMessage`——给 ZCode 界面发提示；
- PreToolUse 甚至可以 `updatedInput` 改写工具入参。

Z-Buddy 的产品原则是"只旁路感知、不介入 Agent"，这些能力暂时用不上，但暂停拦截的语义现在可以对照 `core/src/hooks/output.ts` 与超时/取消逻辑（`runner-helpers.ts` 的 timeout abort 路径）精确钉死，过去"幽灵暂停"这类玄学问题不再需要靠日志猜。

### 4. snake_case 是兼容层，主契约是 camelCase

源码注释明说：`session_id`、`tool_name` 等 snake_case 字段是**Claude Code 兼容层**，ZCode 内部主契约是 camelCase。这对 Z-Buddy 插件是一个明确的迁移信号：逐步改用 `ZCODE_*` 环境变量与 camelCase 字段，避免未来兼容层被精简时插件失效。

### 5. 官方插件市场真实存在，且在收社区插件

桌面端的插件商店不是空壳：官方市场 `zcode-plugins-official` 的 CDN manifest 公开可读（`https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json`），当前收录 26 个插件，其中包含腾讯云、GitLab、Obsidian 等**第三方**作品。条目格式明确：

```jsonc
{
  "name": "插件 ID",
  "source": { "source": "url", "type": "zip", "url": "…/plugin.zip", "sha256": "…" },
  "description_i18n": { "en": "…", "zh-CN": "…" },
  "author": { "name": "…" },
  "icon": "https://…",
  "category": "developer-tools",
  "keywords": ["…"]
}
```

具体的收录申请入口（提交流程）我们尚未确认，需要进一步查阅其贡献文档或社区渠道。

## 二、对 Z-Buddy 的三层影响

**短期——协议红利可以直接白拿。** 每个事件现在都带着 `cwd`（正在给哪个项目干活）、`timestamp`、`turnId`、`agentName`；`Stop` 还带 `last_assistant_message`。这些字段全部现成，桌宠与主界面只需要消费：总览页显示"当前项目"、活动页按轮次分组、任务完成时显示一句话摘要。改动小、收益立现。

**中期——多会话聚合的方案可以定型了。** Z-Buddy 路线图上的下一站是会话聚合：目前多个 ZCode 会话并发时，`state.json` 是 last-write-wins，桌宠只反映"最后一个说话的会话"。过去不知道该怎么设计探测机制，现在确认每个 hook 输入必带 `session_id`，标准答案就是 `state.json` 改成 per-session map（`session_id → status/since/last_event`），应用端聚合出"哪个会话在干活、哪个在等审批"。不需要任何猜测。

**长期——分发与生态。** 现在 Z-Buddy 插件要走"添加本地市场 → 安装 → 新开会话"，这是新用户流失最大的摩擦点。官方市场已在收录社区插件且 manifest 格式公开，把 z-buddy 插件打进去是明确可行的目标——用户从手动添加市场变成商店一键安装，这是拉新最大的杠杆。配合 Z-Buddy 已兼容的 Petdex 宠物包格式，"ZCode 生态桌宠标准"这个位置是可以去占的。

## 三、接下来的规划（按优先级）

1. **插件协议升级**：改用 `ZCODE_*` 环境变量 + camelCase 主契约；事件流与状态快照吃进 `cwd` / `timestamp` / `turnId` / `agentName`；主界面加"当前项目"显示；顺带**按工具名识别 computer-use 的桌面操作**——活动页将"桌面操作"单独分类，宠物增加"正在操控屏幕"的状态表现。同阶段打包一组桌宠体验修缮：**记住拖放位置、支持宠物缩放、事件流自动轮转**防膨胀。向后兼容，改动集中在 `hooks/report.mjs` 与前端展示层。
2. **多会话聚合按 `session_id` 设计**：`state.json` 的 per-session 化方案写入架构文档，随后实现；主界面同步升级为驾驶舱——多会话卡片、**今日统计**（工具调用数 / 活跃时长）、活动页按项目与会话筛选。
3. **人机协调提示（computer use 增强，紧随多会话聚合实施）**：Agent 通过 computer use 接管鼠标键盘时，用户暂时失去电脑控制权——桌宠切换醒目的"正在操控你的电脑"状态作为预警；而点击宠物的暂停（hook 返回 `deny`）对桌面操作是现成的紧急刹车。展示基础是本阶段新增的**动态气泡**能力（头顶气泡从烘焙图集升级为运行时绘制，可显示自由文本）。"Agent 开始动你的电脑时，桌宠会告诉你，还能一键叫停"，这与产品"旁路感知、不介入"的定位天然契合。
4. **官方市场收录专项**：调研提交流程；做一个脚本从仓库 `marketplace/z-buddy` 生成符合 CDN 格式的条目（zip + sha256 + 双语描述 + icon + category）。
5. **建立上游跟踪习惯**：Z-Buddy 对上游的唯一强依赖面是 `apps/zcode-cli/packages/core/src/hooks/` 目录，watch 仓库即可在协议变动（加事件、改字段）时第一时间跟进，而不是等用户来报"桌宠不动了"。

## 四、风险与注意

- **兼容层依赖**：snake_case 字段与这 7 个事件名今天是稳定的，但它们是"Claude Code 兼容"而非 ZCode 原生契约。长期应向 `ZCODE_*` 环境变量与 camelCase 主契约靠拢（即规划第 1 项）。
- **不依赖临时产物**：`transcript_path` 指向每次 hook 运行的临时文件，运行后即清理，不要在插件里读取它。
- **收录未确认**：官方市场的提交流程入口尚未确认，在拿到明确答复前，本地市场安装方式继续保留为兜底。
- **许可合规**：Apache-2.0 允许参考其实现，若引用代码需保留 NOTICE 与版权声明；Z-Buddy 桌宠应用本体（Tauri）不依赖 ZCode 代码，无直接影响。

## 参考

- ZCode 开源仓库：<https://github.com/zai-org/ZCode>
- Hook 事件与输入契约：`apps/zcode-cli/packages/contracts/src/hooks/index.ts`
- Hook stdin 兼容层：`apps/zcode-cli/packages/core/src/hooks/configured-runner-input.ts`
- Hook 输出处理：`apps/zcode-cli/packages/core/src/hooks/output.ts`
- 官方插件市场 manifest：<https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json>
- Z-Buddy 插件源码：仓库内 [`marketplace/z-buddy/hooks/report.mjs`](https://github.com/learnerCodeZ/Z-Buddy/tree/main/marketplace/z-buddy)
