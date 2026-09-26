---
layout: ../../layouts/DocsLayout.astro
title: 导入 Petdex 宠物
description: 把 Petdex（Codex 宠物生态）的 4600+ 现成宠物搬进 Z-Buddy：格式对照、转换模板与手动导入步骤。
---

# 导入 Petdex 宠物

> [Petdex](https://petdex.dev/) 是 Codex 生态的宠物分发平台（4600+ 只社区宠物）。它的图集格式与 Z-Buddy **思路一致但约定不同**——这篇手把手教你把一只 Petdex 宠物转换成 Z-Buddy 能认的宠物包。应用内一键导入在计划中，目前是手动转换。

## 先了解：两种格式的差异

| | Petdex / Codex | Z-Buddy |
|---|---|---|
| 图集 | `sprite.webp`，**固定 8 列 × 9 行，每帧 192×208**（行=状态的顺序写死在约定里） | `atlas.png`，行列任意，由 `pet.json` 声明 |
| 清单 | `petjson.json`，只有 `{id, displayName, description, spritesheetPath}`，**不含任何帧信息** | `pet.json`，显式声明帧尺寸与每个状态的行号/帧数/帧率 |
| 状态名 | idle / running-right / running-left / waving / jumping / failed / waiting / running / review | idle / working / thinking / permission / error / sleep（+ 可选扩展） |

因为 Petdex 的行序是固定约定，转换就是**按一张固定的对照表写出我们的 pet.json**。

## 状态行对照表（转换的核心）

下表来自 Petdex 桌面端渲染器的源码常量，可直接信任：

| Petdex 行 | 状态 | 帧数 | Z-Buddy 状态 | 建议 fps |
|---|---|---|---|---|
| 0 | idle | 6 | `idle`（`sleep` 也复用这行、放慢帧率） | 5 |
| 1 | running-right | 8 | `working` | 8 |
| 2 | running-left | 8 | 备选：`idle_alt` | 8 |
| 3 | waving | 4 | 备选：`idle_alt` | 7 |
| 4 | jumping | 5 | 备选：`thinking_alt` | 7 |
| 5 | failed | 8 | `error` | 7 |
| 6 | waiting | 6 | `permission` | 7 |
| 7 | running | 6 | 备选：`working` | 8 |
| 8 | review | 6 | `thinking` | 7 |

## 转换步骤

1. **拿到 Petdex 宠物文件**：`npx petdex install <宠物名>`，文件会落在 `~/.codex/pets/<宠物名>/`（Windows 为 `%USERPROFILE%\.codex\pets\`），里面是 `sprite.webp` 和 `petjson.json`；
2. **新建 Z-Buddy 宠物文件夹**，把 `sprite.webp` 复制进去并改名 `atlas.png`（WebView 通常按文件内容而非扩展名解码，一般直接改名即可；若遇到不显示，用任意图片工具把 webp 转存为 png）；
3. **在同目录创建 `pet.json`**，内容用下面的模板（把 `name`/`title` 换成这只宠物的名字）；
4. 主界面 → 宠物 → 「导入自定义宠物」选这个文件夹，完成。

## pet.json 模板（可直接复制）

```json
{
  "name": "petdex-xxx",
  "title": "Petdex 宠物",
  "frame": { "w": 192, "h": 208 },
  "states": {
    "idle":         { "row": 0, "frames": 6, "fps": 5 },
    "working":      { "row": 1, "frames": 8, "fps": 8 },
    "thinking":     { "row": 8, "frames": 6, "fps": 7 },
    "permission":   { "row": 6, "frames": 6, "fps": 7 },
    "error":        { "row": 5, "frames": 8, "fps": 7 },
    "sleep":        { "row": 0, "frames": 6, "fps": 3 },
    "idle_alt":     { "row": 3, "frames": 4, "fps": 7 },
    "thinking_alt": { "row": 4, "frames": 5, "fps": 7 }
  }
}
```

模板已经把 row 2（running-left）、row 7（running）空出来了——它们是 running-right 的同义/镜像动作，不需要重复映射；想要更活泼可以自行启用。

## 已知限制

- **v2 布局暂不支持**：Petdex 有两代图集布局，约 95% 的宠物是 v1（本指南覆盖的范围）。v2 宠物转换后帧位会错乱；
- **轻微压扁**：Petdex 帧是 192×208（纵向略长），Z-Buddy 画布是 192×192，当前版本会纵向压缩约 8%；等比绘制的适配在计划中；
- **待机时序归一**：Petdex 的 idle 行每帧时长不固定（110–320ms），Z-Buddy 按统一帧率播放，节奏会略有差异；
- **暂停/拖动形象缺失**：Petdex 没有对应行，相关交互自动回退到普通状态，不影响使用。

## 相关页面

- [宠物包规范 v1](/Z-Buddy/docs/pet-pack-spec/) —— Z-Buddy 自有格式的完整定义
- [友情链接](/Z-Buddy/links/) —— Petdex 与其他生态站点
