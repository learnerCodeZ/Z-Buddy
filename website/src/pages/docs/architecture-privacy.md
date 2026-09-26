---
layout: ../../layouts/DocsLayout.astro
title: 架构与隐私
description: Z-Buddy 的数据流、文件清单、hook 协议来源与隐私边界——数据在哪、谁写的、会不会出门。
---

# 架构与隐私

> 一句话：**所有数据只写在你自己电脑的用户主目录里，插件无网络请求，桌宠应用不读你的代码。**

## 数据流

```
ZCode Agent
   │ 生命周期事件（7 种 hooks）
   ▼
z-buddy 插件（hooks/report.mjs）
   │  状态机翻译 + 轻量摘要落盘
   ▼
~/.z-buddy/{state.json, sessions/, events.jsonl, pause}
   │  桌宠应用每 600ms 轮询读取
   ▼
Z-Buddy 桌宠应用（宠物窗 + 主界面 + 托盘）
```

## 数据文件清单

| 文件 | 内容 | 由谁写 |
|---|---|---|
| `state.json` | 最近活跃会话的状态快照（兼容快照，旧逻辑读这个） | 插件 |
| `sessions/<会话id>.json` | 每会话独立状态分片——多会话聚合的数据源，各写各的文件、并发零竞态 | 插件 |
| `events.jsonl` | 事件流（追加写）。每条只存事件类型 / 工具名 / 预览（命令前 120 字符或文件路径）等轻量摘要；应用读取时超 5000 行自动轮转、保留尾部 2000 | 插件 |
| `pause` | 暂停标志（存在 = 暂停） | 桌宠应用 |
| `app.json` | 应用偏好（当前宠物 / 缩放 / 窗口位置 / 关闭行为） | 桌宠应用 |
| `pets/<名>/` | 外部宠物包（`atlas.png` + `pet.json`） | 用户 |

**不写项目目录，不读你的代码文件。** 删除 `~/.z-buddy/` 即彻底重置。

## Hook 协议从哪来

插件挂载 ZCode 的 7 种生命周期事件（`SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PermissionRequest` / `PostToolUse` / `PostToolUseFailure` / `Stop`）。协议字段以 [ZCode 开源源码](https://github.com/zai-org/ZCode)为准（`apps/zcode-cli/packages/core/src/hooks/`）：每个事件携带会话 ID、工作目录、时间戳、Agent 名等上下文，插件据此区分多会话与项目。snake_case 字段（如 `session_id`）是 ZCode 的 Claude Code 兼容层，本插件以 camelCase 主契约优先、兼容层与环境变量作后备。

## 状态怎么判定

桌宠最终显示哪个状态，按优先级从高到低：

1. **暂停**（`pause` 文件存在）；
2. **多会话取"最要紧"的**：出错 > 等审批 > 干活 > 思考 > 待机（同级取最近活跃）；
3. **待机超过 5 分钟** → 睡觉；
4. 待机 / 思考每 30 秒在两张形象之间轮换（夜羽有 `idle_alt` / `thinking_alt`）。

## 隐私边界

- 插件只写用户主目录 `~/.z-buddy/`，**绝不写项目目录**；
- 插件**零网络请求、零模型调用**；
- 事件流只存轻量摘要（命令前 120 字符 / 文件路径），不存工具结果全文；
- 桌宠应用联网只有一种情况：你点了主界面的 🔄 更新按钮（访问 GitHub Releases 下载新版）；
- 不收集任何遥测。本项目统计的唯一数据是 GitHub 公开的 Star 与 Issue 数。

## 暂停拦截的边界

- 点桌宠 → 写 `pause` 文件 → 插件对 `PreToolUse` / `PermissionRequest` 返回 `deny`：拦的是**下一次**工具调用；
- **正在执行中的单次操作拦不住**（等它跑完才停）——这是 hook 拦截机制的天然边界，宣传与预期都按此对齐；
- 命令文本含 `.z-buddy/pause` 时豁免拦截——保证你随时能自己解锁；
- 桌宠是你手里的刹车，不是隐形的监控者：**AI 在干什么，你永远看得见；它要乱来，你一点就停。**

## 相关页面

- [宠物包规范 v1](/Z-Buddy/docs/pet-pack-spec/) —— 想自己做宠物看这里
- [ZCode 开源的影响](/Z-Buddy/docs/zcode-opensource/) —— 协议调研与开发规划
- [FAQ / 故障排查](/Z-Buddy/docs/faq/) —— 出问题了看这里
