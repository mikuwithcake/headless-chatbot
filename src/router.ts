import type { AppConfig } from "./config.js";
import type { NormalizedChatMessage } from "./connections/types.js";
import type { RaffleService } from "./raffle.js";
import { createLogger } from "./logger.js";

const log = createLogger("router");

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
    log.trace(`!raffle from "${name}" (${msg.platform})`);
    const r = raffle.enter(name);
    if (!r.ok) {
      if (r.reason === "locked") {
        log.debug(`Turned "${name}" away — raffle already drawn, submissions closed`);
        msg.reply(`@${name}, the raffle is closed — a winner has already been drawn!`);
        return;
      }
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
    log.debug(`!clearraffle from "${msg.authorDisplayName}" — dropping ${count} entries`);
    raffle.clear();
    msg.reply(`Raffle cleared! Removed ${count} entries. Submissions are open again.`);
    return;
  }

  if (text === "!drawraffle") {
    if (!msg.privileges.canModerate) return;
    log.debug(`!drawraffle from "${msg.authorDisplayName}" — ${raffle.entryCount} entries in play`);
    const result = raffle.draw();
    if (!result) {
      msg.reply("No entries in the raffle yet!");
      return;
    }
    const tally =
      result.wins && result.wins > 1 ? ` (win #${result.wins})` : "";
    msg.reply(
      `The raffle winner is: @${result.winner}!${tally} Submissions are now closed — !clearraffle to start a new round.`
    );
  }
}
