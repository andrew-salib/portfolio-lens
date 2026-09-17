export type Holding = {
  ticker: string;
  name: string;
  sector: string;
  industry?: string;
  weight: number;
  id?: string;
};

export type Asset = {
  ticker: string;
  name: string;
  type: string;
  weight: number;
  holdings: Holding[];
  date: string;
  source: string;
  status: string;
};

export type FundDefinition = {
  ticker: string;
  name: string;
  issuer: string;
  productId?: string;
  slug?: string;
};

export type HoldingExposure = Holding & {
  exposure: number;
  via: Array<{
    ticker: string;
    exposure: number;
  }>;
};

export const funds: FundDefinition[] = [
  {
    ticker: "IVV",
    name: "iShares Core S&P 500 ETF",
    issuer: "iShares",
    productId: "239726",
    slug: "ishares-core-sp-500-etf",
  },
  {
    ticker: "ITOT",
    name: "iShares Core S&P Total U.S. Stock Market ETF",
    issuer: "iShares",
    productId: "239724",
    slug: "ishares-core-sp-total-us-stock-market-etf",
  },
  {
    ticker: "IXUS",
    name: "iShares Core MSCI Total International Stock ETF",
    issuer: "iShares",
    productId: "244048",
    slug: "ishares-core-msci-total-international-stock-etf",
  },
  {
    ticker: "IWM",
    name: "iShares Russell 2000 ETF",
    issuer: "iShares",
    productId: "239710",
    slug: "ishares-russell-2000-etf",
  },
  {
    ticker: "IYW",
    name: "iShares U.S. Technology ETF",
    issuer: "iShares",
    productId: "239522",
    slug: "ishares-us-technology-etf",
  },
  {
    ticker: "SOXX",
    name: "iShares Semiconductor ETF",
    issuer: "iShares",
    productId: "239705",
    slug: "ishares-phlx-semiconductor-etf",
  },
  {
    ticker: "IEFA",
    name: "iShares Core MSCI EAFE ETF",
    issuer: "iShares",
    productId: "244049",
    slug: "ishares-core-msci-eafe-etf",
  },
  {
    ticker: "IEMG",
    name: "iShares Core MSCI Emerging Markets ETF",
    issuer: "iShares",
    productId: "244050",
    slug: "ishares-core-msci-emerging-markets-etf",
  },
  {
    ticker: "VGS",
    name: "Vanguard MSCI Index International Shares ETF",
    issuer: "Vanguard",
  },
  {
    ticker: "NDQ",
    name: "Betashares Nasdaq 100 ETF",
    issuer: "Betashares",
  },
  {
    ticker: "XMET",
    name: "Betashares Critical Minerals ETF",
    issuer: "Betashares",
  },
  {
    ticker: "AINF",
    name: "Global X Artificial Intelligence Infrastructure ETF",
    issuer: "Global X",
  },
];

// AI exposure is a theme layered on top of sectors, so it can overlap them.
export const aiTickers = new Set([
  "NVDA",
  "MSFT",
  "GOOG",
  "GOOGL",
  "AMZN",
  "META",
  "AVGO",
  "AMD",
  "TSM",
  "PLTR",
  "ORCL",
  "MU",
  "ANET",
  "ARM",
  "SNOW",
  "CRM",
]);

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      const nextCharacter = text[index + 1];

      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    const isLineBreak = character === "\n" || character === "\r";
    if (isLineBreak && !insideQuotes) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      if (currentRow.some(Boolean)) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  currentRow.push(currentValue);
  if (currentRow.some(Boolean)) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseHoldings(text: string) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex(
    (row) => row.includes("Ticker") && row.includes("Weight (%)"),
  );

  if (headerIndex < 0) {
    throw new Error("Holdings file is unavailable or has an unsupported format.");
  }

  const headers = rows[headerIndex];
  const getColumn = (row: string[], column: string) => {
    return row[headers.indexOf(column)] || "";
  };

  const holdings = rows
    .slice(headerIndex + 1)
    .filter((row) => {
      const weight = Number(getColumn(row, "Weight (%)").replaceAll(",", ""));

      return (
        row.length >= headers.length &&
        Number.isFinite(weight) &&
        Boolean(getColumn(row, "Name"))
      );
    })
    .map((row): Holding => {
      const ticker = getColumn(row, "Ticker");
      const location = getColumn(row, "Location");
      const isin = getColumn(row, "ISIN");

      return {
        ticker,
        name: getColumn(row, "Name"),
        sector: getColumn(row, "Sector") || "Unclassified",
        industry: getColumn(row, "Industry") || undefined,
        weight: Number(getColumn(row, "Weight (%)").replaceAll(",", "")),
        id: isin || (location ? `${location}:${ticker}` : undefined),
      };
    })
    .filter((holding) => holding.weight > 0);

  if (holdings.length === 0) {
    throw new Error("No usable holdings found.");
  }

  const dateRow = rows.find((row) => {
    return row[0]?.includes("Fund Holdings as of");
  });

  return {
    holdings,
    date: dateRow?.[1] || "Date not supplied",
  };
}

