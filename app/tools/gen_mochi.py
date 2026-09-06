#!/usr/bin/env python
"""生成 Z-Buddy 首只原创宠物「团子 Mochi」的精灵图集。

图集规格（兼容 Codex hatch-pet 思路：每一"行"是一个语义状态，横向分帧）：
  64x64 帧，4 列 x 4 行，RGBA PNG
  行 0 idle     呼吸/眨眼
  行 1 working  干活弹跳（小爪子敲键盘）
  行 2 error    沮丧抖动（X 眼 + 汗滴）
  行 3 sleep    睡觉（闭眼 + Zzz）

用法：python gen_mochi.py <输出目录>
"""

import sys
from PIL import Image, ImageDraw

CELL = 32          # 逻辑画布 32x32，2x 放大到 64x64 成品帧
SCALE = 2
COLS, ROWS = 4, 4

BODY = (255, 159, 67, 255)        # 主色橙
BODY_HI = (255, 201, 120, 255)    # 高光
BELLY = (255, 217, 168, 255)      # 肚皮
OUTLINE = (150, 82, 22, 255)      # 描边
EYE = (47, 53, 66, 255)           # 眼睛
SWEAT = (116, 185, 255, 255)      # 汗滴
ZZZ = (223, 230, 233, 255)        # Zzz


def px(d, x, y, color):
    d.point((x, y), fill=color)


def draw_blob(d, ox=0, oy=0, squash=0, body=BODY):
    """基础团子：椭圆身体 + 描边 + 高光 + 肚皮。squash 压扁程度。"""
    top, bot = 12 + oy + squash, 27 + oy
    # 轮廓（外一圈描边）
    d.ellipse((3 + ox, top - 1, 28 + ox, bot + 1), fill=OUTLINE)
    # 身体
    d.ellipse((4 + ox, top, 27 + ox, bot), fill=body)
    # 肚皮（下半浅色）
    d.ellipse((9 + ox, bot - 8, 23 + ox, bot - 2), fill=BELLY)
    # 高光（左上）
    px(d, 9 + ox, top + 3, BODY_HI)
    px(d, 10 + ox, top + 2, BODY_HI)
    px(d, 8 + ox, top + 4, BODY_HI)


def eyes_open(d, ox=0, oy=0):
    d.rectangle((11 + ox, 17 + oy, 12 + ox, 19 + oy), fill=EYE)
    d.rectangle((19 + ox, 17 + oy, 20 + ox, 19 + oy), fill=EYE)


def eyes_blink(d, ox=0, oy=0):
    d.rectangle((11 + ox, 18 + oy, 12 + ox, 18 + oy), fill=EYE)
    d.rectangle((19 + ox, 18 + oy, 20 + ox, 18 + oy), fill=EYE)


def eyes_x(d, ox=0, oy=0):
    for (x0, y0) in ((11, 17), (19, 17)):
        px(d, x0 + ox, y0 + oy, EYE)
        px(d, x0 + 1 + ox, y0 + 1 + oy, EYE)
        px(d, x0 + 2 + ox, y0 + oy, EYE)
        px(d, x0 + ox, y0 + 2 + oy, EYE)
        px(d, x0 + 1 + ox, y0 + 1 + oy, EYE)


def mouth_smile(d, ox=0, oy=0):
    px(d, 15 + ox, 22 + oy, EYE)
    px(d, 16 + ox, 23 + oy, EYE)
    px(d, 17 + ox, 22 + oy, EYE)


def mouth_flat(d, ox=0, oy=0):
    d.rectangle((14 + ox, 22 + oy, 18 + ox, 22 + oy), fill=EYE)


def draw_frame(d, row, col):
    if row == 0:  # idle：呼吸 + 眨眼（第 3 帧眨眼）
        oy = (0, 1, 0, 1)[col]
        draw_blob(d, oy=oy, squash=(0, 1, 0, 1)[col])
        if col == 2:
            eyes_blink(d, oy=oy)
        else:
            eyes_open(d, oy=oy)
        mouth_smile(d, oy=oy)

    elif row == 1:  # working：前倾敲键盘，小爪子交替
        ox = (0, 1, 0, -1)[col]
        oy = (0, 1, 0, 1)[col]
        draw_blob(d, ox=ox, oy=oy)
        eyes_open(d, ox=ox, oy=oy)
        mouth_flat(d, ox=ox, oy=oy)
        # 小爪子（交替抬起）
        lift = col % 2 == 0
        d.rectangle((12 + ox, 25 + oy - (1 if lift else 0), 15 + ox, 26 + oy), fill=OUTLINE)
        d.rectangle((18 + ox, 25 + oy - (0 if lift else 1), 21 + ox, 26 + oy), fill=OUTLINE)

    elif row == 2:  # error：X 眼 + 汗滴 + 抖动
        ox = (-1, 1, -1, 0)[col]
        draw_blob(d, ox=ox)
        eyes_x(d, ox=ox)
        mouth_flat(d, ox=ox, oy=1)
        # 汗滴（右侧飞出，第 1、3 帧可见）
        if col in (1, 3):
            px(d, 26, 12, SWEAT)
            px(d, 27, 13, SWEAT)
            px(d, 26, 14, SWEAT)

    elif row == 3:  # sleep：闭眼 + 压扁 + Zzz
        oy = (0, 0, 1, 1)[col]
        draw_blob(d, oy=oy, squash=1)
        eyes_blink(d, oy=oy + 1)
        mouth_flat(d, oy=oy + 2)
        # Zzz 气泡（随帧上飘）
        zy = 10 - col * 2
        zx = 24 + (col % 2)
        d.rectangle((zx, zy, zx + 2, zy + 2), fill=ZZZ)
        if col >= 2:
            d.rectangle((zx + 3, zy - 3, zx + 4, zy - 2), fill=ZZZ)


def main(outdir):
    atlas = Image.new("RGBA", (CELL * COLS * SCALE, CELL * ROWS * SCALE), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            d = ImageDraw.Draw(frame)
            draw_frame(d, row, col)
            big = frame.resize((CELL * SCALE, CELL * SCALE), Image.NEAREST)
            atlas.paste(big, (col * CELL * SCALE, row * CELL * SCALE))
    atlas.save(f"{outdir}/atlas.png")
    print(f"已生成 {outdir}/atlas.png ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
