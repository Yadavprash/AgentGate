/**
 * POST /api/agent/launch
 * Proxies to the gateway so the browser never hits the gateway directly
 * (avoids CORS and works identically in Docker and locally).
 *
 * Set GATEWAY_URL in dashboard/.env.local:
 *   Local:  GATEWAY_URL=http://localhost:8000   (default)
 *   Docker: GATEWAY_URL=http://gateway:8000
 */
import { NextRequest, NextResponse } from "next/server";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${GATEWAY}/agent/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: `Gateway unreachable: ${err}` },
      { status: 502 },
    );
  }
}
