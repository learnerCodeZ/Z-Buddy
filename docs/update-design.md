# 应用自动更新机制设计

> 日期：2026-09-07
> 状态：已实施，待首次发版验证
> 关联：主界面标题栏"更新"按钮、`tauri-plugin-updater`、GitHub Releases

---

## 产品体验（用户视角）

主界面（Z-Buddy 控制台）标题栏右侧，平时**没有更新按钮**。应用启动时后台静默检查 GitHub Releases 是否有新版本——如果发现新版本，标题栏右侧出现**绿色"🔄 更新"按钮**（带呼吸动画）。用户**不点就不会打扰**。点击后：按钮变为"⬇️ 下载中…" → 下载完成 → 自动替换并重启。全程无需用户手动下载安装包。

## 技术方案（开发者视角）

**不需要自建服务器。** 用 GitHub Releases 的公开 API 当"更新服务器"——免费、全球 CDN、零运维。

### 工作流程

```
① 应用启动 → 后台 GET github.com/.../releases/latest/download/latest.json
   （latest.json 是随 Release 上传的元数据文件，含版本号 + 下载地址）

② 对比本地 Cargo.toml 里的 version：
   - 相同/更旧 → 静默，不显示按钮
   - 更新 → 标题栏出现"🔄 更新"按钮

③ 用户点击 → 从 GitHub Releases 下载签名的新 exe → 校验签名 → 替换旧文件 → 重启

④ 重启后按钮消失（已是最新版）
```

### 签名机制

更新安全靠 **ed25519 签名**（不是代码签名证书，两者是独立的两件事）：

| 项 | 作用 | 本项目现状 |
|---|---|---|
| ed25519 签名密钥对 | 防止下载被篡改 | ✅ 已生成，私钥在 `~/.z-buddy/updater.key`，公钥写入 `tauri.conf.json` |
| 代码签名证书 | 消除 SmartScreen 蓝色警告 | ❌ 未购买（正式分发后处理） |

### 发版流程（每次发布新版本）

```bash
# 1. 改版本号
#    app/src-tauri/Cargo.toml → version = "0.2.0"
#    app/src-tauri/tauri.conf.json → "version": "0.2.0"

# 2. 构建 + 同步（含签名）
bash scripts/sync-release.sh

# 3. 生成 latest.json
python scripts/gen-latest-json.py 0.2.0 ~/.z-buddy/updater.key

# 4. 用私钥签名 exe
#    （Tauri 构建时自动签名，签名文件在 bundle/nsis/*.sig）

# 5. 打 tag + 推 GitHub Release（上传 exe + latest.json）
git tag v0.2.0
git push origin v0.2.0
gh release create v0.2.0 \
  app/src-tauri/target/release/bundle/nsis/Z-Buddy_*_x64-setup.exe \
  app/src-tauri/target/release/bundle/nsis/latest.json \
  --title "Z-Buddy v0.2.0" --notes "更新说明"

# 6. 用户下次启动应用 → 标题栏出现"🔄 更新"
```

### 关键配置

- `tauri.conf.json` → `plugins.updater.endpoints`：指向 GitHub Releases 的 `latest.json`
- `tauri.conf.json` → `plugins.updater.pubkey`：ed25519 公钥（用于校验下载内容）
- `~/.z-buddy/updater.key`：私钥（**绝不入库，绝不上传**）

## 待办（首次发版前）

- [ ] 首次构建并打 tag `v0.1.0`（将当前版本发布为正式 Release）
- [ ] 上传 `latest.json` + 安装包到 GitHub Release
- [ ] 验证：修改版本号重建 → 老版本标题栏出现更新按钮
- [ ] （可选）购买代码签名证书，消除 SmartScreen 警告
