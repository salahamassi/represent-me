import { NextRequest, NextResponse } from "next/server";
import { getRunHistory, getSeenJobs, getRecentContent } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId") || undefined;
  const type = searchParams.get("type") || "runs";

  if (type === "jobs") {
    return NextResponse.json(getSeenJobs());
  }
  if (type === "content") {
    return NextResponse.json(getRecentContent());
  }

  return NextResponse.json(getRunHistory(50, agentId));
}
