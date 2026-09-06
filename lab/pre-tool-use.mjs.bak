#!/usr/bin/env node
/**
 * PreToolUse hook sample for example-plugin.
 *
 * This sample only appends model context; it does NOT deny or rewrite tools.
 * For deny / updatedInput patterns see the ZCode plugin hooks tutorial.
 *
 * Manual smoke test:
 *   printf '%s\n' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"x"}}' \
 *     | node hooks/pre-tool-use.mjs
 */

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = raw.trim() ? JSON.parse(raw) : {};
} catch (err) {
  process.stderr.write(`[example-plugin] invalid PreToolUse stdin: ${err}\n`);
  process.exit(1);
}

const eventName = input.hook_event_name || input.hookEventName || "PreToolUse";
const toolName = input.tool_name || input.toolName || "unknown";

// Log matcher-relevant fields only — never dump tool_input contents (may hold secrets).
process.stderr.write(`[example-plugin] PreToolUse tool=${toolName}\n`);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: `example-plugin noted upcoming tool call: ${toolName}.`,
    },
  }),
);
