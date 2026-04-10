import { NextRequest, NextResponse } from "next/server";
import { updateJobAction } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { jobId, action } = await request.json();

  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  updateJobAction(jobId, action || "apply_later");
  return NextResponse.json({ success: true });
}
