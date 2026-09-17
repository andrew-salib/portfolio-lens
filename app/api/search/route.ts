import { searchStoredEtfs } from "@/db/etf-repository";
import { searchSecurities } from "@/db/security-repository";
import { funds } from "@/lib/portfolio";

type SearchResult = {
  id: string;
  ticker: string;
  name: string;
  kind: "fund" | "security";
  issuer?: string;
  sector?: string;
  assetType?: string;
};

function matches(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query);
}

async function searchFunds(query: string): Promise<SearchResult[]> {
  const storedFunds = await searchStoredEtfs(query);
  const matchesByTicker = new Map<string, SearchResult>();

  for (const fund of funds) {
    if (
      matches(fund.ticker, query) ||
      matches(fund.name, query) ||
      matches(fund.issuer, query)
    ) {
      matchesByTicker.set(fund.ticker, {
        id: `fund:${fund.ticker}`,
        ticker: fund.ticker,
        name: fund.name,
        kind: "fund",
        issuer: fund.issuer,
      });
    }
  }

  for (const fund of storedFunds) {
    matchesByTicker.set(fund.ticker, {
      id: `fund:${fund.ticker}`,
      ticker: fund.ticker,
      name: fund.name,
      kind: "fund",
      issuer: fund.issuer || undefined,
    });
  }

  return [...matchesByTicker.values()]
    .sort((left, right) => {
      const leftStarts = left.ticker.toLocaleLowerCase().startsWith(query);
      const rightStarts = right.ticker.toLocaleLowerCase().startsWith(query);
      return Number(rightStarts) - Number(leftStarts);
    })
    .slice(0, 8);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().toLocaleLowerCase() || "";
  const kind = url.searchParams.get("kind");

  if (!query || !["fund", "security"].includes(kind || "")) {
    return Response.json({ results: [] });
  }

  try {
    if (kind === "fund") {
      return Response.json({ results: await searchFunds(query) });
    }

    const securities = await searchSecurities(query);
    const results: SearchResult[] = securities.map((security) => ({
      id: security.identity_key,
      ticker: security.ticker,
      name: security.name,
      kind: "security",
      sector: security.sector_name,
      assetType: security.asset_type,
    }));

    return Response.json({ results });
  } catch (error) {
    console.error("Asset search failed", error);
    return Response.json(
      { error: "Search is temporarily unavailable." },
      { status: 503 },
    );
  }
}
