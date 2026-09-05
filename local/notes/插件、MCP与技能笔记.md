# ZCode 笔记：插件、MCP 服务器与技能（Skills）

> 记录日期：2026-09-05
> 目的：搞清楚 ZCode 三种扩展机制的区别与联系，为 Z-Buddy 桌宠项目选型做铺垫（见第 7 节）。
> 资料来源：ZCode 官方文档 + 本会话一手观察（已标注）。ZCode 插件体系与 Claude Code 兼容，通用结论可互相参照。

---

## 1. 一句话总览

| 截图菜单项 | 一句话定位 | 类比 |
|---|---|---|
| **插件**（Plugin） | 能力**打包载体**：把下面两类东西连同斜杠命令、子智能体、钩子一起打成一个可一键安装的包 | 安装包 / 工具箱 |
| **MCP 服务器** | **外部能力扩展**：跑在 Agent 之外的服务，给 Agent 提供一组可调用的工具 | 外接设备 / 器官移植 |
| **技能**（Skill） | **可复用的工作说明**：一份 SKILL.md，教 Agent"某类事该怎么做" | 操作手册 / SOP |

三者不是竞争关系，而是**不同粒度**：MCP 和 Skill 是"能力单元"，Plugin 是"分发单元"。

---

## 2. MCP 服务器：给 Agent 外接工具

**是什么**：Model Context Protocol（模型上下文协议）——连接外部工具与数据的开放标准。一个 MCP 服务器是一个独立进程（本地 stdio 或远程 HTTP），它向 Agent 注册一组**工具（tools）**，工具以 `mcp__服务器名__工具名` 的形式进入对话，Agent 按需调用。

**配置方式**（官方文档）：设置 → MCP 服务器 → 右上角"新建 MCP 服务器"。表单模式适合快速填写常见 stdio 服务；作用域分两级：

- **用户级**：所有工作区可用；
- **工作区级**：仅当前项目可用。

**与插件的关系**：插件捆绑的 MCP 服务器会在"设置 → MCP"里显示为 *Plugin MCP 服务器*，随插件启停自动加载/卸载。

**本会话的一手实例**（证明其形态）：

- `computer-use`——桌面控制（截图、点击、键盘），即官方"电脑控制"功能的底层（官方说明原文："开启后将启用电脑控制**及其 MCP 与技能**"）；
- `web_reader`——网页抓取转 Markdown；
- `kicad`——PCB 设计全流程工具（几十个工具）；
- `node_repl`——浏览器自动化专用的 JS 运行时。

**注意事项**：MCP 配置里的密钥（API Key、Authorization 头）是明文写进配置文件的，远程开发同步时只应对信任的主机（官方 remote-development 文档明确提示）；工具的启用/禁用按会话生效。

---

## 3. 技能（Skill）：教 Agent 做事的手册

**是什么**：一份 **SKILL.md**（可带补充脚本/资源），描述触发场景、处理步骤、输出要求。Agent 判断用户请求命中某个技能的场景时，加载它并按同一套标准执行。

**关键特性**：

- **触发是语义匹配**：不是命令，而是"这个请求像不像这个技能描述的场景"（也可以被显式点名调用）；
- **分发依附插件**：官方文档明确——ZCode **没有独立的 Skill 市场**，Skill 必须通过 plugin marketplace 分发；
- **设置页可见可开关**：截图里"技能"那一项就是已安装技能的列表。

**对照实例**：Codex 的 `hatch-pet` 就是一个技能——`$skill-installer hatch-pet` 安装、`/hatch` 调用、从参考图生成桌宠精灵包。ZCode 与 Claude Code 的技能格式兼容，同款玩法可以搬过来（这正是 Z-Buddy 宠物包生成技能的模板）。

---

## 4. 插件（Plugin）：把一切打成包

**是什么**：ZCode 的能力打包机制。**一个插件可同时包含五类资源**：

