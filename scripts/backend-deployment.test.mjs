import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createGateway } from "./backend-gateway.mjs";
import { checkBackend } from "./check-backend-deployment.mjs";

test("deployment gate rejects stale builds and missing database data", async () => {
  let seeded = true;
  const upstream = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify(
        request.url.includes("performance")
          ? { performance: seeded ? { ticker: "IVV" } : null }
          : { results: [] },
      ),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const gateway = createGateway({
    database: ":memory:",
    version: "current-build",
    upstream: `http://127.0.0.1:${upstream.address().port}`,
  });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const base = `http://127.0.0.1:${gateway.address().port}`;
  try {
    await checkBackend(base, "current-build");
    await assert.rejects(checkBackend(base, "new-build"), /outdated/);
    seeded = false;
    await assert.rejects(checkBackend(base, "current-build"), /503/);
    await assert.rejects(checkBackend("", "current-build"), /missing/);
  } finally {
    gateway.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => gateway.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  }
});
