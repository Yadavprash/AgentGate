/**
 * GET /api/agent/stream/[runId]
 * Proxies the SSE stream from the gateway to the browser.
 */
import { NextRequest } from "next/server";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const upstream = await fetch(`${GATEWAY}/agent/stream/${runId}`, {
      headers: { Accept: "text/event-stream" },
      // @ts-expect-error — Next.js / undici needs this to disable response buffering
      duplex: "half",
    });

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return new Response(`data: [ERROR: ${err}]\n\ndata: [DONE]\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
}
