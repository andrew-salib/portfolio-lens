import type { Asset, Holding } from "@/lib/portfolio";
import { getD1Database } from "./index";

type EtfMetadata = {
  issuer?: string;
  productId?: string;
  slug?: string;
};

type StoredHoldingRow = {
  etf_id: number;
  etf_ticker: string;
  etf_name: string;
  holdings_as_of: string;
  source_url: string | null;
  security_ticker: string;
  security_name: string;
  identity_key: string;
  sector_name: string | null;
  security_industry: string | null;
  weight: number;
};

type IdRow = {
  id: number;
};

type NamedIdRow = IdRow & {
  name: string;
};

type SecurityIdRow = IdRow & {
  identity_key: string;
};

export type EtfSearchResult = {
  ticker: string;
  name: string;
  issuer: string | null;
};

// Keep each prepared statement below D1's conservative parameter allowance.
// Security writes use seven bound values per row.
const WRITE_CHUNK_SIZE = 12;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function createValuePlaceholders(rowCount: number, columnCount: number) {
  const rowPlaceholder = `(${Array(columnCount).fill("?").join(", ")})`;
  return Array(rowCount).fill(rowPlaceholder).join(", ");
}

function getSecurityIdentity(holding: Holding) {
  return holding.id || `ticker:${holding.ticker}`;
}

function getSecurityDetails(holding: Holding) {
  const identityKey = getSecurityIdentity(holding);
  const isIsin = /^[A-Z]{2}[A-Z0-9]{10}$/.test(identityKey);
  const country =
    !isIsin && identityKey.includes(":") ? identityKey.split(":", 1)[0] : null;

  return {
    identityKey,
    isin: isIsin ? identityKey : null,
    country,
  };
}

export async function getStoredEtf(ticker: string): Promise<Asset | null> {
  const database = getD1Database();
  const result = await database
    .prepare(
      `SELECT
        etfs.id AS etf_id,
        etfs.ticker AS etf_ticker,
        etfs.name AS etf_name,
        etfs.holdings_as_of,
        etfs.source_url,
        securities.ticker AS security_ticker,
        securities.name AS security_name,
        securities.identity_key,
        securities.industry AS security_industry,
        sectors.name AS sector_name,
        etf_holdings.weight
      FROM etfs
      JOIN etf_holdings ON etf_holdings.etf_id = etfs.id
      JOIN securities ON securities.id = etf_holdings.security_id
      LEFT JOIN sectors ON sectors.id = securities.sector_id
      WHERE etfs.ticker = ?
      ORDER BY etf_holdings.weight DESC`,
    )
    .bind(ticker.toUpperCase())
    .all<StoredHoldingRow>();

  if (result.results.length === 0) {
    return null;
  }

  const firstRow = result.results[0];

  return {
    ticker: firstRow.etf_ticker,
    name: firstRow.etf_name,
    type: "Fund",
    weight: 0,
    date: firstRow.holdings_as_of,
    source: firstRow.source_url || "",
    status: "Database holdings",
    holdings: result.results.map((row) => ({
      ticker: row.security_ticker,
      name: row.security_name,
      sector: row.sector_name || "Unclassified",
      industry: row.security_industry || undefined,
      weight: row.weight,
      id: row.identity_key,
    })),
  };
}

export async function searchStoredEtfs(query: string) {
  const database = getD1Database();
  const escapedQuery = query
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  const searchPattern = `%${escapedQuery}%`;
  const prefixPattern = `${escapedQuery}%`;
  const result = await database
    .prepare(
      `SELECT ticker, name, issuer
      FROM etfs
      WHERE ticker LIKE ? ESCAPE '\\'
        OR name LIKE ? ESCAPE '\\'
        OR issuer LIKE ? ESCAPE '\\'
      ORDER BY
        CASE
          WHEN ticker LIKE ? ESCAPE '\\' THEN 0
          WHEN name LIKE ? ESCAPE '\\' THEN 1
          ELSE 2
        END,
        ticker
      LIMIT 8`,
    )
    .bind(searchPattern, searchPattern, searchPattern, prefixPattern, prefixPattern)
    .all<EtfSearchResult>();

  return result.results;
}

async function upsertEtfRecord(asset: Asset, metadata: EtfMetadata): Promise<number> {
  const database = getD1Database();
  const result = await database
    .prepare(
      `INSERT INTO etfs (
        ticker,
        name,
        issuer,
        product_id,
        slug,
        source_url,
        holdings_as_of,
        last_synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ticker) DO UPDATE SET
        name = excluded.name,
        issuer = excluded.issuer,
        product_id = excluded.product_id,
        slug = excluded.slug,
        source_url = excluded.source_url,
        holdings_as_of = excluded.holdings_as_of,
        last_synced_at = excluded.last_synced_at
      RETURNING id`,
    )
    .bind(
      asset.ticker.toUpperCase(),
      asset.name,
      metadata.issuer || null,
      metadata.productId || null,
      metadata.slug || null,
      asset.source || null,
      asset.date,
      new Date().toISOString(),
    )
    .first<IdRow>();

  if (!result) {
    throw new Error(`Could not save ETF ${asset.ticker}`);
  }

  return result.id;
}

