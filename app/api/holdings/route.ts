import snapshots from "@/lib/snapshots.json";
import { getStoredEtf, saveEtf } from "@/db/etf-repository";
import {
  type Asset,
  type FundDefinition,
  type Holding,
  funds,
  parseHoldings,
} from "@/lib/portfolio";

const ISHARES_ORIGIN = "https://www.ishares.com";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_IMPORTED_HOLDINGS = 10_000;

function getIssuerPageUrl(fund: FundDefinition) {
  if (!fund.productId || !fund.slug) {
    throw new Error("Live issuer refresh is not configured for this fund");
  }

  return `${ISHARES_ORIGIN}/us/products/${fund.productId}/${fund.slug}`;
}

function jsonResponse(asset: Asset, status = 200) {
  return Response.json(asset, {
    status,
    headers: {
      "Cache-Control": "private, max-age=3600",
    },
  });
}

async function fetchIssuerHoldings(fund: FundDefinition): Promise<Asset> {
  const source = getIssuerPageUrl(fund);
  const productPage = await fetch(source, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!productPage.ok) {
    throw new Error("Issuer page is unavailable");
  }

  const pageHtml = await productPage.text();
  const holdingsPath = pageHtml.match(/href="([^"]+\/latest-holdings\.csv)"/)?.[1];

  if (!holdingsPath) {
    throw new Error("Holdings feed was not found");
  }

  const holdingsUrl = new URL(holdingsPath, ISHARES_ORIGIN);

  // Never follow a holdings link away from the expected issuer domain.
  if (holdingsUrl.hostname !== "www.ishares.com") {
    throw new Error("Holdings feed uses an unexpected domain");
  }

  const holdingsResponse = await fetch(holdingsUrl, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!holdingsResponse.ok) {
    throw new Error("Holdings download is unavailable");
  }

  const parsedData = parseHoldings(await holdingsResponse.text());
  const reportedWeight = parsedData.holdings.reduce((total, holding) => {
    return total + holding.weight;
  }, 0);

  if (reportedWeight > 102) {
    throw new Error("Leveraged holdings data is not supported");
  }

  return {
    ticker: fund.ticker,
    name: fund.name,
    type: "Fund",
    weight: 0,
    ...parsedData,
    source,
    status: "Issuer holdings",
  };
}

async function saveKnownFund(asset: Asset, fund?: FundDefinition) {
  return saveEtf(asset, {
    issuer: fund?.issuer || "User import",
    productId: fund?.productId,
    slug: fund?.slug,
  });
}

async function seedSnapshot(ticker: string, fund?: FundDefinition) {
  const snapshot = snapshots[ticker as keyof typeof snapshots];

  if (!snapshot) {
    return null;
  }

  return saveKnownFund(
    {
      ...snapshot,
      weight: 0,
      status: "Database holdings",
    },
    fund,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.trim().toUpperCase();
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!ticker) {
    return Response.json({ error: "Enter an ETF ticker." }, { status: 400 });
  }

  const fund = funds.find((candidate) => candidate.ticker === ticker);

  try {
    if (!forceRefresh) {
      const storedFund = await getStoredEtf(ticker);
      if (storedFund) {
        return jsonResponse(storedFund);
      }

      const seededFund = await seedSnapshot(ticker, fund);
      if (seededFund) {
        return jsonResponse(seededFund);
      }
    }

    if (!fund) {
      return Response.json(
        {
          error:
            "This ETF is not in the database yet. Import its holdings CSV " +
            "to add it.",
        },
        { status: 404 },
      );
    }

    try {
      const issuerAsset = await fetchIssuerHoldings(fund);
      const storedAsset = await saveKnownFund(issuerAsset, fund);
      return jsonResponse(storedAsset);
    } catch (issuerError) {
      console.error("ETF issuer sync failed", issuerError);

      const storedFund = await getStoredEtf(ticker);
      if (storedFund) {
        return jsonResponse({
          ...storedFund,
          status: "Database holdings · issuer refresh unavailable",
        });
      }

      const seededFund = await seedSnapshot(ticker, fund);
      if (seededFund) {
        return jsonResponse({
          ...seededFund,
          status: "Database holdings · saved snapshot",
        });
      }

      throw issuerError;
    }
  } catch (error) {
    console.error("ETF database request failed", error);
    return Response.json(
      {
        error:
          "ETF holdings storage is temporarily unavailable. " +
          "Please try again shortly.",
      },
      { status: 503 },
    );
  }
}

function isHolding(value: unknown): value is Holding {
  if (!value || typeof value !== "object") {
    return false;
  }

  const holding = value as Partial<Holding>;
  return (
    typeof holding.ticker === "string" &&
    typeof holding.name === "string" &&
    typeof holding.sector === "string" &&
    typeof holding.weight === "number" &&
    Number.isFinite(holding.weight) &&
    holding.weight > 0
  );
}

function parseImportedAsset(value: unknown): Asset {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid ETF data");
  }

  const asset = value as Partial<Asset>;
  const ticker = asset.ticker?.trim().toUpperCase();
  const holdings = asset.holdings;

  if (!ticker || !/^[A-Z0-9.-]{1,15}$/.test(ticker)) {
    throw new Error("Enter a valid ETF ticker");
  }

  if (!asset.name?.trim()) {
    throw new Error("Enter an ETF name");
  }

  if (!Array.isArray(holdings) || holdings.length === 0) {
    throw new Error("The ETF must contain holdings");
  }

  if (holdings.length > MAX_IMPORTED_HOLDINGS) {
    throw new Error("The holdings file contains too many rows");
  }

  if (!holdings.every(isHolding)) {
    throw new Error("One or more holdings are invalid");
  }

  const totalWeight = holdings.reduce((total, holding) => {
    return total + holding.weight;
  }, 0);

  if (totalWeight > 102) {
    throw new Error("ETF holdings weights exceed 102%");
  }

  return {
    ticker,
    name: asset.name.trim(),
    type: "Fund",
    weight: 0,
    holdings,
    date: asset.date || "Date not supplied",
    source: "",
    status: "Database holdings · user imported",
  };
}

export async function POST(request: Request) {
  try {
    const importedAsset = parseImportedAsset(await request.json());
    const storedAsset = await saveKnownFund(importedAsset);

    return jsonResponse(
      {
        ...storedAsset,
        status: "Database holdings · user imported",
      },
      201,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not import ETF holdings";

    console.error("ETF import failed", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
