import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGateway } from "./backend-gateway.mjs";

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${server.address().port}`),
    ),
  );
const close = (server) => new Promise((resolve) => server.close(resolve));

test("gateway enforces origins, upload limits, persistence and expiry", async () => {
  const directory = mkdtempSync(join(tmpdir(), "portfolio-gateway-"));
  const upstreamServer = createServer((request, response) => {
    request.resume();
    response.setHeader("Content-Type", "application/json");
    response.end('{"ok":true}');
  });
  const upstream = await listen(upstreamServer);
  let time = Date.now();
  const options = {
    upstream,
    database: join(directory, "limits.sqlite"),
    now: () => time,
  };
  let gateway = createGateway(options);
  let address = await listen(gateway);
  const upload = () =>
    fetch(address + "/api/holdings", {
      method: "POST",
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "1.2.3.4",
        Origin: "https://andrew-salib.github.io",
      },
    });
  try {
    assert.equal(
      (
        await fetch(address + "/api/search", {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(address + "/private")).status, 404);
    for (let index = 0; index < 3; index++) assert.equal((await upload()).status, 200);
    const blocked = await upload();
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("Retry-After")) > 0);
    await close(gateway);
    gateway = createGateway(options);
    address = await listen(gateway);
    assert.equal((await upload()).status, 429);
    time += 15 * 60_000 + 1;
    assert.equal((await upload()).status, 200);
    const oversized = await fetch(address + "/api/holdings", {
      method: "POST",
      body: "x".repeat(2 * 1024 * 1024 + 1),
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(oversized.status, 413);
  } finally {
    await close(gateway);
    await close(upstreamServer);
    rmSync(directory, { recursive: true, force: true });
  }
});
