# AGENTS.md — Z-Buddy 开发者指南

> 给所有加入项目的人看：项目是什么、怎么跑起来、怎么改。

---

## 一句话

Z-Buddy 是 ZCode 的桌宠——一只悬浮在桌面上的原创像素宠物，通过 ZCode 插件（hooks）感知 Agent 状态并实时反应，同时提供主界面驾驶舱查看历史、管理宠物和设置。

## 项目结构

```
Z-Buddy/
├── app/                        # 🔑 桌宠应用（Tauri v2 + Web 前端）
│   ├── src/                    #    前端代码（零构建，vanilla JS）
│   │   ├── pet/                #    宠物窗：精灵图动画、暂停/拖动、右键菜单
│   │   ├── main/               #    主界面窗：总览/宠物管理/活动/设置
│   │   ├── shared/             #    两窗共用：API 封装 + 宠物包加载器
│   │   └── pets/               #    内置宠物包（yoru 默认/插画、mochi/bsod/fireball 像素）
│   ├── public/pets/            #    内置宠物包副本（Vite 静态目录约定，与 src/pets 同步）
│   ├── tools/                  #    宠物素材生成器（python 像素 / node 插画）
│   └── src-tauri/              #    Rust 后端
│       ├── src/
│       │   ├── lib.rs          #    run() 组装、双窗创建、单实例、自启、窗口事件
│       │   ├── commands.rs     #    全部 Tauri 命令（状态/暂停/拖动/宠物/事件流/设置）
│       │   ├── tray.rs         #    托盘菜单（五项：打开主界面/官网/显示隐藏/切宠物/退出）
│       │   ├── clickthrough.rs #    点击穿透守护线程（光标不在宠物本体时穿透窗口）
│       │   └── config.rs       #    ~/.z-buddy 路径 + app.json 读写
│       └── Cargo.toml
├── marketplace/                # ZCode 插件
│   ├── z-buddy/                #   插件本体
│   │   ├── hooks/hooks.json    #   7 种 hook 事件定义
│   │   └── hooks/report.mjs    #   核心：状态机 + 事件流落盘 + 暂停拦截
│   └── .claude-plugin/         #   本地市场清单（开发期用）
├── scripts/                    # 发布工具
│   └── sync-release.sh         #   一键：构建 → 覆盖 ~/.z-buddy/bin/ → 重启
├── lab/                        # Phase 0 实验样品（Electron/Tauri 对拼）
├── website/                    # 官网站点（Astro，部署到 GitHub Pages）
├── docs/                       # 项目文档（设计规范、架构决策等）
├── local/                      # 本地私有资料（不入库）
├── .gitignore
└── README.md
```

## 快速上手

### 环境要求

- **Node.js** 18+（当前 24）+ npm
- **Rust**（`rustup` 安装，当前 1.98）
- **Windows 10/11**（macOS/Linux 待验证）
- Windows 代理环境下 Cargo 需要 `NO_PROXY='*'`（项目内 `.cargo/config.toml` 已配 rsproxy.cn 镜像，可忽略系统代理对 crates.io 的干扰）

### 开发模式运行

```bash
cd app
npm install
NO_PROXY='*' npx tauri dev
```

首次编译约 3-5 分钟（新依赖），之后热重载（改 Rust → 自动重编译，改前端 → 2 秒热更新）。应用启动后宠物出现在**主屏右下角**。

### 构建发布版

```bash
# 一键构建 + 同步到自启目录 + 重启桌宠（推荐）
bash scripts/sync-release.sh

# 手动构建
cd app && npx tauri build
# 产物：
#   app/src-tauri/target/release/z-buddy-app.exe           (4.2MB 单文件)
#   app/src-tauri/target/release/bundle/nsis/*.exe           (1.4MB 安装包)
```

### 插件本地测试

插件目前只能通过"添加本地市场"安装：
1. ZCode → 设置 → 插件市场 → 添加市场 → 本地路径
2. 选择仓库的 `marketplace/` 目录
3. 安装 z-buddy → **新建会话**（hooks 只对新会话生效）

### 数据目录

所有运行时数据在 `~/.z-buddy/`（不进项目目录）：

