import { sourceVersion } from "./backend-version.mjs";

export async function checkBackend(base, expected) {
  if (!base) throw new Error("API_URL is missing.");
  const response = await fetch(`${base.replace(/\/$/, "")}/api/deployment`, {
    signal: AbortSignal.timeout(10000),
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) throw new Error(`Backend health returned ${response.status}.`);
  const health = await response.json();
  if (health.version !== expected) throw new Error("Laptop backend build is outdated.");
}

if (process.argv[1]?.endsWith("check-backend-deployment.mjs")) {
  const expected = sourceVersion();
  let failure;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await checkBackend(process.env.API_URL, expected);
      console.log("Live backend matches this deployment and its API is healthy.");
      failure = null;
      break;
    } catch (error) {
      failure = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  if (failure) {
    console.error(failure.message);
    console.error(
      "Deploy blocked. On the laptop, use merged main, apply required migrations/seeds, run npm run build, then restart the backend/tunnel. Rerun Pages after API_URL updates.",
    );
    process.exitCode = 1;
  }
}
