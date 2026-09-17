import type { Asset } from "@/lib/portfolio";
import { getD1Database } from "./index";

type DirectSecurity = {
  ticker: string;
  name: string;
  type: string;
  sector: string;
  industry: string;
  country?: string;
};

type DirectSecurityRow = {
  identity_key: string;
  ticker: string;
  name: string;
  asset_type: string;
  industry: string;
  sector_name: string;
};

export type SecuritySearchResult = DirectSecurityRow;

const DIRECT_SECURITIES: DirectSecurity[] = [
  {
    ticker: "NXT",
    name: "NEXTDC Limited",
    type: "Stock",
    sector: "Information Technology",
    industry: "Data centres",
    country: "Australia",
  },
  {
    ticker: "BTC",
    name: "Bitcoin",
    type: "Crypto",
    sector: "Digital Assets",
    industry: "Cryptocurrency",
  },
  {
    ticker: "CASH",
    name: "Cash",
    type: "Cash",
    sector: "Cash & equivalents",
    industry: "Cash",
  },
  {
    ticker: "PROPERTY",
    name: "Property",
    type: "Property",
    sector: "Real Estate",
    industry: "Direct property",
  },
];

async function seedDirectSecurities() {
  const database = getD1Database();

  for (const security of DIRECT_SECURITIES) {
    await database
      .prepare(
        `INSERT INTO sectors (name)
        VALUES (?)
        ON CONFLICT(name) DO NOTHING`,
      )
      .bind(security.sector)
      .run();

    await database
      .prepare(
        `INSERT INTO securities (
          identity_key,
          ticker,
          name,
          country,
          industry,
          asset_type,
          sector_id
        )
        VALUES (?, ?, ?, ?, ?, ?, (SELECT id FROM sectors WHERE name = ?))
        ON CONFLICT(identity_key) DO UPDATE SET
          ticker = excluded.ticker,
          name = excluded.name,
          country = excluded.country,
          industry = excluded.industry,
          asset_type = excluded.asset_type,
          sector_id = excluded.sector_id`,
      )
      .bind(
        `direct:${security.ticker}`,
        security.ticker,
        security.name,
        security.country || null,
        security.industry,
        security.type.toLowerCase(),
        security.sector,
      )
      .run();
  }
}

export async function getDirectSecurity(
  ticker: string,
  identityKey?: string,
): Promise<Asset | null> {
  await seedDirectSecurities();

  const database = getD1Database();
  const row = await database
    .prepare(
      `SELECT
        securities.identity_key,
        securities.ticker,
        securities.name,
        securities.asset_type,
        securities.industry,
        sectors.name AS sector_name
      FROM securities
      JOIN sectors ON sectors.id = securities.sector_id
      WHERE securities.identity_key = ?
        OR (? IS NULL AND securities.ticker = ?)
      ORDER BY CASE WHEN securities.identity_key LIKE 'direct:%' THEN 0 ELSE 1 END
      LIMIT 1`,
    )
    .bind(identityKey || `direct:${ticker.toUpperCase()}`, identityKey || null, ticker)
    .first<DirectSecurityRow>();

  if (!row) {
    return null;
  }

  const type = row.asset_type.charAt(0).toUpperCase() + row.asset_type.slice(1);

  return {
    ticker: row.ticker,
    name: row.name,
    type,
    weight: 0,
    date: "Database classification",
    source: "",
    status: "Database security",
    holdings: [
      {
        ticker: row.ticker,
        name: row.name,
        sector: row.sector_name,
        industry: row.industry,
        weight: 100,
        id: row.identity_key,
      },
    ],
  };
}

export async function searchSecurities(query: string) {
  await seedDirectSecurities();

  const escapedQuery = query
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  const searchPattern = `%${escapedQuery}%`;
  const prefixPattern = `${escapedQuery}%`;
  const database = getD1Database();
  const result = await database
    .prepare(
      `SELECT DISTINCT
        securities.identity_key,
        securities.ticker,
        securities.name,
        securities.asset_type,
        securities.industry,
        sectors.name AS sector_name
      FROM securities
      JOIN sectors ON sectors.id = securities.sector_id
      WHERE securities.ticker LIKE ? ESCAPE '\\'
        OR securities.name LIKE ? ESCAPE '\\'
      ORDER BY
        CASE
          WHEN securities.identity_key LIKE 'direct:%' THEN 0
          WHEN securities.ticker LIKE ? ESCAPE '\\' THEN 1
          WHEN securities.name LIKE ? ESCAPE '\\' THEN 2
          ELSE 3
        END,
        securities.ticker
      LIMIT 8`,
    )
    .bind(searchPattern, searchPattern, prefixPattern, prefixPattern)
    .all<SecuritySearchResult>();

  return result.results;
}