1. **Skills**（技能）
2. **Commands**（斜杠命令，如 `/zpet`）
3. **Subagents**（子智能体）
4. **MCP 服务器**
5. **Hooks**（生命周期钩子）

**分发与安装**：通过插件市场分发（官方仓库 [zai-org/zcode-plugins](https://github.com/zai-org/zcode-plugins)，也支持第三方 marketplace）；安装前可查看详情页（实际包含的技能/命令/MCP/Hooks、开发者、版本）；v3.11.2 起支持**按工作区单独安装**，有新版本会提醒。

**开发成本**：官方文档的说法是"只需 JSON 和 Markdown"即可开发自己的插件——无编译、无 SDK 门槛。

**本会话的一手验证**：`example-plugin` 是官方示例插件，功能为空，但它的 **SessionStart hook 和每次工具调用的 hook 都在实时触发**（本会话每轮工具调用都留下 "example-plugin noted upcoming tool call: …" 的记录）——证明插件的 hooks 通道是可用且实时的，这是 Z-Buddy 状态感知的地基。

---

## 5. 三者对比表

| 维度 | 插件 Plugin | MCP 服务器 | 技能 Skill |
|---|---|---|---|
| 定位 | 打包与分发载体 | 外部能力扩展 | 可复用工作说明 |
| 形态 | 一个目录（JSON + MD） | 一个运行中的服务（stdio/HTTP） | 一个 SKILL.md（+ 附属文件） |
| 提供什么 | 五类资源的组合 | 一组可调用**工具** | 一套**方法论** |
| Agent 怎么用 | （容器，不直接用） | 当工具调用，`mcp__x__y` | 语义匹配后按步骤执行 |
| 作用域 | 用户级 / 工作区级 | 用户级 / 工作区级 | 随插件 |
| 安装来源 | 插件市场 / 本地 | 设置页手动添加 / 随插件 | 随插件（无独立市场） |
| 典型场景 | 一键装齐整套能力 | 接桌面、接浏览器、接数据库、接硬件 | 标准化流程：生成精灵包、代码评审清单 |

**关系图**：

```
插件 Plugin（分发单元）
├── Skills            ─┐
├── Commands           │ 能力单元
├── Subagents          │ （MCP 和 Skill 也可以脱离插件、
├── MCP 服务器         │  在设置页单独配置）
└── Hooks             ─┘
```

---

## 6. 怎么选（通用决策）

- 要让 Agent **能做新动作**（操作外部系统）→ **MCP 服务器**；
- 要让 Agent **按固定套路做事**（流程/规范/生成物）→ **技能**；
- 要把上述东西**给别人一键安装**、并附带命令/钩子/子代理 → **打包成插件**发市场。

---

## 7. 对 Z-Buddy 的意义（选型结论）

| Z-Buddy 需求 | 载体 | 理由 |
|---|---|---|
| 感知 Agent 状态（干活/权限请求/完成） | 插件的 **Hooks** | 生命周期事件级、实时（本会话已验证），无侵入降级（Hook 详解见第 9 节） |
| 生成宠物包（对标 hatch-pet） | **技能**（z-buddy-hatch） | 语义触发 + 生成型流程，GLM 直接产精灵图规格 |
| "操作权证"/电脑操作暂停机制 | 自建 **MCP 服务器** | 与官方"电脑控制"（MCP + 技能）同源同构，工具调用天然是审批点 |
| 用户侧一键安装 / `/zpet` 命令 | **插件**打包以上全部 + Commands | 一个包进市场，对齐 Codex"装个技能就有桌宠"的体验 |

**结论：三种载体全都要用——插件是发布形态，MCP 和技能是内部构件，Hooks 是感知神经。**

---

## 8. 参考链接

- [ZCode Docs: Plugin（插件 = 五类资源打包）](https://zcode.z.ai/cn/docs/plugin)
- [ZCode Docs: Skill（SKILL.md 规范、无独立技能市场）](https://zcode.z.ai/cn/docs/skill)
- [ZCode Docs: MCP（设置 → MCP 服务器、用户/工作区作用域）](https://zcode.z.ai/cn/docs/mcp-services)
- [ZCode Docs: Q&A（权限默认值、插件与技能开关）](https://zcode.z.ai/cn/docs/qa)
- [ZCode Docs: 远程开发（MCP 密钥明文提示）](https://zcode.z.ai/cn/docs/remote-development)
- [zai-org/zcode-plugins（官方插件市场仓库）](https://github.com/zai-org/zcode-plugins)
- [Claude Code Docs: 使用 MCP 连接外部工具（对照）](https://code.claude.com/docs/zh-CN/agent-sdk/mcp)
- [腾讯云 CloudBase：ZCode 配置指南（第三方添加 MCP 实例）](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/zcode)

---

## 9. Hooks：Agent 生命周期钩子

> 插件五类资源里唯一还没展开的一个。本节回答：Hook 是什么、怎么用、举例子。
> ZCode Hooks 与 Claude Code 规范兼容；官方文档：[Hooks | ZCode Docs](https://zcode.z.ai/cn/docs/hooks)。

### 9.1 是什么

**Hook = 挂在 Agent 生命周期固定节点上的自动执行脚本。** 事件发生时（比如"Agent 正要调用 Bash""会话开始了"），运行时替你跑一个命令——**不是 Agent 主动调用的，Agent 本身无感知**。

类比：Git 的 pre-commit 钩子、网页开发的 DOM 事件监听。

三种扩展机制的角色一句话分清：

| 机制 | 谁发起 | Agent 是否知情 |
|---|---|---|
| MCP 工具 | Agent **主动调用** | 知道（它决定调什么工具） |
| 技能 | Agent 按需加载 | 知道（它读手册照做） |
| **Hook** | **运行时自动触发** | **不知道**（旁观者视角） |

最后一行正是 Hook 的价值：**它让"第三方程序"（比如 Z-Buddy 桌宠）能旁观 Agent 的一举一动**——Agent 自己不知道被观察，也就不会为了"给桌宠看"而分心。

### 9.2 怎么用（配置）

**配置位置**：插件内的标准位置 `hooks/hooks.json`（自动发现，无需在 manifest 里指向）；也可以在设置 → Hooks 查看/管理——插件带来的 Hook 显示为**只读条目**，能看到事件、matcher、命令和来源路径。

**配置结构**：JSON，按**事件名**分组，每个事件下是 **matcher 组数组**（官方 Plugin 文档确认）：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash|Edit|Write",
        "hooks": [
          { "command": "node ~/.z-buddy/report.js post-tool-use" }
        ]
      }
    ]
  }
}
```

要点：

- **事件名是顶层 key**（如 `PreToolUse`、`PostToolUse`、`Stop`）；
- **matcher** 过滤工具名（正则/字符串，如 `"Bash"`、`".*"`），不写 = 匹配全部；
- **两种执行方式**（官方 Plugin 文档）：`command` = shell 字符串（支持 async）；`process` = argv 数组执行（免 shell 转义，跨平台更稳）——具体字段名以官方 hooks/plugin 文档为准；
- **事件数据通过 stdin 传入**：脚本收到一段 JSON（含 `hook_event_name`、`session_id`、`cwd`、`tool_name`、`tool_input` 等）——这就是状态上报的数据来源；
- **反馈语义**（Claude Code 兼容）：退出码 0 = 正常；exit 2 = 阻断并把 stderr 反馈给模型；`PreToolUse`/权限类 Hook 可以**拦截或放行**工具调用；
- 调试技巧（官方文档）：日志写到 **stderr**；改完配置新建 session 验证。

**常用事件**（Claude Code 兼容体系，全表以官方文档为准）：

| 事件 | 触发时机 | Z-Buddy 用途 |
|---|---|---|
| `SessionStart` / `SessionEnd` | 会话开始/结束 | 宠物"上线/下班" |
| `UserPromptSubmit` | 用户发出请求 | 宠物进入"接单"状态 |
| `PreToolUse` / `PostToolUse` | 工具调用前/后 | **干活中**动画（打字/跑动） |
| 权限请求类事件 | Agent 请求敏感操作授权 | **桌面审批气泡**（对标 clawd） |
| `Stop` / `SubagentStop` | 任务回合/子代理结束 | 任务完成庆祝 / 子代理收工 |
| `PreCompact` | 上下文压缩前 | （可忽略，长任务场景） |

### 9.3 例子（由浅入深）

**例 1 · 最小可用**：每次 Agent 用完 Bash 就追加一行日志——

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Bash", "hooks": [{ "command": "echo [hook] Bash used at %DATE% %TIME% >> \"%USERPROFILE%/.z-buddy/hook.log\"" }] }
    ]
  }
}
```

跑一个任务后 `cat ~/.z-buddy/hook.log` 能看到记录，说明 Hook 生效了。

**例 2 · Z-Buddy 核心链路：状态上报**（就是调研报告 Phase 0 第一条实验）——

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "command": "node ~/.z-buddy/report.js session-start" }] }],
    "PreToolUse":   [{ "matcher": ".*", "hooks": [{ "command": "node ~/.z-buddy/report.js busy" }] }],
    "Stop":         [{ "hooks": [{ "command": "node ~/.z-buddy/report.js idle" }] }]
  }
}
```

`report.js` 做三件事：读 stdin 的 JSON → 提炼成 `{event, tool, time}` → 写入 `~/.z-buddy/state.json`。桌宠应用 watch 这个文件，状态一变就切动画——**Agent 干活时宠物打字、Agent 结束时宠物庆祝**，这条链路就通了。

**例 3 · 桌面审批气泡**（对标 clawd 的 Ctrl+Shift+Y/N）：权限请求事件触发 → 脚本调 Windows toast 通知或直接 HTTP 通知桌宠应用弹卡片 → 用户点"允许/拒绝"。Agent 请求危险命令时，不用切回 ZCode 窗口，在桌面上就完成审批。

**例 4 · PreToolUse 拦截**（展示 Hook 能"管住" Agent）：matcher 匹配 `Write|Edit`，脚本检查 `tool_input` 里的目标路径——如果撞上受保护目录（比如生产配置），exit 2 阻断，Agent 会收到 stderr 里的理由并改道。这也是 8.4 节"操作权证"暂停机制的候选实现之一。

### 9.4 本会话的一手证据

`example-plugin` 的 Hook 在本会话**每次工具调用都在实时触发**（每轮都留下 "example-plugin noted upcoming tool call: Bash" 的记录），而且零配置、零感知——证明插件的 hooks 通道开箱即用，Z-Buddy 的状态感知不需要任何黑科技。

### 9.5 注意事项

1. **无侵入降级**：Hook 脚本失败/超时绝不能影响 Agent 主流程（桌宠没开，Hook 静默跳过）；
2. **别做重活**：`PreToolUse`/`PostToolUse` 每次工具调用都会跑，脚本要毫秒级返回；
3. **安全意识**：Hook 以你的用户权限执行任意命令——**安装第三方插件 = 信任它的 hooks.json**，装前看一眼它的 Hook 都在跑什么；
4. **matcher 精确化**：能用 `"Bash"` 就别用 `".*"`，避免无关事件白白跑脚本。

### 9.6 参考链接

- [Hooks | ZCode Docs（设置页查看、stderr 调试）](https://zcode.z.ai/cn/docs/hooks)
- [Plugin | ZCode Docs（hooks/hooks.json 结构、process/command）](https://zcode.z.ai/cn/docs/plugin)
- [JavaGuide：Claude Code Hooks 详解（兼容规范原理）](https://javaguide.cn/ai-coding/principles/claude-code-hooks.html)
- [腾讯云开发者社区：Hook 事件与实战场景解析](https://cloud.tencent.com/developer/article/2649082)