function collectIdsByTicker(assets: Asset[]) {
  const idsByTicker = new Map<string, Set<string>>();

  for (const asset of assets) {
    for (const holding of asset.holdings) {
      if (!holding.id || holding.id === "-") {
        continue;
      }

      const identifiers = idsByTicker.get(holding.ticker) || new Set<string>();
      identifiers.add(holding.id);
      idsByTicker.set(holding.ticker, identifiers);
    }
  }

  return idsByTicker;
}

function getHoldingKey(holding: Holding, idsByTicker: Map<string, Set<string>>) {
  if (holding.id && holding.id !== "-") {
    return holding.id;
  }

  const knownIdentifiers = idsByTicker.get(holding.ticker);

  // A missing identifier is safe to infer only when the ticker maps to one asset.
  if (knownIdentifiers?.size === 1) {
    return [...knownIdentifiers][0];
  }

  return holding.ticker;
}

export function analyze(assets: Asset[], useEqualWeights = false) {
  const enteredWeight = assets.reduce((total, asset) => {
    return total + asset.weight;
  }, 0);
  const weightDenominator = useEqualWeights
    ? assets.length
    : Math.max(100, enteredWeight);
  const idsByTicker = collectIdsByTicker(assets);
  const exposures = new Map<string, HoldingExposure>();

  let unknownExposure = useEqualWeights ? 0 : Math.max(0, 100 - enteredWeight);

  for (const asset of assets) {
    const portfolioWeight = useEqualWeights
      ? 100 / Math.max(1, assets.length)
      : (asset.weight / weightDenominator) * 100;
    const reportedFundWeight = asset.holdings.reduce((total, holding) => {
      return total + holding.weight;
    }, 0);
    const holdingWeightDenominator = Math.max(100, reportedFundWeight);
    let reportedCoverage = 0;

    for (const holding of asset.holdings) {
      const exposure = (portfolioWeight * holding.weight) / holdingWeightDenominator;
      const holdingKey = getHoldingKey(holding, idsByTicker);
      const existingHolding = exposures.get(holdingKey);

      reportedCoverage += holding.weight;

      if (existingHolding) {
        existingHolding.exposure += exposure;
        existingHolding.via.push({
          ticker: asset.ticker,
          exposure,
        });
        continue;
      }

      exposures.set(holdingKey, {
        ...holding,
        exposure,
        via: [{ ticker: asset.ticker, exposure }],
      });
    }

    const missingCoverage = Math.max(0, 100 - reportedCoverage);
    unknownExposure += (portfolioWeight * missingCoverage) / 100;
  }

  const holdings = [...exposures.values()]
    .filter((holding) => holding.exposure > 0)
    .sort((first, second) => second.exposure - first.exposure);

  const sectorTotals: Record<string, number> = {};
  for (const holding of holdings) {
    sectorTotals[holding.sector] =
      (sectorTotals[holding.sector] || 0) + holding.exposure;
  }

  if (unknownExposure > 0.005) {
    sectorTotals["Unmapped / unallocated"] = unknownExposure;
  }

  const overlap = holdings.filter((holding) => {
    const contributingAssets = new Set(holding.via.map((source) => source.ticker));
    return contributingAssets.size > 1;
  });

  const sectors = Object.entries(sectorTotals).sort((first, second) => {
    return second[1] - first[1];
  });
  const overlapPct = overlap.reduce((total, holding) => {
    return total + holding.exposure;
  }, 0);
  const aiExposure = holdings
    .filter((holding) => aiTickers.has(holding.ticker))
    .reduce((total, holding) => total + holding.exposure, 0);

  return {
    total: enteredWeight,
    holdings,
    sectors,
    unknown: unknownExposure,
    overlap,
    overlapPct,
    ai: aiExposure,
  };
}
