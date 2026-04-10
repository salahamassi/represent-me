import { NextRequest, NextResponse } from "next/server";
import { getActivityLog, getTotalAICost } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "100");
  const agentId = searchParams.get("agentId") || undefined;
  const runId = searchParams.get("runId") ? parseInt(searchParams.get("runId")!) : undefined;

  const activities = getActivityLog(limit, agentId, runId);
  const costs = getTotalAICost();

  return NextResponse.json({ activities, costs });
}
