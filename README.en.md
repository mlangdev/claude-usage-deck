# claude-usage-deck

[🇧🇷 Português](README.md) | 🇬🇧 English

Shows how much of your [Claude Code](https://claude.com/claude-code) usage quota (current session and weekly Pro/Max plan allowance) is left, right on a Stream Deck / Stream Dock key — including other brands (Redragon, Mirabox, etc.) that run the **StreamDock** software.

The project has two parts:

1. **`poller/`** — a dependency-free local Node.js service that runs `claude -p "/usage" --output-format json` on an interval and exposes the parsed result on a local HTTP endpoint, plus a visual dashboard in the browser (`http://127.0.0.1:4756`) — handy if you don't own a Stream Deck. This call is free: it doesn't spend tokens or count as a message, it's just a status query.
2. **`streamdock-plugin/`** — a plugin for the **StreamDock** software (used by Elgato's Stream Deck and by several other brands — Redragon Stream Station, Mirabox, etc.) with four keys:
   - **Claude Usage** — a circular gauge with the percentage used (session or week), terracotta/amber/red colors depending on consumption, and a visual alert (`showAlert`) automatically triggered when crossing 90%.
   - **Claude Reset Countdown** — how much time is left before the chosen quota (session or week) resets.
   - **Claude Stats** — how many requests and sessions Claude Code had in the last 24h or 7 days.
   - **Claude Reset Day** — which day of the week (and date) the chosen quota (session or week) will reset.

> This is NOT an official Elgato or Anthropic plugin. It's a community-made tool that only reads the public output of the Claude Code CLI's `/usage` command.

## How it works

```
claude -p "/usage" --output-format json   (every N minutes)
        │
        ▼
   poller/ (Node.js, http://127.0.0.1:4756/usage)
        │
        ▼
   StreamDock plugin (polls every N seconds)
        │
        ▼
   Stream Deck key shows "WEEK 4%" with a colored bar
```

## Prerequisites

- [Claude Code CLI](https://claude.com/claude-code) installed and authenticated (`claude` needs to work in your terminal).
- Node.js 18+.
- A Stream Deck (Elgato) or a device from another brand running the **StreamDock** software (look for a `plugins` folder inside your app's install directory — if it has `.sdPlugin` files, it's this SDK).

## 1. Run the poller

```bash
cd poller
npm install   # no third-party dependencies, just primes the npm cache
npm start
```

This starts a server at `http://127.0.0.1:4756`. Open that address in your browser and you'll get a dashboard with usage, countdown, and stats — handy if you don't own a Stream Deck/StreamDock and just want to check from a screen. It reads the same JSON endpoint, available at `http://127.0.0.1:4756/usage`:

```bash
curl http://127.0.0.1:4756/usage
```

You should see something like:

```json
{
  "updatedAt": "2026-08-30T02:48:29.782Z",
  "metrics": [
    { "label": "Current session", "percentUsed": 12, "resetsAt": "Aug 30, 4:09am (America/Sao_Paulo)" },
    { "label": "Current week (all models)", "percentUsed": 4, "resetsAt": "Sep 4, 5:59am (America/Sao_Paulo)" }
  ],
  "error": null
}
```

### Configuration (optional)

Copy `poller/.env.example` to `poller/.env` (or export the variables directly in your environment) to change:

- `PORT` — local server port (default `4756`)
- `POLL_INTERVAL_MS` — interval between queries to the `claude` CLI (default 5 minutes)
- `CLAUDE_BIN` — path/command for the Claude Code executable, in case `claude` isn't on your PATH

### Keeping it running in the background

The simplest way on Windows is to create a shortcut that runs `npm start` inside the `poller` folder and drop it in the Windows Startup folder (`shell:startup`), or use a process manager like [pm2](https://pm2.keymetrics.io/).

## 2. Install the plugin on StreamDock

1. Inside `streamdock-plugin/com.mlangdev.claudeusage.sdPlugin/plugin`, run:

   ```bash
   npm install
   ```

   This downloads the plugin's only dependency (`ws`, to speak WebSocket with StreamDock).

2. Copy the entire `com.mlangdev.claudeusage.sdPlugin` folder into StreamDock's plugins folder:

   - Windows: `%AppData%\HotSpot\StreamDock\plugins\`
   - (On rebranded builds — Redragon, etc. — the real path is still `HotSpot\StreamDock`, even if the app shows up with a different name/icon.)

3. Restart the Stream Deck/Stream Dock app.

4. Look for the **"Claude Usage"** category in the actions list — there are four keys available (Claude Usage, Claude Reset Countdown, Claude Stats, Claude Reset Day). Drag whichever ones you want onto your panel.

5. Click each key to open its settings panel:
   - **Claude Usage**: metric (session/week), poller URL, refresh interval.
   - **Claude Reset Countdown**: metric (session/week), poller URL, refresh interval.
   - **Claude Stats**: window (24h/7 days), poller URL, refresh interval.
   - **Claude Reset Day**: metric (session/week), poller URL, refresh interval.

Pressing any key forces an immediate refresh (the poller then re-queries the `claude` CLI right away).

### About the reset countdown

The `/usage` text doesn't include a full date (e.g. "Aug 30, 4:09am"), so the poller assumes the displayed time is in the same timezone as the machine it runs on. If you run the poller on a machine/server in a different timezone, the countdown will be wrong — in that case this key isn't recommended (the gauge and stats remain correct, since they don't depend on timezone).

## Known limitations

- Claude Code's `/usage` isn't a documented public API — it's the text output of an interactive command. The parser (`poller/src/parseUsage.js`) is deliberately tolerant, but if Anthropic changes the `/usage` wording, parsing may stop recognizing the lines (the endpoint always returns the raw text in `raw` so you can check).
- The numbers reflect **local sessions on this machine** — they don't include usage from other devices or from claude.ai (this is a limitation of `/usage` itself, not of the poller).
- Tested with the **Redragon Stream Station** software (a rebrand of Mirabox/HotSpot's StreamDock). Should work with any app based on the same SDK (look for `.sdPlugin` folders in the install), but may need manifest tweaks on different versions of the software.

## License

MIT — see [LICENSE](LICENSE).
