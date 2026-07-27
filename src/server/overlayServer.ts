import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import type { RaffleService, RaffleSnapshot, DrawResult } from "../raffle.js";
import { retentionDays } from "../database.js";
import type { WinnerDatabase } from "../database.js";
import { createLogger } from "../logger.js";
import { WHEEL_HTML, HISTORY_HTML } from "./assets.generated.js";

const log = createLogger("overlay");

function sseWrite(res: ServerResponse, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

export function startOverlayServer(
  raffle: RaffleService,
  opts: { host: string; port: number; db?: WinnerDatabase | null }
): Promise<{ close: () => Promise<void> }> {
  const clients = new Set<ServerResponse>();
  const db = opts.db ?? null;

  const broadcast = (event: string, payload: unknown): void => {
    const data = JSON.stringify(payload);
    log.trace(`Broadcasting "${event}" to ${clients.size} client(s):`, data);
    for (const res of clients) {
      sseWrite(res, event, data);
    }
  };

  const onUpdate = (snap: RaffleSnapshot): void => {
    broadcast("update", snap);
  };
  const onDraw = (payload: DrawResult): void => {
    broadcast("draw", payload);
  };

  raffle.on("update", onUpdate);
  raffle.on("draw", onDraw);

  const server = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "/";
    log.trace(`${req.method ?? "?"} ${req.url ?? "?"}`);

    if (req.method === "GET" && path === "/") {
      html(res, WHEEL_HTML);
      return;
    }

    if (req.method === "GET" && (path === "/history" || path === "/winners")) {
      html(res, HISTORY_HTML);
      return;
    }

    if (req.method === "GET" && path === "/api/raffle") {
      json(res, 200, raffle.getSnapshot());
      return;
    }

    if (req.method === "GET" && path === "/api/history") {
      json(res, 200, {
        path: db?.path ?? null,
        retentionDays: retentionDays(),
        totalWins: db?.totalWins() ?? 0,
        winners: db?.list() ?? [],
      });
      return;
    }

    if (req.method === "GET" && path === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      clients.add(res);
      log.debug(`SSE client connected (${clients.size} total)`);
      sseWrite(res, "update", JSON.stringify(raffle.getSnapshot()));
      req.on("close", () => {
        clients.delete(res);
        log.debug(`SSE client disconnected (${clients.size} left)`);
      });
      return;
    }

    if (req.method === "POST" && path === "/api/draw") {
      const result = raffle.draw();
      if (result) {
        json(res, 200, { ok: true, ...result });
      } else {
        json(res, 200, { ok: false, error: "no_entries" });
      }
      return;
    }

    if (req.method === "POST" && path === "/api/clear") {
      raffle.clear();
      json(res, 200, { ok: true });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => {
      const showHost = opts.host === "0.0.0.0" ? "127.0.0.1" : opts.host;
      console.log(
        `[overlay] http://${showHost}:${opts.port}/ (bind ${opts.host}:${opts.port})`
      );
      console.log(
        `[overlay] Winner history: http://${showHost}:${opts.port}/history`
      );
      console.log(
        `[overlay] Local draw test (no chat): open http://${showHost}:${opts.port}/?dev=1 — buttons call POST /api/draw`
      );
      resolve({
        close: () =>
          new Promise((resClose, rejClose) => {
            raffle.off("update", onUpdate);
            raffle.off("draw", onDraw);
            for (const c of clients) {
              try {
                c.end();
              } catch {
                /* ignore */
              }
            }
            clients.clear();
            server.close((err) => (err ? rejClose(err) : resClose()));
          }),
      });
    });
  });
}