| 文件 | 内容 | 由谁写 |
|---|---|---|
| `state.json` | Agent 当前状态快照 | 插件 `report.mjs` |
| `events.jsonl` | 事件流（追加写） | 插件 `report.mjs` |
| `pause` | 暂停标志文件（存在=暂停） | 桌宠应用 `set_pause` |
| `app.json` | 应用偏好（当前宠物/关闭行为/mainSeen） | 桌宠应用 |
| `pets/<名>/` | 外部宠物包（atlas.png + pet.json） | 用户 |
| `bin/z-buddy-app.exe` | 发布版副本（自启用） | `sync-release.sh` |

## 核心架构

### 数据流

```
ZCode Agent
  ↓ (生命周期事件)
插件 hooks/report.mjs  ──写入──→  ~/.z-buddy/{state.json, events.jsonl, pause}
                                       ↑ 轮询 600ms
                  ┌───────────────────┘
                  ↓
          桌宠应用 (Tauri)
          ├── pet 窗口：读 state.json → 切换动画
          ├── main 窗口：读 state.json + events.jsonl → 总览/活动页
          └── 托盘：读 pause 文件 → 右键菜单状态
```

### 宠物包格式（兼容 Codex hatch-pet）

每个宠物是一个文件夹，放在 `src/pets/`（内置）或 `~/.z-buddy/pets/`（外部）：

```
<名>/
├── atlas.png   # 精灵图：行 = 状态，列 = 帧（行数列数不固定，由 pet.json 声明）
└── pet.json    # 配置：frame 尺寸 + 状态→{row, frames, fps} 映射
```

- **atlas 不是固定 4×4**：播放器只按 `states[状态].row` 和 `frame.w/h` 裁图，从不校验图集行列数，
  所以 6 种状态就 6 行、每行 6 帧就 6 列 —— 换形态只改 `pet.json`，应用代码零改动；
- 基础状态：`idle / thinking / working / permission / error / sleep`（可复用同一行）；
- **可选扩展状态**：`drag_left` / `drag_right`（长按拖动的静态形象，左右互为镜像）、
  `paused`（点桌宠暂停时的姿态）、`idle_alt` / `thinking_alt`（待机/思考的**第二张形象**：
  运行期每 30 秒与 `idle`/`thinking` 互换，规则在 `pack.js` 的 `withPoseAlternate()`）——
  宠物包没有这些键时自动降级为普通状态动画；
- **气泡（Z / ? / 暂停）烘焙进精灵图帧**：队列语义（最多 N 个、依次出现、最早的先消失、
  上下或并排排列）都在构建期合成，运行时不额外绘制 → 应用代码零改动；
- 夜羽当前是 **6 列 × 10 行**（`idle/working/error/sleep/drag_left/drag_right/thinking/paused/idle_alt/thinking_alt`），
  图集 1152×1920；working/permission/error 仍用旧立绘（用户未指定这三个状态的新姿势）；
- 思考行**没有**手部动效（曾做过"手部左右微动 ±1.8px"，按用户要求已关闭；
  实现保留在提交 `c8cb2f3` 里，需要时取回：把姿势按手部矩形拆成 body + hand 两层，
  hand 做横向位移，body 的空洞用上下边缘插值补掉 —— 注意矩形**只许框手、不能碰下巴**）；
- 带气泡的状态行角色高度统一 140px（给上方气泡留空间）。

### 长按拖动 = 切换拖动形象（可选能力）

宠物窗的交互：**单击 = 暂停/恢复**；**长按 220ms = 拎起来，换成拖动形象**；按住拖动 = 挪窗口（沿用系统拖动）。

- 形象由**拖动方向**决定：向左（含左上/左下）与**正上方** → `drag_left`；其余（含向右、正下方）→ `drag_right`
  （规则在 `shared/pack.js` 的 `pickDragState()`）；
- 方向**不能用 mousemove 判断**：Windows 原生拖动走系统模态移动循环，WebView 收不到 mousemove。
  实际做法是前端每 80ms 轮询 Rust 命令 `cursor_pos`（JS 定时器在拖动中照常运行），累计位移过阈值才换（防抖）；
