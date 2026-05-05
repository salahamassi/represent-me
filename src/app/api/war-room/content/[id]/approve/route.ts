/**
 * POST /api/war-room/content/[id]/approve
 *
 * Lightweight approval marker for a `generated_content` row — used
 * by Yusuf's inline draft preview ("✅ Approve & Copy" button). Just
 * flips `user_action` to 'approved' and returns.
 *
 * Distinct from the legacy `POST /api/content` route which also
 * triggers Zernio auto-publish on approval; the War Room flow is
 * "approve, copy to clipboard, paste manually", so we deliberately
 * skip the publish path.
 */

import { NextResponse } from "next/server";
import { updateContentAction } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentId = Number(id);
  if (!Number.isFinite(contentId) || contentId <= 0) {
    return NextResponse.json({ error: "Invalid content id" }, { status: 400 });
  }
  try {
    updateContentAction(contentId, "approved");
    return NextResponse.json({ ok: true, contentId, action: "approved" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
