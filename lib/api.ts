import snapshots from "./snapshots.json";
import performanceSnapshots from "./performance-snapshots.json";
import { funds, type Asset } from "./portfolio";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const STATIC_HOST = process.env.NEXT_PUBLIC_STATIC_HOST === "true";

function bundledResponse(path: string): Response {
  const url = new URL(path, "https://portfolio.invalid");
  const ticker = url.searchParams.get("ticker") || "";
  if (url.pathname === "/api/performance") {
    return Response.json({
      performance: performanceSnapshots.find((item) => item.ticker === ticker) || null,
      offline: true,
    });
  }
  const samples = snapshots as Record<string, Asset>;
  if (url.pathname === "/api/holdings" && samples[ticker]) {
    return Response.json({ ...samples[ticker], status: "Bundled sample · offline" });
  }
  if (url.pathname === "/api/search") {
    const query = (url.searchParams.get("q") || "").toLowerCase();
    const results =
      url.searchParams.get("kind") === "fund"
        ? funds
            .filter(
              (fund) =>
                samples[fund.ticker] &&
                `${fund.ticker} ${fund.name} ${fund.issuer}`
                  .toLowerCase()
                  .includes(query),
            )
            .slice(0, 8)
            .map((fund) => ({ ...fund, kind: "fund", id: `fund:${fund.ticker}` }))
        : [];
    return Response.json({ results });
  }
  return Response.json(
    { error: "This asset needs the backend. Try a sample fund." },
    { status: 404 },
  );
}

function reportOffline(offline: boolean) {
  window.dispatchEvent(new CustomEvent("portfolio-backend", { detail: offline }));
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const readOnly = !options.method || options.method === "GET";
  try {
    if (STATIC_HOST && !API_URL) throw new Error("Backend is not configured");
    const timeout = AbortSignal.timeout(readOnly ? 5000 : 30000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const response = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
      ...options,
      signal,
    });
    if (response.status >= 500) throw new Error("Backend unavailable");
    reportOffline(false);
    return response;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    reportOffline(true);
    if (readOnly) return bundledResponse(path);
    throw new Error("Backend offline. Your CSV has not been saved. Try again later.");
  }
}
