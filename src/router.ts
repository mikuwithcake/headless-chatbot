import type { AppConfig } from "./config.js";
import type { NormalizedChatMessage } from "./connections/types.js";
import type { RaffleService } from "./raffle.js";
import { createLogger } from "./logger.js";

const log = createLogger("router");

type Command = "raffle" | "feelalive" | "clearraffle" | "drawraffle";

/** Every spelling we answer to, aliases included. Keys must be lowercase. */
const COMMANDS: Readonly<Record<string, Command>> = {
  "!raffle": "raffle",
  "!feelalive": "feelalive",
  "!clearraffle": "clearraffle",
  "!cr": "clearraffle",
  "!drawraffle": "drawraffle",
  "!dr": "drawraffle",
};

export function handleChatMessage(
  config: AppConfig,
  msg: NormalizedChatMessage,
  raffle: RaffleService
): void {
  const text = msg.rawText.trim();
  if (config.debug) {
    console.log(`[debug][${msg.platform}] ${msg.authorDisplayName}: ${msg.rawText}`);
  }

  const command = COMMANDS[text.toLowerCase()];
  if (!command) return;

  if (command === "raffle" || command === "feelalive") {
    const feelAlive = command === "feelalive";
    const name = msg.authorDisplayName;
    log.trace(`!${command} from "${name}" (${msg.platform})`);
    const r = raffle.enter(name, feelAlive);
    if (!r.ok) {
      if (r.reason === "locked") {
        log.debug(`Turned "${name}" away — raffle already drawn, submissions closed`);
        msg.reply(`@${name}, the raffle is closed — a winner has already been drawn!`);
        return;
      }
      // Already on the wheel, so !raffle and !feelalive are both no-ops here —
      // neither one can flip an entry that is already in.
      msg.reply(`@${name}, you're already in the raffle!`);
      return;
    }
    msg.reply(
      feelAlive
        ? `@${name} has entered the raffle — blacked out, re-roll if they win! (${raffle.entryCount} entries)`
        : `@${name} has entered the raffle! (${raffle.entryCount} entries)`
    );
    return;
  }

  if (command === "clearraffle") {
    if (!msg.privileges.canModerate) return;
    const count = raffle.entryCount;
    log.debug(`!clearraffle from "${msg.authorDisplayName}" — dropping ${count} entries`);
    raffle.clear();
    msg.reply(`Raffle cleared! Removed ${count} entries. Submissions are open again.`);
    return;
  }

  if (command === "drawraffle") {
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
