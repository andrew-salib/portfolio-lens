import { getFundPerformance } from "@/db/performance-repository";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.-]{1,15}$/.test(ticker)) {
    return Response.json({ error: "Enter a valid ETF ticker." }, { status: 400 });
  }
  try {
    const performance = await getFundPerformance(ticker);
    return Response.json({ performance });
  } catch (error) {
    console.error("Performance lookup failed", error);
    return Response.json(
      { error: "Performance storage is unavailable." },
      { status: 503 },
    );
  }
}
