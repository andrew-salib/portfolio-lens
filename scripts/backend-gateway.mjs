import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ROUTES = new Set([
  "/api/search",
  "/api/securities",
  "/api/holdings",
  "/api/performance",
]);

export function createGateway({
  upstream = "http://127.0.0.1:8787",
  origin = "https://andrew-salib.github.io",
  database = "backend-data/rate-limits.sqlite",
  now = Date.now,
} = {}) {
  if (database !== ":memory:")
    mkdirSync(dirname(resolve(database)), { recursive: true });
  const storage = new DatabaseSync(database);
  storage.exec(`CREATE TABLE IF NOT EXISTS limits (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
  )`);
  const consume = storage.prepare(`
    INSERT INTO limits (key, count, expires) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN expires <= ? THEN 1 ELSE count + 1 END,
      expires = CASE WHEN expires <= ? THEN excluded.expires ELSE expires END
    RETURNING count, expires
  `);
  let activeUploads = 0;

  const server = createServer(async (request, response) => {
    const send = (status, message, extra = {}) => {
      response.writeHead(status, { "Content-Type": "application/json", ...extra });
      response.end(JSON.stringify({ error: message }));
    };
    response.setHeader("Vary", "Origin");
    response.setHeader("Cache-Control", "no-store");
    if (request.headers.origin && request.headers.origin !== origin) {
      return send(403, "Origin is not allowed.");
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Expose-Headers", "Retry-After");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      return response.end();
    }
    const url = new URL(request.url, "http://localhost");
    if (!ROUTES.has(url.pathname)) return send(404, "Not found.");
    const upload = request.method === "POST" && url.pathname === "/api/holdings";
    if (request.method !== "GET" && !upload) return send(405, "Method not allowed.");

    // Only expose this loopback listener through cloudflared, which supplies this IP.
    const identity = request.headers["cf-connecting-ip"] || "local";
    const expensive = upload || url.searchParams.get("refresh") === "1";
    const timestamp = now();
    storage.prepare("DELETE FROM limits WHERE expires <= ?").run(timestamp);
    const budgets = [["read:" + identity, 120, 60_000]];
    if (expensive)
      budgets.push(
        ["upload:" + identity, 3, 15 * 60_000],
        ["upload:global", 20, 60 * 60_000],
      );
    for (const [key, limit, window] of budgets) {
      const row = consume.get(key, timestamp + window, timestamp, timestamp);
      if (row.count > limit) {
        const retry = Math.max(1, Math.ceil((row.expires - timestamp) / 1000));
        return send(429, `Too many requests. Try again in ${retry} seconds.`, {
          "Retry-After": String(retry),
        });
      }
    }
    if (upload && activeUploads >= 1)
      return send(429, "Another import is running. Try again shortly.", {
        "Retry-After": "30",
      });
    if (upload && !request.headers["content-type"]?.startsWith("application/json")) {
      return send(415, "Send a JSON holdings document.");
    }
    if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) {
      return send(413, "Upload exceeds the 2 MB limit.");
    }
    if (upload) activeUploads++;
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) return send(413, "Upload exceeds the 2 MB limit.");
        chunks.push(chunk);
      }
      const result = await fetch(upstream + url.pathname + url.search, {
        method: request.method,
        headers: upload ? { "Content-Type": "application/json" } : {},
        body: upload ? Buffer.concat(chunks) : undefined,
        signal: AbortSignal.timeout(25000),
      });
      response.writeHead(result.status, { "Content-Type": "application/json" });
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      if (!response.headersSent) send(503, "Laptop backend is unavailable.");
      else response.end();
    } finally {
      if (upload) activeUploads--;
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on("close", () => storage.close());
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createGateway({ origin: process.env.FRONTEND_ORIGIN });
  server.listen(8788, "127.0.0.1", () => {
    console.log("Protected backend: http://127.0.0.1:8788");
  });
}
