import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function sourceVersion() {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((file) =>
      /^(app\/api\/|build\/|\.openai\/|db\/|drizzle\/|lib\/|scripts\/|package.*\.json$|vite\.config\.|wrangler\.|tsconfig\.)/.test(
        file,
      ),
    )
    .sort();
  return hashFiles(files);
}

function hashFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file + "\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function artifactVersion(directory = "dist") {
  function walk(path) {
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const child = join(path, entry.name);
      return entry.isDirectory() ? walk(child) : [child];
    });
  }
  return hashFiles(walk(directory).sort());
}