- 拖动期间 `#pet` 的 class 为 `dragging`，轮询的状态切换被抑制（`if (!dragState)`），避免 600ms 轮询把画面覆盖回去；
- 外部宠物包没有拖动形象行时自动跳过（`hasDragRows()`）；
- 生成方式见下：`--drag <立绘.png>`，工具自动抠背景 + 裁切 + 镜像，写入 row 4 / row 5（各 1 帧）；
- **镜像时字形要保持正**：`--drag-upright` 传字形矩形（源图坐标），镜像后按原方向贴回，
  否则头顶的 Z、配饰里的字母会跟着翻反。

### hooks 事件全表（7 种）

| 事件 | 触发时机 | 状态机映射 |
|---|---|---|
| `SessionStart` | 会话启动 | → idle |
| `UserPromptSubmit` | 用户发请求 | → thinking |
| `PreToolUse` | 工具调用前 | → working |
| `PermissionRequest` | 权限请求 | → permission |
| `PostToolUse` | 工具调用后 | → working |
| `PostToolUseFailure` | 工具失败 | → error（is_interrupt 标记区分是否被打断） |
| `Stop` | 一轮结束 | → idle |

### 暂停机制

- 桌宠应用写/删 `~/.z-buddy/pause` 文件
- 插件 `report.mjs` 的 PreToolUse hook 检测到 pause 文件 → 返回 `permissionDecision:"deny"`（硬拦截，Agent 收到拒绝理由）
- 含 `.z-buddy/pause` 的命令豁免（防止"暂停后删不了 pause"死锁）

## 设计规范

### 风格

- **深色底**（#1e2229）、像素风、圆角卡片、橙色强调色（#FF9F43）
- 精灵图 `imageSmoothingEnabled: false`（保像素清晰）
- 宠物窗透明无边框置顶；主界面无边框不缩放

### 新增宠物

宠物包 = 一个文件夹（`app/src/pets/<名>/` 内置，`~/.z-buddy/pets/<名>/` 外部），内含 `atlas.png` + `pet.json`。
加内置宠物时记得**同时**放进 `app/src/pets/` 和 `app/public/pets/`（仓库既有约定），
并在 `pack.js` 的 `BUNDLED`、`commands.rs` 的 `BUNDLED`、`config.rs` 的 `pet_list()` 三处登记。

```bash
# ① 像素宠物（程序化绘制，四色可配：身体/肚皮/描边/高光）
python app/tools/gen_mochi.py src/pets/<新名> <身体hex> <肚皮hex> <描边hex> <高光hex>

# ② 插画宠物（一张完整立绘 → 图集：抠白底 + 六态动画 + 头顶装饰分离，纯 Node 无依赖）
node app/tools/gen_illustration_pet.mjs app/tools/source/<名>.png app/src/pets/<名> \
     --name <名> --title-hex <标题的UTF-8字节hex> --frame 192
# 标题用 hex 是因为 Windows PowerShell 5.1 传非 ASCII 参数会乱码
# （夜羽 = e5a49ce7bebd）；生成后把 atlas.png / pet.json 复制到 app/public/pets/<名>/

# ②' 追加"长按拖动形象"两行（可选）：传一张单张立绘（不带动效）
node app/tools/gen_illustration_pet.mjs app/tools/source/<名>.png app/src/pets/<名> \
     --name <名> --title-hex <hex> --frame 192 --drag app/tools/source/<名>-drag.png \
     --drag-upright "683,0,838,148;697,148,762,178;686,712,744,768"
# 工具会自动：抠白底（阈值 250，可用 --drag-bgmin 调）→ 裁切到内容包围盒
# → 写入 drag_left(row4) / drag_right(row5)，各 1 帧；另一个方向是水平镜像
# 素材默认"朝右"（原图给 drag_right、镜像给 drag_left）；若立绘本来就朝左，加 --drag-faces left
# --drag-upright：若干**源图坐标**矩形（x0,y0,x1,y1;…）。整图镜像会把字形也翻反，
#   这些矩形在镜像后按原方向贴回 ⇒ 鸭子反、字正。上面那串是夜羽的实测值
#   （头顶 Z / Z 的卷尾 / 胸针心形里的 Z）；矩形只许覆盖字形，压到鸭子身上会留一块没镜像的补丁。

# ③ 手工：行 = 状态（idle/working/error/sleep[/drag_left/drag_right]），参考 src/pets/mochi/pet.json

# ④ 多姿势宠物（夜羽专用构建器）：4 张姿势图（每张 3 个姿势：站/睡/思考）+ 旧立绘 + 天鹅
#    → 合成 8 行图集，并烘焙 Z / ? / 暂停气泡队列
node app/tools/gen_yoru_atlas.mjs app/src/pets/yoru
# 源图在 app/tools/source/：yoru-pose1..4.png、yoru.png（working/error 用）、yoru-drag.png（天鹅）
# 想换某个状态的姿势，改 gen_yoru_atlas.mjs 里的 poses[索引] 再跑一次即可
```

