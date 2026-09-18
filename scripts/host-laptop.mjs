import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";

const project = fileURLToPath(new URL("../", import.meta.url));
process.chdir(project);
mkdirSync("backend-data", { recursive: true });
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
  setTimeout(() => process.exit(code), 500).unref();
}

function start(command, args, piped = false) {
  const child = spawn(command, args, {
    cwd: project,
    env: process.env,
    stdio: piped ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", () => {
    if (!stopping) stop(1);
  });
  return child;
}

process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());

start(process.execPath, [
  "--import",
  "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js",
  "dev",
  "--config",
  "dist/server/wrangler.json",
  "--local",
  "--persist-to",
  ".wrangler/state",
  "--ip",
  "127.0.0.1",
  "--port",
  "8787",
  "--inspector-port",
  "0",
]);
start(process.execPath, ["--experimental-sqlite", "scripts/backend-gateway.mjs"]);
start("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)]);

for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const result = await fetch("http://127.0.0.1:8787/api/search?kind=fund&q=VGS");
    if (result.ok) break;
  } catch {
    /* Wait for the production worker to start. */
  }
  if (attempt === 59) {
    stop(1);
    throw new Error("Backend failed to start");
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const tunnel = start(
  "cloudflared",
  ["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8788"],
  true,
);
let output = "";
let published = false;
function tunnelOutput(chunk) {
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-16000);
  const address = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!address || published) return;
  published = true;
  writeFileSync("backend-data/tunnel-url.txt", address + "\n");
  try {
    execFileSync(
      "gh",
      [
        "variable",
        "set",
        "API_URL",
        "--body",
        address,
        "--repo",
        "andrew-salib/portfolio-lens",
      ],
      { stdio: "inherit" },
    );
    execFileSync(
      "gh",
      [
        "workflow",
        "run",
        "pages.yml",
        "--ref",
        "main",
        "--repo",
        "andrew-salib/portfolio-lens",
      ],
      { stdio: "inherit" },
    );
    console.log("GitHub Pages is rebuilding with the current laptop address.");
  } catch {
    console.error("Could not update Pages. Set API_URL and rerun pages.yml.");
  }
}
tunnel.stdout.on("data", tunnelOutput);
tunnel.stderr.on("data", tunnelOutput);
