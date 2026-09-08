# Phase 0 技术验证总结

> 日期：2026-09-05 深夜～09-06
> 状态：✅ **已完成，待用户检查**
> 对应立项书：第 6 章 Phase 0 清单 + 10.2 待决问题 Q1-Q7
> 实验产物：`lab/` 目录（events.log 事件日志、electron-demo/、tauri-demo/、pre-tool-use.mjs.bak）

---

## 0. 结论一览（30 秒版）

| 待决问题 | 结论 | 置信度 |
|---|---|---|
| Q1 hooks 事件表 | **官方 7 事件确认**，stdin 契约实测捕获成功 | 高（文档+实测） |
| Q2 暂停机制 | **hook deny 硬拦截全闭环通过**——"点桌宠=暂停"成立 | 高（实测） |
| Q3 打断自愈 | 窗口强关→结构化错误→协议指引 re-observe，与立项书预测一致 | 高（实测） |
| Q4 聊天 Key | 与 ZCode 订阅**解耦**（任意 OpenAI 兼容端点+Key）；实测读到本机订阅状态 | 高 |
| Q5 错峰任务痕迹 | **金矿**：`tasks-index.sqlite` 完整任务生命周期表，可直接读 | 高（实测 schema） |
| Q6 取消通道 | 无公开 API → 降级方案定稿（深链回 ZCode + hook 软暂停） | 中 |
| Q7 框架选型 | **Tauri 30.6MB 单进程 vs Electron 334.9MB 4 进程（11 倍）**，两者透明窗都验证通过 | 高（实测） |

**七问全部有着落，无一项卡死。两大意外收获：官方原生用户打断信号（is_interrupt）、本机任务数据库可读。**

---

## 1. Q1 hooks 事件表 —— 已解决

### 官方事件全表（7 个）

`SessionStart`（matcher 匹配 source：startup/clear/compact）、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PostToolUseFailure`、`Stop`。

### 对 Z-Buddy 至关重要的文档发现

- **`PreToolUse` 支持 `permissionDecision: "deny"`**（优雅拒绝 + 理由回传模型）——Q2 暂停机制的官方正道；
- **`PermissionRequest` 事件可 allow/deny**——clawd 式"桌面审批卡片"是官方支持的能力；
- **`PostToolUseFailure` 带 `is_interrupt` 字段**——🎯 **意外收获：官方原生区分"用户打断"**！桌宠检测打断不需要自己造轮子；
- `PostToolUse` 带**完整 tool_response**——后台任务气泡事件流的数据源；
- `Stop` 的 `decision:block` 可让主模型续跑（最多 3 次）。

### 实测捕获（stdin 契约）

通过临时替换 example-plugin 的 hook 脚本（.mjs 内容热生效，配置快照不影响），捕获到真实事件流 `lab/events.log`：

```json
{"ts":"...","event":"PreToolUse","tool":"Bash","cwd":"D:\\MYCODE\\Z-Buddy",
 "session_id":"sess_...","tool_use_id":"call_be8abe...","tool_input_keys":["command","description"]}
