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
│   │   └── pets/               #    内置宠物包（mochi/bsod/fireball）
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
├── atlas.png   # 精灵图：4列×4行，每行一个状态（idle/working/error/sleep），每行4帧
└── pet.json    # 配置：frame 尺寸 + 状态→行/fps 映射
```

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

```bash
# 用生成器一行命令（四色可配：身体/肚皮/描边/高光）
python app/tools/gen_mochi.py src/pets/<新名> <身体hex> <肚皮hex> <描边hex> <高光hex>

# 或手工：64x64 帧，4列×4行，atlas.png + pet.json
# 参考 src/pets/mochi/pet.json 的格式
```

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
