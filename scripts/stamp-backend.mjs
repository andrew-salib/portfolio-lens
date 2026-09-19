import { mkdirSync, writeFileSync } from "node:fs";
import { artifactVersion, sourceVersion } from "./backend-version.mjs";

mkdirSync("backend-data", { recursive: true });
writeFileSync(
  "backend-data/build-version.json",
  JSON.stringify({ source: sourceVersion(), artifact: artifactVersion() }) + "\n",
);
