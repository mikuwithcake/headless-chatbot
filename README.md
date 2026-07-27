# headless-bot

A lightweight chat bot for Twitch and YouTube livestreams with a built-in raffle system and spin-the-wheel browser overlay.

## Features

- **Multi-platform chat** — connects to Twitch (via tmi.js) and YouTube Live (via the official Data API v3 or youtubei.js) simultaneously
- **Raffle system** — viewers enter by chatting, mods draw winners and clear entries with chat commands
- **Spin-the-wheel overlay** — a self-hosted HTML5 canvas wheel that syncs in real time over SSE, suitable as an OBS browser source
- **Winner history** — recent wins are tallied in a plain `database.json`, with a `/history` page showing who won, how often, and how long ago
- **Flexible auth** — Twitch runs read-only (anonymous) or read/write (with OAuth), YouTube works with or without an API key

## Quick Start

### Option A — prebuilt executable (no Node.js needed)

Grab the binary for your platform from the [Releases](../../releases) page, drop a
`.env` next to it (copy `.env.example`), and run it. Everything — including the
overlay HTML — is baked into the single file.

### Option B — from source

Install Node.js 22.22.2 from https://nodejs.org/en/download
> Direct installer link: https://nodejs.org/dist/v22.22.2/node-v22.22.2-x64.msi

After that:
1. Download this repo and extract it.
2. Copy `.env.example` to `.env`.
3. Open a terminal in that folder and run:

```bash
npm install
npm run dev
```

The overlay server starts at `http://127.0.0.1:3847/` by default. Add `?dev=1` for local draw/clear buttons without needing chat. Winner history lives at `http://127.0.0.1:3847/history`.

## Configuration

All configuration is via environment variables (or a `.env` file).

| Variable | Required | Description |
|---|---|---|
| `TWITCH_CHANNEL` | no | Twitch channel to join. Omit to skip Twitch. |
| `TWITCH_USERNAME` | no | Bot's Twitch username (enables replies). |
| `TWITCH_OAUTH_TOKEN` | no | OAuth token for the bot account (enables replies). |
| `YOUTUBE_CHANNEL_ID` | no | YouTube channel ID. Omit to skip YouTube. |
| `YOUTUBE_API_KEY` | no | YouTube Data API v3 key. If unset, falls back to youtubei.js (no quota cost). |
| `OVERLAY_HOST` | no | Bind address for the overlay server. Default `127.0.0.1`. |
| `OVERLAY_PORT` | no | Port for the overlay server. Default `3847`. |
| `DEBUG` | no | Set `true` to log every chat message and enable `debug`-level logs. |
| `LOG_LEVEL` | no | `error`, `warn`, `info` (default), `debug` or `trace`. Overrides `DEBUG`. |
| `DATABASE_PATH` | no | Where to keep the winner tally. Default `database.json` in the working directory. |
| `WINNER_RETENTION_DAYS` | no | Drop winners not seen in this many days, checked at startup. Default `7`; `0` keeps everyone forever. |

At least one of `TWITCH_CHANNEL` or `YOUTUBE_CHANNEL_ID` should be set for chat functionality. Without either, the bot runs in overlay-only mode.

## Chat Commands

| Command | Who | Effect |
|---|---|---|
| `!raffle` | anyone | Enter the raffle |
| `!drawraffle` | mods / broadcaster | Pick a random winner **and close submissions** |
| `!clearraffle` | mods / broadcaster | Remove all entries and reopen submissions |

Drawing a winner locks the raffle: the wheel's rendered state is frozen for the
spin, so anyone entering afterwards would never appear on it. `!raffle` replies
that the raffle is closed until a mod runs `!clearraffle`. Run with
`LOG_LEVEL=debug` to see each accepted/rejected entry and every lock transition.

## Winner History

Each draw bumps the winner's tally in `database.json` (plain JSON, no database
engine required) next to the executable:

```json
{
  "version": 1,
  "updatedAt": "2026-07-27T18:35:51.889Z",
  "winners": [
    { "name": "Mert", "wins": 2, "firstWonAt": "...", "lastWonAt": "..." }
  ]
}
```

Names are matched case-insensitively. `http://127.0.0.1:3847/history` renders the
leaderboard with each winner's total and how long ago they last won, and the
overlay's winner banner shows `win #N · won 2 days ago` for repeat winners.

**The tally is short-lived on purpose.** On every startup, anyone whose last win
is older than `WINNER_RETENTION_DAYS` (default 7) is dropped from the file, so it
stays small and only ever answers "did this person win recently?". A pruned name
is treated as a brand-new winner: their next win is `win #1` and the banner shows
no note at all, exactly like a first-timer.

## NPM Scripts

While the bot is running, you can trigger raffle actions from a second terminal:

| Script | Description |
|---|---|
| `npm run raffle:draw` | Draw a raffle winner |
| `npm run raffle:clear` | Clear all raffle entries |

## Overlay API

The built-in HTTP server exposes:

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Spin-the-wheel HTML overlay |
| `/history` | GET | Winner leaderboard page (alias: `/winners`) |
| `/api/raffle` | GET | Current raffle state (JSON, includes `locked`) |
| `/api/history` | GET | Winner tally (JSON) |
| `/api/events` | GET | SSE stream (`update` and `draw` events) |
| `/api/draw` | POST | Trigger a draw (also locks submissions) |
| `/api/clear` | POST | Clear all entries and unlock |

## Releases

Pushing a `v*` tag builds standalone executables for Linux, macOS and Windows
with `bun build --compile` and attaches them to a GitHub release
(`.github/workflows/release.yml`). `workflow_dispatch` builds the same binaries
as downloadable artifacts without publishing a release. To build one locally:

```bash
npm run build:exe    # requires bun; writes dist/headless-bot
```

