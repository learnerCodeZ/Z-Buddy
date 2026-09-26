# z-buddy

把 ZCode Agent 生命周期桥接到 [Z-Buddy 桌宠](https://learnercodez.github.io/Z-Buddy/)的插件：一只像素风桌面宠物，实时反映 Agent 在干什么——点一下桌宠就能暂停 Agent。

## 它做什么

插件挂载全部 **7 种 hook 事件**（`SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PermissionRequest` / `PostToolUse` / `PostToolUseFailure` / `Stop`），把每个生命周期事件翻译成宠物状态，落盘给 Z-Buddy 桌宠应用读取：

| Hook 事件 | 触发时机 | 宠物状态 |
|---|---|---|
| `SessionStart` | 会话启动 | 待机 |
| `UserPromptSubmit` | 用户发请求 | 思考 |
| `PreToolUse` / `PostToolUse` | 工具调用 | 干活 |
| `PermissionRequest` | 权限请求 | 等你审批 |
| `PostToolUseFailure` | 工具失败 | 出错 |
| `Stop` | 一轮结束 | 待机 |

同时识别 **computer-use 桌面操作**（Agent 接管你的鼠标键盘），桌宠会弹预警气泡；支持**暂停键**：点一下桌宠即可挂起 Agent。

## 安装

1. 先装 Z-Buddy 桌宠应用——从[官网](https://learnercodez.github.io/Z-Buddy/)下载（插件只负责写状态文件，可视化在桌面应用里）。
2. 在 ZCode 插件商店安装本插件（或通过市场源），然后**新开一个会话**——hooks 只对新会话生效。
3. 本机需要 **Node.js**（hooks 用 `node` 执行脚本）。

不装桌宠应用时插件照常工作（状态文件照写），只是桌面上没有可视化。

## 副作用与权限（必读）

- **Hooks**：上述 7 种事件每次触发都会本地执行一个 Node 脚本。
- **写入路径**：仅在用户主目录 `~/.z-buddy/`（Windows 为 `%USERPROFILE%\.z-buddy\`）下：
  - `state.json`——最近活跃会话的状态快照；
  - `sessions/<会话id>.json`——每会话独立状态分片；
  - `events.jsonl`——追加式事件流（轻量摘要，如命令前 120 字符）。
  插件**绝不写你的项目目录**。
- **读取**：暂停标志文件 `~/.z-buddy/pause`（存在=暂停）与自己的历史状态文件。
- **暂停拦截（重要）**：pause 文件存在期间，插件对 `PreToolUse` / `PermissionRequest` 返回 `permissionDecision: "deny"`——**会阻断 Agent 的工具调用**，直到你再点一次桌宠（或删除 pause 文件）。命令文本含 `.z-buddy/pause` 时豁免，保证你随时能自行解锁。
- **网络**：无。插件不发起任何网络请求、不调用模型 API。（桌宠应用若开启自动更新会访问 GitHub Releases——那是应用的行为，与本插件无关。）
- **隐私**：全部数据只留在本机，不上传任何内容。

## 数据目录

运行时数据都在 `~/.z-buddy/`，删除该目录即重置。详见[官网文档](https://learnercodez.github.io/Z-Buddy/docs/quick-start/)。

## 故障排查

- **装了桌宠但不动**：hooks 只对安装*之后*新开的会话生效——新开一个会话。
- **Agent 突然拒绝工具调用且提示 Z-Buddy**：桌宠处于暂停态。点一下桌宠，或删除 `%USERPROFILE%\.z-buddy\pause`。
- **完全没状态**：确认 `~/.z-buddy/events.jsonl` 存在且在增长；确认 `node` 在 PATH 里。

## 许可证

插件代码：MIT。桌宠美术素材（像素/插画精灵图）为 Z-Buddy 项目原创，不得作为 IP 衍生物再分发。

## 相关链接

- 官网与桌宠下载：<https://learnercodez.github.io/Z-Buddy/>
- 源码与桌宠应用：<https://github.com/learnerCodeZ/Z-Buddy>
