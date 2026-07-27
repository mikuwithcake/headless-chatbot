import "dotenv/config";
import { loadConfig } from "./config.js";
import { WinnerDatabase } from "./database.js";
import { RaffleService } from "./raffle.js";
import { handleChatMessage } from "./router.js";
import { TwitchConnection } from "./connections/twitch.js";
import { YoutubeConnection } from "./connections/youtube.js";
import { YoutubeiConnection } from "./connections/youtubei.js";
import { startOverlayServer } from "./server/overlayServer.js";
import type { ChatConnection, NormalizedChatMessage } from "./connections/types.js";
import { toErrorMessage } from "./utils.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = WinnerDatabase.load();
  const raffle = new RaffleService(db);

  const overlay = await startOverlayServer(raffle, {
    host: config.overlay.host,
    port: config.overlay.port,
    db,
  });

  const onChatMessage = (msg: NormalizedChatMessage): void => {
    handleChatMessage(config, msg, raffle);
  };

  const connections: ChatConnection[] = [];

  if (config.twitch) {
    connections.push(new TwitchConnection(config.twitch, onChatMessage));
  }
  if (config.youtube) {
    const YTClass = config.youtube.apiKey ? YoutubeConnection : YoutubeiConnection;
    connections.push(new YTClass(config.youtube, onChatMessage));
  }

  for (const c of connections) {
    try {
      await c.start();
    } catch (err) {
      console.error("[bootstrap] Connection start failed:", toErrorMessage(err));
    }
  }

  if (connections.length === 0) {
    console.log("[bootstrap] No chat connections started (overlay only).");
  }

  const shutdown = async (): Promise<void> => {
    console.log("\nShutting down...");
    await Promise.all([
      ...connections.map((c) =>
        c.stop().catch((e: unknown) => {
          console.error(e);
        })
      ),
      overlay.close(),
    ]);
    process.exit(0);
  };

  const onSignal = (): void => { void shutdown(); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

void main();
