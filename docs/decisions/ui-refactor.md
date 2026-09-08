# Phase 1 · 主界面实施总结（P1.5）

> 日期：2026-09-06 深夜
> 状态：🟢 **代码全部实施并部署运行**，主界面的交互验收移交用户（设计稿见 `ui/主界面设计方案.md`）
> 本阶段产物：双窗架构（pet + main）、Rust 模块化拆分、托盘五项菜单、宠物右键菜单、单实例、自启插件

---

## 0. 一分钟看完

按设计稿完成主界面 P1.5 全部代码：**托盘五项菜单**（打开主界面 / 显示隐藏 / 切换宠物 / 打开官方网站 / 退出）、**宠物右键同款菜单**、**主界面驾驶舱**（总览：大图同步 + 状态卡 + 暂停 + 事件时间线；宠物管理：内置/外部包网格卡点击切换；活动：事件流筛选时间线；任务页 P2 灰置；设置：开机自启/关闭行为/关于）、**单实例**（二次启动聚焦主界面）、**自启插件**（设置页开关可控）。

应用已带全部新代码运行中（宠物右下角在线）。主界面的**交互验收 = 你右键团子 → 打开主界面**（自动化测试因前台校验限制改由人工执行）。

## 1. 架构升级：单窗 → 双窗 + 模块化

### 前端（app/src/，零构建 vanilla 多页面）

```
src/
├── pet/                 # 宠物窗（原 index.html/main.js/styles.css 迁入）
│   ├── index.html  ├── main.js  └── styles.css
├── main/                # 主界面窗（新增，动态创建）
│   ├── index.html  ├── main.js（导航/标题栏）
│   ├── dashboard.js     # 总览：大图同帧同步/状态卡/暂停/时间线
│   ├── pets.js          # 宠物管理：网格卡/点击切换
│   ├── activity.js      # 活动：事件流筛选时间线
│   ├── settings.js      # 设置：自启/关闭行为/关于
│   └── main.css
├── shared/              # 两窗共享
│   ├── api.js           # invoke/convertFileSrc/listen 封装
│   └── pack.js          # 宠物包加载器 + SpriteAnimator（两窗共用）
└── pets/mochi/          # 内置宠物包
```

要点：宠物窗 URL `/pet/index.html` + `label: "pet"`；主窗 URL `/main/index.html` + `label: "main"` 由 Rust 动态创建。

### Rust（app/src-tauri/src/）——lib.rs 拆四模块

```
src-tauri/src/
├── lib.rs           # run() 组装 + open_main + first_run + 窗口事件
├── commands.rs      # 全部 15 个 #[tauri::command]
├── tray.rs          # 托盘五项菜单
├── clickthrough.rs  # 穿透守护线程
└── config.rs        # ~/.z-buddy 路径 + app.json 读写 + pet_list
```

新命令：`list_all_pets`（内置+外部）、`set_pet_pref_cmd`（写偏好+广播 pet-changed）、`read_events`（尾部 N 条+总数）、`hide_main`、`get/set_close_behavior`、`autostart_enabled/set`、`open_external`、`popup_pet_menu`（宠物右键）。

新依赖：`tauri-plugin-single-instance`（单实例）、`tauri-plugin-autostart`（自启，设置页开关）。

## 2. 交互设计落地情况

| 设计项 | 状态 |
|---|---|
| 托盘五项菜单（含新增两项） | ✅ |
| 宠物右键弹出同款菜单（含暂停/恢复动态文案） | ✅ 代码就绪 |
| 主窗动态创建 + 单实例聚焦 | ✅ |
| 关闭 ✕ 默认隐藏到托盘（设置可改"退出"） | ✅ |
| 首次运行：弹一次主界面 + 默认开启自启 | ✅（本机已置 mainSeen 跳过） |
| 总览大图与宠物同帧同步（同一 pack 加载器） | ✅ |
| 事件时间线 + 今日统计 | ✅ |
| 任务页 P2 灰置 | ✅ |

## 3. 踩坑记录（本轮新增）

1. **窗口标签冲突**：宠物窗未设 label 时默认就叫 "main"——主界面窗口必须用别的标签，pet 窗显式改 `label: "pet"`，能力清单 windows 同步加 "main"；
2. **tauri.conf 字段**：`focus`（不是 `focused`）、菜单项 `with_id(...).expect()` 不能用 `.ok()`（Menu::with_items 要 `&MenuItem` 不是 `Option`）、`menu.popup()` 需要 `ContextMenu` trait + 参数类型是 `Window` 不是 `WebviewWindow`——三个类型小坑一次讲清；
3. **dev 守护进程 cwd 漂移**：后台 shell 工作目录会漂，`npx tauri dev` 必须带显式 `cd`；
4. **自动化测试边界**：原始鼠标事件在 Windows 要求目标前台 + 光标瞬移会与穿透守护竞态——**真人拖拽/右键不受影响**，自动化验证改由用户手动执行（本阶段的验收方式）。

## 4. 已知问题 / 下一步

1. 主界面交互验收待用户完成（右键团子 → 打开主界面；切宠物看两窗同步）；
2. 真人鼠标竞态测试（Phase 0 遗留）；
3. 托盘"切换宠物"的 pet-changed 已广播，主界面 pets 页高亮同步已实现，待人工复验；
4. 发布版（release exe/安装包）需在下次代码变更后重新 `npx tauri build`；
5. 幽灵暂停（§0.5）已有日志埋点，复现即定位。

## 5. Phase 1 收尾清单

- [x] 主界面三页 + 托盘两项 + 右键菜单 + 单实例 + 自启（本轮）
- [ ] **用户验收：右键团子 → 打开主界面 → 五页走一遍 → 托盘切换宠物看双窗同步**
- [ ] **用户操作：ZCode 设置 → 插件市场 → 添加本地市场 `D:\MYCODE\Z-Buddy\marketplace` → 装 z-buddy → 新建会话**
- [ ] 真人鼠标竞态 5 分钟
- [ ] Phase 1 毕业照：ZCode 干活 + 团子实时反应
