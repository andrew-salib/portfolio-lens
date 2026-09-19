import { getD1Database } from "./index";
import type { FundPerformance } from "@/lib/performance";

export async function getFundPerformance(
  ticker: string,
): Promise<FundPerformance | null> {
  const row = await getD1Database()
    .prepare(
      `
    SELECT e.ticker, p.* FROM performance p
    JOIN etfs e ON e.id = p.etf_id WHERE e.ticker = ?
  `,
    )
    .bind(ticker)
    .first<{
      ticker: string;
      one_year: number | null;
      three_year_pa: number | null;
      five_year_pa: number | null;
      ten_year_pa: number | null;
      as_of: string;
      fetched_at: string;
      currency: string;
      source_url: string;
      basis: string;
    }>();
  if (!row) return null;
  return {
    ticker: row.ticker,
    asOf: row.as_of,
    fetchedAt: row.fetched_at,
    currency: row.currency,
    sourceUrl: row.source_url,
    basis: row.basis,
    returns: {
      "1": row.one_year,
      "3": row.three_year_pa,
      "5": row.five_year_pa,
      "10": row.ten_year_pa,
    },
  };
}
