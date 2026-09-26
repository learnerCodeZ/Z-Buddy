---
layout: ../../layouts/DocsLayout.astro
title: 宠物包规范 v1
description: 自己做一只 Z-Buddy 宠物：atlas.png + pet.json 的完整格式说明、状态行约定、导入与分享方法。
---

# 宠物包规范 v1

> 一个宠物包 = 一个文件夹。不需要写任何代码——画好精灵图、填对 JSON，就能上架到你的桌宠里。

## 总览

```
my-pet/
├── atlas.png   # 精灵图：一行 = 一个状态，一列 = 一帧
└── pet.json    # 清单：帧尺寸 + 状态到图集行的映射
```

## pet.json 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 宠物唯一 ID，仅限字母/数字/`-`/`_`（应用内导入接口按此校验，且不可与内置宠物重名） |
| `title` | 推荐 | 显示名（如「夜羽」），缺省用 `name` |
| `version` / `author` / `license` | 可选 | 元信息，随包展示 |
| `frame` | ✅ | `{ "w": 192, "h": 192 }` 单帧像素尺寸，**帧尺寸任意**（像素宠物常用 64，插画常用 192） |
| `states` | ✅ | 状态名 → `{ "row": 行号, "frames": 帧数, "fps": 帧率 }`，行号从 0 计 |

## 状态行约定

**行 = 状态，列 = 帧**；图集不需要铺满，播放器只按 `states` 声明裁剪对应行列，从不校验整图。

| 状态 | 必需 | 触发时机 |
|---|---|---|
| `idle` | ✅ | 会话启动 / 一轮任务结束 |
| `thinking` | 推荐 | 用户发出请求后 |
| `working` | 推荐 | 工具调用中 |
| `permission` | 推荐 | 等你审批时（建议做"举牌"类显眼动作） |
| `error` | 推荐 | 工具失败 |
| `sleep` | 可选 | 待机超过 5 分钟（缺省回退 `idle`） |
| `paused` | 可选 | 用户点了桌宠的暂停（缺省回退 `idle`） |
| `drag_left` / `drag_right` | 可选 | 长按拖动时的"被拎起来"形象（各 1 帧，静态；两者互为镜像关系，画一个方向即可） |
| `idle_alt` / `thinking_alt` | 可选 | 待机/思考的**第二张形象**，运行期每 30 秒与主形象轮换（缺省不轮换） |

降级规则：宠物包缺哪个状态，应用就自动回退（不会报错）——最小可用包只需要 6 个基础状态行。

## 最小示例

```json
{
  "name": "my-pet",
  "title": "我的宠物",
  "version": "1.0.0",
  "frame": { "w": 64, "h": 64 },
  "states": {
    "idle":      { "row": 0, "frames": 4, "fps": 4 },
    "working":   { "row": 1, "frames": 3, "fps": 8 },
    "thinking":  { "row": 2, "frames": 4, "fps": 5 },
    "permission":{ "row": 3, "frames": 2, "fps": 2 },
    "error":     { "row": 4, "frames": 2, "fps": 2 },
    "sleep":     { "row": 5, "frames": 4, "fps": 3 }
  }
}
```

对应的 `atlas.png` 就是 6 行 × 4 列（短行留空即可）、每帧 64×64 的透明 PNG。

最完整的参考是内置的**夜羽**：11 行图集（1152×2112，192×192 帧），把上表所有可选状态都用上了——见仓库 `app/src/pets/yoru/pet.json`。

## 绘制约定

- **透明背景** PNG；帧内容贴底对齐（宠物窗里宠物贴着画布底边）；
- 想在头顶画气泡（Zzz / ? / ⏸）就把该状态行的角色画矮一点、气泡画在帧内上方——夜羽带气泡的行统一角色高 140px、帧高 192px；
- 应用渲染时关闭平滑（`imageSmoothingEnabled = false`），像素风请按整数倍设计、避免非整数缩放。

## 导入与分享

- **应用内导入**：主界面 → 宠物 → 「导入自定义宠物」→ 选择文件夹（自动校验格式与重名）→ 点击卡片即可切换使用；
- **手动安装**：把文件夹放进 `~/.z-buddy/pets/<宠物名>/`，重开主界面生效；
- **分享**：把整个文件夹打包发给朋友即可；格式与 Codex `hatch-pet` / Petdex 生态兼容，理论上那边的宠物包可以直接导入——具体转换步骤见[导入 Petdex 宠物](/Z-Buddy/docs/petdex-import/)。

## 官方工具

| 工具 | 用途 |
|---|---|
| `app/tools/gen_mochi.py` | 程序化生成四色像素宠物（给个色板就出包） |
| `app/tools/gen_pet_gifs.py` | 从任意宠物包导出各状态循环 GIF（发帖分享用） |
| `app/tools/gen_illustration_pet.mjs` | 一张完整立绘 → 自动抠底 + 六态动画的插画宠物 |

做了好看的宠物包欢迎来 [GitHub](https://github.com/learnerCodeZ/Z-Buddy) 提 Issue 分享，官方画廊会定期收录。
