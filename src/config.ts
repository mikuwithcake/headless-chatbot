function parseEnvBool(key: string, autoWhenUnset: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return autoWhenUnset;
  const v = raw.toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  if (v === "true" || v === "1" || v === "yes") return true;
  return autoWhenUnset;
}

export interface TwitchConfig {
  username?: string;
  oauthToken?: string;
  channel: string;
}

export interface YoutubeConfig {
  channelId: string;
  apiKey?: string;
}

export interface OverlayConfig {
  host: string;
  port: number;
}

export interface AppConfig {
  debug: boolean;
  twitch: TwitchConfig | null;
  youtube: YoutubeConfig | null;
  overlay: OverlayConfig;
}

function buildTwitchConfig(): TwitchConfig | null {
  const channel = process.env.TWITCH_CHANNEL?.trim() ?? "";
  if (!channel) return null;
  const username = process.env.TWITCH_USERNAME?.trim() || undefined;
  const oauthToken = process.env.TWITCH_OAUTH_TOKEN?.trim() || undefined;
  return { channel, username, oauthToken };
}

function buildYoutubeConfig(): YoutubeConfig | null {
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  if (!channelId) return null;
  const apiKey = process.env.YOUTUBE_API_KEY?.trim() || undefined;
  return { channelId, apiKey };
}

function overlayPort(): number {
  const raw = process.env.OVERLAY_PORT;
  if (!raw?.trim()) return 3847;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) {
    console.warn(
      `[config] Invalid OVERLAY_PORT "${raw}", using default 3847.`
    );
    return 3847;
  }
  return n;
}

function overlayHost(): string {
  const h = process.env.OVERLAY_HOST?.trim();
  if (h) return h;
  return "127.0.0.1";
}

export function loadConfig(): AppConfig {
  const debug = parseEnvBool("DEBUG", false);
  return {
    debug,
    twitch: buildTwitchConfig(),
    youtube: buildYoutubeConfig(),
    overlay: { host: overlayHost(), port: overlayPort() },
  };
}
