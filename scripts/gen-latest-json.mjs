#!/usr/bin/env node
/**
 * 生成 Tauri updater 所需的 latest.json（发版时本地跑，私钥不出本机）
 *
 *   node scripts/gen-latest-json.mjs [版本号] [安装包路径]
 *
 * 默认：版本号取 app/src-tauri/tauri.conf.json，安装包取
 *   app/src-tauri/target/release/bundle/nsis/Z-Buddy_<版本>_x64-setup.exe
 *
 * 做的事：用本机私钥（~/.z-buddy/updater.key，或环境变量
 *   TAURI_SIGNING_PRIVATE_KEY_PATH）给安装包签名 → 写 website/public/latest.json
 *   → 官网 CI 发布到 https://learnercodez.github.io/Z-Buddy/latest.json（即更新源）。
 *
 * 为什么不在 CI 签名：私钥绝不能上传；CI 只负责编译，签名在本地完成。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = "learnerCodeZ/Z-Buddy";
const cfg = JSON.parse(fs.readFileSync("app/src-tauri/tauri.conf.json", "utf8"));
const version = process.argv[2] || cfg.version;
const installer =
  process.argv[3] ||
  `app/src-tauri/target/release/bundle/nsis/${cfg.productName}_${version}_x64-setup.exe`;
const keyPath =
  process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || path.join(os.homedir(), ".z-buddy", "updater.key");
const outPath = "website/public/latest.json";

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(installer)) die(`找不到安装包：${installer}`);
if (!fs.existsSync(keyPath)) die(`找不到私钥：${keyPath}（换路径请设 TAURI_SIGNING_PRIVATE_KEY_PATH）`);

// 本地签名：直接调项目里装好的 tauri CLI，避免 npx/shell 的平台差异
const cli = path.resolve("app/node_modules/@tauri-apps/cli/tauri.js");
if (!fs.existsSync(cli)) die(`未安装 Tauri CLI：${cli}（先 cd app && npm install）`);

console.log(`签名 ${path.basename(installer)} …`);
execFileSync(process.execPath, [cli, "signer", "sign", "-f", keyPath, installer], { stdio: "inherit" });

const sigPath = `${installer}.sig`;
if (!fs.existsSync(sigPath)) die(`签名失败：没有生成 ${sigPath}`);
const signature = fs.readFileSync(sigPath, "utf8").trim();
if (!signature) die("签名为空");

const url = `https://github.com/${REPO}/releases/download/v${version}/${path.basename(installer)}`;
const latest = {
  version,
  notes: `Z-Buddy v${version} 更新`,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  platforms: { "windows-x86_64": { signature, url } },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(latest, null, 2) + "\n");
console.log(`✓ 已生成 ${outPath}`);
console.log(`  版本   ${version}`);
console.log(`  下载   ${url}`);
console.log(`  签名   ${signature.slice(0, 40)}…（${signature.length} 字符）`);
console.log(`  提醒：提交并推送到 main 后，官网 CI 会把它发布到更新源`);
