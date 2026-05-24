import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

function policyPath(): string {
  const explicit = process.env.BASTION_POLICY_FILE?.trim();
  if (explicit) return explicit;
  // Next.js CWD is dashboard/ — go up one level to project root
  return path.resolve(process.cwd(), "..", "bastion-policy.yaml");
}

export async function GET() {
  try {
    const content = readFileSync(policyPath(), "utf-8");
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ content: "" });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    }
    if (!content.includes("version:") || !content.includes("tools:")) {
      return NextResponse.json(
        { error: "Policy must include both version: and tools:" },
        { status: 422 },
      );
    }
    writeFileSync(policyPath(), content, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
