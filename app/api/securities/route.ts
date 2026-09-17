import { getDirectSecurity } from "@/db/security-repository";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const identityKey = searchParams.get("id") || undefined;

  if (!ticker) {
    return Response.json({ error: "Enter a security ticker." }, { status: 400 });
  }

  try {
    const security = await getDirectSecurity(ticker, identityKey);

    if (!security) {
      return Response.json({ error: "Security not found." }, { status: 404 });
    }

    return Response.json(security, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    console.error("Security database request failed", error);
    return Response.json(
      { error: "Security storage is temporarily unavailable." },
      { status: 503 },
    );
  }
}
