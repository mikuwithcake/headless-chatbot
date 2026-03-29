# headless-bot

A lightweight chat bot for Twitch and YouTube livestreams with a built-in raffle system and spin-the-wheel browser overlay.

## Features

- **Multi-platform chat** — connects to Twitch (via tmi.js) and YouTube Live (via the official Data API v3 or youtubei.js) simultaneously
- **Raffle system** — viewers enter by chatting, mods draw winners and clear entries with chat commands
- **Spin-the-wheel overlay** — a self-hosted HTML5 canvas wheel that syncs in real time over SSE, suitable as an OBS browser source
- **Flexible auth** — Twitch runs read-only (anonymous) or read/write (with OAuth), YouTube works with or without an API key

## Quick Start

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

The overlay server starts at `http://127.0.0.1:3847/` by default. Add `?dev=1` for local draw/clear buttons without needing chat.

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
| `DEBUG` | no | Set `true` to log every chat message. |

At least one of `TWITCH_CHANNEL` or `YOUTUBE_CHANNEL_ID` should be set for chat functionality. Without either, the bot runs in overlay-only mode.

## Chat Commands

| Command | Who | Effect |
|---|---|---|
| `!raffle` | anyone | Enter the raffle |
| `!drawraffle` | mods / broadcaster | Pick a random winner |
| `!clearraffle` | mods / broadcaster | Remove all entries |

## Overlay API

The built-in HTTP server exposes:

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Spin-the-wheel HTML overlay |
| `/api/raffle` | GET | Current raffle state (JSON) |
| `/api/events` | GET | SSE stream (`update` and `draw` events) |
| `/api/draw` | POST | Trigger a draw |
| `/api/clear` | POST | Clear all entries |

