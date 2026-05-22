import { Innertube, UniversalCache, YTNodes } from "youtubei.js";
import type { YoutubeConfig } from "../config.js";
import { toErrorMessage } from "../utils.js";
import type { ChatConnection, NormalizedChatMessage } from "./types.js";

export class YoutubeiConnection implements ChatConnection {
  private livechat: ReturnType<
    Awaited<ReturnType<Innertube["getInfo"]>>["getLiveChat"]
  > | null = null;

  constructor(
    private readonly cfg: YoutubeConfig,
    private readonly onInbound: (m: NormalizedChatMessage) => void
  ) {}

  async start(): Promise<void> {
    try {
      const yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
        retrieve_player: false,
      });

      console.log(
        `[YouTubei] Searching for active livestream on channel: ${this.cfg.channelId}`
      );

      const videoId = await this.findLiveVideoId();
      if (!videoId) {
        console.log(
          "[YouTubei] No active livestream found — skipping YouTube chat."
        );
        return;
      }

      console.log(`[YouTubei] Connecting to livestream: ${videoId}`);
      const info = await yt.getInfo(videoId);

      try {
        this.livechat = info.getLiveChat();
      } catch {
        console.log("[YouTubei] No live chat available — skipping YouTube.");
        return;
      }

      this.livechat.on("start", () => {
        console.log("[YouTubei] Live chat connected.");
      });

      this.livechat.on("chat-update", (action) => {
        if (!action.is(YTNodes.AddChatItemAction)) return;
        const item = action.as(YTNodes.AddChatItemAction).item;
        if (!item) return;

        let author: string | undefined;
        let text: string | undefined;
        let isModerator = false;
        let isOwner = false;

        if (item.is(YTNodes.LiveChatTextMessage)) {
          const msg = item.as(YTNodes.LiveChatTextMessage);
          author = msg.author?.name;
          text = msg.message?.toString();
          isModerator = !!msg.author?.is_moderator;
          isOwner = !!msg.author?.is_verified;
        } else if (item.is(YTNodes.LiveChatPaidMessage)) {
          const msg = item.as(YTNodes.LiveChatPaidMessage);
          author = msg.author?.name;
          text = msg.message?.toString();
          isModerator = !!msg.author?.is_moderator;
          isOwner = !!msg.author?.is_verified;
        }

        if (author && text?.trim()) {
          this.onInbound({
            platform: "youtube",
            authorDisplayName: author,
            rawText: text.trim(),
            privileges: { canModerate: isModerator || isOwner },
            reply: (replyText) => {
              console.log(`[YouTubei] BOT REPLY: ${replyText}`);
            },
          });
        }
      });

      this.livechat.on("error", (err) => {
        console.error("[YouTubei] Chat error:", toErrorMessage(err));
      });

      this.livechat.on("end", () => {
        console.log("[YouTubei] Live chat ended.");
      });

      this.livechat.start();
    } catch (err) {
      console.error("[YouTubei] Setup failed:", toErrorMessage(err));
    }
  }

  async stop(): Promise<void> {
    if (this.livechat) {
      this.livechat.stop();
      this.livechat = null;
    }
  }

  private async findLiveVideoId(): Promise<string | null> {
    try {
      const res = await fetch(
        `https://www.youtube.com/channel/${this.cfg.channelId}/live`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) {
        console.warn(`[YouTubei] /live returned HTTP ${res.status}.`);
        return null;
      }
      const html = await res.text();
      const m = html.match(
        /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/
      );
      return m?.[1] ?? null;
    } catch (err) {
      console.warn("[YouTubei] /live lookup failed:", toErrorMessage(err));
      return null;
    }
  }
}
