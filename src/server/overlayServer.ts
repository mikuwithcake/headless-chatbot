import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import type { RaffleService, RaffleSnapshot } from "../raffle.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WHEEL_HTML = readFileSync(join(__dirname, "wheel.html"), "utf-8");

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

export function startOverlayServer(
  raffle: RaffleService,
  opts: { host: string; port: number }
): Promise<{ close: () => Promise<void> }> {
  const clients = new Set<ServerResponse>();

  const broadcast = (event: string, payload: unknown): void => {
    const data = JSON.stringify(payload);
    for (const res of clients) {
      sseWrite(res, event, data);
    }
  };

  const onUpdate = (snap: RaffleSnapshot): void => {
    broadcast("update", snap);
  };
  const onDraw = (payload: { winner: string }): void => {
    broadcast("draw", payload);
  };

  raffle.on("update", onUpdate);
  raffle.on("draw", onDraw);

  const server = createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "/";

    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(WHEEL_HTML);
      return;
    }

    if (req.method === "GET" && path === "/api/raffle") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(raffle.getSnapshot()));
      return;
    }

    if (req.method === "GET" && path === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      clients.add(res);
      sseWrite(res, "update", JSON.stringify(raffle.getSnapshot()));
      req.on("close", () => {
        clients.delete(res);
      });
      return;
    }

    if (req.method === "POST" && path === "/api/draw") {
      const result = raffle.draw();
      if (result) {
        json(res, 200, { ok: true, winner: result.winner });
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
