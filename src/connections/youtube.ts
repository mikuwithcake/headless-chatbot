import type { YoutubeConfig } from "../config.js";
import { toErrorMessage } from "../utils.js";
import type { ChatConnection, NormalizedChatMessage } from "./types.js";

const API = "https://www.googleapis.com/youtube/v3";

interface LiveChatMessage {
  snippet: {
    type: string;
    displayMessage?: string;
    superChatDetails?: { userComment?: string };
  };
  authorDetails: {
    displayName: string;
    isChatOwner: boolean;
    isChatModerator: boolean;
  };
}

interface LiveChatResponse {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  items?: LiveChatMessage[];
}

export class YoutubeConnection implements ChatConnection {
  private abortController: AbortController | null = null;

  constructor(
    private readonly cfg: YoutubeConfig,
    private readonly onInbound: (m: NormalizedChatMessage) => void
  ) {
  }

  async start(): Promise<void> {
    if (!this.cfg.apiKey) {
      console.warn("[YouTube] No API key configured — skipping official API.");
      return;
    }

    try {
      console.log(
        `[YouTube] Looking up active livestream for channel: ${this.cfg.channelId}`
      );

      const liveChatId = await this.findLiveChatId();
      if (!liveChatId) {
        console.log(
          "[YouTube] No active livestream found — skipping YouTube chat."
        );
        return;
      }

      console.log("[YouTube] Live chat connected — polling via Data API v3.");
      this.abortController = new AbortController();
      this.pollLoop(liveChatId, this.abortController.signal);
    } catch (err) {
      console.error("[YouTube] Setup failed:", toErrorMessage(err));
    }
  }

  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async findLiveChatId(): Promise<string | null> {
    const searchUrl = new URL(`${API}/search`);
    searchUrl.searchParams.set("part", "id");
    searchUrl.searchParams.set("channelId", this.cfg.channelId);
    searchUrl.searchParams.set("eventType", "live");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "1");
    searchUrl.searchParams.set("key", this.cfg.apiKey!);

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      console.warn(
        `[YouTube] search.list failed: ${searchRes.status} ${searchRes.statusText}`
      );
      return null;
    }

    const searchData = (await searchRes.json()) as {
      items?: { id?: { videoId?: string } }[];
    };
    const videoId = searchData.items?.[0]?.id?.videoId;
    if (!videoId) return null;

    console.log(`[YouTube] Found livestream: ${videoId}`);

    const videoUrl = new URL(`${API}/videos`);
    videoUrl.searchParams.set("part", "liveStreamingDetails");
    videoUrl.searchParams.set("id", videoId);
    videoUrl.searchParams.set("key", this.cfg.apiKey!);

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      console.warn(
        `[YouTube] videos.list failed: ${videoRes.status} ${videoRes.statusText}`
      );
      return null;
    }

    const videoData = (await videoRes.json()) as {
      items?: { liveStreamingDetails?: { activeLiveChatId?: string } }[];
    };
    return videoData.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? null;
  }

  private async pollLoop(
    liveChatId: string,
    signal: AbortSignal
  ): Promise<void> {
    let pageToken: string | undefined;

    while (!signal.aborted) {
      try {
        const url = new URL(`${API}/liveChat/messages`);
        url.searchParams.set("liveChatId", liveChatId);
        url.searchParams.set("part", "snippet,authorDetails");
        url.searchParams.set("key", this.cfg.apiKey!);
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await fetch(url, { signal });
        if (!res.ok) {
          if (res.status === 403) {
            console.warn("[YouTube] Chat poll returned 403 — stopping.");
            return;
          }
          console.warn(
            `[YouTube] Poll error: ${res.status} ${res.statusText}`
          );
          await sleep(5000, signal);
          continue;
        }

        const data = (await res.json()) as LiveChatResponse;
        pageToken = data.nextPageToken;

        if (data.items) {
          for (const item of data.items) {
            const author = item.authorDetails.displayName;
            const text =
              item.snippet.displayMessage ??
              item.snippet.superChatDetails?.userComment;
            if (!text?.trim()) continue;

            this.onInbound({
              platform: "youtube",
              authorDisplayName: author,
              rawText: text.trim(),
              privileges: {
                canModerate:
                  item.authorDetails.isChatModerator ||
                  item.authorDetails.isChatOwner,
              },
              reply: (replyText) => {
                console.log(`[YouTube] BOT REPLY: ${replyText}`);
              },
            });
          }
        }

        const interval = data.pollingIntervalMillis ?? 5000;
        await sleep(interval, signal);
      } catch (err) {
        if (signal.aborted) return;
        console.error("[YouTube] Poll loop error:", toErrorMessage(err));
        await sleep(5000, signal).catch(() => { });
      }
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
