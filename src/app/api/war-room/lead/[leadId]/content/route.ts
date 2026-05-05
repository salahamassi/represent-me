/**
 * GET /api/war-room/lead/[leadId]/content
 *
 * Returns the latest `generated_content` row tagged with this lead's
 * id (`related_lead_id`), or null if no agent has produced anything
 * yet. The Layla workbench panel polls this endpoint to drive the
 * synthetic-row replacement: real char count, real createdAt, real
 * "Queued / Drafting / Ready" status — no setInterval theatre.
 *
 * Returns 200 in both cases (with `content: null` when the lead has
 * no draft yet) so the client can distinguish "no row exists" from
 * "request failed."
 */

import { NextRequest, NextResponse } from "next/server";
import { getLeadContent } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }
  const content = getLeadContent(leadId);
  return NextResponse.json({ leadId, content });
}
