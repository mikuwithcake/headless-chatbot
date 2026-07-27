import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogger } from "./logger.js";
import { toErrorMessage } from "./utils.js";

const log = createLogger("db");

export const DATABASE_VERSION = 1;

export interface WinnerRecord {
  /** Display name as it was last seen in chat. */
  name: string;
  wins: number;
  firstWonAt: string;
  lastWonAt: string;
}

interface DatabaseFile {
  version: number;
  updatedAt: string;
  winners: WinnerRecord[];
}

/** Case-insensitive identity so "Mert" and "mert" are the same human. */
function keyOf(name: string): string {
  return name.trim().toLowerCase();
}

export function databasePath(): string {
  const override = process.env.DATABASE_PATH?.trim();
  return override ? resolve(override) : join(process.cwd(), "database.json");
}

export const DEFAULT_RETENTION_DAYS = 7;

/** How long a winner stays in the tally, in days. 0 disables pruning. */
export function retentionDays(): number {
  const raw = process.env.WINNER_RETENTION_DAYS?.trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) {
    log.warn(`Invalid WINNER_RETENTION_DAYS "${raw}", using ${DEFAULT_RETENTION_DAYS}.`);
    return DEFAULT_RETENTION_DAYS;
  }
  return n;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseWinners(raw: unknown): WinnerRecord[] {
  if (!isRecord(raw) || !Array.isArray(raw.winners)) return [];
  const out: WinnerRecord[] = [];
  for (const entry of raw.winners) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === "string" ? entry.name : "";
    if (!name.trim()) continue;
    const wins = typeof entry.wins === "number" && entry.wins > 0 ? Math.floor(entry.wins) : 1;
    const lastWonAt = typeof entry.lastWonAt === "string" ? entry.lastWonAt : new Date(0).toISOString();
    const firstWonAt = typeof entry.firstWonAt === "string" ? entry.firstWonAt : lastWonAt;
    out.push({ name, wins, firstWonAt, lastWonAt });
  }
  return out;
}

/**
 * Winner tally persisted to a plain JSON file next to the executable's cwd.
 * Kept fully in memory; every write rewrites the file atomically (tmp + rename).
 */
export class WinnerDatabase {
  private readonly winners = new Map<string, WinnerRecord>();

  private constructor(private readonly file: string) {}

  static load(file: string = databasePath()): WinnerDatabase {
    const db = new WinnerDatabase(file);
    log.debug(`Loading winner database from ${file}`);

    if (!existsSync(file)) {
      log.info(`No database at ${file} yet — starting a fresh one.`);
      return db;
    }

    try {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
      for (const rec of parseWinners(parsed)) {
        db.winners.set(keyOf(rec.name), rec);
      }
      log.info(`Loaded ${db.winners.size} winner(s) from ${file}`);
      log.trace("Loaded records:", db.list());
      db.prune();
    } catch (err) {
      log.error(`Could not read ${file} (${toErrorMessage(err)}) — continuing with an empty tally.`);
    }
    return db;
  }

  /**
   * Drops anyone whose last win is older than the retention window. Runs once at
   * startup — a pruned name is simply treated as a first-time winner afterwards.
   */
  private prune(): void {
    const days = retentionDays();
    if (days === 0) {
      log.debug("WINNER_RETENTION_DAYS=0 — keeping every winner forever.");
      return;
    }

    const cutoff = Date.now() - days * 86_400_000;
    const dropped: string[] = [];
    for (const [key, rec] of this.winners) {
      const at = Date.parse(rec.lastWonAt);
      // An unparseable timestamp is stale by definition — drop it too.
      if (!Number.isFinite(at) || at < cutoff) {
        this.winners.delete(key);
        dropped.push(`${rec.name} (last won ${rec.lastWonAt})`);
      }
    }

    if (dropped.length === 0) {
      log.debug(`Nothing older than ${days} day(s) to prune — ${this.winners.size} winner(s) kept.`);
      return;
    }
    log.info(
      `Pruned ${dropped.length} winner(s) not seen in the last ${days} day(s); ${this.winners.size} kept.`
    );
    log.debug("Pruned:", dropped.join(", "));
    this.save();
  }

  get path(): string {
    return this.file;
  }

  /** Most wins first, then most recent win. */
  list(): WinnerRecord[] {
    return [...this.winners.values()].sort(
      (a, b) => b.wins - a.wins || b.lastWonAt.localeCompare(a.lastWonAt)
    );
  }

  get(name: string): WinnerRecord | null {
    return this.winners.get(keyOf(name)) ?? null;
  }

  totalWins(): number {
    let n = 0;
    for (const rec of this.winners.values()) n += rec.wins;
    return n;
  }

  /** Bumps the tally for `name`, persists, and returns the updated record. */
  recordWin(name: string): WinnerRecord {
    const key = keyOf(name);
    const now = new Date().toISOString();
    const existing = this.winners.get(key);

    const record: WinnerRecord = existing
      ? { name, wins: existing.wins + 1, firstWonAt: existing.firstWonAt, lastWonAt: now }
      : { name, wins: 1, firstWonAt: now, lastWonAt: now };

    this.winners.set(key, record);
    log.debug(
      `Recorded win for "${name}" (key=${key}) — now ${record.wins} win(s), previous win ${existing?.lastWonAt ?? "never"}`
    );
    this.save();
    return record;
  }

  private save(): void {
    const payload: DatabaseFile = {
      version: DATABASE_VERSION,
      updatedAt: new Date().toISOString(),
      winners: this.list(),
    };
    const tmp = `${this.file}.tmp`;
    try {
      writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
      renameSync(tmp, this.file);
      log.trace(`Persisted ${payload.winners.length} winner(s) to ${this.file}`);
    } catch (err) {
      log.error(`Failed to persist ${this.file}: ${toErrorMessage(err)}`);
    }
  }
}
