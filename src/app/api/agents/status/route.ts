import { NextRequest, NextResponse } from "next/server";
import { getLastAgentError } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent") || undefined;

  const lastError = getLastAgentError(agentId, 24);

  if (!lastError) {
    return NextResponse.json({ ok: true, error: null });
  }

  // Parse detail for error type
  let errorType = "unknown";
  try {
    const detail = lastError.detail ? JSON.parse(lastError.detail) : {};
    errorType = detail.errorType || "unknown";
  } catch {}

  return NextResponse.json({
    ok: false,
    error: {
      id: lastError.id,
      agentId: lastError.agent_id,
      title: lastError.title,
      type: errorType,
      createdAt: lastError.created_at,
    },
  });
}
