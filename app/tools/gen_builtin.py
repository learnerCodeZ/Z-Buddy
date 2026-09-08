#!/usr/bin/env python
"""生成 Z-Buddy 内置宠物：BSOD（蓝屏小恶魔）+ Fireball（火球）。
64×64 帧，4列×4行，RGBA PNG。

用法：python gen_bsod.py <输出目录>
"""
import sys
from PIL import Image, ImageDraw

CELL, SCALE, COLS, ROWS = 32, 2, 4, 4

# ======================== 调色板 ========================
# BSOD
BSOD_BLUE  = (59, 130, 246, 255)    # 亮蓝（屏幕主体）
BSOD_DARK  = (30, 58, 138, 255)     # 深蓝（描边/天线）
BSOD_WHITE = (220, 230, 245, 255)   # 淡蓝白（身体/高光）
BSOD_EYE   = (255, 255, 255, 255)   # 纯白（眼睛）
BSOD_PUPIL = (30, 30, 30, 255)      # 黑（瞳孔）
BSOD_MOUTH = (255, 100, 100, 255)   # 红（嘴）

# Fireball
FB_FLAME1  = (255, 150, 30, 255)    # 亮橙
FB_FLAME2  = (255, 90, 10, 255)     # 深橙
FB_FLAME3  = (255, 200, 50, 255)    # 高光黄
FB_BODY    = (50, 45, 40, 255)      # 深棕（身体）
FB_EYE     = (255, 255, 255, 255)   # 白
FB_PUPIL   = (30, 30, 30, 255)      # 黑
FB_MOUTH   = (255, 255, 255, 255)   # 白嘴
FB_OUTLINE = (40, 35, 30, 255)      # 描边


def px(d, x, y, c):
    if 0 <= x < CELL and 0 <= y < CELL:
        d.point((x, y), fill=c)


# ======================== BSOD 绘制 ========================

def bsod_draw_frame(d, col):
    """蓝屏小恶魔：方形屏幕脸 + 白色小身体 + 天线 + 小手脚"""
    # --- 天线（头顶小圆球 + 竖线）---
    ax = 15 + (0, 0, 1, 0)[col]
    px(d, ax, 3, BSOD_DARK)
    px(d, ax, 4, BSOD_DARK)
    px(d, ax - 1, 2, BSOD_BLUE)
    px(d, ax, 2, BSOD_BLUE)
    px(d, ax + 1, 2, BSOD_BLUE)

    # --- 方形屏幕脸 ---
    sq = (0, 1, 0, 1)[col]  # 微弹
    top = 6 + sq
    # 外框
    for x in range(8, 24):
        px(d, x, top, BSOD_DARK)
        px(d, x, top + 14, BSOD_DARK)
    for y in range(top, top + 15):
        px(d, 8, y, BSOD_DARK)
        px(d, 23, y, BSOD_DARK)
    # 屏幕填充
    for y in range(top + 1, top + 14):
        for x in range(9, 23):
            px(d, x, y, BSOD_BLUE)
    # 眼睛（白色方块 + 黑瞳孔，跟随帧微动）
    ey_off = (0, 0, 1, -1)[col]
    for dx in (0, 7):
        # 白底
        for dx2 in range(3):
            px(d, 11 + dx + dx2, top + 5, BSOD_EYE)
            px(d, 11 + dx + dx2, top + 6, BSOD_EYE)
            px(d, 11 + dx + dx2, top + 7, BSOD_EYE)
        # 瞳孔
        px(d, 12 + dx + ey_off, top + 6, BSOD_PUPIL)
    # 嘴（红条）
    for x in range(13, 19):
        px(d, x, top + 10, BSOD_MOUTH)
    # 闪烁效果（error 行第 2、4 帧闪白条）
    if col in (1, 3) and False:  # 预留
        for x in range(10, 22):
            px(d, x, top + 12, BSOD_EYE)

    # --- 小身体（白色圆角矩形）---
    bot = top + 15
    for x in range(11, 21):
        px(d, x, bot, BSOD_WHITE)
        px(d, x, bot + 4, BSOD_WHITE)
    for y in range(bot, bot + 5):
        px(d, 11, y, BSOD_WHITE)
        px(d, 20, y, BSOD_WHITE)

    # --- 小手（左右各伸 1 像素，交替摆）---
    hand_y = bot + 2 + (0, 0, -1, 1)[col]
    px(d, 10, hand_y, BSOD_WHITE)
    px(d, 21, hand_y, BSOD_WHITE)

    # --- 小脚 ---
    feet_off = (0, 0, 0, 1)[col]
    px(d, 12, bot + 5, BSOD_DARK)
    px(d, 19, bot + 5, BSOD_DARK)
    px(d, 13, bot + 6, BSOD_DARK)
    px(d, 18, bot + 6, BSOD_DARK)
    if col % 2 == 1:
        px(d, 13, bot + 5, BSOD_DARK)
        px(d, 18, bot + 5, BSOD_DARK)


# ======================== Fireball 绘制 ========================

