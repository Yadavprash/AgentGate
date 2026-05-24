/**
 * DELETE /api/agent/stop/[runId]
 * Terminates a running agent subprocess via the gateway.
 */
import { NextRequest, NextResponse } from "next/server";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8000";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const res = await fetch(`${GATEWAY}/agent/run/${runId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
