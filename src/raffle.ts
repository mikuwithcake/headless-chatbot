import { EventEmitter } from "node:events";

export interface RaffleSnapshot {
  entries: readonly string[];
  lastWinner: string | null;
}

export class RaffleService extends EventEmitter {
  private entries: string[] = [];
  private lastWinner: string | null = null;

  get entryCount(): number {
    return this.entries.length;
  }

  getSnapshot(): RaffleSnapshot {
    return {
      entries: [...this.entries],
      lastWinner: this.lastWinner,
    };
  }

  seedEntries(names: readonly string[]): void {
    this.entries = [...names];
    this.emit("update", this.getSnapshot());
  }

  enter(username: string): { ok: true } | { ok: false; reason: "duplicate" } {
    if (this.entries.includes(username)) {
      return { ok: false, reason: "duplicate" };
    }
    this.entries.push(username);
    this.emit("update", this.getSnapshot());
    return { ok: true };
  }

  clear(): void {
    this.entries = [];
    this.emit("update", this.getSnapshot());
  }

  draw(): { winner: string } | null {
    if (this.entries.length === 0) return null;
    const idx = Math.floor(Math.random() * this.entries.length);
    const winner = this.entries[idx]!;
    this.lastWinner = winner;
    this.emit("draw", { winner });
    this.emit("update", this.getSnapshot());
    return { winner };
  }
}
