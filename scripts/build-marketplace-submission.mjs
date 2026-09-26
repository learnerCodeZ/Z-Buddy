#!/usr/bin/env node
/**
 * 组装 z-code-plugins 官方收录 PR 的暂存目录（phase-5）。
 *
 * 用法：node scripts/build-marketplace-submission.mjs
 * 产物：dist/zcode-plugins-submission/
 *   plugins/z-buddy/…          # 整目录拷进官方仓（贡献指南要求整份拷贝）
 *   marketplace-entry.json     # 追加到官方仓根 marketplace.json 的 plugins[] 条目
 *
 * 提交流程见 local/notes/phase/phase-5-官方市场收录.md：
 *   fork zai-org/zcode-plugins → 拷贝本产物 → 根 marketplace.json 追加条目
 *   → python3 scripts/validate.py && python3 scripts/build_dist.py && git diff --check
 *   → PR：feat(z-buddy): add Z-Buddy desktop pet bridge plugin
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "marketplace", "z-buddy");
const out = path.join(root, "dist", "zcode-plugins-submission");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const plugin = readJson(path.join(src, ".zcode-plugin", "plugin.json"));

// ---- 拷贝插件目录（白名单：PR 最小集合，见操作手册 §9）----
const files = [
  ".zcode-plugin/plugin.json",
  "hooks/hooks.json",
  "hooks/report.mjs",
  "README.md",
  "README_CN.md",
];
for (const rel of files) {
  const from = path.join(src, rel);
  if (!fs.existsSync(from)) {
    console.error(`✗ 缺少 ${rel}（先把双语 README 备齐）`);
    process.exit(1);
  }
  const to = path.join(out, "plugins", "z-buddy", rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// ---- 官方仓根 marketplace.json 的追加条目（字段对照 cloudbase-skills/github 条目）----
const entry = {
  name: "z-buddy",
  displayName: "Z-Buddy",
  displayName_i18n: { en: "Z-Buddy", "zh-CN": "Z-Buddy 桌宠" },
  source: "./plugins/z-buddy",
  description: plugin.description,
  description_i18n: plugin.description_i18n,
  version: plugin.version,
  author: plugin.author,
  icon: "https://learnercodez.github.io/Z-Buddy/apple-touch-icon.png",
  category: "utilities",
  keywords: plugin.keywords,
};
fs.writeFileSync(
  path.join(out, "marketplace-entry.json"),
  JSON.stringify(entry, null, 2) + "\n",
);

// ---- 自查摘要 ----
const localMarket = readJson(path.join(root, "marketplace", ".claude-plugin", "marketplace.json"));
const localVersion = localMarket.plugins[0].version;
console.log(`✓ 已组装 ${out}`);
console.log(`  插件 version: ${plugin.version}（本地市场条目 ${localVersion}）`);
if (plugin.version !== localVersion) {
  console.error("✗ plugin.json 与本地 marketplace.json 版本不一致——先对齐再出包");
  process.exit(1);
}
console.log(`
提交前自查（对照官方 CONTRIBUTING_CN.md）：
  [ ] 官方 marketplace.json 搜重名 "z-buddy"
  [ ] fork zai-org/zcode-plugins，从最新 main 建分支 feat/add-z-buddy
  [ ] 拷贝 plugins/z-buddy/ + 根 marketplace.json 追加条目
  [ ] 官方仓根跑 python3 scripts/validate.py && python3 scripts/build_dist.py && git diff --check
  [ ] PR 标题：feat(z-buddy): add Z-Buddy desktop pet bridge plugin
  [ ] PR 描述写清：动机/用户可见行为与测试/版本与市场注册/副作用（deny 拦截）/许可证`);
