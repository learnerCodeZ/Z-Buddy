#!/usr/bin/env python
"""生成 Tauri updater 所需的 latest.json（发版时调用）。

用法：python scripts/gen-latest-json.py <版本号> <签名文件路径>
输出：app/src-tauri/target/release/bundle/nsis/latest.json（与安装包同目录）

示例：
  python scripts/gen-latest_json.py 0.2.0 ~/.z-buddy/updater.key
"""
import sys
import os
import json
import base64
from pathlib import Path

def main():
    if len(sys.argv) < 3:
        print("用法: python scripts/gen-latest_json.py <版本号> <私钥路径>")
        sys.exit(1)

    version = sys.argv[1]
    key_path = os.path.expanduser(sys.argv[2])

    # 读取私钥用于签名（Tauri 的签名格式是 base64 的 raw ed25519 私钥）
    priv_key_b64 = Path(key_path).read_text().strip()

    # 构建 latest.json（平台为 windows）
    release_base = f"https://github.com/learnerCodeZ/Z-Buddy/releases/download/v{version}"
    latest = {
        "version": version,
        "notes": f"Z-Buddy v{version} 更新",
        "pub_date": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            "windows-x86_64": {
                "signature": "",  # 签名在 sync-release.sh 中自动填充
                "url": f"{release_base}/z-buddy_{version}_x64-setup.exe",
            }
        }
    }

    out_dir = Path("app/src-tauri/target/release/bundle/nsis")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "latest.json"
    out_path.write_text(json.dumps(latest, indent=2, ensure_ascii=False))
    print(f"✓ 已生成 {out_path}")
    print(f"  版本: {version}")
    print(f"  下载: {latest['platforms']['windows-x86_64']['url']}")

if __name__ == "__main__":
    main()
