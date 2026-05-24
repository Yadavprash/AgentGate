import { NextResponse } from "next/server";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${GATEWAY_URL}/health`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ status: "unreachable" }, { status: 503 });
  }
}
