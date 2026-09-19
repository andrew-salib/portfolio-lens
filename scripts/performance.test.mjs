import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("performance seeds preserve issuer values, missing periods and ETF relationships", () => {
  execFileSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/seed-performance.mjs",
    "--sql-only",
  ]);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const filename of [
      "0000_rare_abomination.sql",
      "0001_sturdy_black_cat.sql",
      "0002_flawless_prism.sql",
    ]) {
      db.exec(readFileSync("drizzle/" + filename, "utf8"));
    }
    const seed = readFileSync("backend-data/seed-performance.sql", "utf8");
    db.exec(seed);
    db.exec(seed);
    assert.equal(db.prepare("SELECT count(*) AS n FROM performance").get().n, 12);
    const lookup = db.prepare(`SELECT p.* FROM performance p
      JOIN etfs e ON e.id=p.etf_id WHERE e.ticker=?`);
    assert.equal(lookup.get("VGS").five_year_pa, 11.76);
    assert.equal(lookup.get("XMET").five_year_pa, null);
    assert.equal(lookup.get("AINF").three_year_pa, null);
    assert.equal(lookup.get("IVV").currency, "USD");
    assert.equal(lookup.get("NXT"), undefined);
    assert.throws(() => db.exec("UPDATE performance SET etf_id=999999 WHERE id=1"));
    db.exec(
      "UPDATE performance SET as_of='2027-01-01', one_year=-2, three_year_pa=0 WHERE id=1",
    );
    db.exec(seed);
    const retained = db.prepare("SELECT * FROM performance WHERE id=1").get();
    assert.equal(retained.one_year, -2);
    assert.equal(retained.three_year_pa, 0);
  } finally {
    db.close();
  }
});
