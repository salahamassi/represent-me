import { NextRequest, NextResponse } from "next/server";
import { updateJobAction } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { jobId, action } = (await request.json()) as {
    jobId?: string;
    action?: string | null;
  };

  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  // `action: "unapply"` (or explicit null) clears the state, moving the
  // row back to the Pending tab in the Jobs UI. Any other falsy value
  // keeps the legacy default of "apply_later" for backward compatibility
  // with older clients.
  let nextAction: string | null;
  if (action === "unapply" || action === null) {
    nextAction = null;
  } else {
    nextAction = action || "apply_later";
  }

  updateJobAction(jobId, nextAction);
  return NextResponse.json({ success: true });
}
