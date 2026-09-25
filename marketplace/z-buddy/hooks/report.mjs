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

// ---- 桌面操作识别（人机协调预警）----
// ZCode 的 computer use 不是独立 MCP 工具：它通过共享 node_repl 宿主执行
// `agent.computerUse.*` SDK 调用（见官方 computer-use 插件 docs/computer-use.md），
// 所以识别 = node_repl 工具 + 代码里出现 computerUse；末行预留将来独立工具的前缀
const computerUseHit =
  (/node_repl/i.test(toolName) && /computerUse|computer-use/i.test(String(toolInput.code || ""))) ||
  /^(mcp__)?computer[_-]use/i.test(toolName);

// ZCode 开源后的主契约是 camelCase；snake_case（session_id 等）是 Claude Code 兼容层，
// ZCODE_* 环境变量是第三重兜底 —— 三者按此优先级取
const sessionId = input.sessionId || input.session_id || process.env.ZCODE_SESSION_ID || "";
const cwd = input.cwd || process.env.ZCODE_PROJECT_DIR || "";
const agentName = input.agentName || input.agent_type || "";

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

// 时间戳优先用 ZCode 事件自带的（hook 派发时刻，跨进程时钟一致），缺失才本地取时
const now = input.timestamp || new Date().toISOString();

// 项目名（cwd 末段）：events.jsonl 冗余一份，活动页按项目筛选免解析路径
const project = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() || undefined : undefined;
// 本地时间戳（YYYY-MM-DDTHH:MM:SS）：今日统计按本地日切，避免 UTC 与本地日期错位
const d = new Date(now);
const pad2 = (n) => String(n).padStart(2, "0");
const tsLocal = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
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
    ts_local: tsLocal,
    event: eventName,
    tool: toolName || undefined,
    session_id: sessionId,
    project,
    computer_use: computerUseHit || undefined,
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

// ---- 会话分片（多会话聚合：每会话一个文件，多会话并发写零竞态）----
// 应用端读分片聚合；state.json 保留为"最近活跃会话"兼容快照（旧版应用/托盘不坏）
try {
  if (sessionId) {
    const sessionsDir = path.join(DIR, "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    // 文件名消毒：session_id 直接拼路径，防路径注入
    const safeId = sessionId.replace(/[^A-Za-z0-9_-]/g, "_");
    const shardPath = path.join(sessionsDir, `${safeId}.json`);
    const prevShard = (() => {
      try {
        return JSON.parse(fs.readFileSync(shardPath, "utf8"));
      } catch {
        return {};
      }
    })();
    fs.writeFileSync(
      shardPath,
      JSON.stringify(
        {
          session_id: sessionId,
          status: mapped.status,
          detail: mapped.detail,
          last_event: eventName,
          since: prevShard.status === mapped.status ? prevShard.since || now : now,
          updated_at: now,
          updated_ms: Date.parse(now) || Date.now(),
          cwd: cwd || prevShard.cwd,
          agent: agentName || prevShard.agent,
          desktop_control: computerUseHit, // 每次事件都覆盖写：agent 换干别的就自动清除
        },
        null,
        2,
      ),
    );
  }
} catch {
  /* 分片写入失败不影响主流程 */
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
    session_id: sessionId,
    paused,
    // 状态切换时间：同状态延续时保留原 since（供桌宠显示"已工作 X 秒"）
    since: prev.status === mapped.status ? prev.since || now : now,
    updated_at: now,
    cwd: cwd || undefined, // 正在干活的项目目录（主界面显示项目名）
    agent: agentName || undefined, // Agent 名称（区分主 Agent 与子 Agent）
    desktop_control: computerUseHit, // 该会话最近一次工具调用是否为桌面操作（预警气泡依据）
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