```

配置机制实测确认：插件 `hooks/hooks.json` 自动发现；`process` 类型（argv+timeoutMs+statusMessage）；**配置在 session 启动时快照（改配置需新 session），脚本内容每次实时读取**；`.mjs` 里不能用 `require`（ESM）。

### 遗留

当前 session 只能捕获 example-plugin matcher（Bash|Write|Edit）的 PreToolUse。**全事件（7 种）全字段捕获需新建 session 装 z-buddy-lab 插件后进行**（列入 Phase 1 首日任务）。

---

## 2. Q2 暂停机制 —— 已解决（本 Phase 最重要成果）

实验：临时 hook 脚本读 `lab/pause.flag`，存在则返回 `permissionDecision:"deny"` + 理由。

| 步骤 | 结果 |
|---|---|
| 无 flag 时调用 Bash | ✅ 正常执行，事件已记录 |
| 写入 flag 后调用 Bash | ✅ **命令被硬拦截**（回显文本未执行），Agent 收到自定义理由"[Z-Buddy 实验暂停中]..." |
| 豁免规则（命令含 "pause.flag"） | ✅ 穿透放行，删除 flag 成功（防止"暂停后无法解除"死锁） |
| 删除 flag 后调用 Bash | ✅ 恢复正常 |

**结论：立项书 8.4 的"操作权证"确认为可行，且实现比预想更优雅**——不需要自建 MCP，一个 PreToolUse deny 钩子就是完整的暂停机制。配套确认：`PermissionRequest` 事件的 allow/deny 能力让"桌面审批气泡"（P3）有官方通道。

**设计修订建议**：8.4 可行性表中"暂停机制 ⚠️ 需设计验证"改为 ✅；方案从"MCP 权证（劝）"改为"hook deny（管）+ 豁免清单"。

---

## 3. Q3 打断行为实测 —— 已解决

实验：computer-use 打开记事本（新实例 pid 31644）→ 记录 UI 元素（state s-1，73 元素）→ `taskkill` 强关（模拟用户）→ 对 s-1 旧元素点击。

实测结果（与立项书 8.1-Q4 预测一致）：

1. 对死元素的 AXPress 派发返回 `possibly_sent`（发向已死 token，无崩溃、无错误点击）；
2. 紧随的状态回报返回**结构化错误** `PermissionBrokerError`："UIA returned no tree for pid 31644……**Call list_windows to confirm, then re-observe**"——协议亲自指引恢复；
3. 直接查询死 pid 返回同样的干净错误。

**结论：响应式恢复机制实测确认，桌宠的"打断剧本"（惊讶表情+气泡询问）有真实的失败信号可挂载。**

### 遗留

真人鼠标竞态测试（Agent 点击时用户持续晃鼠标）无法自模拟——**需要用户配合 5 分钟实测**（Phase 1 初，属低风险补充项）。

---

## 4. Q4 聊天 Key —— 已解决（方案解耦）

实测读取 `D:/ZcodeData/.zcode/v2/coding-plan-cache.json`：本机订阅为 `bigmodel-start-plan`（available），Z.ai/bigmodel Coding Plan 均 not entitled。

**结论**：聊天 Key 与 ZCode 订阅彻底解耦——产品侧做成"任意 OpenAI 兼容端点 + API Key"配置（base URL 可填），用户自备 BigModel 标准键即可。附带发现：桌宠未来可读此缓存展示订阅状态（隐私敏感，仅本机显示，不上传）。

---

## 5. Q5 错峰任务痕迹 —— 重大发现 🏆

实测 `D:/ZcodeData/.zcode/v2/tasks-index.sqlite`（Python sqlite3 直读，WAL 模式），表结构完整：

- `off_peak_tasks`：**完整生命周期**（status/queued_at/started_at/session_id/queue_position/next_poll_at/failure_reason/files_changed…）
- `automations`：**cron 自动化任务表**（cron_expr/enabled/running/dispatch_status/next_run_at…）
- `automation_runs` / `tasks` / `task_groups` 及关联表

（当前 0 行——功能还没用过，但 schema 就是权威数据源。）

**结论：后台任务气泡（8.6.2）的数据源升级为双通道**——hooks 事件流（实时）+ tasks-index.sqlite（权威状态、历史、错峰任务、自动化任务）。比原设计覆盖面大得多。

---

## 6. Q6 取消通道 —— 已解决（降级方案定稿）

调研确认：无公开的任务取消 CLI/API；Remote Control 是手机扫码查看/切换；任务管理（取消/归档/删除）在应用内。

**定稿**：气泡 v1 的"取消" = **深链回 ZCode 对应任务窗口**（`tasks` 表有 task_id ↔ session_id 映射可定位）；我们的 hook 层可做"暂停"（软停止）作为增强。同步给 zai-org 提 feature request（官方控制 API）。

---

## 7. Q7 框架选型 —— 已解决（数据决定）

环境勘察：Node 24.15.0 / npm 11.12.1 / **Rust 1.98** / cargo 1.98 / Python 3.14.5 —— 三条路线工具链全齐。

### 同规格最小样品实测（160×160 透明/无边框/置顶/托盘外宠物窗）

| 指标 | Electron | Tauri |
|---|---|---|
| 内存 | **334.9 MB**（4 进程：main 96.5 + gpu 53.1 + utility 50.9 + renderer 71.3，关硬件加速） | **30.6 MB**（单进程） |
| 进程数 | 4 | **1** |
| 透明+无边框+置顶 | ✅ 截图验证 | ✅ 截图验证（🐾 emoji 渲染还更清晰） |
| 点击穿透 | ✅ `setIgnoreMouseEvents(forward)` | 待实现（API 存在） |
| 额外坑 | 首次测量误判（下载器进程）；ZCode 自身也是 Electron，进程需按命令行路径归属 | 首编约 4 分钟；**代理陷阱**（见下） |

**结论：Tauri 胜出**——桌宠是常驻进程，11 倍内存差距是体验级差异（clawd 被诟病的正是这个）。**建议主栈 Tauri（前端仍是 Web 技术，两者通用），Electron 保留为备选**。demo 代码保留在 `lab/` 供复查。

### ⚠️ 环境坑记录（重要，避免未来重踩）

注册表残留 Clash 代理 `127.0.0.1:7890`（`ProxyEnable=0` 已禁用但 **cargo 的 curl 仍然读取**，端口未监听）→ 构建失败。解法已固化在项目内：

- `lab/tauri-demo/src-tauri/.cargo/config.toml` → rsproxy.cn sparse 镜像（项目本地，未动全局）
- 构建命令加 `NO_PROXY='*' no_proxy='*'`

---

## 8. 环境恢复确认

- ✅ example-plugin 原脚本已恢复（头部校验一致）
- ✅ pause.flag 已删除；electron/tauri/cargo 进程已清理
- ✅ events.log 与脚本备份保留在 `lab/` 作为实验证据
- ✅ 用户桌面无残留窗口

---

## 9. 对立项报告的修订建议（待批准后执行）

1. 10.2 待决问题表：Q1-Q7 标注"Phase 0 已解决"+ 指向本笔记；
2. 8.4 可行性核对表："暂停机制 ⚠️"→ ✅（hook deny 实测），方案改为"hook deny + 豁免清单"；
3. 8.6.2 数据源：升级为"hooks 事件流 + tasks-index.sqlite 双通道"；
4. 第 5 节技术选型：定稿 Tauri 主栈（附内存对比数据）；
5. 第 6 章：勾选 Phase 0 已完成项；新增遗留项（全事件捕获、真人竞态测试）入 Phase 1 首日。

## 10. Phase 1 启动条件检查

- [x] 暂停机制可行（Q2）→ 接力协议"让位"段有地基
- [x] 框架定稿（Q7）→ 可以搭正式项目脚手架（monorepo：plugin + tauri app）
- [ ] 新建 session 装 z-buddy-lab 插件 → 全事件捕获补全（Phase 1 首日）
- [ ] 真人鼠标竞态 5 分钟实测（Phase 1 初，需你配合）
- [ ] Phase 0 总结经你检查通过
