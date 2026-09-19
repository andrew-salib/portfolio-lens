"use client";

import { useEffect, useMemo, useState } from "react";
import { SectorExposure } from "@/components/sector-exposure";
import { apiFetch } from "@/lib/api";
import snapshots from "@/lib/snapshots.json";
import {
  Layers3,
  Plus,
  ArrowUpRight,
  Trash2,
  RefreshCw,
  Search,
  Info,
  ArrowRight,
  Upload,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Asset,
  Holding,
  analyze,
  funds,
  parseHoldings,
  aiTickers,
} from "@/lib/portfolio";

const CHART_COLORS = [
  "#3455dc",
  "#8185f3",
  "#4ea9ba",
  "#f1b666",
  "#df7f93",
  "#97a0b4",
  "#679884",
  "#b5b9cb",
];

const STOCK_SECTORS = [
  "Information Technology",
  "Financials",
  "Health Care",
  "Consumer Discretionary",
  "Communication",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
  "Unclassified",
];

const NVIDIA_EXAMPLE: Asset = {
  ticker: "NVDA",
  name: "NVIDIA",
  type: "Stock",
  weight: 20,
  holdings: [
    {
      ticker: "NVDA",
      name: "NVIDIA",
      sector: "Information Technology",
      weight: 100,
      id: "United States:NVDA",
    },
  ],
  date: "User classified",
  source: "",
  status: "Manual classification",
};

const INITIAL_ASSETS: Asset[] = [snapshots.IVV, snapshots.IYW, NVIDIA_EXAMPLE];

type AssetSearchResult = {
  id: string;
  ticker: string;
  name: string;
  kind: "fund" | "security";
  issuer?: string;
  sector?: string;
  assetType?: string;
};

function getMarkLabel(result: AssetSearchResult) {
  if (result.issuer === "Vanguard") return "V";
  if (result.issuer === "Betashares") return "β";
  if (result.issuer === "Global X") return "GX";
  if (result.issuer === "iShares") return "iS";
  if (result.ticker === "BTC") return "₿";
  if (result.ticker === "CASH") return "$";
  return result.ticker.slice(0, 2);
}

function AssetMark({ result }: { result: AssetSearchResult }) {
  const brandName = result.issuer || result.assetType || "security";
  const brandClass = brandName.toLocaleLowerCase().replaceAll(" ", "-");

  return (
    <span className={`asset-mark asset-mark-${brandClass}`} aria-hidden="true">
      {getMarkLabel(result)}
    </span>
  );
}

function formatPercentage(value: number) {
  if (value === 0) return "0%";
  if (value > 0 && value < 0.1) return "<0.1%";
  return `${value.toFixed(1)}%`;
}

