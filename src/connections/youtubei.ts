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

      const videoId = await this.findLiveVideoId(yt);
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

  private async findLiveVideoId(yt: Innertube): Promise<string | null> {
    try {
      const channel = await yt.getChannel(this.cfg.channelId);
      const tab = await channel.getLiveStreams();
      for (const video of tab.videos) {
        if (video.is(YTNodes.Video) || video.is(YTNodes.GridVideo)) {
          const v = video as { id: string; is_live?: boolean };
          if (v.is_live && v.id) {
            return v.id;
          }
        }
      }
    } catch (err) {
      console.warn("[YouTubei] Channel lookup failed:", toErrorMessage(err));
    }
    return null;
  }
}
