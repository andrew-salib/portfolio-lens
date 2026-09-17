import { relations } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sectors = sqliteTable(
  "sectors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("idx_sectors_name").on(table.name)],
);

export const securities = sqliteTable(
  "securities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    identityKey: text("identity_key").notNull(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    isin: text("isin"),
    country: text("country"),
    industry: text("industry"),
    assetType: text("asset_type").notNull().default("stock"),
    sectorId: integer("sector_id").references(() => sectors.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    uniqueIndex("idx_securities_identity_key").on(table.identityKey),
    index("idx_securities_ticker").on(table.ticker),
    index("idx_securities_sector_id").on(table.sectorId),
  ],
);

export const etfs = sqliteTable(
  "etfs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    issuer: text("issuer"),
    productId: text("product_id"),
    slug: text("slug"),
    sourceUrl: text("source_url"),
    holdingsAsOf: text("holdings_as_of").notNull(),
    lastSyncedAt: text("last_synced_at").notNull(),
  },
  (table) => [uniqueIndex("idx_etfs_ticker").on(table.ticker)],
);

export const etfHoldings = sqliteTable(
  "etf_holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    etfId: integer("etf_id")
      .notNull()
      .references(() => etfs.id, { onDelete: "cascade" }),
    securityId: integer("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "restrict" }),
    weight: real("weight").notNull(),
  },
  (table) => [
    uniqueIndex("idx_etf_holdings_etf_security").on(table.etfId, table.securityId),
    index("idx_etf_holdings_security_id").on(table.securityId),
  ],
);

export const sectorRelations = relations(sectors, ({ many }) => ({
  securities: many(securities),
}));

export const securityRelations = relations(securities, ({ one, many }) => ({
  sector: one(sectors, {
    fields: [securities.sectorId],
    references: [sectors.id],
  }),
  fundHoldings: many(etfHoldings),
}));

export const etfRelations = relations(etfs, ({ many }) => ({
  holdings: many(etfHoldings),
}));

export const etfHoldingRelations = relations(etfHoldings, ({ one }) => ({
  etf: one(etfs, {
    fields: [etfHoldings.etfId],
    references: [etfs.id],
  }),
  security: one(securities, {
    fields: [etfHoldings.securityId],
    references: [securities.id],
  }),
}));
