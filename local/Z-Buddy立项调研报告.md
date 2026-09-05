# Z-Buddy 立项调研报告：Codex 桌宠生态 × ZCode 桌宠开发方案 × 协同设计

> 调研日期：2026-09-05
> 项目代号：**Z-Buddy**（ZCode 桌宠）
> 状态：调研与立项设计已完成，待进入 Phase 0 技术验证
> 调研人备注：本文档为立项前调研，结论基于公开网络资料与 GitHub 仓库核实；第二轮调研（同日）新增第 8 节"电脑操作协同"专题，含作者在 ZCode Computer Use 环境中的一手观察；第三、四轮讨论沉淀为 7.1 与 8.6 两节设计；关键结论已汇总到第 0 章概要与第 10 章决策记录。

---

## 目录

- [0. 项目概要（Executive Summary）](#0-项目概要executive-summary)
- [1. 调研背景与目标](#1-调研背景与目标)
- [2. Codex 官方桌宠功能调研（Q1 上半部分）](#2-codex-官方桌宠功能调研q1-上半部分)
  - [2.1 功能概览](#21-功能概览)
  - [2.2 开启方式](#22-开启方式)
  - [2.3 hatch-pet 自定义宠物机制（关键技术参考）](#23-hatch-pet-自定义宠物机制关键技术参考)
  - [2.4 宠物包（Pet Pack）格式](#24-宠物包pet-pack格式)
  - [2.5 社区总结的宠物设计要点](#25-社区总结的宠物设计要点)
- [3. 国内外非官方生态盘点（Q1 下半部分）](#3-国内外非官方生态盘点q1-下半部分)
  - [3.1 项目清单](#31-项目清单)
  - [3.2 clawd-on-desk 的状态感知架构（最有参考价值）](#32-clawd-on-desk-的状态感知架构最有参考价值)
  - [3.3 生态结构小结](#33-生态结构小结)
- [4. ZCode 现状与扩展能力（Q2 的基础）](#4-zcode-现状与扩展能力q2-的基础)
  - [4.1 官方现状](#41-官方现状)
  - [4.2 ZCode 的扩展机制（决定桌宠形态的关键）](#42-zcode-的扩展机制决定桌宠形态的关键)
- [5. 形态分析：ZCode 桌宠应该做成什么？（Q2）](#5-形态分析zcode-桌宠应该做成什么q2)
- [6. 分阶段计划](#6-分阶段计划)
- [7. 新想法候选池（MVP 之后的差异化方向）](#7-新想法候选池mvp-之后的差异化方向)
  - [7.1 深化设计：GLM 对话气泡与「点击聊天」机制](#71-深化设计glm-对话气泡与点击聊天机制)
- [8. 专题调研与功能设计：桌宠 × 电脑操作协同（Computer Use）](#8-专题调研与功能设计桌宠--电脑操作协同computer-use)
  - [8.1 调研结论：四个子问题](#81-调研结论四个子问题)
  - [8.2 产品洞察：为什么"桌宠 × Computer Use"是天作之合](#82-产品洞察为什么桌宠--computer-use是天作之合)
  - [8.3 功能设计：Z-Buddy「电脑操作协同」模式（三层）](#83-功能设计z-buddy电脑操作协同模式三层)
  - [8.4 技术可行性核对表](#84-技术可行性核对表)
  - [8.5 对路线图的影响](#85-对路线图的影响)
  - [8.6 增补设计（第四轮讨论）：人机接力 与 后台任务气泡](#86-增补设计第四轮讨论人机接力-与-后台任务气泡)
- [9. 风险与注意事项](#9-风险与注意事项)
- [10. 决策记录与待决问题](#10-决策记录与待决问题)
- [11. 参考资料](#11-参考资料)
- [附录 A：术语表](#附录-a术语表)

---

## 0. 项目概要（Executive Summary）

> 赶时间只读这一节：项目是什么、为什么做、已经定了什么、怎么算成功。

**一句话定位**：Z-Buddy 是 ZCode 桌宠——一只悬浮在桌面上的原创宠物，实时反映 ZCode Agent 的工作状态，并延伸为 Agent 的"桌面化身"：可视化电脑操作、人机接力协作、GLM 对话气泡、后台任务中心。

**要解决的三个缺口**：

1. **生态缺口**：Codex 有桌宠且有 4681+ 宠物包的繁荣生态，ZCode 官方没有任何桌宠功能（第 2/3/4 章核实）；
2. **信任缺口**：ZCode 的电脑操作多为无障碍后台执行，屏幕上什么都看不到——用户不知道 AI 在干什么（8.2）；
3. **协调缺口**：人机同时操作电脑时协议层没有任何门控，存在双指针竞态（8.1-Q4）。

**产品形态（已定，见 D1-D9）**：ZCode 插件（hooks 状态感知 + skill 宠物包生成 + 自建 MCP 操作权证）+ 独立桌宠应用（Electron/Tauri，Windows 优先），宠物包格式兼容 Codex hatch-pet——直接接入 4681+ 宠物存量生态。

**功能版图**：

- 对齐 Codex（P1 必做）：状态动画全覆盖、悬浮拖动、深夜睡觉、`/zpet` 命令、GLM 生成宠物包；
- 差异化护城河（P2/P3）：GLM 对话气泡（7.1）、电脑操作可视化（8.3-L1）、人机接力协议（8.6.1）、后台任务气泡（8.6.2）、子代理多宠物（想法 #3）——全部依赖 GLM/插件/Computer Use，**Codex 桌宠做不到**。

**里程碑**：P0 技术验证（"屏幕角落有个东西会动"）→ P1 MVP 仿 Codex（"装个插件就有"）→ P2 生态与可视化（"好用"）→ P3 护城河（"独有"）。各阶段任务清单见第 6 章。

**成功指标**：

| 阶段 | 指标 |
|---|---|
| P1 自用达标 | 我自己每天开着它、离不开它 |
| P2 传播 | 插件市场安装量 / GitHub Star（对标 clawd 2.6K Star） |
| P3 生态 | 宠物包数量、hatch 技能生成成功率、社区投稿 |

**项目性质与成本**：个人项目；运行成本仅 GLM-Flash API 费用（闲聊场景每月可忽略）；全部技术组件有开源先例，无需要从零发明的东西（3.3）。

---

## 1. 调研背景与目标

### 背景

OpenAI 的 Codex 上线了"宠物模式（Pet Mode）"，可以让 AI 编程助手以桌宠的形式悬浮在桌面上，实时反映 Agent 的工作状态，在国内外社交平台（小红书、X、知乎等）热度很高，并且已经形成了一个活跃的第三方生态（4000+ 社区宠物包、多个运行时和合集仓库）。

ZCode 是智谱（Z.ai）官方的 AI 编程工具（GLM-5.3 官方 Harness）。**经核实官方更新日志（最新 v3.11.2：PDF/媒体预览、按工作区安装插件、插件更新提醒等），ZCode 目前没有任何桌宠相关功能。**

### 目标

我最常用的工具就是 ZCode，希望开发一款 ZCode 桌宠，让 ZCode 用户也能像 Codex 用户一样拥有一只桌面宠物。

### 开发路线（初步决定）

1. **先仿照 Codex 桌宠做一个 MVP**（复刻其核心体验：悬浮、可拖动、随 Agent 状态切换动画）；
2. **再叠加自己的新想法**（养成、GLM 对话气泡等，详见第 7 节）；
3. **让桌宠在"电脑操作（Computer Use）"场景发挥作用**——ZCode 操控电脑时，桌宠与用户协同完成任务（第二轮调研新增，专题见第 8 节）。

### 本次调研要回答的三个核心问题

- **Q1**：Codex 桌宠到底是怎么做的（官方功能机制 + 非官方生态有哪些可借鉴的项目）？
- **Q2**：ZCode 桌宠应该做成什么形态——独立于 ZCode 桌面端之外的软件？一个 Skill？还是一个插件？还是别的？
- **Q3**：在"ZCode 操控电脑"的场景里桌宠能扮演什么角色？Codex 生态是否有人做过同类结合？Codex 与 ZCode 的 Computer Use 底层逻辑、前台/后台特性、被打断后的行为分别是什么？

---

## 2. Codex 官方桌宠功能调研（Q1 上半部分）

### 2.1 功能概览

Codex 宠物模式是一个**内置于 Codex 桌面端的全局悬浮层**：

- 宠物悬浮于桌面最上层，可拖动，不遮挡工作；
- 宠物动画**实时映射 Agent 生命周期状态**：`idle`（待机/呼吸/眨眼）→ `running`（任务执行中）→ `waiting-for-input`（等待用户输入）→ `waiting-for-review` / `review`（等待审查）→ `failed`（失败/沮丧）→ 完成（庆祝）；
- 据体验报告，深夜（约 23 点后）宠物会冒出 "Zzz" 气泡睡觉；
- 内置约 **8 种宠物**形象可直接选择。

### 2.2 开启方式

| 方式 | 操作 |
|---|---|
| 内置宠物 | 更新 Codex → `Settings → Appearance → Pets` → 选择宠物 → 输入 `/pet` 唤醒 |
| 快捷召唤 | 输入框直接输入 `/pet` |
| 自定义宠物 | 安装 hatch-pet 技能：`$skill-installer hatch-pet`，然后执行 `/hatch`（或 `/hatch-pet`） |

### 2.3 hatch-pet 自定义宠物机制（关键技术参考）

- hatch-pet 是 OpenAI Skills 仓库中的官方 Skill，功能是"**从概念、一张或多张参考图，生成一只 Codex 兼容的动画桌宠**"。它负责宠物专属的 prompt 规划和动画行（animation rows）生成。
- 官方版 hatch-pet 依赖 Codex 内部的 `$imagegen` 系统技能（需要 Codex Pro 订阅）；社区已有替代实现（如 RunComfy 版 codex-pet skill，只需 `RUNCOMFY_TOKEN`，跑同样的动画行规格）。
- **重要限制**（来自社区实测）：图片图集只决定"哪个状态播放哪段动画"，**不能控制状态时长**——如果 Codex 提前把 running 任务切回 idle，宠物会跟着立刻回 idle。

### 2.4 宠物包（Pet Pack）格式

Codex 桌宠的本质是一个**精灵图（sprite sheet）+ 状态映射**：

- 一张横向分帧的精灵图，**每一"行"对应一个语义状态**：
  - 行 1：`idle` — 呼吸、眨眼
  - 行 2：`running` / `running-right` — 向右跑
  - 行 N：`failed` — 失败沮丧
  - 行 N+1：`review` — 专注审查
  - 等等，共 9 组左右动作（社区教程提到"9 pet animations"）
- 自定义宠物安装后是本地目录（社区教程披露了自定义宠物文件夹的文件结构）；
- 这个格式已被第三方运行时（Codex-Pet-Live）和 clawd-on-desk 的"导入 Codex Pet 动画包"功能**反向兼容**，说明格式是公开可解析的。

### 2.5 社区总结的宠物设计要点

- 轮廓要清晰——缩到屏幕角落还能认出来；
- 颜色控制在 2–4 种；
- 动作要有状态感——待机 / 工作 / 完成 三态明显不同；
- 人设要具体，别只写"一只猫"。

> 📌 本节来源备注：功能机制与开启方式见 [11. 参考资料](#11-参考资料)「Codex 官方功能」分类（IT之家、知乎保姆级教程、53AI 动画行解析、utto hatch-pet 指南等）。

---

## 3. 国内外非官方生态盘点（Q1 下半部分）

Codex 桌宠已经形成了「**宠物包资产 → 播放器/运行时 → 状态感知 → 分发渠道**」的完整生态链。

### 3.1 项目清单

| 项目 | 类型 | 平台/技术栈 | 核心亮点 |
|---|---|---|---|
| [Petdex](https://petdex.dev/)（[crafter-station/petdex](https://github.com/crafter-station/petdex)） | 宠物分发平台 | 官网 + `npx petdex install <name>` | 收录 **4681+** 社区宠物（哆啦A梦、蜡笔小新、卡皮巴拉、皮卡丘…），一键安装，跨平台，社区志愿制作 |
| [Awesome-Codex-Pets](https://github.com/T-Zevin/Awesome-Codex-Pets) | 生态导航/awesome 合集 | — | 汇总宠物作品、下载站点、开源项目、教程、Prompt 灵感；覆盖宠物包/播放器/CLI/桌面应用/React 组件五类 |
| [legeling/awesome-codex-pet](https://github.com/legeling/awesome-codex-pet) | 宠物画廊 | — | 社区宠物画廊，带完整动画预览 + 一键安装命令，有中文文档 |
| [VectorPeak/Codex-Pet-Live](https://github.com/VectorPeak/codex-pet-live) | **独立运行时** | Windows / PySide6 | 把 Codex 生成的 hatch-pet 角色包变成独立可跑的桌宠（idle/移动/动作/交互），可调宠物大小、默认宠物、界面语言、主题色 |
| [rullerzhou-afk/clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) | **通用 Agent 桌宠**（约 2.6K Star） | Windows 11 / macOS / Linux / **Electron** | 像素螃蟹 Clawd，感知 20 个 AI 编程工具状态；权限审批直接在桌面弹卡片（Ctrl+Shift+Y/N）；**可直接导入 Codex Pet 动画包**；三套内置主题（螃蟹/三花猫/云宝）+ 自定义主题 |
| Codex Dream Skin | 换肤工具 | Windows / macOS | 开源换肤，支持自定义背景 |
| runcomfy `codex-pet` skill | 生成技能替代 | 需 RUNCOMFY_TOKEN | 不依赖 Codex Pro 的 $imagegen，跑同样的动画行规格 |
| miles007 宠物合集 | 宠物包集合 | — | 35 只宠物（小龙、狐狸、水母、熊猫、猫头鹰、史莱姆、麒麟、蝙蝠等） |

（另有 GitHub Topic 聚合页：[codex-pet](https://github.com/topics/codex-pet)、[codex-pets](https://github.com/topics/codex-pets)，主题下还有"开源 Agent 桌宠，支持多桌宠并行、AI 聊天、持久记忆、定时任务"等衍生方向的项目。）

### 3.2 clawd-on-desk 的状态感知架构（最有参考价值）

clawd-on-desk 是目前**架构上最接近我们要做的东西**的开源项目，它感知 Agent 状态有四条通道：

1. **Hooks**——向各 Agent 工具注入生命周期 hook（Claude Code 兼容规范）；
2. **日志轮询**——轮询 Agent 的本地日志文件推断状态；
3. **Plugin**——Agent 插件形式集成；
4. **Extension**——浏览器/IDE 扩展。

它的**自定义 HTTP Agent 协议**（给不在支持列表里的工具留的口子）：

- 在 `Settings → Agents` 注册本机可执行文件，分配稳定的 `custom-` ID；
- **注册 ≠ 接入**：不会自动装 hook，需要接入方主动向 Clawd 的 `/state` 端点 HTTP POST 上报生命周期事件；
- 端口是动态的，接入方必须先读 `~/.clawd/runtime.json` 拿当前端口；
- custom v1 协议不支持 `/permission` 上报（权限审批仍走原工具界面）；
- 权限 Hook 在 Clawd 未运行时静默跳过，不影响 Agent 正常工作——**这个"无侵入降级"设计值得抄**；
- 支持 SSH 反向端口转发，远程服务器上 Agent 的状态也能传回本地桌宠。

### 3.3 生态结构小结

```
┌─────────────────────────────────────────────────────┐
│ 资产层   宠物包（sprite sheet + 状态映射 JSON）        │
│          Petdex(4681+) / miles007 / hatch-pet 产出    │
├─────────────────────────────────────────────────────┤
│ 生成层   hatch-pet skill（官方）/ RunComfy 替代       │
├─────────────────────────────────────────────────────┤
│ 感知层   hooks / 日志轮询 / plugin / extension        │
│          clawd-on-desk 四通道 + 自定义 HTTP 上报       │
├─────────────────────────────────────────────────────┤
│ 呈现层   Codex 内置悬浮层 / Codex-Pet-Live(PySide6)   │
│          / clawd-on-desk(Electron) / React 组件        │
├─────────────────────────────────────────────────────┤
│ 分发层   petdex.dev / awesome 合集 / 社区站点          │
└─────────────────────────────────────────────────────┘
```

**每一层都有开源先例可参考，没有需要从零发明的东西。**

> 📌 本节来源备注：各项目详情与数据出处见 [11. 参考资料](#11-参考资料)「非官方生态」分类（Petdex 官网、clawd-on-desk 仓库及中文接入指南、掘金/CSDN 实测文章等）。clawd 支持 20 个工具但**不含 ZCode** 的结论，来自对 [README.zh-CN.md](https://github.com/rullerzhou-afk/clawd-on-desk/blob/main/README.zh-CN.md) 的逐字核实。

---

## 4. ZCode 现状与扩展能力（Q2 的基础）

### 4.1 官方现状

- 更新日志（[zcode.z.ai/cn/changelog](https://zcode.z.ai/cn/changelog)）核实：**无桌宠功能**；
- 近期新功能方向：Goal、Subagents（子智能体）、Remote Control（远程控制）、Off-Peak Tasks（错峰任务）；
- 官方有插件市场仓库：[zai-org/zcode-plugins](https://github.com/zai-org/zcode-plugins)。

### 4.2 ZCode 的扩展机制（决定桌宠形态的关键）

ZCode 的插件体系与 Claude Code 兼容：

- **Plugin = 打包载体**：一个插件可同时包含 **Skills、Commands（斜杠命令）、Subagents、MCP 服务器、Hooks** 五类资源；
- **Skill**：`SKILL.md` 描述触发场景/步骤/输出的可复用工作说明；ZCode 没有独立 Skill 市场，Skill 需通过 plugin marketplace 分发；
- **Hooks**：本会话已实际验证 SessionStart hook 正常触发（example-plugin 的 hook 输出可见），说明 ZCode 的 hook 系统是**可用且实时**的；
- 插件支持按工作区安装、新版本提醒（v3.11.2）。

**关键结论：ZCode 已经具备实现桌宠所需的全部扩展点——hooks 可以做状态感知，skill 可以做宠物包生成，plugin 可以做一键分发。**

---

## 5. 形态分析：ZCode 桌宠应该做成什么？（Q2）

### 候选方案对比

| 方案 | 形态 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 插件 + 独立桌宠应用** | ZCode 插件（hooks+skill）负责感知与生成；独立桌面应用负责显示 | 状态感知准确（hook 事件级）；可完整复刻 Codex 体验；应用可脱离 ZCode 独立运行；分发靠 marketplace 一键装 | 需要装两个东西（可用插件安装器自动拉起应用解决） | ✅ **推荐** |
| B. 纯 Skill | 只写 SKILL.md | 最轻 | **做不到**：skill 只能生成资产/文本，无法常驻悬浮窗、无法持续感知状态 | ❌ 只能作为 A 的子模块 |
| C. 纯独立软件（无插件） | 独立 app 靠轮询日志感知 | 不依赖插件体系 | 状态判断粗糙（对比 clawd 的日志轮询通道）；不如 hook 事件准 | ⚠️ 降级备选 |
| D. 接入现成桌宠（clawd 等） | 用自定义 HTTP Agent 协议上报 ZCode 状态 | 零开发成本即可用 | 不是自己的产品；受制于人；无法承载后续新想法 | ⚠️ 可作为临时尝鲜 |
| E. 推动官方内置 | 给 zai-org 提 feature request / 贡献 | 体验最原生 | 周期不可控 | 📮 并行推进（做完 MVP 后拿成果去谈） |

### 推荐架构（方案 A 展开）

```
┌──────────────────────────┐        ┌──────────────────────────────┐
│  ZCode 插件 (z-buddy)     │        │  Z-Buddy 桌宠应用（独立进程）  │
│                          │        │                              │
│  hooks.json              │        │  悬浮窗（置顶/无边框/可拖动）   │
│   └─ 生命周期 hook 触发    │──HTTP──│  精灵图播放器（状态→动画行）    │
│      → POST /state       │  或    │  权限审批气泡（可选 P1）        │
│                          │ 本地文件│  托盘菜单/设置                 │
│  skills/z-buddy-hatch/   │        │                              │
│   └─ SKILL.md 生成宠物包  │        │  宠物包目录 ~/.z-buddy/pets/  │
└──────────────────────────┘        └──────────────────────────────┘
```

要点：

1. **状态感知**：hook 脚本在 Agent 生命周期节点（会话开始/结束、工具调用、权限请求、任务完成）向桌宠应用上报事件；桌宠未运行时**静默跳过**（抄 clawd 的无侵入降级）；
2. **通信**：MVP 用本地文件（状态 JSON）最简单稳妥，Phase 2 升级为本地 HTTP/WebSocket（动态端口写入 `~/.z-buddy/runtime.json`，同 clawd 方案）；
3. **宠物包格式：直接兼容 Codex hatch-pet 格式**（精灵图 + 动画行状态映射）——这样能立刻白嫖 Petdex 的 4681+ 宠物和 clawd 的动画包生态，同时自己也能用 skill 生成；
4. **技术栈选型**：Electron（clawd 同款，生态最熟）或 Tauri（更轻）或 PySide6（Codex-Pet-Live 同款）。倾向 Electron/Tauri，Windows 优先（本人环境）再跨平台。

---

## 6. 分阶段计划

### Phase 0 — 技术验证（当前阶段）

- [ ] 验证 ZCode hooks 全量事件类型（不只是 SessionStart：工具调用/权限请求/任务完成各有哪些 hook 名）
- [ ] 写一个最小 hook 脚本，把事件写入 `~/.z-buddy/state.json`，用 ZCode 跑一个任务观察事件流
- [ ] 用 Electron/Tauri 起一个置顶透明窗口，读取 state.json 切换两帧动画（idle / running）
- [ ] **打断行为实测**（Computer Use 协同的前置调研，见 8.1-Q4）：让 ZCode 操控电脑时故意移动鼠标 / 关闭目标窗口，记录 Agent 的真实反应（重试？改道？卡住？），验证 8.1 的协议层推断
- [ ] **"操作权证"暂停机制验证**（见 8.4）：验证能否通过插件/hook/MCP 通道实现对电脑操作的暂停与恢复——L2 冲突协调层的技术前提
- **里程碑：ZCode 干活时，屏幕角落有个东西会动。**

### Phase 1 — MVP：仿 Codex 桌宠

- [ ] 悬浮窗完善：置顶、拖动、多显示器、开机自启（可选）
- [ ] 状态动画全覆盖：idle / running / waiting-for-input / review / failed / 完成（庆祝）/ 深夜睡觉（Zzz）
- [ ] 内置 2–3 只原创宠物（版权安全，见第 9 节）
- [ ] 宠物包加载器：兼容 hatch-pet 精灵图格式
- [ ] 插件打包：hooks + skill 塞进一个 plugin，发布到插件市场（或先本地安装）
- **里程碑：别人装一个插件 + 一个应用，就能拥有和 Codex 一样的体验。**

### Phase 2 — 生态与差异化

- [ ] `/zpet`（暂定名）斜杠命令：唤醒/切换宠物
- [ ] hatch skill：用 GLM 生成宠物包（对标 hatch-pet，但 ZCode 用户人人可用——不依赖 Pro 订阅）
- [ ] 兼容导入 Petdex / Codex Pet 动画包
- [ ] 权限审批桌面气泡（对标 clawd 的 Ctrl+Shift+Y/N）
- [ ] 电脑操作可视化层 v1：动作遥测 → 宠物表演 + 目标元素高亮框 + 气泡旁白（详见 8.3-L1）
- [ ] 项目站点 + 宠物画廊（对标 petdex.dev）

### Phase 3 — 新想法（见第 7 节 + 第 8 节"电脑操作协同"设计，筛选后展开）

---

## 7. 新想法候选池（MVP 之后的差异化方向）

> 这是"先仿照、再创新"的创新部分，全部待筛选，按"独特性 × 实现成本"给初步判断。

| # | 想法 | 说明 | 初判 |
|---|---|---|---|
| 1 | **养成系统** | 写代码/跑任务涨经验，宠物升级、进化、换形态（参考码宠 CodePet，但可绑定 ZCode 用量数据） | 高独特性，中成本 |
| 2 | **GLM 驱动的对话气泡** | 宠物不只是状态机——闲时用 GLM 吐一句吐槽/鼓励/代码冷知识，还可点击聊天（GLM-5.3-Flash 便宜） | ⭐ 高独特性，ZCode 独有优势；机制设计已深化，见 7.1 |
| 3 | 多智能体可视化 | 对接 Subagents：一个子代理 = 一只小宠物，并行任务时桌面一窝宠物各忙各的（对标 clawd 的杂耍动画但更进一步） | ⭐ 高独特性，中成本 |
| 4 | 番茄钟/专注模式 | 宠物陪你专注 25 分钟，摸鱼检测（长时间无 git 提交宠物睡觉） | 中独特性，低成本 |
| 5 | 任务播报 | 长任务完成/失败时宠物气泡提醒（结合 Off-Peak Tasks 错峰任务的完成通知场景） | 实用，低成本 |
| 6 | 桌面驾驶舱 | 点击宠物展开面板：今日任务、token 消耗、git 统计 | 中独特性，中成本；轻量版已设计为"后台任务气泡"，见 8.6.2 |
| 7 | 宠物社交/分享 | 宠物包一键分享链接，画廊社区（Phase 2 已含） | 生态向 |
| 8 | 多桌宠并行 | GitHub 生态已有此方向（codex-pet topic），支持同时养多只 | 低优先 |
| 9 | **电脑操作协同（Computer Use × 桌宠）** | ZCode 操控电脑时，桌宠作为可视化化身 + 冲突协调员 + 协同伙伴 | ⭐⭐ **全网无先例**，已立项专题调研与设计，见第 8 节 |

**初步判断**：#2（GLM 对话气泡）、#3（子代理可视化）和 #9（电脑操作协同）是 Codex 桌宠**做不到或做不好**的，因为它们依赖 GLM 模型、ZCode 的多智能体架构和 Computer Use 能力——这才是 Z-Buddy 的护城河。其中 #9 经第二轮调研确认为**全网空白点**，已单独成章（第 8 节）；#2 的机制设计已深化（见 7.1），建议 MVP 验证通过后作为主线推进。

### 7.1 深化设计：GLM 对话气泡与「点击聊天」机制

> 针对想法 #2 的机制细化（第三轮讨论，2026-09-05）。核心结论：**"点击聊天"链路完全不经过 ZCode——桌宠应用自己直连 GLM API，宠物进程本身就是一个迷你聊天客户端。**

#### 完整链路

```
你点击宠物
   ↓ ① 桌宠应用弹出气泡式输入框（贴宠物上方，无边框小窗）
你打一句话，回车
   ↓ ② 应用直接 POST GLM API（OpenAI 兼容 chat/completions，SSE 流式）
      └ system prompt = 宠物人设 + 当前上下文注入（state.json）
   ↓ ③ 流式返回 → 打字机效果渲染到气泡，宠物同步播放"说话"动画行
   ↓ ④ 会话历史保留在进程内存（滚动窗口），点击外部收起气泡
```

#### 四层机制

**① 交互层**：单击与拖动需区分（按下后移动 = 拖位置，原地按下松开 = 开聊天）。气泡为贴宠物上方的置顶无边框小窗（输入框 + 最近几条消息），失焦自动收起；聊天时宠物切换到"说话"动画行——即宠物包新增一行 animation row，与状态映射机制完全同构。

**② 模型接入层（关键决策点）**：

- **Key 来源**：用户自填 GLM API Key（BigModel 开放平台；如有 GLM Coding Plan 的 Key 可尝试复用，注意平台条款），用系统凭据管理器或加密文件存储，禁止明文；
- **模型选 GLM-5.3-Flash**：闲聊场景一次几百 token，Flash 快、便宜、多模态，天天聊月成本也可忽略；
- **隐私边界（必须注明）**：本地不落盘 ≠ 数据不出本机——消息会发送到 GLM 服务端，按平台数据政策处理，真正的隐私边界在云端。

**③ 人设与上下文层（宠物"有话说"的灵魂）**：system prompt = 人设（性格、口头禅）+ **现成的状态注入**。桌宠为做状态动画本来就维护 `state.json`（Agent 状态、当前任务、时间），聊天时注入上下文，宠物才知道"你刚跑了个失败的任务"——这是它与"挂宠物皮肤的通用聊天机器人"的本质区别。

**④ 会话历史与内存管理（MVP 零落盘）**：

| 触发时机 | 行为 |
|---|---|
| 滚动窗口满（如最近 30 条） | 更早消息被丢弃，GC 正常回收 |
| 点"新会话"/清空按钮 | 数组清空，立即释放（建议默认提供） |
| 收起气泡 | **不释放**——仅隐藏 UI，历史仍在内存，再点开可接着聊 |
| 退出桌宠 / 关机 / 崩溃 | 全部消失，下次启动全新会话 |

- 历史只存在宠物进程内存：**不写项目目录、不碰 ZCode 工作区、不产生任何文件**；文本消息体积极小（千条 MB 级以下），滚动窗口裁剪后由 GC 正常回收，无泄漏风险；
- "零落盘"是产品优点：聊天内容**永不进 git**（无误提交风险）、**永不进 ZCode 上下文**（不污染代码任务）、卸载即零残留；
- **持久化预留**（养成系统阶段才做）：长期记忆落盘位置必须是 `~/.z-buddy/` 用户主目录（如 `chat/` 或 `memory.db`），**绝不放项目文件夹**——理由：桌宠是全局应用、跨工作区存在，数据必须在用户级；项目目录可能被 git 跟踪；卸载/重装项目不应影响宠物记忆。届时整个桌宠唯一的磁盘文件是本来就设计在 `~/.z-buddy/` 的 `state.json`。

#### 两条链路的取舍

| 链路 | 适用场景 | 特点 |
|---|---|---|
| **直连 GLM API**（本节所述） | 闲聊、吐槽、讲笑话 | 快、便宜、独立于 ZCode 运行；但宠物不知道代码细节 |
| **经 ZCode 中转** | 任务感知型问答（"总结一下我今天的进度"） | 桌宠 → 自家插件本地端口 → ZCode 子任务 → 可引用工作区真实上下文；但重、慢、占任务队列 |

**推荐混合**：MVP 只做直连链路；进阶版在宠物输入框旁加"工作区模式"开关切换到中转链路——**这半个功能 Codex 桌宠做不到**（它没有开放的插件通道），与 #9 一起构成 Z-Buddy 的护城河。

---

## 8. 专题调研与功能设计：桌宠 × 电脑操作协同（Computer Use）

> 第二轮调研新增。起因：想让 Z-Buddy 在"ZCode 操控电脑"时发挥作用——与用户协同完成任务。
> 调研手段：全网检索（官方文档 + 实测文章 + GitHub）+ **一手资料**（本文作者即运行在 ZCode 的 Computer Use 执行环境中，工具层协议为直接观察所得；涉及行为推断的部分已标注，待 Phase 0 实测确认）。

### 8.1 调研结论：四个子问题

#### Q1：Codex 桌宠或第三方开发者提过"桌宠 × 电脑操作"吗？

**没有。结论：全网空白点。**

- Codex 官方桌宠只映射**编码任务状态**（idle/running/failed/…），与 Computer Use 功能完全独立，官方从未将二者结合；
- 最接近的已有形态是 **ChatGPT Agent**（云端沙盒）：执行任务时屏幕直播 + **语音播报**操作流程、用户可随时中断接管——但它跑在 OpenAI 的虚拟电脑里，不在本地，更不是桌宠；
- 第三方桌宠（clawd-on-desk、TRAE 论坛的 Tauri 联动桌宠 demo 等）全部只做**编码状态可视化**；
- 沾边但不相同的：ModelScope「端侧 AI 桌宠助手」（桌宠用语音控制本机亮度/音量等）、CSDN「可控制电脑的智能桌宠」教程——方向都是"桌宠自己操控电脑的个别功能"，而不是"桌宠可视化/协同一个编程 Agent 的本地桌面操作"。

#### Q2：Codex 的 Computer Use 是前台工作吗？

**Windows 上是。** Codex 桌面端 Computer Use 的关键事实：

| 维度 | Codex Computer Use | ChatGPT Agent / Operator |
|---|---|---|
| 运行环境 | **用户本地真实电脑** | OpenAI 云端沙盒虚拟机 |
| macOS | 支持**后台运行**（用户可同时用电脑） | — |
| Windows | **严格前台接管**：执行期间屏幕被占用，用户必须停手围观 | — |
| 感知/操作原理 | 截图看屏幕 + 模拟鼠标点击/键盘输入 | 同左，限浏览器 |
| 实时观看 | 前台模式天然全程可见；支持在页面上圈点批注下指令 | 屏幕直播 + 语音播报，可随时接管 |
| 限制（Windows 实测） | 不能操作管理员权限窗口、不能自动化终端、不能后台运行 | 操作范围限云端浏览器 |

（来源见第 11 节：OpenAI 官方博客、腾讯云完整指南、知乎 Windows 实测、AITNT"Windows 是 Mac 的残血版"。）

#### Q3：ZCode 操控电脑现在怎么样？前台还是后台？

**功能入口确认（作者客户端设置页截图，2026-09-05）**：该功能官方名称为「**电脑控制**」，设置页有两个开关——「启用电脑控制」（说明文字：*开启后将启用电脑控制及其 MCP 与技能*）和「在输入框显示电脑操作按钮」。两个细节值得记录：① 官方实现 = **MCP server + Skills** 的组合，这与 Z-Buddy 采用的插件/MCP 扩展通道**同源同构**——桌宠的"操作权证"MCP（见 8.4）和官方电脑控制是同一技术层面的东西，可行性进一步加分；② 电脑控制默认关闭、需用户手动开启，输入框还有显式调用按钮——官方把它定位为"用户明确授权的显式能力"，桌宠做电脑操作协同时应保持同样的授权姿态（呼应第 9 节风险 7）。

架构上，与 Codex 的"纯视觉模拟"路线不同，ZCode 走的是**无障碍优先（Accessibility-First）+ 视觉兜底**的双轨设计（以下为作者在 ZCode Computer Use 环境中的一手观察，工具协议层证据确凿）：

1. **第一优先：无障碍语义操作（隐形）**
   - Agent 先读取目标应用的辅助功能树（元素列表：名称、类型、可否按压/编辑、屏幕坐标边界），再对**元素**直接执行语义动作（按下按钮、填值、选文本、滚动）；
   - 这类操作**在后台完成：不抢焦点、不动物理鼠标、屏幕上什么都看不到**；
   - 键盘输入在 macOS 上走"合成焦点"后台投递；在 Windows/Linux 上要求目标应用在前台。
2. **兜底：视觉坐标操作（可见）**
   - 只有无障碍树够不到的目标（自绘界面、游戏、特殊控件）才退化为"截图 → 看图 → 坐标点击"；
   - 这是**真实输入事件**：Windows 上要求目标窗口前台，光标真实移动——用户看得见；
   - 把应用拉到前台（激活）在协议里被定义为**最后手段**，且宿主安全策略可以直接拒绝。
3. **权限与安全**：官方明确"使用电脑控制功能前会明确提示所需权限"（更新日志），配合四档权限模式（含高权限/全自动），进入高权限模式后工具栏持续显示状态提示。

**与 Codex 对比一句话**：Codex Windows = 可见但霸屏（前台接管，用户必须围观）；ZCode = 不霸屏但多数操作隐形（a11y 后台优先，用户看不到 AI 在干嘛）。**两个极端各留一个体验缺口——这正是桌宠的切入点（见 8.2）。**

> 📌 本节来源备注：Codex 侧结论出自 [11. 参考资料](#11-参考资料)「Computer Use / 电脑操作」分类（OpenAI 官方博客、腾讯云 CU 指南、知乎 Windows 实测、AITNT、@宝玉）；ZCode 侧"功能入口确认"来自作者客户端设置页截图，架构描述为作者在 ZCode Computer Use 环境中的一手观察；"电脑控制权限明确提示"出自 [ZCode 更新日志](https://zcode.z.ai/cn/changelog)。

#### Q4：操作会被打断吗？打断后 ZCode 是后台硬继续，还是等用户不动了再继续？

**都不是。ZCode 现行机制是"响应式恢复"，没有"用户空闲门控"。**（一手观察 + 协议层证据，待 Phase 0 实测复核）

打断的两种情况：

- **隐形操作被"打断"**：用户移动鼠标不会与之冲突（它本来就不碰物理鼠标）；但若用户**关闭了它正在操作的应用/窗口**，元素引用立即失效（协议内有专门的 element_stale 过期错误）。
- **可见操作被"打断"**：坐标点击与用户真实输入走同一条系统输入队列，会真实交错——用户此刻移动鼠标，Agent 的下一次点击仍落在它上一帧截图记录的坐标上（帧绑定机制），存在点错的真实竞态；用户在它操作时关掉目标软件，同样触发元素过期。

打断之后 Agent 的行为：

1. 操作失败 / 元素过期 → **立即重新观察**当前屏幕（"观察-行动"循环是协议核心）；
2. 根据新状态决定下一步：重试、改道（例如把被用户关掉的窗口重新打开）、换操作方式（元素点击 ↔ 坐标点击互为兜底），或停下来向用户求助；
3. **是否继续由任务推理决定**（它认为任务没完成就会继续尝试），**是否允许由权限模式决定**——但协议里**没有**"检测到用户正在操作就自动暂停/等待"的机制。

> 换句话说：ZCode 不会后台硬点（点不动就是失败），也不会礼貌等待（协议里没有"等"这个动作）——它会在失败后自己重新观察再试。**"用户空闲门控"和"人机冲突仲裁"在协议层是空白，这正是桌宠功能的设计空间。**

### 8.2 产品洞察：为什么"桌宠 × Computer Use"是天作之合

| 方案 | 可见性 | 用户代价 |
|---|---|---|
| Codex（Windows 前台接管） | 全程可见 | **霸屏**：用户必须停手围观 |
| Codex（macOS 后台） | 不可见 | 用户不知道 AI 在干什么 |
| ZCode（a11y 后台优先） | **多数操作隐形** | **信任问题**：鼠标没动、屏幕没变，AI 到底干了啥？ |
| **Z-Buddy（桌宠）** | **后台干活 + 前台演戏** | 两全：不霸屏，但全程"看得见" |

三个支撑点：

1. ZCode 的隐形操作缺一个"化身"——桌宠就是 Agent 在物理世界的 body；
2. 无障碍树**自带每个元素的精确屏幕坐标**——桌宠应用可以在真实屏幕上为被操作元素渲染"幽灵高亮框"，让隐形操作显形，这个数据是现成的，零额外探测成本；
3. ChatGPT Agent 已验证"操作旁白"的需求（语音播报），但本地桌面场景还没有人用桌宠做这件事。

### 8.3 功能设计：Z-Buddy「电脑操作协同」模式（三层）

#### L1 可视化层——"隐形操作显形"（优先级最高，Phase 2 即做）

- **操作遥测流**：ZCode 插件捕获 computer-use 动作事件（动作类型 / 目标应用 / 元素名称 / 元素坐标）→ 上报桌宠；
- **显形表演**：桌宠拿出小鼠标图标做点击动画；在真实屏幕的目标元素周围画一圈呼吸高亮框 + 幽灵光标轨迹（坐标来自无障碍树）；
- **气泡旁白**：「正在打开记事本」「已点击 保存」——对标 ChatGPT Agent 的语音播报，做视觉版（可选 TTS 语音）；
- **跑位监工**：宠物移动到操作发生的屏幕区域附近"盯着干活"。

#### L2 冲突协调层——"人机冲突仲裁员"（核心差异化，直接补 Q4 的协议空白）

- **用户空闲门控**：前台可见操作前检查物理输入空闲时长（Windows `GetLastInputInfo` / macOS `CGEventSource`），用户正在操作 → 自动推迟，桌宠举牌「等你忙完我再继续～」，空闲后自动续跑——把 Q4 里"没有等待机制"变成产品功能；
- **点桌宠 = 暂停/恢复**：桌宠成为电脑操作的**物理暂停键**（点击宠物 → 经插件 → hook 信号链路通知 Agent 侧门控）；
- **打断剧本**：检测到目标窗口被用户关闭 → 宠物惊讶表情 + 气泡「咦，窗口没了，要我重新打开吗？」——把"响应式失败重试"升级为"主动协商"；
- **优先权仲裁**：用户在打字/开会/演示 → 桌宠切换"安静模式"，只保留无障碍后台操作，前台动作全部排队。

#### L3 协同层——"一起干活"（长期方向）

- **圈选指派**：用户在屏幕上圈选一个区域/控件 → 桌宠接单 → 转交 ZCode 执行（对标 Codex 的圈点批注，但入口是桌宠）；
- **双人四手**：用户操作 A 应用，ZCode 经无障碍通道并行操作 B 应用，桌宠分别"看着"两边——macOS 后台特性的最大化利用，Windows 上靠 a11y 后台操作也可部分实现；
- **操作回放**：桌宠可以"重演"AI 刚才做过的每一步（审计、教学、复盘场景）。

### 8.4 技术可行性核对表

| 能力 | 可得性 | 来源 |
|---|---|---|
| 被操作元素的名称/类型 | ✅ 现成 | 无障碍树（observe 层） |
| 被操作元素的屏幕坐标边界 | ✅ 现成 | 无障碍树完整模式返回 bounds |
| 动作类型（点击/输入/滚动…） | ✅ 现成 | 工具调用事件（hook/插件捕获） |
| 用户物理输入空闲时长 | ✅ 系统级 API | Win32 `GetLastInputInfo`、macOS `CGEventSourceSecondsSinceLastEventType` |
| 目标窗口存活性 | ✅ 可查 | 无障碍窗口枚举 |
| element_stale 感知 | ✅ 协议内建 | 元素过期错误本身就是事件源 |
| 暂停 Agent 的电脑操作 | ⚠️ **需设计验证** | 候选方案：Z-Buddy 自带 MCP server 提供"操作权证"（Agent 每次前台操作前需 acquire，桌宠可拒发实现暂停）；或 hook 层拦截。**列为 Phase 0 实验** |

### 8.5 对路线图的影响

- Phase 0 新增两项实验：打断行为实测、"操作权证"暂停机制验证（见第 6 节）；
- Phase 2 新增：L1 可视化层 v1；
- Phase 2 追加（8.6.2）：后台任务气泡 v1（悬停预览即可）；
- Phase 3 新增主线：L2 冲突协调层 + L3 协同层（护城河功能，全网无先例）；
- Phase 3 追加（8.6.1）：人机接力三段协议（**前置依赖：暂停机制验证通过**）；面板完整版（token 消耗 / git 统计）。

### 8.6 增补设计（第四轮讨论）：人机接力 与 后台任务气泡

#### 8.6.1 人机接力（Take-over & Hand-back）——L3 协同层第一场景

> 用户设想："如果我打断了电脑操作，桌宠有反应；部分任务执行得慢，我帮它点两步，我不操作了，它就能接上。"前者即 L2 打断剧本；后者是新的协同能力，定为 **L3 第一场景**（优先级高于双人四手、圈选指派）。

**基础机制今天就有**：Agent 的"观察→行动"循环天然消化用户造成的 UI 变化——用户帮点后，Agent 下一次操作要么发现目标已达成直接跳步，要么发现状态异常重新规划（即 8.1-Q4 的响应式恢复）。Phase 0 打断实验将验证其可靠度。

真正缺的是三件事，由桌宠补齐——**三段接力协议**：

```
① 让位（硬性规则）：检测到用户物理输入 → 立即冻结 Agent 的前台操作
   （它下一帧截图的坐标点击会和用户的手抢——双指针竞态是最危险的坑）
② 交接：用户停手 N 秒 → 桌宠发"用户已介入"事件给 Agent 侧
   （附屏幕变化摘要：前后 a11y 树 / 截屏对比）
③ 复位：Agent 重新观察 → 状态前进则跳步继续（气泡告知"接上了"）；
   与原计划不一致（它要选 A、用户选了 B）→ 气泡确认用户意图后再走
```

**桌宠定位：交通协管员，不是翻译官。** 它不试图"理解"用户点了什么——只负责让位（暂停）、把介入事件可靠送达、把过程可视化；理解新状态是 Agent re-observe 循环的本职。这样实现难度大降，可靠性反而高。

**配套功能："等待原因可视化"**（L1 旁白延伸）：任务显得慢时，多数情况是 Agent 在等（页面加载、网络响应）。桌宠气泡播报"页面加载中，别急"，避免用户把"加载中"误判为"卡死"而帮倒忙（如触发重复提交）。

**落地两步**：MVP 先"被动兼容"（零开发，靠 re-observe 自愈，Phase 0 实验验证）；Phase 3 做"主动接力"三段协议（前置：8.4 的暂停机制验证通过）。

#### 8.6.2 后台任务气泡——"后台有什么在跑"的按需可视化

> 用户需求原话："后台有在执行什么，做一个类似桌宠的气泡，鼠标放在桌宠上面可以选择展开，也可以关上。"

**定位**：8.3-L1 的"看着它干活"是实时表演（**被动**），本气泡是**按需查询**（**主动**）——一被动一主动，互补成完整的信息层；同时它是想法 #6"桌面驾驶舱"的轻量 MVP（token 消耗、git 统计等后续往面板里加）。

**交互三态**：

| 状态 | 触发 | 显示 |
|---|---|---|
| 平时 | — | 宠物本体状态动画；有后台任务时头顶挂**迷你指示**（数字角标"2"或转圈小图标），不遮挡、可感知 |
| 悬停预览 | 鼠标悬停 ≥300ms | 浮出**预览卡**：每个后台任务一行（名称 / 状态 / 当前步骤 / 已用时），不点击、可扫一眼 |
| 展开固定 | 点击卡片或 📌 按钮 | **完整面板**：任务列表 + 每任务最近事件流 + 子代理列表；"等待审批"行内嵌【允许/拒绝】按钮（打通 L2 审批气泡） |

- **收起与关闭的语义必须分开**：✕ 关闭面板 ≠ 取消任务（任务继续跑）；取消任务必须二次确认、走 ZCode 任务取消通道（入口待验证）——避免"随手关气泡把任务杀了"的事故；
- **防误触**：鼠标高速掠过宠物不弹出（移动速度阈值 + 悬停延时），只在停留时触发；
- 位置跟随宠物，支持多显示器。

**数据源（零新增基建，100% 复用 hooks 管道）**：

- 任务边界：`SessionStart`/`Stop` = 任务生命周期；子代理事件 = 并行任务清单；错峰任务（Off-Peak Tasks）/远程控制的状态可轮询本地痕迹（待验证）；
- `report.js` 扩展：把 hook 事件追加写入 `~/.z-buddy/events.jsonl`，气泡读它渲染；
- 每行内容：名称（目标摘要）、状态（排队/执行中/等待审批/完成/失败）、最新动作（最近一次 PreToolUse 摘要）、已用时。

**生态对照**：Codex 桌宠只有状态动画、无任务面板；clawd 有审批卡片、无任务列表——**这种"悬停查任务"的 UI 在两个生态里都罕见**，成本低（hover + 列表渲染是普通前端活）但感知价值高，性价比突出。

---

## 9. 风险与注意事项

1. **版权风险（最重要）**：Petdex 上大量皮卡丘、哆啦A梦、蜡笔小新等 IP 形象，**Z-Buddy 自带宠物必须原创**；宠物包格式兼容可以，但官方分发渠道要审核上传内容，避免侵权连带。
2. **状态准确性**：hook 事件粒度决定体验上限，需实测 ZCode 各生命周期 hook 的覆盖度；Codex 社区也踩过"状态时长不可控"的坑，状态机要防抖。
3. **资源占用**：桌宠是常驻进程，Electron 方案需注意内存（clawd 同样被诟病）；Tauri 或原生 Win32 + WebView2 是备选。
4. **无侵入原则**：桌宠挂了绝不能影响 ZCode 正常工作（hook 静默降级、上报超时熔断）。
5. **跨平台**：ZCode 桌面端有 macOS/Windows/Linux 版本，桌宠至少 Windows + macOS 双支持才对齐用户盘（MVP 先 Windows）。
6. **官方功能撞车风险**：ZCode 官方未来可能内置桌宠——应对：MVP 快速验证占位 + 主动向官方提案合作（方案 E）。
7. **电脑操作安全**：Computer Use 协同功能放大会误操作风险（点错、删错、误发送）；缓解手段 = L1 可视化（让用户看得见）+ L2 冲突协调（空闲门控/暂停键）+ 敏感操作气泡确认；与 Codex 一致地回避管理员权限窗口和终端自动化。

---

## 10. 决策记录与待决问题

### 10.1 关键决策（Decision Log）

> 四轮讨论沉淀下来的结论，每条标注依据与出处章节——后续翻现状不用重读全文。

| # | 决策点 | 结论 | 依据 | 出处 |
|---|---|---|---|---|
| D1 | 桌宠形态 | **ZCode 插件 + 独立桌宠应用** 二件套 | 纯 Skill 做不到常驻 UI；hooks 提供事件级感知 | 第 5 节 |
| D2 | 宠物包格式 | **兼容 Codex hatch-pet**（精灵图 + 状态行） | 直接接入 Petdex 4681+ 宠物与 clawd 动画包生态 | 第 5 节 |
| D3 | 状态感知通道 | 插件 hooks → `report.js` → `state.json` / `events.jsonl` | 本会话实测 hooks 实时可用（example-plugin） | 第 4 节 / 笔记第 9 节 |
| D4 | 聊天链路 | 桌宠**直连 GLM API**（Flash），MVP 零落盘；"工作区模式"中转作进阶 | 快、便宜、独立；中转链路是 Codex 做不到的 | 7.1 |
| D5 | 电脑操作可视化 | 动作遥测 + 元素高亮框 + 旁白（坐标来自 a11y 树，零额外探测） | 隐形操作需要一个"化身" | 8.3-L1 |
| D6 | 人机冲突协调 | 空闲门控 + 点桌宠暂停 + 三段接力（让位→交接→复位） | 协议层无用户空闲门控（8.1-Q4 确认的空白点） | 8.4 / 8.6.1 |
| D7 | 协同设计原则 | **桌宠当交通协管员，不当翻译官**——不理解用户操作，只管让位/送达/可视化 | 理解新状态交给 Agent 的 re-observe 本职，难度大降 | 8.6.1 |
| D8 | 后台任务信息 | 悬停预览 / 展开固定 / 头顶角标 三态气泡 | 按需查询与被动表演互补，复用同一数据管道 | 8.6.2 |
| D9 | 版权红线 | 自带宠物全原创；格式兼容可以、渠道内容必须审核 | Petdex 大量 IP 形象不可跟进 | 第 9 节风险 1 |

### 10.2 待决问题（Open Questions → Phase 0 验证清单的来源）

| # | 问题 | 影响哪个功能 | 验证方式 |
|---|---|---|---|
| Q1 | ZCode hooks 完整事件表（权限请求、子代理的事件名是什么） | 审批气泡、任务气泡的数据完备性 | 官方 hooks 文档全表 + 实测事件流 |
| Q2 | "操作权证"暂停机制可行性（自建 MCP 权证 vs hook 拦截） | 人机接力"让位"、点桌宠暂停 | 两条通道各做最小原型 |
| Q3 | 用户打断后 Agent re-observe 自愈的可靠度 | 接力 MVP 能否只做"被动兼容" | Phase 0 打断行为实测 |
| Q4 | GLM Coding Plan 的 Key 能否复用于桌宠聊天 | 7.1 的 Key 来源方案 | 查平台条款 |
| Q5 | 错峰任务 / 远程控制的本地状态痕迹 | 后台任务气泡能否覆盖这两类任务 | 查本地文件与日志 |
| Q6 | 任务取消通道（面板"取消任务"按钮调什么） | 8.6.2"关闭 ≠ 取消"交互的完整性 | 查插件/CLI 是否暴露取消能力 |
| Q7 | Electron vs Tauri 最终选型 | 常驻内存 vs 开发速度 | Phase 0 用两者各起悬浮窗 demo 实测 |

---

## 11. 参考资料

### Codex 官方功能

- [腾讯云：Codex宠物模式怎么开启？桌面赛博桌宠教程](https://cloud.tencent.com/developer/article/2690082)
- [IT之家：Codex 桌宠开启教程](https://www.ithome.com/0/945/989.htm)
- [知乎：Codex电子宠物保姆级教程（/pet、/hatch、/goal）](https://zhuanlan.zhihu.com/p/2034795997839221924)
- [知乎：Codex 桌宠体验报告（深夜 Zzz）](https://zhuanlan.zhihu.com/p/2045192355624515484)
- [钛媒体：Codex 上线桌面宠物功能](https://www.tmtpost.com/7975795.html)
- [53AI：深度解析 Codex Pet Skill（动画行语义）](https://www.53ai.com/news/tishicijiqiao/2026050320581.html)
- [utto的学习屋：hatch-pet 自定义桌宠指南（图集/状态时长限制）](https://www.yyshow.xyz/article/codex-hatch-pet-guide)
- [open-design 仓库：hatch-pet SKILL.md 源码](https://github.com/nexu-io/open-design/blob/main/skills/hatch-pet/SKILL.md)
- [Hatch Pet 官方社区站](https://www.hatch-pet.com/zh)
- [RunComfy codex-pet skill（$imagegen 替代）](https://mcpservers.org/agent-skills/runcomfy-com/codex-pet)
- [CSDN：Codex 宠物模式开启教程](https://blog.csdn.net/weixin_41961749/article/details/160746327)
- [Linux.do：Codex 桌宠更换指北（$skill-installer hatch-pet）](https://linux.do/t/topic/2100410)
- [知乎：试了下 Codex 新出的宠物功能](https://zhuanlan.zhihu.com/p/2035288180124030141)
- [网易：免费定制 Codex 桌宠（上传参考图 + /Hatch Pet）](https://www.163.com/dy/article/L1QQB98U0511CSAO.html)
- [InfoQ：Codex Pets 社区站（一行命令安装像素桌宠）](https://xie.infoq.cn/article/18e4081bc41febf5e77cea53a)
- [腾讯云：宠物功能背后的 Agent 交互理念](https://cloud.tencent.com/developer/article/2667669)
- [QQ 新闻：深度解析 Codex Pet Skill](https://view.inews.qq.com/a/20260502A060XZ00)
- [explainx.ai：Codex pets complete guide](https://explainx.ai/blog/codex-pets-complete-guide-how-to-use-top-custom-pets-2026)
- [augmentedswe：How to use Codex pets (and make your own!)](https://www.augmentedswe.com/p/how-to-use-codex-pets)
- [觉醒学院：Codex 桌宠保姆级教程](https://www.jxxy.net/ai/articles/codex-hatch-pet-tutorial/)
- [awesome-codex-tutorial：hatch-pet 照片生成配方](https://github.com/xianyu110/awesome-codex-tutorial/blob/master/recipes/hatch-pet-photo.md)
- [YouTube：Codex 自定义宠物功能完整教程](https://www.youtube.com/watch?v=Gz62lTvSyLs)
- [YouTube：Codex Pets Explained（宠物包结构解析）](https://www.youtube.com/watch?v=KGoh_VP6Z3o)
- [X：@shao__meng（8 种内置宠物与状态映射）](https://x.com/shao__meng/status/2050365455223951629)
- [X：@AbleGPT（Settings → Appearance → Pets 快指南）](https://x.com/AbleGPT/status/2053014508172624346)
- [OpenAI Instagram：Pets. Now in Codex（官方宣传）](https://www.instagram.com/reel/DXzrPSNvru0/)

### 非官方生态

- [Petdex（4681+ 宠物分发平台）](https://petdex.dev/) / [crafter-station/petdex](https://github.com/crafter-station/petdex)
- [T-Zevin/Awesome-Codex-Pets（生态导航）](https://github.com/T-Zevin/Awesome-Codex-Pets)
- [legeling/awesome-codex-pet（动画预览画廊）](https://github.com/legeling/awesome-codex-pet)
- [VectorPeak/Codex-Pet-Live（Windows 运行时，PySide6）](https://github.com/VectorPeak/codex-pet-live)
- [rullerzhou-afk/clawd-on-desk（通用 Agent 桌宠，Electron）](https://github.com/rullerzhou-afk/clawd-on-desk) / [接入指南](https://github.com/rullerzhou-afk/clawd-on-desk/blob/main/docs/guides/setup-guide.zh-CN.md) / [架构说明 AGENTS.md](https://github.com/rullerzhou-afk/clawd-on-desk/blob/main/AGENTS.md)
- [GitHub Topic: codex-pet](https://github.com/topics/codex-pet) / [codex-pets](https://github.com/topics/codex-pets)
- [clawd 已知限制文档（custom 协议 v1 不支持 /permission 等）](https://github.com/rullerzhou-afk/clawd-on-desk/blob/main/docs/guides/known-limitations.zh-CN.md)
- [掘金：开源 Agent 桌宠 Clawd on Desk](https://juejin.cn/post/7647637814667739187)
- [CSDN：Clawd-on-desk 实测](https://blog.csdn.net/m0_52059290/article/details/162698821)
- [ai-bot.cn：Clawd on Desk 介绍](https://ai-bot.cn/github-clawd-on-desk/)
- [clawd-on-desk WinGet 安装页](https://winstall.app/apps/rullerzhou-afk.clawd-on-desk)
- [CSDN：Codex 更换桌面宠物教程（Codex Dream Skin 换肤工具）](https://blog.csdn.net/weixin_48093827/article/details/161645370)
- [petdex.dev 哆啦A梦宠物页（一键安装示例）](https://petdex.dev/pets/doraemon)
- [X：@GitHub_Daily（Petdex 4000+ 宠物报道）](https://x.com/GitHub_Daily/status/2079491307521908800)
- [deepseek.club：Clawd on Desk 介绍](http://deepseek.club/topic/2101)

### ZCode 扩展机制

- [ZCode 官网](https://zcode.z.ai/cn) / [更新日志](https://zcode.z.ai/cn/changelog)
- [ZCode Docs: Plugin（插件打包 Skills/Commands/Subagents/MCP/Hooks）](https://zcode.z.ai/cn/docs/plugin)
- [ZCode Docs: Skill](https://zcode.z.ai/cn/docs/skill)
- [zai-org/zcode-plugins（官方插件市场仓库）](https://github.com/zai-org/zcode-plugins)
- [智谱开放文档：Agentic 扩展组件](https://docs.bigmodel.cn/cn/coding-plan/learning-resources/agentic-extension)
- [ZCode Docs: Q&A（权限默认值 / 插件与技能开关 / Hooks 配置）](https://zcode.z.ai/cn/docs/qa)
- [ZCode Docs: Welcome（ADE 产品定位）](https://zcode.z.ai/en/docs/welcome)
- [七牛云：ZCode 安装使用完整指南](https://news.qiniu.com/archives/1785117449028)
- [ai-bot.cn：ZCode 介绍（四档权限模式）](https://ai-bot.cn/sites/69134.html)
- [知乎：ZCode 把 GLM-5.2 接进微信和飞书（高权限操作先暂停确认）](https://zhuanlan.zhihu.com/p/2065871234219389531)

### Computer Use / 电脑操作

- [OpenAI 官方：Codex 全能型助手（后台 Computer Use 能力发布）](https://openai.com/zh-Hans-CN/index/codex-for-almost-everything/)
- [腾讯云开发者社区：Codex Computer Use 完整指南（macOS 后台 / Windows 前台接管）](https://developer.cloud.tencent.com/article/2706684)
- [知乎实测：Windows 版 Computer Use（屏幕被接管、无法同时用电脑）](https://zhuanlan.zhihu.com/p/2045955256706659505)
- [AITNT：Windows 版是 Mac 的"残血版"（不能操作管理员窗口/终端）](https://m.aitntnews.com/newDetail.html?newId=25694)
- [七牛云：Codex Computer Use 完全指南（安装方式）](https://news.qiniu.com/archives/1785290635845)
- [OpenAI 官方：隆重推出 ChatGPT 智能体（云端沙盒、语音播报、随时中断接管）](https://openai.com/zh-Hans-CN/index/introducing-chatgpt-agent/)
- [OpenAI 官方：Operator 简介（截图感知 + 模拟交互）](https://openai.com/zh-Hans-CN/index/introducing-operator/)
- [BAAI：OpenAI 重构 Codex（圈点批注下指令）](https://hub.baai.ac.cn/view/54050)
- [ZCode Docs：安全操作确认（权限模式/执行方式选择）](https://zcode.z.ai/cn/docs/safety-confirm)
- [ZCode 更新日志（电脑控制权限明确提示、macOS Intel 支持）](https://zcode.z.ai/cn/changelog)
- [ModelScope：端侧 AI 桌宠助手（语音控制 PC 的桌宠，方向不同可对照）](https://modelscope.cn/brand/view/AIPetCompanion)
- [X：@宝玉（Codex Computer Use 登陆 Windows）](https://x.com/dotey/status/2060436685037682896)
- [SegmentFault：Codex Computer Use 完全指南](https://segmentfault.com/a/1190000048087948)
- [腾讯云 CodeBuddy：Hook 功能文档（Claude Code Hooks 兼容规范参考）](https://www.tencentcloud.com/zh/document/product/1256/77296)
- [TRAE 论坛：联动 AI 编程状态的智能桌宠 Demo（Tauri v2 + Rust）](https://forum.trae.cn/t/topic/46969)

### 同类参考

- [jnMetaCode/codepet（码宠，养成系，读 git + ~/.claude 用量）](https://github.com/jnMetaCode/codepet)
- [腾讯云：Clawd 开源桌宠介绍](https://cloud.tencent.com/developer/article/2670724)
- [JavaGuide：Claude Code Hooks 详解（ZCode hook 规范同源）](https://javaguide.cn/ai-coding/principles/claude-code-hooks.html)
- [知乎：Claude Code Plugins 指南（ZCode 插件体系对照）](https://zhuanlan.zhihu.com/p/2050283217786348433)
- [知乎：插件、MCP、Skills 如何让封闭工具变成开放平台](https://zhuanlan.zhihu.com/p/2030348645946667521)
- [CSDN：Claude Code 完整指南（九）Plugins](https://blog.csdn.net/qq_20042935/article/details/156979756)
- [CSDN：ZCode桌面宠物系统（注意：仅与 ZCode 同名，与 ZCode 工具本身无集成）](https://blog.csdn.net/weixin_43915643/article/details/163301960)
- [Verdent AI：What is ZCode（第三方视角）](https://www.verdent.ai/guides/agent/what-is-zcode-ai)

---

## 附录 A：术语表

| 术语 | 含义 |
|---|---|
| Agent / 子代理（Subagent） | 执行任务的 AI 智能体；子代理是主 Agent 派生的并行执行单元（ZCode 的 Subagents 功能） |
| Hook（钩子） | 挂在 Agent 生命周期节点上自动执行的脚本，Agent 本身无感知（配置与示例见配套笔记《插件、MCP与技能笔记》第 9 节） |
| MCP | Model Context Protocol，给 Agent 外接工具的开放协议；工具以 `mcp__服务器__工具` 形式进入对话 |
| Skill（技能） | 一份 `SKILL.md` 描述的可复用工作说明，Agent 按语义匹配触发 |
| a11y / 无障碍树 | 应用对外暴露的界面元素结构（名称/类型/坐标），ZCode"隐形后台操作"的基础 |
| Computer Use（电脑控制） | Agent 直接操控 GUI 的能力；ZCode 走"无障碍优先 + 视觉兜底"双轨（8.1-Q3） |
| 精灵图（Sprite Sheet） | 横向分帧的动画图集，每一行对应一个语义状态（idle/running/failed…） |
| 宠物包（Pet Pack） | 精灵图 + 状态映射的桌宠资源包；本方案兼容 Codex hatch-pet 格式（D2） |
| hatch-pet | OpenAI 官方桌宠生成技能，从概念/参考图产出宠物包（2.3） |
| element_stale | 元素过期错误：目标界面已变化，触发 Agent 重新观察（8.1-Q4） |
| 双指针竞态 | 用户与 Agent 同时操作鼠标/键盘导致输入交错、点击错位的冲突（8.6.1） |
| Off-Peak Tasks（错峰任务） | ZCode 的闲时后台任务功能，是"后台任务气泡"（8.6.2）的信息源之一 |
| 操作权证 | Z-Buddy 自建设想：Agent 前台操作前需获取的许可凭证，桌宠可拒发以实现暂停（8.4） |
| 人机接力 | 用户中途接管操作、停手后 Agent 续跑的协同模式，三段协议：让位→交接→复位（8.6.1） |
