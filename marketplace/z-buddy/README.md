# z-buddy

A ZCode plugin that bridges the agent lifecycle to the [Z-Buddy desktop pet](https://learnercodez.github.io/Z-Buddy/): a pixel-style desk pet that reacts in real time to what your ZCode agent is doing — and lets you pause the agent with a single click on the pet.

![category: utilities](https://img.shields.io/badge/category-utilities-blue)

## What it does

The plugin mounts **7 hook events** (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Stop`) and translates each agent lifecycle event into a pet status, persisted locally for the Z-Buddy pet app to pick up:

| Hook event | Trigger | Pet status |
|---|---|---|
| `SessionStart` | session starts | idle |
| `UserPromptSubmit` | user submits a prompt | thinking |
| `PreToolUse` / `PostToolUse` | tool call | working |
| `PermissionRequest` | permission requested | permission (waiting for you) |
| `PostToolUseFailure` | tool failed | error |
| `Stop` | turn finished | idle |

It also detects **computer-use actions** (Agent taking over your mouse/keyboard) so the pet can raise a warning, and supports a **pause button**: click the pet to suspend the agent.

## Install

1. Install the Z-Buddy pet app first — download from the [official site](https://learnercodez.github.io/Z-Buddy/) (the plugin only writes status files; the visualization is the separate desktop app).
2. Install this plugin from the ZCode plugin store (or a marketplace source), then **start a new session** — hooks only take effect for new sessions.
3. Requires **Node.js** on PATH (hooks run `node report.mjs`).

Without the pet app the plugin still works (status files are written), but nothing is visualized.

## Side effects & permissions (read this)

- **Hooks**: the 7 events listed above run a local Node script on every lifecycle event.
- **File writes**: only under `<user home>/.z-buddy/` (Windows: `%USERPROFILE%\.z-buddy\`):
  - `state.json` — status snapshot of the most recently active session;
  - `sessions/<session-id>.json` — one status shard per session;
  - `events.jsonl` — append-only event log (lightweight previews, e.g. first 120 chars of a command).
  The plugin **never writes into your project directory**.
- **File reads**: the marker file `~/.z-buddy/pause` (existence = paused), its own previous state files.
- **Pause enforcement (important)**: while the pause file exists, this plugin returns `permissionDecision: "deny"` for `PreToolUse` and `PermissionRequest` hooks — **tool calls are blocked** until you click the pet again (or delete the pause file). Commands containing `.z-buddy/pause` are exempt so you can always unblock yourself.
- **Network**: none. The plugin performs no network requests and calls no model/API. (The separate pet app may contact GitHub Releases for self-update — that is the app, not this plugin.)
- **Privacy**: everything stays on your machine; nothing is uploaded.

## Data directory

All runtime data lives in `~/.z-buddy/`. Delete the folder to reset. See the [website docs](https://learnercodez.github.io/Z-Buddy/docs/quick-start/) for details.

## Troubleshooting

- **Pet installed but not moving**: hooks only apply to sessions started *after* installation — open a new session.
- **Agent suddenly refuses tool calls with a Z-Buddy message**: the pet is paused. Click the pet, or run `rm ~/.z-buddy/pause` (Windows: delete `%USERPROFILE%\.z-buddy\pause`).
- **No status at all**: check `~/.z-buddy/events.jsonl` exists and grows; ensure `node` is on PATH.

## License

Plugin code: MIT. The Z-Buddy pet artwork (pixel sprites / illustrations) is original artwork of the Z-Buddy project — not redistributable as the basis of derivative IP assets.

## Links

- Website & pet app download: <https://learnercodez.github.io/Z-Buddy/>
- Source & pet app: <https://github.com/learnerCodeZ/Z-Buddy>
