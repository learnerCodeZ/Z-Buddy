# Phase 1 · 第一里程碑：桌宠上线 + 状态联动 + 点桌宠暂停

> 日期：2026-09-06
> 状态：🏁 **第一、二里程碑达成，待用户检查**（Phase 1 剩余项见 §7）
> 本阶段产物：`marketplace/`（插件+本地市场）、`app/`（Tauri 桌宠应用）、`lab/`（实验区保留）

---

## 0.5 用户体验修复轮（用户反馈：不能拖动、卡片显示不全）

用户实机反馈两个问题，根因与修复：

1. **不能拖动**——根因是"点击穿透守护"与拖拽的**竞态**：守护线程每 200ms 检测光标，拖动一开始光标移出宠物矩形，穿透被打开，原生拖拽当场夭折（我第一次自动化测试复现：手势完成但窗口纹丝不动）。修复三层：
   - 拖拽改为**手动触发**：mousedown 记录起点 → 位移 >6px 调 `start_dragging`（阈值区分"拖"与"点"，拖动结束的 click 不误触暂停）；
   - **mousedown 瞬间置 `DRAGGING=true`**、mouseup 置 false，守护线程看到标记就闭嘴；
   - **物理兜底**：Rust 轮询 `GetAsyncKeyState(VK_LBUTTON)`——左键按着期间穿透守护绝不动手（新增 windows crate 依赖，覆盖一切真人手势，合成事件竞态也从物理层面消除）。
2. **悬停卡被窗口边缘裁掉**——根因：窗口 160px 宽 < 卡片 224px。修复：窗口加宽到 240（宠物重新居中 left 56），卡片定宽 224 居中，点击穿透守护的交互区矩形同步更新（50..190）。

遗留：自动化拖拽测试受工具限制（原始事件要求前台匹配 + 合成拖拽瞬时跳跃与守护线程天然竞态），**拖动最终验证 = 用户手动拖一下**（按下团子拖走即可）。

## 0.6 第二里程碑：原创宠物「团子」+ 精灵图加载器 + 点击穿透（同日追加）

1. **原创美术落地**：`app/tools/gen_mochi.py`（PIL）程序化生成第一只原创宠物**团子 Mochi** 的精灵图集——64×64 帧、4 状态×4 帧（idle 呼吸眨眼 / working 敲键盘 / error X 眼汗滴 / sleep 闭眼 Zzz），版权干净、可复现、可二次创作；
2. **宠物包格式定稿（hatch-pet 兼容思路）**：`pets/<name>/` = `atlas.png`（行=状态、横向分帧）+ `pet.json`（帧尺寸 + 状态→行/帧数/fps 映射）。前端 Canvas 渲染器：按状态 fps 推帧、`imageSmoothingEnabled=false` 保像素风、`image-rendering: pixelated`；
3. **点击穿透守护**：Rust 轮询线程（200ms）检测光标是否在宠物本体矩形内，不在则 `set_ignore_cursor_events(true)`——修掉"窗口上半透明区挡点击"的已知问题；
4. **复测**：团子彩色上岗（工作姿态截图 frame-54cc576e），内存 28-31MB。

## 0.7 第三里程碑：外部宠物包加载 + MiMo 事件记录（同日追加）

1. **外部宠物包目录打通（端到端实测）**：`~/.z-buddy/pets/<名>/`（atlas.png + pet.json）→ Rust `list_external_pets` 扫描 → Tauri asset protocol（scope 限定 `$HOME/.z-buddy/pets/**`）喂给前端 → Canvas 渲染。实测：放入绿色「抹茶」包 → 应用重启后自动加载（截图确认绿色团子上岗）。**宠物商店生态的地基完成**；
2. **第二只原创宠物「抹茶」**：gen_mochi.py 升级为可传配色参数（身体/肚皮/描边/高光四色），一行命令换肤生成；
3. **MiMo 供应商消失事件（用户报告，已闭环）**：用户自配的 mimo-lite 供应商一度从设置页消失。排查确认：与桌宠开发零关系（我对 ZCode 数据目录全程只读）；根因是**自定义供应商落盘时机不确定**——mimo 一度只存在于内存，ZCode 重启即丢。用户已重配，实测已持久化（config.json 12:51:54 写入含 mimo-v2.5/v2.5-pro，UUID 型条目）。**建议**：添加供应商后重启 ZCode 确认落盘；避免多窗口同时改设置（last-write-wins 互踩）。

### 新增待查异常：「幽灵暂停」

一次应用重启后 pause 文件被莫名置位（09:17:42，唯一写入者是前端 click→set_pause，但重启后无人点击）。怀疑 WebView 在光标停留位置合成幽灵点击。已加 `set_pause` 日志埋点，下次复现可定位。**影响有限**（最坏情况：宠物显示已暂停，再点一下即恢复）。

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

1. ~~窗口透明区拦鼠标~~ ✅ 已修（点击穿透守护，§0.5-3）；
2. **拖动未实测**：`data-tauri-drag-region` 与 click 共存理论上没问题，待手动验证；
3. **多会话并发**：多个 ZCode 会话同时跑时 state.json 互相覆盖（last-write-wins）， Phase 2 引入会话聚合；
4. **幽灵暂停**：见 §0.5，已加埋点待复现定位；
5. **外部宠物包加载**：加载器架构就绪但仅内置 mochi；`~/.z-buddy/pets/` 外部包 + Tauri asset protocol 待 Phase 2。

## 5. Phase 1 剩余清单（下次继续）

- [ ] **插件装进 ZCode**（需要你操作 2 分钟）：设置 → 插件市场 → 添加本地市场 → 选 `D:\MYCODE\Z-Buddy\marketplace` → 安装 z-buddy → **新建会话**（hooks 快照机制）→ 然后真实干活时宠物就会动了
- [ ] 外部宠物包目录（`~/.z-buddy/pets/`）+ Tauri asset protocol（加载器已就绪）
- [ ] 原创宠物扩充（团子已有，再 1-2 只 + 表情细节打磨）
- [ ] 真人鼠标竞态 5 分钟实测（Phase 0 遗留）
- [ ] 托盘图标 + 退出菜单 + 开机自启（可选）

## 6. 检查点

等你检查通过后：提交推送本次代码 → 继续Phase 1 剩余清单（宠物包加载器 + 原创美术）。
