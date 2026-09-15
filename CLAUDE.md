# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Independent pieces that together show Claude Code's `/usage` quota (session/week), all reading the same local HTTP endpoint:

1. **`poller/`** — a dependency-free Node HTTP server that shells out to `claude -p "/usage" --output-format json` on an interval and exposes the parsed result at `http://127.0.0.1:4756/usage`, plus a static browser dashboard at `http://127.0.0.1:4756/`.
2. **`streamdock-plugin/com.mlangdev.claudeusage.sdPlugin/`** — a plugin for **StreamDock** (the SDK behind Elgato Stream Deck and other brands like Redragon Stream Station / Mirabox) that polls the poller's HTTP endpoint and renders the result on physical keys.
3. **`tray/`** — an optional, Windows-only PowerShell script (no plugin/Node involved) that polls the same endpoint and renders two live percentage icons in the system tray.

`claude -p "/usage" --output-format json` is free (0 tokens, 0 turns) — it's a status query, not a model call, so the poller can hit it on a short interval without cost concerns.

## Commands

Poller:
```bash
cd poller
npm install      # no third-party deps, just primes npm
npm start         # serves http://127.0.0.1:4756/usage
curl http://127.0.0.1:4756/usage           # inspect cached state
curl "http://127.0.0.1:4756/usage?refresh=1"  # force an immediate claude CLI re-query
node --check src/index.js && node --check src/parseUsage.js  # syntax check after edits
```

Plugin:
```bash
cd streamdock-plugin/com.mlangdev.claudeusage.sdPlugin/plugin
npm install       # only dependency is `ws`
node --check index.js
```

Tray (Windows only):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tray\claude-usage-tray.ps1   # run in foreground to see errors
```

There is no automated test suite in this repo; validation is `node --check` (or a foreground run, for the tray script) plus manual verification on real StreamDock hardware (see "Deploying to a real device" below).

## Architecture

### Poller (`poller/src/`)

- `index.js` — owns an in-memory `state` object (`updatedAt`, `metrics`, `stats`, `raw`, `error`, `refreshing`), refreshed on a timer (`POLL_INTERVAL_MS`, default 5 min) by shelling out to the `claude` CLI via `child_process.exec`. Serves `/usage` (returns `state`, accepts `?refresh=1` to force a synchronous re-query), `/health`, and `/` (a static browser dashboard, see below).
- `dashboard.html` — a standalone, framework-free page (read once into memory as `DASHBOARD_HTML` and served verbatim at `/`) that polls the same `/usage` endpoint client-side every 15s (plus a 1s client-only tick to keep countdowns live between polls) and renders it as cards, reusing the plugin's terracotta/cream palette for visual consistency with the physical keys. This is the no-hardware fallback: anyone can open `http://127.0.0.1:<PORT>` in a browser instead of installing the StreamDock plugin.
- `parseUsage.js` — turns the free-text `result` field from `/usage` into structured data. This text is **not a documented/stable API** — it's the literal interactive-mode output — so parsing is deliberately tolerant (unmatched lines are just skipped) and the raw text is always kept in `state.raw` as a fallback. Two regexes matter:
  - `METRIC_LINE_RE` — matches `"<label>: N% used · resets <text>"` lines (session/week quotas). `estimateResetDate()` best-effort-parses the reset text (e.g. `"Aug 30, 4:09am (America/Sao_Paulo)"`) into an ISO date, **assuming the poller's machine is in the same timezone shown in that string** (JS `Date` can't resolve the IANA tz name itself).
  - `STATS_LINE_RE` — matches `"Last <window> · N requests · M sessions"` lines.
- If Anthropic changes the `/usage` wording, these regexes stop matching silently (metrics/stats come back empty, `error` gets set) rather than throwing — check `raw` in the JSON response to re-derive the new format.

### StreamDock plugin (`streamdock-plugin/com.mlangdev.claudeusage.sdPlugin/`)

This targets the **StreamDock** plugin SDK (see `plugin/utils/plugin.js` header comment for the upstream reference: github.com/MiraboxSpace/StreamDock-Plugin-SDK), not Elgato's own SDK — they're protocol-compatible in spirit but this repo does not use `@elgato/streamdeck`.

