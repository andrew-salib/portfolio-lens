import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in " +
        ".openai/hosting.json to `DB` before using the database.",
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1Database() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in " +
        ".openai/hosting.json to `DB` before using ETF storage.",
    );
  }

  return env.DB;
}
