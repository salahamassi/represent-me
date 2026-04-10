import { NextRequest, NextResponse } from "next/server";
import { updateScheduleConfig } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentId, enabled } = body;

  if (!agentId || enabled === undefined) {
    return NextResponse.json({ error: "agentId and enabled required" }, { status: 400 });
  }

  updateScheduleConfig(agentId, { enabled: enabled ? 1 : 0 });

  return NextResponse.json({ success: true, agentId, enabled });
}
