import type { AppConfig } from "./config.js";
import type { NormalizedChatMessage } from "./connections/types.js";
import type { RaffleService } from "./raffle.js";

export function handleChatMessage(
  config: AppConfig,
  msg: NormalizedChatMessage,
  raffle: RaffleService
): void {
  const text = msg.rawText.trim();
  if (config.debug) {
    console.log(`[debug][${msg.platform}] ${msg.authorDisplayName}: ${msg.rawText}`);
  }

  if (text === "!raffle") {
    const name = msg.authorDisplayName;
    const r = raffle.enter(name);
    if (!r.ok) {
      msg.reply(`@${name}, you're already in the raffle!`);
      return;
    }
    msg.reply(
      `@${name} has entered the raffle! (${raffle.entryCount} entries)`
    );
    return;
  }

  if (text === "!clearraffle") {
    if (!msg.privileges.canModerate) return;
    const count = raffle.entryCount;
    raffle.clear();
    msg.reply(`Raffle cleared! Removed ${count} entries.`);
    return;
  }

  if (text === "!drawraffle") {
    if (!msg.privileges.canModerate) return;
    const result = raffle.draw();
    if (!result) {
      msg.reply("No entries in the raffle yet!");
      return;
    }
    msg.reply(`The raffle winner is: @${result.winner}!`);
  }
}
