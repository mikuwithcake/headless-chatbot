import tmi from "tmi.js";
import type { TwitchConfig } from "../config.js";
import type { ChatConnection, NormalizedChatMessage } from "./types.js";

export class TwitchConnection implements ChatConnection {
  private readonly client: tmi.Client;

  constructor(
    private readonly cfg: TwitchConfig,
    private readonly onInbound: (m: NormalizedChatMessage) => void
  ) {
    const canWrite = !!(cfg.username && cfg.oauthToken);

    this.client = new tmi.Client({
      options: { debug: false },
      ...(canWrite
        ? { identity: { username: cfg.username!, password: cfg.oauthToken! } }
        : {}),
      channels: [cfg.channel],
    });

    this.client.on("message", (channel, userstate, message, self) => {
      if (self) return;
      const isBroadcaster = userstate.badges?.broadcaster === "1";
      const canModerate = !!(userstate.mod || isBroadcaster);

      this.onInbound({
        platform: "twitch",
        authorDisplayName: userstate["display-name"] || userstate.username || "unknown",
        rawText: message,
        privileges: { canModerate },
        reply: canWrite
          ? (text) => { void this.client.say(channel, text); }
          : (text) => { console.log(`[Twitch] Not logged in, can't send reply: ${text}`); },
      });
    });
  }

  async start(): Promise<void> {
    await this.client.connect();
    const mode = this.cfg.username && this.cfg.oauthToken ? "read/write" : "read-only";
    console.log(`[Twitch] Connected to #${this.cfg.channel} (${mode})`);
  }

  async stop(): Promise<void> {
    await this.client.disconnect();
  }
}
