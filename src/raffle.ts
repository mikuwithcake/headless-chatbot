import { EventEmitter } from "node:events";
import type { WinnerDatabase, WinnerRecord } from "./database.js";
import { createLogger } from "./logger.js";

const log = createLogger("raffle");

export interface RaffleSnapshot {
  entries: readonly string[];
  /**
   * Subset of `entries` who joined with !feelalive: draw them and we re-roll by
   * hand. The wheel paints their segment black so we can see it happen live.
   */
  feelAlive: readonly string[];
  lastWinner: string | null;
  /** True once a draw has happened: no new entries until the raffle is cleared. */
  locked: boolean;
}

export interface DrawResult {
  winner: string;
  /** Total lifetime wins for this name, null when no database is attached. */
  wins: number | null;
  /** ISO timestamp of the win before this one, null if this was their first. */
  previousWonAt: string | null;
}

export type EnterResult =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "locked" };

export class RaffleService extends EventEmitter {
  private entries: string[] = [];
  private feelAlive: string[] = [];
  private lastWinner: string | null = null;
  private locked = false;

  constructor(private readonly db: WinnerDatabase | null = null) {
    super();
  }

  get entryCount(): number {
    return this.entries.length;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  getSnapshot(): RaffleSnapshot {
    return {
      entries: [...this.entries],
      feelAlive: [...this.feelAlive],
      lastWinner: this.lastWinner,
      locked: this.locked,
    };
  }

  seedEntries(names: readonly string[]): void {
    this.entries = [...names];
    this.feelAlive = [];
    this.locked = false;
    log.debug(`Seeded ${this.entries.length} entries, lock released`);
    log.trace("Seeded entries:", this.entries);
    this.emit("update", this.getSnapshot());
  }

  /**
   * @param feelAlive Entered via !feelalive — flag them for a manual re-roll.
   *   The duplicate check runs first, so this never converts an existing entry
   *   either way: whichever command got them onto the wheel is the one that sticks.
   */
  enter(username: string, feelAlive = false): EnterResult {
    log.trace(
      `enter("${username}", feelAlive=${feelAlive}) — locked=${this.locked}, entries=${this.entries.length}`
    );

    if (this.locked) {
      log.debug(
        `Rejected "${username}": raffle is locked (a draw has run; !clearraffle to reopen)`
      );
      return { ok: false, reason: "locked" };
    }
    if (this.entries.includes(username)) {
      log.debug(`Rejected "${username}": already entered`);
      return { ok: false, reason: "duplicate" };
    }

    this.entries.push(username);
    if (feelAlive) this.feelAlive.push(username);
    log.debug(
      `Accepted "${username}"${feelAlive ? " (feelalive — black on the wheel)" : ""} — ${this.entries.length} entries total`
    );
    this.emit("update", this.getSnapshot());
    return { ok: true };
  }

  clear(): void {
    const had = this.entries.length;
    this.entries = [];
    this.feelAlive = [];
    this.locked = false;
    log.debug(`Cleared ${had} entries, lock released — accepting submissions again`);
    this.emit("update", this.getSnapshot());
  }

  draw(): DrawResult | null {
    log.trace(`draw() — locked=${this.locked}, entries=${this.entries.length}`);

    if (this.entries.length === 0) {
      log.debug("Draw requested with no entries — nothing to spin");
      return null;
    }

    // Lock first: the wheel state is now frozen for the spin animation, and any
    // entry added past this point would never show up on the rendered wheel.
    if (!this.locked) {
      this.locked = true;
      log.debug(`Locked the raffle at ${this.entries.length} entries — no further submissions`);
    }

    const idx = Math.floor(Math.random() * this.entries.length);
    const winner = this.entries[idx]!;
    this.lastWinner = winner;

    let record: WinnerRecord | null = null;
    const previousWonAt = this.db?.get(winner)?.lastWonAt ?? null;
    if (this.db) {
      record = this.db.recordWin(winner);
    }

    const result: DrawResult = {
      winner,
      wins: record?.wins ?? null,
      previousWonAt,
    };
    log.debug(
      `Winner: "${winner}" (index ${idx} of ${this.entries.length}), lifetime wins=${result.wins ?? "n/a"}`
    );

    this.emit("draw", result);
    this.emit("update", this.getSnapshot());
    return result;
  }
}