export default function Home() {
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [busy, setBusy] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);

  useEffect(() => {
    const update = (event: Event) => {
      setBackendOffline((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener("portfolio-backend", update);
    return () => window.removeEventListener("portfolio-backend", update);
  }, []);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [ticker, setTicker] = useState("");
  const [kind, setKind] = useState("fund");
  const [weight, setWeight] = useState("");
  const [sector, setSector] = useState("Information Technology");
  const [equal, setEqual] = useState(false);
  const [entryMode, setEntryMode] = useState("percent");
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const dollars = entryMode === "dollars";
  const portfolioValue = assets.reduce(
    (total, asset) => total + (amounts[asset.ticker] || 0),
    0,
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState<Holding[]>([]);
  const [customDate, setCustomDate] = useState("");
  const [customFileName, setCustomFileName] = useState("");
  const [example, setExample] = useState(true);
  const [searchResults, setSearchResults] = useState<AssetSearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] =
    useState<AssetSearchResult | null>(null);

  const analysis = useMemo(() => {
    if (!dollars) return analyze(assets, equal);
    if (!portfolioValue) return analyze([], true);
    const weightedAssets = assets.map((asset) => ({
      ...asset,
      weight: ((amounts[asset.ticker] || 0) / portfolioValue) * 100,
    }));
    return analyze(weightedAssets);
  }, [assets, equal, dollars, amounts, portfolioValue]);
  const selectedAsset = assets.find((asset) => asset.ticker === selected);
  const technologyExposure =
    analysis.sectors.find(([name]) => name === "Information Technology")?.[1] || 0;
  const uniqueExposure =
    assets.length && (!dollars || portfolioValue > 0)
      ? Math.max(0, 100 - analysis.overlapPct - analysis.unknown)
      : 0;
  const overlapDescription = [
    `${formatPercentage(analysis.overlapPct)} shared`,
    `${formatPercentage(uniqueExposure)} unique`,
    `${formatPercentage(analysis.unknown)} unmapped`,
  ].join(", ");
  const donutBackground = assets.length
    ? [
        "conic-gradient(",
        `#3455dc 0% ${analysis.overlapPct}%,`,
        `#b5c3f5 ${analysis.overlapPct}% ${100 - analysis.unknown}%,`,
        `#e9edf4 ${100 - analysis.unknown}% 100%`,
        ")",
      ].join(" ")
    : "#e9edf4";
  const insightHeadline = assets.length
    ? `${formatPercentage(technologyExposure)} of your portfolio is in technology.`
    : "Different funds can hold the same companies.";
  const insightDescription = assets.length
    ? `${analysis.overlap.length} securities appear in more than one asset. ` +
      `Your AI-related company exposure is ${formatPercentage(analysis.ai)}; ` +
      "this overlaps sectors and is not an additional slice."
    : "Look through every supported fund to spot concentrations that " +
      "ticker symbols alone can hide.";

  useEffect(() => {
    let cancelled = false;

    async function loadDatabasePortfolio() {
      try {
        const databaseAssets = await Promise.all([
          fetchAsset("IVV", 50),
          fetchAsset("IYW", 30),
        ]);

        if (!cancelled) {
          setAssets([...databaseAssets, NVIDIA_EXAMPLE]);
        }
      } catch (error) {
        if (!cancelled) {
          setError((error as Error).message);
        }
      }
    }

    loadDatabasePortfolio();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const searchText = ticker.trim();
    if (
      !modal ||
      kind === "custom" ||
      !searchText ||
      selectedSearchResult?.ticker === ticker
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);

      try {
        const searchKind = kind === "fund" ? "fund" : "security";
        const response = await apiFetch(
          `/api/search?kind=${searchKind}&q=${encodeURIComponent(searchText)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          results?: AssetSearchResult[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Search is unavailable.");
        }

        setSearchResults(data.results || []);
        setSearchOpen(true);
      } catch (searchError) {
        if ((searchError as Error).name !== "AbortError") {
          setError((searchError as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchBusy(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kind, modal, selectedSearchResult, ticker]);

  async function fetchAsset(
    ticker: string,
    weight: number,
    forceRefresh = false,
  ): Promise<Asset> {
    const refreshParameter = forceRefresh ? "&refresh=1" : "";
    const response = await apiFetch(
      `/api/holdings?ticker=${encodeURIComponent(ticker)}${refreshParameter}`,
    );
    const data = (await response.json()) as Asset & { error?: string };

    if (!response.ok) {
      throw new Error(data.error);
    }

    return { ...data, weight };
  }

  async function storeImportedFund(asset: Asset): Promise<Asset> {
    const response = await apiFetch("/api/holdings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(asset),
    });
    const data = (await response.json()) as Asset & { error?: string };

    if (!response.ok) {
      throw new Error(data.error);
    }

    return {
      ...data,
      weight: asset.weight,
    };
  }

  async function fetchDirectAsset(
    ticker: string,
    weight: number,
    identityKey?: string,
  ): Promise<Asset | null> {
    const identityParameter = identityKey
      ? `&id=${encodeURIComponent(identityKey)}`
      : "";
    const response = await apiFetch(
      `/api/securities?ticker=${encodeURIComponent(ticker)}${identityParameter}`,
    );

    if (response.status === 404) {
      return null;
    }

    const data = (await response.json()) as Asset & { error?: string };
    if (!response.ok) {
      throw new Error(data.error);
    }

    return { ...data, weight };
  }

  async function addAsset() {
    setError("");

    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) {
      return setError("Enter a ticker.");
    }

    if (assets.some((asset) => asset.ticker === normalizedTicker)) {
      return setError("This asset is already in your portfolio.");
    }

    if (
      weight !== "" &&
      (!Number.isFinite(Number(weight)) ||
        Number(weight) < 0 ||
        Number(weight) > (dollars ? 1e12 : 100))
    ) {
      return setError(
        dollars
          ? "Enter an amount between $0 and $1 trillion."
          : "Enter a weighting between 0 and 100.",
      );
    }

    setBusy(true);

    try {
      let newAsset: Asset;

      if (kind === "fund") {
        newAsset = await fetchAsset(normalizedTicker, Number(weight));
      } else if (kind === "stock") {
        const databaseSecurity = await fetchDirectAsset(
          normalizedTicker,
          Number(weight),
          selectedSearchResult?.id,
        );

        newAsset = databaseSecurity || {
          ticker: normalizedTicker,
          name: normalizedTicker,
          type: "Stock",
          weight: Number(weight),
          holdings: [
            {
              ticker: normalizedTicker,
              name: normalizedTicker,
              sector,
              weight: 100,
            },
          ],
          date: "User classified",
          source: "",
          status: "Manual classification",
        };
      } else {
        newAsset = {
          ticker: normalizedTicker,
          name: normalizedTicker,
          type: "Fund",
          weight: Number(weight),
          holdings: custom,
          date: customDate || "Date not supplied",
          source: "",
          status: "User supplied",
        };

        if (kind === "custom") {
          newAsset = await storeImportedFund(newAsset);
        }
      }

      if (!newAsset.holdings.length) {
        throw new Error("Import a holdings CSV first.");
      }

      if (dollars) {
        setAmounts((current) => ({ ...current, [newAsset.ticker]: Number(weight) }));
        newAsset = { ...newAsset, weight: 0 };
      }
      setAssets((currentAssets) => [...currentAssets, newAsset]);
      setModal(false);
      setTicker("");
      setWeight("");
      setCustom([]);
      setCustomFileName("");
      setSearchResults([]);
      setSelectedSearchResult(null);
      setExample(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadExamplePortfolio() {
    setBusy(true);
    setError("");
    try {
      const items = await Promise.all([fetchAsset("IVV", 50), fetchAsset("IYW", 30)]);
      setAssets([...items, NVIDIA_EXAMPLE]);
      setEntryMode("percent");
      setAmounts({});
      setExample(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshHoldings() {
    setBusy(true);
    setError("");
    const results = await Promise.allSettled(
      assets.map((asset) =>
        asset.source
          ? fetchAsset(asset.ticker, asset.weight, true)
          : Promise.resolve(asset),
      ),
    );

    setAssets((currentAssets) =>
      currentAssets.map((asset, index) =>
        results[index].status === "fulfilled"
          ? (results[index] as PromiseFulfilledResult<Asset>).value
          : asset,
      ),
    );

    if (results.some((result) => result.status === "rejected")) {
      setError(
        "Some sources could not refresh. Their previous dated holdings remain visible.",
      );
    }

    setBusy(false);
  }
  return (
    <div className="app">
      <header>
        <a className="brand" href="./">
          <span className="brand-icon">
            <Layers3 size={22} />
          </span>
          Portfolio<span className="brand-light">Lens</span>
        </a>
        <span className="header-label">PORTFOLIO INTELLIGENCE</span>
        <span className="private-label">Your portfolio, in focus</span>
      </header>
      <main>
        {backendOffline && (
          <p className="panel" role="status" style={{ padding: 16 }}>
            Backend offline — bundled sample holdings remain available. Live search,
            refresh and CSV uploads will return when it reconnects.
          </p>
        )}
        <div className="page-title">
          <div>
            <div className="eyebrow">LOOK BENEATH THE TICKER</div>
            <h1>See what you really own.</h1>
            <p>Unpack your funds. Find the overlap. Understand your exposure.</p>
          </div>
          <button
            className="primary"
            onClick={() => {
              setError("");
              setModal(true);
            }}
          >
            <Plus size={18} /> Add asset
          </button>
        </div>
        {error && !modal && (
          <div role="alert" className="notice">
            {error}
          </div>
        )}
        <div className="workspace">
          <aside className="panel portfolio">
            <div className="panel-title">
              <h2>Your portfolio</h2>
              <span className="count">{assets.length} assets</span>
            </div>
            <div className="small muted">
              {example
                ? "Example portfolio · Replace with your assets."
                : "Add stocks and funds, then set their weight."}
            </div>
            <div style={{ marginTop: 16 }}>
              <label className="form-label">
                Enter portfolio by
                <select
                  className="form-input"
                  value={entryMode}
                  onChange={(event) => {
                    setEntryMode(event.target.value);
                    setEqual(false);
                    setWeight("");
                  }}
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="dollars">Dollar amount ($)</option>
                </select>
              </label>
              {dollars && (
                <p className="small muted">
                  Enter current values in the same currency for every asset. Percentages
                  are calculated from your entered total.
                </p>
              )}
            </div>
            {example && (
              <button
                className="text-button"
                onClick={() => {
                  setAssets([]);
                  setAmounts({});
                  setExample(false);
                }}
              >
                Clear example & start my portfolio
              </button>
            )}
            <div className="asset-list">
              {assets.map((asset, index) => (
                <div className="asset" key={asset.ticker}>
                  <div className="asset-top">
                    <span
                      className="ticker-icon"
                      style={{
                        background: CHART_COLORS[index % CHART_COLORS.length] + "15",
                        color: CHART_COLORS[index % CHART_COLORS.length],
                      }}
                    >
                      {asset.ticker.slice(0, 2)}
                    </span>
                    <div className="asset-name">
                      <strong>{asset.ticker}</strong>
                      <span title={asset.name}>{asset.name}</span>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${asset.ticker}`}
                      onClick={() =>
                        setAssets((currentAssets) =>
                          currentAssets.filter(
                            (candidate) => candidate.ticker !== asset.ticker,
                          ),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="weight-row">
                    <span className="small muted">
                      {dollars ? "Current value" : "Portfolio weight"}
                    </span>
                    <label className="weight-input">
                      <input
                        aria-label={`${asset.ticker} ${dollars ? "dollar amount" : "portfolio weight"}`}
                        style={dollars ? { width: 120 } : undefined}
                        type="number"
                        min="0"
                        max={dollars ? 1e12 : 100}
                        step={dollars ? "0.01" : "0.1"}
                        value={dollars ? (amounts[asset.ticker] ?? "") : asset.weight}
                        disabled={equal}
                        onChange={(e) => {
                          if (dollars) {
                            const amount = Number(e.target.value);
                            setAmounts((current) => ({
                              ...current,
                              [asset.ticker]: Number.isFinite(amount)
                                ? Math.max(0, Math.min(1e12, amount))
                                : 0,
                            }));
                            return;
                          }
                          setAssets((currentAssets) =>
                            currentAssets.map((candidate) =>
                              candidate.ticker === asset.ticker
                                ? {
                                    ...candidate,
                                    weight: Math.max(
                                      0,
                                      Math.min(100, Number(e.target.value) || 0),
                                    ),
                                  }
                                : candidate,
                            ),
                          );
                        }}
                      />
                      <span>{dollars ? "$" : "%"}</span>
                    </label>
                  </div>
                  {dollars && (
                    <p className="small muted">
                      {formatPercentage(
                        portfolioValue
                          ? ((amounts[asset.ticker] || 0) / portfolioValue) * 100
                          : 0,
                      )}
                      {" of portfolio"}
                    </p>
                  )}
                </div>
              ))}
              {!assets.length && (
                <div className="empty-portfolio">
                  <Layers3 size={32} />
                  <h3>Start with what you own</h3>
                  <p>Add your first asset or explore a sample portfolio.</p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={loadExamplePortfolio}
                  >
                    {busy ? "Fetching holdings…" : "Explore example"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
            <button className="add-outline" onClick={() => setModal(true)}>
              <Plus size={16} /> Add another asset
            </button>
            <div className="allocation">
              <span>{dollars ? "Portfolio value" : "Total allocation"}</span>
              <strong>
                {dollars
                  ? portfolioValue.toLocaleString("en-AU", {
                      style: "currency",
                      currency: "AUD",
                    })
                  : equal && assets.length
                    ? "100.0%"
                    : formatPercentage(analysis.total)}
              </strong>
            </div>
            <div className="allocation-track">
              <div style={{ width: `${Math.min(analysis.total, 100)}%` }} />
            </div>
            {!dollars && (
              <button className="text-button" onClick={() => setEqual(!equal)}>
                {equal ? "Use my entered weights" : "Use equal weights"}
              </button>
            )}
            {dollars && !portfolioValue && (
              <p className="small muted">
                Enter at least one dollar amount to calculate your breakdown.
              </p>
            )}
            {!dollars && !equal && analysis.total > 100 && (
              <p className="small warning">
                Weights exceed 100%. Results are normalized to your entered total.
              </p>
            )}
            {!dollars && !equal && analysis.total < 100 && assets.length > 0 && (
              <p className="small muted">
                {formatPercentage(100 - analysis.total)} is unallocated and excluded
                from known exposure.
              </p>
            )}
            <div className="sidebar-foot">
              <Info size={15} />
              <span>
                Portfolio stays in this session. No account or upload required for
                supported funds.
              </span>
            </div>
          </aside>
          <section className="results">
            <div className="results-top">
              <div>
                <span className="live-tag">
                  {example ? "EXAMPLE PORTFOLIO" : "PORTFOLIO OVERVIEW"}
                </span>
                <span className="small muted">
                  {equal ? "Equal-weight view" : "Weighted look-through"}
                </span>
              </div>
              <button
                className="icon-button"
                disabled={busy || !assets.length}
                onClick={refreshHoldings}
                aria-label="Refresh holdings"
              >
                <RefreshCw size={17} className={busy ? "spin" : ""} />
              </button>
            </div>
            <div className="stats">
              <Metric
                label="Underlying securities"
                value={analysis.holdings.length.toLocaleString()}
                note="Across your assets"
              />
              <Metric
                label="Technology exposure"
                value={formatPercentage(technologyExposure)}
                note="Information Technology sector"
              />
              <Metric
                label="AI-related exposure"
                value={formatPercentage(analysis.ai)}
                note="Curated company theme"
                accent
              />
              <Metric
                label="Shared holdings"
                value={analysis.overlap.length.toString()}
                note="Held through 2+ assets"
              />
            </div>
            <Tabs defaultValue="overview">
              <TabsList className="view-tabs" variant="line">
                <TabsTrigger value="overview">Exposure overview</TabsTrigger>
                <TabsTrigger value="holdings">All holdings</TabsTrigger>
                <TabsTrigger value="funds">Asset breakdown</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <div className="charts">
                  <section className="panel chart-panel">
                    <div className="panel-title">
                      <h2>Sector exposure</h2>
                      <span className="small muted">% of portfolio</span>
                    </div>
                    <SectorExposure
                      sectors={analysis.sectors}
                      holdings={analysis.holdings}
                      assets={assets}
                    />
                  </section>
                  <section className="panel chart-panel overlap-panel">
                    <div className="panel-title">
                      <h2>Portfolio overlap</h2>
                      <span className="badge">LOOK-THROUGH</span>
                    </div>
                    <div className="donut-wrap">
                      <div
                        className="donut"
                        role="img"
                        aria-label={overlapDescription}
                        style={{
                          background: donutBackground,
                        }}
                      >
                        <div>
                          <strong>{formatPercentage(analysis.overlapPct)}</strong>
                          <span>shared exposure</span>
                        </div>
                      </div>
                    </div>
                    <div className="legend">
                      {[
                        ["Shared holdings", analysis.overlapPct, "#3455dc"],
                        ["Unique holdings", uniqueExposure, "#b5c3f5"],
                        [
                          "Unmapped / unallocated",
                          assets.length ? analysis.unknown : 0,
                          "#e9edf4",
                        ],
                      ].map(([label, exposure, color]) => (
                        <div key={String(label)}>
                          <i style={{ background: String(color) }} />
                          <span>{label}</span>
                          <strong>{formatPercentage(Number(exposure))}</strong>
                        </div>
                      ))}
                    </div>
                    <p className="small muted">
                      Shared exposure is the total weight in securities held through
                      multiple assets; each security is counted once.
                    </p>
                  </section>
                </div>
                <section className="insight">
                  <div className="insight-icon">
                    <Layers3 size={22} />
                  </div>
                  <div>
                    <span className="eyebrow">THE BIGGER PICTURE</span>
                    <h3>{insightHeadline}</h3>
                    <p>{insightDescription}</p>
                  </div>
                </section>
                <div className="panel top-holdings">
                  <div className="panel-title">
                    <h2>Largest underlying positions</h2>
                    <span className="small muted">Combined exposure</span>
                  </div>
                  <HoldingsTable rows={analysis.holdings.slice(0, 5)} />
                </div>
              </TabsContent>
              <TabsContent value="holdings">
                <div className="panel holdings-panel">
                  <div className="panel-title">
                    <h2>All underlying holdings</h2>
                    <span className="count">{analysis.holdings.length}</span>
                  </div>
                  <label className="search">
                    <Search size={17} />
                    <input
                      placeholder="Search company, ticker or sector"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <HoldingsTable
                    rows={analysis.holdings.filter((holding) =>
                      (holding.ticker + holding.name + holding.sector)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )}
                  />
                </div>
              </TabsContent>
              <TabsContent value="funds">
                <div className="panel holdings-panel">
                  <h2>Explore each asset</h2>
                  <div className="asset-pills">
                    {assets.map((asset) => (
                      <button
                        className={selected === asset.ticker ? "primary" : "secondary"}
                        key={asset.ticker}
                        onClick={() => setSelected(asset.ticker)}
                      >
                        {asset.ticker}
                      </button>
                    ))}
                  </div>
                  {selectedAsset ? (
                    <>
                      <h3>{selectedAsset.name}</h3>
                      <p className="small muted">
                        {selectedAsset.status} · As of {selectedAsset.date} ·{" "}
                        {selectedAsset.holdings.length} holdings
                      </p>
                      {selectedAsset.source && (
                        <a
                          className="source-link"
                          href={selectedAsset.source}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View issuer source <ArrowUpRight size={14} />
                        </a>
                      )}
                      <HoldingsTable
                        rows={selectedAsset.holdings.map((holding) => ({
                          ...holding,
                          exposure: holding.weight,
                          via: [],
                        }))}
                        asset
                      />
                    </>
                  ) : (
                    <p className="muted">
                      Select an asset to see its holdings and weights.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            <details className="method">
              <summary>Data coverage & methodology</summary>
              <p>
                Database lookup currently supports{" "}
                {funds.map((fund) => fund.ticker).join(", ")}. Other funds can be added
                with a holdings CSV. Known stocks and securities use their stored
                sector; unknown tickers can still be classified manually. Holdings may
                be delayed; source dates appear per asset. Only positive, long positions
                are analyzed. Unreported holdings remain unmapped; funds within funds
                are not recursively expanded. Holdings are matched by ISIN when
                supplied, otherwise by country and ticker. A stock with no country is
                matched only when its ticker identifies a single security; custom CSVs
                without identifiers use ticker matching. Share classes remain separate.
              </p>
              <p>
                AI is a curated theme: {Array.from(aiTickers).join(", ")}. This measures
                exposure to these companies, not their AI revenue. It overlaps the
                sector breakdown. Exposure = portfolio weight × holding weight. Issuer
                weights above 100% from rounding are scaled to 100%.
              </p>
            </details>
          </section>
        </div>
        <footer>
          <span>PortfolioLens</span>
          <span>Clarity behind every holding.</span>
        </footer>
      </main>
      <Dialog
        open={modal}
        onOpenChange={(isOpen) => {
          setModal(isOpen);
          if (!isOpen) {
            setSearchBusy(false);
            setSearchOpen(false);
            setSearchResults([]);
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Add to your portfolio</DialogTitle>
          <DialogDescription>
            Find a supported fund, add a security, or import another fund’s holdings.
          </DialogDescription>
          <Select
            value={kind}
            onValueChange={(nextKind) => {
              setKind(nextKind);
              setTicker("");
              setSearchResults([]);
              setSelectedSearchResult(null);
              setSearchOpen(false);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fund">Index fund / ETF</SelectItem>
              <SelectItem value="stock">Stock or other security</SelectItem>
              <SelectItem value="custom">Import fund CSV</SelectItem>
            </SelectContent>
          </Select>
          <div className="form-label asset-search-field">
            <label htmlFor="asset-search">
              {kind === "fund" ? "Search funds" : "Search stocks and securities"}
            </label>
            <div className="asset-search-input">
              <Search size={17} aria-hidden="true" />
              <input
                id="asset-search"
                placeholder={
                  kind === "fund" ? "Search VGS or Vanguard…" : "Search NXT or NEXTDC…"
                }
                value={ticker}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={searchOpen}
                aria-controls="asset-search-results"
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                onChange={(event) => {
                  setTicker(event.target.value);
                  setSelectedSearchResult(null);
                  if (!event.target.value.trim()) {
                    setSearchResults([]);
                    setSearchBusy(false);
                  }
                }}
              />
              {searchBusy && <span className="search-status">Searching…</span>}
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div
                id="asset-search-results"
                className="asset-search-results"
                role="listbox"
              >
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={selectedSearchResult?.id === result.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setTicker(result.ticker);
                      setSelectedSearchResult(result);
                      setSearchResults([]);
                      setSearchOpen(false);
                      if (result.sector) {
                        setSector(result.sector);
                      }
                    }}
                  >
                    <AssetMark result={result} />
                    <span className="asset-search-copy">
                      <span>
                        <strong>{result.ticker}</strong>
                        {result.issuer && <small>{result.issuer}</small>}
                      </span>
                      <span>{result.name}</span>
                    </span>
                    {result.sector && (
                      <span className="sector-match">{result.sector}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {kind === "fund" && (
            <p className="small muted">
              Search by ticker, fund name, or issuer. Choose a result to load its stored
              holdings.
            </p>
          )}
          {kind === "stock" && selectedSearchResult?.sector && (
            <div className="matched-sector">
              <span>Matched sector</span>
              <strong>{selectedSearchResult.sector}</strong>
              <small>Applied automatically from the security database</small>
            </div>
          )}
          {kind === "stock" && !selectedSearchResult?.sector && (
            <label className="form-label">
              Sector for an unlisted result
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_SECTORS.map((sectorName) => (
                    <SelectItem key={sectorName} value={sectorName}>
                      {sectorName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {kind === "custom" && (
            <>
              <p className="small muted">
                CSV columns: Ticker, Name, Sector, Weight (%), plus optional Industry.
                Positive long positions only; weights must total no more than 101%.
              </p>
              <div className="file-upload">
                <input
                  id="holdings-csv"
                  className="file-upload-input"
                  aria-label="Holdings CSV"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (event) => {
                    try {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (file.size > 3000000) {
                        throw Error("Use a CSV under 3 MB.");
                      }

                      const parsedFile = parseHoldings(await file.text());
                      const totalWeight = parsedFile.holdings.reduce(
                        (total, holding) => total + holding.weight,
                        0,
                      );

                      if (totalWeight > 101) {
                        throw Error("Weights exceed 101%. Check your CSV.");
                      }

                      setCustom(parsedFile.holdings);
                      setCustomDate(parsedFile.date);
                      setCustomFileName(file.name);
                      setError("");
                    } catch (error) {
                      setCustom([]);
                      setCustomFileName("");
                      setError((error as Error).message);
                    }
                  }}
                />
                <label className="file-upload-button" htmlFor="holdings-csv">
                  <Upload size={16} />
                  Add holdings file
                </label>
                <span className="file-upload-name">
                  {customFileName || "No file selected"}
                </span>
              </div>
              {custom.length > 0 && <p>{custom.length} holdings ready to import.</p>}
            </>
          )}
          <label className="form-label">
            {dollars ? "Current value ($)" : "Portfolio weight (%)"}
            <input
              className="form-input"
              type="number"
              min="0"
              max={dollars ? 1e12 : 100}
              step={dollars ? "0.01" : "0.1"}
              placeholder={dollars ? "e.g. 5000" : "e.g. 25"}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <p className="small muted">
            {dollars
              ? "Leave blank to enter the value later. Use the same currency as your other assets."
              : "Leave blank to enter later, or use equal weights."}
          </p>
          {error && (
            <p role="alert" className="warning">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy} onClick={addAsset}>
            {busy ? "Looking up holdings…" : "Add asset"}
            <Plus size={16} />
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={"metric " + (accent ? "accent" : "")}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function HoldingsTable({
  rows,
  asset = false,
}: {
  rows: (Holding & {
    exposure: number;
    via: { ticker: string; exposure: number }[];
  })[];
  asset?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company / security</TableHead>
          <TableHead>Sector</TableHead>
          {!asset && <TableHead>Held through</TableHead>}
          <TableHead className="text-right">
            {asset ? "Fund weight" : "Exposure"}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((holding, index) => (
          <TableRow key={holding.ticker + index}>
            <TableCell>
              <strong>{holding.ticker}</strong>
              <span className="company-name">{holding.name}</span>
            </TableCell>
            <TableCell className="muted">{holding.sector}</TableCell>
            {!asset && (
              <TableCell>
                <div className="via">
                  {holding.via.map((source, sourceIndex) => (
                    <span
                      key={sourceIndex}
                      title={`${formatPercentage(source.exposure)} of portfolio`}
                    >
                      {source.ticker}
                    </span>
                  ))}
                </div>
              </TableCell>
            )}
            <TableCell className="text-right font-semibold">
              {formatPercentage(holding.exposure)}
            </TableCell>
          </TableRow>
        ))}
        {!rows.length && (
          <TableRow>
            <TableCell colSpan={4} className="empty-cell">
              No holdings to show yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
