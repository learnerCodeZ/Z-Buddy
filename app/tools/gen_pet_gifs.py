#!/usr/bin/env python
"""从宠物包（atlas.png + pet.json）合成各状态的循环 GIF——推广物料，不依赖录屏。

用法:
  python app/tools/gen_pet_gifs.py app/src/pets/yoru docs/assets
  python app/tools/gen_pet_gifs.py app/src/pets/yoru docs/assets --scale 2 --states working,error

规则:
  - 帧尺寸/行号/帧率全部来自 pet.json（与运行时播放器同一数据源，图集改了重跑即可）
  - 最近邻放大保像素清晰；单帧静态行（drag_left/drag_right）自动跳过
  - *_alt 与主状态互为备选形象，GIF 只出主状态
"""

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

SKIP_STATES = {"drag_left", "drag_right"}  # 静态单帧，不值得动图


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pack_dir", help="宠物包目录（含 atlas.png + pet.json）")
    ap.add_argument("out_dir", help="GIF 输出目录")
    ap.add_argument("--scale", type=int, default=3, help="整数倍放大（默认 3）")
    ap.add_argument("--states", default="", help="逗号分隔，默认全部非跳过状态")
    args = ap.parse_args()

    pack = Path(args.pack_dir)
    out = Path(args.out_dir)
    manifest = json.loads((pack / "pet.json").read_text(encoding="utf-8"))
    atlas = Image.open(pack / "atlas.png").convert("RGBA")
    fw, fh = manifest["frame"]["w"], manifest["frame"]["h"]
    pet_name = manifest.get("name", pack.name)
    out.mkdir(parents=True, exist_ok=True)

    states = (
        [s for s in manifest["states"] if s not in SKIP_STATES and not s.endswith("_alt")]
        if not args.states
        else [s.strip() for s in args.states.split(",")]
    )

    for name in states:
        st = manifest["states"].get(name)
        if not st:
            print(f"✗ 未知状态 {name}，可选: {', '.join(manifest['states'])}")
            return 1
        frames = []
        for col in range(st["frames"]):
            cell = atlas.crop((col * fw, st["row"] * fh, (col + 1) * fw, (st["row"] + 1) * fh))
            big = cell.resize((fw * args.scale, fh * args.scale), Image.NEAREST)
            # 深色背景预览效果更接近真实使用（官网/README 深色主题）；透明格填底色
            bg = Image.new("RGBA", big.size, (30, 34, 41, 255))
            bg.alpha_composite(big)
            frames.append(bg.convert("P", palette=Image.ADAPTIVE, colors=64))
        duration = round(1000 / st.get("fps", 4))
        path = out / f"{pet_name}-{name}.gif"
        frames[0].save(
            path,
            save_all=True,
            append_images=frames[1:],
            duration=duration,
            loop=0,
            disposal=2,
            optimize=False,
        )
        print(f"✓ {path.name}  {st['frames']} 帧 × {duration}ms  {frames[0].size[0]}x{frames[0].size[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
