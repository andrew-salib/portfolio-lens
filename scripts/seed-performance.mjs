import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { funds } from "../lib/portfolio.ts";

const records = JSON.parse(readFileSync("lib/performance-snapshots.json", "utf8"));
const holdings = JSON.parse(readFileSync("lib/snapshots.json", "utf8"));
const sql = (value) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : "'" + value.replaceAll("'", "''") + "'";
const statements = records.flatMap((record) => {
  const fund = funds.find((item) => item.ticker === record.ticker);
  if (!fund) throw new Error(`Missing ETF definition: ${record.ticker}`);
  for (const years of [1, 3, 5, 10]) {
    const value = record.returns[years];
    if (value !== null && (!Number.isFinite(value) || value < -100)) {
      throw new Error(`Invalid return for ${record.ticker}: ${years}`);
    }
  }
  return [
    `INSERT INTO etfs (ticker, name, holdings_as_of, last_synced_at)
     VALUES (${sql(record.ticker)}, ${sql(fund.name)}, ${sql(holdings[record.ticker]?.date || "Not loaded")},
       ${sql(record.fetchedAt)}) ON CONFLICT(ticker) DO NOTHING;`,
    `INSERT INTO performance (etf_id, one_year, three_year_pa, five_year_pa,
      ten_year_pa, as_of, fetched_at, currency, source_url, basis)
     VALUES ((SELECT id FROM etfs WHERE ticker = ${sql(record.ticker)}),
       ${[
         ...[1, 3, 5, 10].map((year) => record.returns[year]),
         record.asOf,
         record.fetchedAt,
         record.currency,
         record.sourceUrl,
         record.basis,
       ]
         .map(sql)
         .join(", ")})
     ON CONFLICT(etf_id) DO UPDATE SET
       one_year = excluded.one_year, three_year_pa = excluded.three_year_pa,
       five_year_pa = excluded.five_year_pa, ten_year_pa = excluded.ten_year_pa,
       as_of = excluded.as_of, fetched_at = excluded.fetched_at,
       currency = excluded.currency, source_url = excluded.source_url,
       basis = excluded.basis
     WHERE excluded.as_of >= performance.as_of;`,
  ];
});
mkdirSync("backend-data", { recursive: true });
const filename = "backend-data/seed-performance.sql";
writeFileSync(filename, statements.join("\n"));
if (!process.argv.includes("--sql-only")) {
  execFileSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "./node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
      "--file",
      filename,
    ],
    { stdio: "inherit" },
  );
}
console.log(`Prepared ${records.length} verified issuer performance records.`);