> 帧尺寸随包而定（像素宠物 64×64，插画宠物 192×192）；桌宠窗画布位图固定 192×192（窗口 240×340，
> 宠物贴底、信息卡在其上方），与 192 帧 1:1、对 64 帧整数 3 倍放大。改画布尺寸时记得同步
> `pet/styles.css` 的 `#pet`/`#card`、`tauri.conf.json` 的窗口高度与 `clickthrough.rs` 的点击穿透矩形。

### 新增 Tauri 命令

1. 在 `commands.rs` 写 `#[tauri::command]` 函数
2. 在 `lib.rs` 的 `generate_handler!` 注册
3. 前端在 `shared/api.js` 导出（如果多处使用）

### 新增前端页签

1. 在 `src/main/` 加 `xxx.js`
2. `index.html` 加对应 `<section id="page-xxx">` + 侧栏按钮
3. `main.js` 里 `import` 并调 `bootXxx()`

## 已知问题

1. **幽灵暂停**：应用重启后 pause 文件偶尔被"幽灵点击"置位（已在 `set_pause` 加日志埋点）
2. **多会话并发**：多 ZCode 会话同写 state.json（last-write-wins），Phase 2 引入会话聚合
3. **安装包未签名**：SmartScreen 会弹警告，需代码签名证书（正式分发后处理）
4. **Dev 守护进程脆弱**：tauri dev 会随应用崩溃退出，重建需 `taskkill` 清 node 链后再起

## 常用命令速查

```bash
# 开发
cd app && npx tauri dev                    # 热重载开发模式
NO_PROXY='*' npx tauri dev                 # 代理环境加这个

# 构建
npx tauri build                            # 构建 exe + 安装包
bash scripts/sync-release.sh               # 构建 + 同步到自启 + 重启

# 插件
cat ~/.z-buddy/state.json                  # 查看当前 Agent 状态
cat ~/.z-buddy/events.jsonl | tail -5      # 最近 5 条事件
rm ~/.z-buddy/pause                        # 手动解除暂停（如需）

# Git
git push                                    # 推送（需要 Clash/VPN 开着）
```

## 项目文档

| 文件 | 内容 |
|---|---|
| [`docs/dev-extensions.md`](docs/dev-extensions.md) | ZCode 三种扩展机制详解（插件/MCP/Skills + Hooks 详解与示例） |
| [`docs/ui-design.md`](docs/ui-design.md) | 主界面设计规范（窗口尺寸、色板、信息架构、分期） |
| [`docs/update-design.md`](docs/update-design.md) | 应用自动更新机制（GitHub Releases + ed25519 签名 + 标题栏按钮） |
| [`docs/decisions/tech-validation.md`](docs/decisions/tech-validation.md) | Phase 0 技术验证决策（hooks 事件表、暂停机制、框架选型） |
| [`docs/decisions/ui-refactor.md`](docs/decisions/ui-refactor.md) | 主界面实施记录（双窗架构拆分、踩坑档案） |

> `local/notes/` 是不入库的私有资料（阶段笔记、设计稿备份），仅项目成员内部分发。

## 参考资料

- [Tauri v2 官方文档](https://tauri.app/v2)
- [ZCode Docs: Plugin](https://zcode.z.ai/cn/docs/plugin) / [Skill](https://zcode.z.ai/cn/docs/skill) / [Hooks](https://zcode.z.ai/cn/docs/hooks)
- [Codex hatch-pet 格式](https://github.com/nexu-io/open-design/blob/main/skills/hatch-pet/SKILL.md)
- [Petdex 宠物市场](https://petdex.dev/) — 4000+ 社区宠物，格式可参考
- [clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) — 架构参考（通用 Agent 桌宠）
