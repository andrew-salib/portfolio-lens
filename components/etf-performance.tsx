"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Asset } from "@/lib/portfolio";
import {
  type FundPerformance,
  type PerformancePeriod,
  performancePeriods,
  periodLabel,
} from "@/lib/performance";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type Result = {
  ticker: string;
  performance: FundPerformance | null;
  offline?: boolean;
  error?: string;
};

export function EtfPerformance({ assets }: { assets: Asset[] }) {
  const [period, setPeriod] = useState<PerformancePeriod>(1);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const fundKey = JSON.stringify(
    assets.filter((asset) => asset.type === "Fund").map((asset) => asset.ticker),
  );

  useEffect(() => {
    const tickers = JSON.parse(fundKey) as string[];
    const controller = new AbortController();
    setResults([]);
    setLoading(tickers.length > 0);
    Promise.all(
      tickers.map(async (ticker): Promise<Result> => {
        try {
          const response = await apiFetch(
            `/api/performance?ticker=${encodeURIComponent(ticker)}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error("Could not load reported performance.");
          const data = (await response.json()) as {
            performance: FundPerformance | null;
            offline?: boolean;
          };
          return { ticker, performance: data.performance, offline: data.offline };
        } catch {
          return { ticker, performance: null, error: "Could not load performance." };
        }
      }),
    ).then((items) => {
      if (!controller.signal.aborted) {
        setResults(items);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [fundKey, retry]);

  const values = results.map((item) => item.performance?.returns[period] ?? null);
  const minimum = Math.min(0, ...values.filter((value) => value !== null));
  const maximum = Math.max(1, ...values.filter((value) => value !== null));
  const chartLeft = 85;
  const chartWidth = 355;
  const position = (value: number) =>
    chartLeft + ((value - minimum) / (maximum - minimum)) * chartWidth;
  const baseline = position(0);

  return (
    <section className="panel performance-panel">
      <div className="panel-title">
        <h2>ETF past performance</h2>
        <Select
          value={String(period)}
          onValueChange={(value) => setPeriod(Number(value) as PerformancePeriod)}
        >
          <SelectTrigger aria-label="Performance period" style={{ width: 150 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {performancePeriods.map((years) => (
              <SelectItem key={years} value={String(years)}>
                {periodLabel(years)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="small muted">
        Issuer-reported fund total returns, including distributions.
        {period > 1
          ? " Multi-year figures are annualised (p.a.), not cumulative."
          : " One-year figures are the total return over that year."}
        {" These are fund returns, not your personal portfolio earnings."}
      </p>
      {fundKey === "[]" && (
        <p>Add an ETF to your portfolio to see its reported returns.</p>
      )}
      {loading && <p role="status">Loading reported returns…</p>}
      {!loading && results.length > 0 && (
        <>
          <svg
            className="performance-chart"
            viewBox={`0 0 540 ${results.length * 62 + 45}`}
            role="img"
            aria-label={`ETF returns for ${periodLabel(period)}`}
          >
            <line
              x1={baseline}
              x2={baseline}
              y1={5}
              y2={results.length * 62}
              stroke="#aeb8cc"
            />
            {results.map((item, index) => {
              const value = values[index];
              const y = index * 62 + 12;
              return (
                <g key={item.ticker}>
                  <title>
                    {item.ticker}:{" "}
                    {value === null
                      ? "Not available"
                      : `${value.toFixed(2)}%${period > 1 ? " p.a." : ""}`}
                  </title>
                  <text x={0} y={y + 22} fill="currentColor" fontSize={14}>
                    {item.ticker}
                  </text>
                  {value !== null && (
                    <rect
                      x={Math.min(baseline, position(value))}
                      y={y}
                      width={Math.max(0, Math.abs(position(value) - baseline))}
                      height={32}
                      rx={4}
                      fill={value < 0 ? "#b64b65" : "#3455dc"}
                    />
                  )}
                  <text x={455} y={y + 22} fill="currentColor" fontSize={13}>
                    {value === null ? "N/A" : `${value.toFixed(2)}%`}
                  </text>
                </g>
              );
            })}
            <text
              x={baseline}
              y={results.length * 62 + 25}
              textAnchor="middle"
              fill="currentColor"
              fontSize={12}
            >
              0%
            </text>
          </svg>
          <p className="small muted">
            Dates and reporting currencies can differ. No currency conversion is
            applied. N/A means no verified fund return for that period; it does not mean
            zero.
          </p>
          {results.map((item) => (
            <div className="performance-source" key={item.ticker}>
              <strong>
                {item.ticker} ·{" "}
                {assets.find((asset) => asset.ticker === item.ticker)?.name}
              </strong>
              {item.performance ? (
                <>
                  <p className="small">
                    As of {item.performance.asOf} · {item.performance.currency}
                    {" · "}
                    {item.offline
                      ? "Bundled issuer snapshot (offline)"
                      : "Stored issuer snapshot"}
                    {" · "}
                    <a
                      href={item.performance.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official issuer source ↗
                    </a>
                  </p>
                  <p className="small muted">{item.performance.basis}</p>
                </>
              ) : (
                <p className="small muted">
                  {item.error ||
                    "No verified issuer performance has been added for this ETF yet."}
                </p>
              )}
            </div>
          ))}
          {results.some((item) => item.error) && (
            <button
              className="text-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry loading
            </button>
          )}
        </>
      )}
      <p className="small muted">
        Past performance is not a reliable indicator of future returns.
      </p>
    </section>
  );
}
