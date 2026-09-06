# Phase 1 · 第一里程碑：桌宠上线 + 状态联动 + 点桌宠暂停

> 日期：2026-09-06
> 状态：🏁 **第一里程碑达成，待用户检查**（Phase 1 后半项继续）
> 本阶段产物：`marketplace/`（插件+本地市场）、`app/`（Tauri 桌宠应用）、`lab/`（实验区保留）

---

## 0. 一分钟看完

**Z-Buddy v0.1 已经活在桌面上了**：右下角橙色小球，随 Agent 状态切换六种动画（待机呼吸/思考脉冲/干活弹跳/审批黄框/出错抖动/睡觉变灰），悬停出信息卡，**单击即暂停/恢复 Agent**（暂停=插件 hook 硬拦截，Phase 0 已验证强制力），可拖动挪位。内存 **~30MB 单进程**（Tauri）。

端到端实测证据：终端触发 `PostToolUseFailure` 事件 → 屏幕上的宠物当场变成 😵；无障碍点击宠物 → pause 文件创建 + 置灰⏸ → 再点 → 恢复。

## 1. 交付物清单

### 插件 v0.1（`marketplace/z-buddy/`）

- `.zcode-plugin/plugin.json` —— ZCode 插件 manifest
- `hooks/hooks.json` —— **全部 7 种事件**统一挂载 `report.mjs`
- `hooks/report.mjs` —— 核心状态机：
  - 状态推导：SessionStart→idle / UserPromptSubmit→thinking / PreToolUse·PostToolUse→working / PermissionRequest→permission / PostToolUseFailure→error / Stop→idle
  - 双写：`~/.z-buddy/state.json`（快照，含 since 状态起始时间）+ `~/.z-buddy/events.jsonl`（事件流）
  - 暂停强制：pause 文件存在 → PreToolUse/PermissionRequest 返回 `permissionDecision:"deny"`；含 `.z-buddy/pause` 的命令豁免
- 冒烟测试 6/6 通过（T1 状态机 / T2 双写 / T4 拦截 / T5 豁免 / T6 恢复）

### 本地市场（`marketplace/.claude-plugin/marketplace.json`）

对齐官方市场 schema（name/plugins/source 相对路径），供"设置 → 插件市场 → 添加本地市场"安装。

### 应用 v0.1（`app/`，Tauri v2）

- Rust 端（`src-tauri/src/lib.rs`）：
  - `read_state`：读 state.json，**paused 字段以 pause 文件实时状态合并**（修复了快照陈旧导致 UI 回退的缺陷）
  - `set_pause(on)`：写/删 pause 文件
  - 右下角出生定位：按 `outer_size()` 动态计算，**适配任意 DPI 缩放**（修复了 1.5x 缩放下宠物半截出屏的问题）
- 前端（`src/`）：
  - 六态 CSS 动画 + 表情映射（🐾🤔❓😵💤）+ 暂停置灰 ⏸ 角标
  - 悬停信息卡：状态 / 最近事件 / 操作提示
  - `role="button"` ARIA 语义——**无障碍点击不抢焦点**（见 §3 故事 2）
  - `data-tauri-drag-region` 拖动 + 单击暂停的并存设计
- 实测内存：**31.5MB / 单进程**（与 lab 数据一致）

## 2. 端到端验证记录（全部真机实测）

| 实验 | 结果 |
|---|---|
| 构建上线 | ✅ z-buddy-app.exe 启动，右下角出生，`focused:false` 不抢焦点 |
| 事件驱动动画 | ✅ 终端触发 PostToolUseFailure → 宠物当场 😵（截图 frame-0ed948d0） |
| 点击暂停 | ✅ 无障碍点击 → pause 文件创建 → 置灰 + ⏸ + 卡片"已暂停"（截图 frame-a0b32123） |
| 点击恢复 | ✅ pause 文件删除，宠物恢复彩色 |
| 内存 | ✅ 28-32MB 单进程 |

## 3. 过程中踩的坑（已修复，值得记录）

1. **幻影代理三连**：git 全局代理指向已关闭的 Clash（127.0.0.1:7890）→ push 失败。仓库级空代理覆盖解决；**你的全局 git 代理还指着 7890，其他仓库推送前记得开 Clash 或改配置**。
2. **DPI 定位翻车**：硬编码 -240/-260 偏移没算系统 1.5x 缩放，宠物半截悬在屏幕外 → 改用 `outer_size()` 动态计算。
3. **tauri.conf 字段名**：`focus` 不是 `focused`（报错信息里其实列了全部合法字段）。
4. **WebView2 无障碍树惰性构建**：首次 get_app_state 可能拿不到完整元素，**再查一次就有了**（第二次查询触发树构建）。

### 故事：无障碍优先的现场教学

点击宠物时原始坐标事件被拒绝（应用不在前台），正确修法不是"激活窗口抢焦点"，而是给 `#pet` 加 `role="button"`——WebView2 立刻把宠物暴露成 pressable 元素，**后台无障碍点击直接生效**。这堂课验证了立项书 8.1-Q3 说的：a11y 优先路线连我们自己的桌宠都受益。

### 缺陷修复：暂停 UI 回退

点击后 pause 文件已创建，但 `state.json` 的 `paused` 字段要等下一个 hook 事件才刷新 → 宠物 UI 600ms 后被打回原形。修复：Rust `read_state` 直接读 pause 文件实时状态合并返回，不信陈旧快照。

## 4. 已知问题（下个迭代修）

1. **窗口透明区拦鼠标**：160×300 窗口上半部（卡片悬浮区）虽然透明但会挡住身后内容的点击 → 方案：鼠标不在宠物本体时 `set_ignore_cursor_events(true)`；
2. **拖动未实测**：`data-tauri-drag-region` 与 click 共存理论上没问题，待手动验证；
3. **多会话并发**：多个 ZCode 会话同时跑时 state.json 互相覆盖（last-write-wins）， Phase 2 引入会话聚合；
4. **宠物形象**：当前是 CSS 圆球 + emoji 占位，原创美术（立项书第 9 节风险 1）待设计。

## 5. Phase 1 剩余清单（下次继续）

- [ ] **插件装进 ZCode**（需要你操作 2 分钟）：设置 → 插件市场 → 添加本地市场 → 选 `D:\MYCODE\Z-Buddy\marketplace` → 安装 z-buddy → **新建会话**（hooks 快照机制）→ 然后真实干活时宠物就会动了
- [ ] hatch-pet 宠物包加载器（精灵图 + 状态行映射）
- [ ] 内置 2-3 只原创宠物美术
- [ ] 真人鼠标竞态 5 分钟实测（Phase 0 遗留）
- [ ] 托盘图标 + 退出菜单 + 开机自启（可选）

## 6. 检查点

等你检查通过后：提交推送本次代码 → 继续Phase 1 剩余清单（宠物包加载器 + 原创美术）。