def fb_draw_frame(d, col):
    """火球：火焰头 + 深色小身体 + 小手脚"""
    # 火焰头（尖角三角形轮廓 + 橙填充，第 col 帧微晃）
    wobble = (0, 1, 0, -1)[col]
    # 最顶端火焰尖
    px(d, 15 + wobble, 3, FB_FLAME2)
    px(d, 16 + wobble, 3, FB_FLAME1)
    # 第二层
    for x in range(13 + wobble, 19 + wobble):
        px(d, x, 4, FB_FLAME2)
    # 高光条（中间亮）
    for x in range(14 + wobble, 18 + wobble):
        px(d, x, 5, FB_FLAME1)
    for x in range(15 + wobble, 17 + wobble):
        px(d, x, 5, FB_FLAME3)
    # 主体圆脸填充
    for y in range(6, 17):
        for x in range(11, 21):
            px(d, x, y, FB_FLAME1)
    # 描边
    for x in range(10, 22):
        px(d, x, 5, FB_OUTLINE)
        px(d, x, 17, FB_OUTLINE)
    for y in range(5, 18):
        px(d, 10, y, FB_OUTLINE)
        px(d, 21, y, FB_OUTLINE)
    # 深色脸区（圆脸中下部）
    for y in range(11, 17):
        for x in range(12, 20):
            px(d, x, y, FB_BODY)
    # 眼睛（白 + 黑瞳孔）
    ey_off = (0, 0, 1, -1)[col]
    for dx in (0, 6):
        for dx2 in range(2):
            px(d, 13 + dx + dx2, 13, FB_EYE)
            px(d, 13 + dx + dx2, 14, FB_EYE)
        px(d, 14 + dx + ey_off, 14, FB_PUPIL)
    # 嘴
    px(d, 15, 15, FB_MOUTH)
    px(d, 16, 15, FB_MOUTH)

    # --- 小身体（深色）---
    bot = 18
    for x in range(12, 20):
        px(d, x, bot, FB_BODY)
        px(d, x, bot + 4, FB_BODY)
    for y in range(bot, bot + 5):
        px(d, 12, y, FB_BODY)
        px(d, 19, y, FB_BODY)

    # --- 小手（交替摆）---
    hand_y = bot + 2 + (0, 0, -1, 1)[col]
    px(d, 11, hand_y, FB_FLAME2)
    px(d, 20, hand_y, FB_FLAME2)

    # --- 小脚 ---
    px(d, 13, bot + 5, FB_OUTLINE)
    px(d, 18, bot + 5, FB_OUTLINE)
    if col % 2 == 1:
        px(d, 14, bot + 5, FB_OUTLINE)
        px(d, 17, bot + 5, FB_OUTLINE)


# ======================== 行：idle/working/error/sleep ========================

def draw_row(d, row, col, pet_type):
    if pet_type == "bsod":
        if row == 0:     # idle：呼吸弹
            bsod_draw_frame(d, col)
        elif row == 1:   # working：小手快摆
            bsod_draw_frame(d, col)
        elif row == 2:   # error：屏幕闪
            bsod_draw_frame(d, col)
        else:            # sleep：下移 + 暗淡由外层处理
            bsod_draw_frame(d, col)
    else:
        if row == 0:
            fb_draw_frame(d, col)
        elif row == 1:
            fb_draw_frame(d, col)
        elif row == 2:
            fb_draw_frame(d, col)
        else:
            fb_draw_frame(d, col)


def gen_atlas(pet_type, outdir):
    atlas = Image.new("RGBA", (CELL * COLS * SCALE, CELL * ROWS * SCALE), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            d = ImageDraw.Draw(frame)
            draw_row(d, row, col, pet_type)
            big = frame.resize((CELL * SCALE, CELL * SCALE), Image.NEAREST)
            atlas.paste(big, (col * CELL * SCALE, row * CELL * SCALE))
    import os
    os.makedirs(outdir, exist_ok=True)
    atlas.save(f"{outdir}/atlas.png")
    print(f"✓ {outdir}/atlas.png ({atlas.width}x{atlas.height})")


# ======================== manifest ========================

def write_pet_json(outdir, name, title):
    import os, json
    os.makedirs(outdir, exist_ok=True)
    manifest = {
        "name": name,
        "title": title,
        "version": "1.0.0",
        "author": "Z-Buddy",
        "license": "original-artwork",
        "frame": {"w": 64, "h": 64},
        "states": {
            "idle":       {"row": 0, "frames": 4, "fps": 3},
            "thinking":   {"row": 0, "frames": 4, "fps": 6},
            "working":    {"row": 1, "frames": 4, "fps": 8},
            "permission": {"row": 1, "frames": 4, "fps": 8},
            "error":      {"row": 2, "frames": 4, "fps": 6},
            "sleep":      {"row": 3, "frames": 4, "fps": 2}
        }
    }
    with open(f"{outdir}/pet.json", "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"✓ {outdir}/pet.json")


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "."
    for pet_type, name, title in [
        ("bsod",    "bsod",     "蓝屏小恶魔"),
        ("fireball","fireball", "火球"),
    ]:
        outdir = f"{base}/{name}"
        gen_atlas(pet_type, outdir)
        write_pet_json(outdir, name, title)
