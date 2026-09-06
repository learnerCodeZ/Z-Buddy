#!/usr/bin/env node
/**
 * Z-Buddy 插件核心：Agent 生命周期 → 桌宠状态
 *
 * 挂载全部 7 种 hook 事件（hooks.json 统一调用本脚本）：
 *   事件流   → ~/.z-buddy/events.jsonl（追加，供后台任务气泡渲染）
 *   状态快照 → ~/.z-buddy/state.json（供桌宠应用轮询切动画）
 *
 * 暂停机制：~/.z-buddy/pause 文件存在时，PreToolUse / PermissionRequest
 * 返回 permissionDecision:"deny"（硬拦截）；命令中含 ".z-buddy/pause" 的
 * 调用豁免（保证解除暂停的操作不被锁死）。
 *
 * 手动冒烟测试：
 *   printf '%s\n' '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"}}' \
 *     | node hooks/report.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = path.join(os.homedir(), ".z-buddy");
const STATE = path.join(DIR, "state.json");
const EVENTS = path.join(DIR, "events.jsonl");
const PAUSE = path.join(DIR, "pause");

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = raw.trim() ? JSON.parse(raw) : {};
} catch (err) {
  process.stderr.write(`[z-buddy] invalid stdin: ${err}\n`);
  process.exit(1);
}

const eventName = input.hook_event_name || input.hookEventName || "Unknown";
const toolName = input.tool_name || input.toolName || "";
const toolInput = input.tool_input || {};

// ---- 状态机：事件 → 桌宠状态 ----
const STATUS_BY_EVENT = {
  SessionStart: { status: "idle", detail: "session ready" },
  UserPromptSubmit: { status: "thinking", detail: "user asked something" },
  PreToolUse: { status: "working", detail: toolName },
  PermissionRequest: { status: "permission", detail: toolName },
  PostToolUse: { status: "working", detail: toolName },
  PostToolUseFailure: { status: "error", detail: toolName },
  Stop: { status: "idle", detail: "task round done" },
};

const now = new Date().toISOString();
const mapped = STATUS_BY_EVENT[eventName] || { status: "idle", detail: eventName };

// ---- 事件流落盘（只存轻量摘要，不落完整 tool_response）----
try {
  fs.mkdirSync(DIR, { recursive: true });
  const preview =
    typeof toolInput.command === "string"
      ? toolInput.command.slice(0, 120)
      : typeof toolInput.file_path === "string"
        ? toolInput.file_path
        : undefined;
  const rec = {
    ts: now,
    event: eventName,
    tool: toolName || undefined,
    session_id: input.session_id,
    is_interrupt: input.is_interrupt,
    preview,
  };
  fs.appendFileSync(EVENTS, JSON.stringify(rec) + "\n");
} catch {
  /* 事件流失败不影响主流程 */
}

// ---- 暂停拦截（含豁免）----
const paused = (() => {
  try {
    return fs.existsSync(PAUSE);
  } catch {
    return false;
  }
})();

const cmdText = typeof toolInput.command === "string" ? toolInput.command : "";
const exempt = cmdText.includes(".z-buddy/pause");

if (paused && (eventName === "PreToolUse" || eventName === "PermissionRequest") && !exempt) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        permissionDecision: "deny",
        permissionDecisionReason:
          "[Z-Buddy] 桌宠暂停中（你点过桌宠的暂停键）。此调用已被暂缓——稍后重试，或点桌宠恢复。",
      },
    }),
  );
  process.exit(0);
}

// ---- 状态快照 ----
try {
  const prev = (() => {
    try {
      return JSON.parse(fs.readFileSync(STATE, "utf8"));
    } catch {
      return {};
    }
  })();
  const state = {
    status: mapped.status,
    detail: mapped.detail,
    last_event: eventName,
    session_id: input.session_id,
    paused,
    // 状态切换时间：同状态延续时保留原 since（供桌宠显示"已工作 X 秒"）
    since: prev.status === mapped.status ? prev.since || now : now,
    updated_at: now,
  };
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
} catch {
  /* 状态写入失败不影响主流程 */
}

// ---- 追加上下文（轻量，不打扰模型）----
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: `z-buddy: status=${mapped.status}`,
    },
  }),
);
