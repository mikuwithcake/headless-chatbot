export type ChatPlatform = "twitch" | "youtube";

export interface ChatPrivileges {
  /** True if the user may run mod-only commands (!clearraffle, !drawraffle). */
  canModerate: boolean;
}

export interface NormalizedChatMessage {
  platform: ChatPlatform;
  authorDisplayName: string;
  rawText: string;
  privileges: ChatPrivileges;
  reply: (text: string) => void;
}

export interface ChatConnection {
  start(): Promise<void>;
  stop(): Promise<void>;
}