- **Launch/connect contract**: StreamDock spawns `plugin/index.js` with positional args `-port <p> -pluginUUID <u> -registerEvent <e> -info <json>`, which land at fixed `process.argv` indices (3, 5, 7, 9). `plugin/utils/plugin.js`'s `Plugins` class reads those directly and opens `ws://127.0.0.1:<port>`, registering with `{uuid, event}`.
- **Action UUID ↔ code binding**: each manifest action's UUID's *last dot segment* must match a property name assigned on the `plugin` instance in `plugin/index.js` (e.g. UUID `com.mlangdev.claudeusage.usage` → `plugin.usage = new Actions({...})`). `Plugins`' message handler dispatches `data.action.split('.').pop()` to look up the right `Actions` instance. Getting this mismatched silently drops all events for that action.
- **Per-action lifecycle**: `Actions` (in `plugin.js`) wraps StreamDock's `willAppear`/`willDisappear`/`didReceiveSettings`/`propertyInspectorDidAppear` events and forwards to underscore-prefixed hooks (`_willAppear`, `_willDisappear`, `_didReceiveSettings`, `_propertyInspectorDidAppear`) if defined; raw events like `keyUp` are dispatched without a prefix.
- **`createPoller()` factory** (in `plugin/index.js`) is the shared per-key polling loop used by all four actions: `start()`/`stop()` manage a `setInterval` keyed by `context` (StreamDock's per-key instance id), and `refreshNow()` forces an immediate poller re-query (via `?refresh=1`) for the manual "press key to refresh" behavior. Each action (`usage`, `countdown`, `stats`, `resetday`) only supplies a `render(context, settings, body, err)` callback.
- **Rendering**: keys are drawn as inline SVG data URIs (`svgDataUri` + `buildGaugeSvg`/`buildCountdownSvg`/`buildStatsSvg`/`buildResetDaySvg`), not native StreamDock titles — `plugin.setTitle(context, '')` is called once on `_willAppear` to clear any default label so it doesn't overlap the custom art. `cardBase()` + `sparkle()` provide the shared dark-card/accent-mark look (Claude-inspired terracotta palette in the `CLAUDE` constant); this is an original decorative mark, not a reproduction of Anthropic's logo.
- **Alerting**: the `usage` action tracks `lastPercentByContext` and calls `plugin.showAlert(context)` only on the upward edge crossing `ALERT_THRESHOLD` (90%), to avoid flashing on every poll while already over the limit.
- **Property Inspectors** (`propertyInspector/<action>/index.html`) are plain HTML/JS (no framework) implementing the StreamDock PI handshake themselves: the host calls the global `connectElgatoStreamDeckSocket(port, uuid, registerEvent, appInfoJson, actionInfoJson)`, and settings are saved back via a debounced `setSettings` WebSocket message. Each PI is a near-duplicate of the others (different field sets) — this is intentional, not accidental duplication, given how small each form is.

### Tray icons (`tray/`)

- `claude-usage-tray.ps1` is a standalone PowerShell script — no npm, no build step — using only `System.Windows.Forms`/`System.Drawing` (ships with Windows). It creates two `NotifyIcon`s (session, week), each showing the current percentage rendered as text onto a generated bitmap (`New-NumberIcon`), recolored per the same 70%/90% tiers as the plugin (`Get-TierColor`, reusing the plugin's `CLAUDE`-palette hex values).
- Polls `$PollerUrl/usage` (default `http://127.0.0.1:4756`, override via `CLAUDE_USAGE_POLLER_URL`) every 15s via `Invoke-RestMethod`; on a failed request both icons switch to an offline/`?` state rather than showing stale data indefinitely.
- Countdown text (in the icon tooltip) is computed client-side from `resetsAtIso`, mirroring `formatCountdown()` from the plugin/dashboard.
- Must run as a normal (not "run whether user is logged on or not") scheduled task or startup entry — `NotifyIcon` needs an interactive desktop session; see the README's `ClaudeUsageTray` scheduled-task snippet, which mirrors the poller's own auto-start pattern.
- New tray icons land in Windows' hidden-icons overflow by default — this is OS behavior, not something the script controls; the README tells users to drag them out once.

### Deploying to a real device (manual, not scripted)

Windows StreamDock install path: `%AppData%\HotSpot\StreamDock\plugins\` — the same path regardless of OEM rebrand (Redragon, Mirabox, etc.). After copying the plugin folder there:
- Editing `plugin/index.js` or `plugin/utils/*.js` only requires killing the running `node20.exe <...>/plugin/index.js` process (StreamDock's host app respawns it automatically) — no full app restart needed.
- Editing `manifest.json` (e.g. adding/removing actions) requires fully quitting and reopening the StreamDock host app (it only reads the plugins directory at startup) — closing the window is not enough, these apps typically keep running from the system tray.
- Per-plugin debug logs (if `plugin/utils/plugin.js`'s file logger writes anything) land in `plugin/log/<date>.log` next to the installed plugin, not in this repo.