async function upsertSectors(holdings: Holding[]) {
  const database = getD1Database();
  const sectorNames = [...new Set(holdings.map((holding) => holding.sector))];

  for (const sectorChunk of chunk(sectorNames, WRITE_CHUNK_SIZE)) {
    const placeholders = createValuePlaceholders(sectorChunk.length, 1);
    await database
      .prepare(
        `INSERT INTO sectors (name)
        VALUES ${placeholders}
        ON CONFLICT(name) DO NOTHING`,
      )
      .bind(...sectorChunk)
      .run();
  }

  const result = await database
    .prepare("SELECT id, name FROM sectors")
    .all<NamedIdRow>();

  return new Map(result.results.map((row) => [row.name, row.id]));
}

async function upsertSecurities(holdings: Holding[], sectorIds: Map<string, number>) {
  const database = getD1Database();

  for (const holdingChunk of chunk(holdings, WRITE_CHUNK_SIZE)) {
    const placeholders = createValuePlaceholders(holdingChunk.length, 7);
    const values = holdingChunk.flatMap((holding) => {
      const details = getSecurityDetails(holding);

      return [
        details.identityKey,
        holding.ticker,
        holding.name,
        details.isin,
        details.country,
        holding.industry || null,
        sectorIds.get(holding.sector) || null,
      ];
    });

    await database
      .prepare(
        `INSERT INTO securities (
          identity_key,
          ticker,
          name,
          isin,
          country,
          industry,
          sector_id
        )
        VALUES ${placeholders}
        ON CONFLICT(identity_key) DO UPDATE SET
          ticker = excluded.ticker,
          name = excluded.name,
          isin = excluded.isin,
          country = excluded.country,
          industry = excluded.industry,
          sector_id = excluded.sector_id`,
      )
      .bind(...values)
      .run();
  }

  const securityIds = new Map<string, number>();
  const identityKeys = holdings.map(getSecurityIdentity);

  for (const identityChunk of chunk(identityKeys, WRITE_CHUNK_SIZE)) {
    const placeholders = Array(identityChunk.length).fill("?").join(", ");
    const result = await database
      .prepare(
        `SELECT id, identity_key
        FROM securities
        WHERE identity_key IN (${placeholders})`,
      )
      .bind(...identityChunk)
      .all<SecurityIdRow>();

    for (const row of result.results) {
      securityIds.set(row.identity_key, row.id);
    }
  }

  return securityIds;
}

async function replaceEtfHoldings(
  etfId: number,
  holdings: Holding[],
  securityIds: Map<string, number>,
) {
  const database = getD1Database();
  const statements = [
    database.prepare("DELETE FROM etf_holdings WHERE etf_id = ?").bind(etfId),
  ];

  for (const holdingChunk of chunk(holdings, WRITE_CHUNK_SIZE)) {
    const placeholders = createValuePlaceholders(holdingChunk.length, 3);
    const values = holdingChunk.flatMap((holding) => {
      const securityId = securityIds.get(getSecurityIdentity(holding));

      if (!securityId) {
        throw new Error(`Could not resolve security ${holding.ticker}`);
      }

      return [etfId, securityId, holding.weight];
    });

    statements.push(
      database
        .prepare(
          `INSERT INTO etf_holdings (etf_id, security_id, weight)
          VALUES ${placeholders}`,
        )
        .bind(...values),
    );
  }

  // D1 executes a batch transactionally, so readers never see a partial fund.
  await database.batch(statements);
}

export async function saveEtf(
  asset: Asset,
  metadata: EtfMetadata = {},
): Promise<Asset> {
  if (asset.holdings.length === 0) {
    throw new Error("An ETF must contain at least one holding");
  }

  const normalizedAsset = {
    ...asset,
    ticker: asset.ticker.toUpperCase(),
  };
  const etfId = await upsertEtfRecord(normalizedAsset, metadata);
  const sectorIds = await upsertSectors(normalizedAsset.holdings);
  const securityIds = await upsertSecurities(normalizedAsset.holdings, sectorIds);

  await replaceEtfHoldings(etfId, normalizedAsset.holdings, securityIds);

  return {
    ...normalizedAsset,
    status: "Database holdings",
  };
}
