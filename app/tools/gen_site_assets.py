#!/usr/bin/env python3
"""生成官网静态素材（对齐《Z-Buddy官网计划书》v2 §4.5）。

输入：宠物包（atlas.png + pet.json，行=状态、横向分帧）
输出（website/public/）：
  pets/<name>-loop.webp    四态循环动图（idle→working→error→sleep，4x 放大）
  pets/<name>-idle.webp    纯 idle 循环（导航 Logo 等小尺寸场景）
  og.png                   1200x630 社交分享图（深色玻璃拟态底 + 宠物 + 标语）
  favicon.ico              16/32/48
  apple-touch-icon.png     180x180

只依赖 PIL；可重复运行（幂等覆盖）。
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
PACK_IN_REPO = REPO / "app" / "src" / "pets"           # 内置宠物
PACK_IN_HOME = Path.home() / ".z-buddy" / "pets"       # 外部宠物包
OUT = REPO / "website" / "public"
SCALE = 4  # 64px 帧 -> 256px 展示

CYCLE = ["idle", "working", "error", "sleep"]


def load_pack(dir_path: Path) -> tuple[Image.Image, dict] | None:
    atlas, meta = dir_path / "atlas.png", dir_path / "pet.json"
    if not (atlas.exists() and meta.exists()):
        return None
    return Image.open(atlas).convert("RGBA"), json.loads(meta.read_text(encoding="utf-8"))


def frame(atlas: Image.Image, fw: int, fh: int, row: int, col: int) -> Image.Image:
    return atlas.crop((col * fw, row * fh, (col + 1) * fw, (row + 1) * fh))


def build_loop(atlas, meta, states, out_path: Path, scale=SCALE) -> None:
    fw, fh = meta["frame"]["w"], meta["frame"]["h"]
    frames, durations = [], []
    for state in states:
        spec = meta["states"][state]
        for i in range(spec["frames"]):
            im = frame(atlas, fw, fh, spec["row"], i).resize(
                (fw * scale, fh * scale), Image.NEAREST
            )
            frames.append(im)
            durations.append(round(1000 / spec["fps"]))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        out_path, save_all=True, append_images=frames[1:],
        duration=durations, loop=0, disposal=2,
    )
    print(f"  {out_path.name}: {len(frames)} 帧, {sum(durations)}ms/圈")


def build_og(pet_img: Image.Image, out_path: Path) -> None:
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (11, 26, 38))  # sky-950 系深底
    d = ImageDraw.Draw(img, "RGBA")  # 显式 RGBA 模式，透明色才会做 alpha 混合
    # 玻璃拟态面板感：右上淡蓝光晕 + 细描边圆角矩形
    for i, r in enumerate(range(560, 140, -80)):
        alpha = 4 + i * 2
        d.ellipse((W - 520 - r // 2, -200 - r // 2, W - 520 + r // 2, -200 + r // 2),
                  fill=(0, 113, 227, alpha))
    d.rounded_rectangle((40, 40, W - 40, H - 40), radius=32, outline=(255, 255, 255, 26), width=2)

    def font(name_candidates, size):
        for name in name_candidates:
            path = Path("C:/Windows/Fonts") / name
            if path.exists():
                return ImageFont.truetype(str(path), size)
        return ImageFont.load_default()

    zh_bold = font(["msyhbd.ttc", "msyh.ttc"], 40)
    zh_small = font(["msyh.ttc"], 26)
    latin_big = font(["arialbd.ttf"], 120)

    d.text((90, 150), "Z-Buddy", font=latin_big, fill=(255, 255, 255))
    d.rounded_rectangle((90, 310, 330, 360), radius=12, fill=(0, 113, 227))
    d.text((110, 320), "ZCode 桌宠", font=zh_small, fill=(255, 255, 255))
    d.text((90, 420), "代码在跑，Z-Buddy 在陪。", font=zh_bold, fill=(230, 236, 240))
    d.text((90, 490), "看得见的状态 · 点一下就暂停 · 宠物包即装即换", font=zh_small, fill=(140, 160, 175))

    # 宠物放右侧，4x 像素风放大
    big = pet_img.resize((256, 256), Image.NEAREST)
    img.paste(big, (820, 220), big)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    print(f"  {out_path.name}")


def build_favicon(atlas, meta, out_path: Path, touch_path: Path) -> None:
    fw, fh = meta["frame"]["w"], meta["frame"]["h"]
    face = frame(atlas, fw, fh, meta["states"]["idle"]["row"], 0)
    face.resize((48, 48), Image.NEAREST).save(
        out_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    face.resize((180, 180), Image.NEAREST).save(touch_path)
    print(f"  {out_path.name} + {touch_path.name}")


def main() -> int:
    print(f"输出目录: {OUT}")
    packs = {
        "mochi": load_pack(PACK_IN_REPO / "mochi"),
        "matcha": load_pack(PACK_IN_HOME / "matcha"),
    }
    packs = {k: v for k, v in packs.items() if v}
    if not packs:
        print("未找到任何宠物包", file=sys.stderr)
        return 1

    for name, (atlas, meta) in packs.items():
        print(f"[{name}] {meta.get('title', name)}")
        build_loop(atlas, meta, CYCLE, OUT / "pets" / f"{name}-loop.webp")
        build_loop(atlas, meta, ["idle"], OUT / "pets" / f"{name}-idle.webp", scale=2)

    mochi_atlas, mochi_meta = packs["mochi"]
    mochi_face = frame(mochi_atlas, mochi_meta["frame"]["w"], mochi_meta["frame"]["h"],
                       mochi_meta["states"]["idle"]["row"], 0)
    build_og(mochi_face, OUT / "og.png")
    build_favicon(mochi_atlas, mochi_meta, OUT / "favicon.ico", OUT / "apple-touch-icon.png")
    print("完成")
    return 0


if __name__ == "__main__":
    sys.exit(main())
