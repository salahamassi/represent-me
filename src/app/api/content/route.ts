import { NextRequest, NextResponse } from "next/server";
import { getContentByType, getCodeGems, getAllContributions, updateContentAction } from "@/lib/db";
import { publishContentRow } from "@/services/zernio-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") || "all";

  switch (tab) {
    case "linkedin":
      return NextResponse.json(getContentByType("linkedin"));
    case "articles":
      return NextResponse.json(getContentByType("article"));
    case "gems":
      return NextResponse.json(getCodeGems(50));
    case "contributions":
      return NextResponse.json(getAllContributions(50));
    default:
      return NextResponse.json(getContentByType("all"));
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { contentId, action, mode } = body as {
    contentId?: number;
    action?: string;
    mode?: "auto" | "now";
  };

  if (!contentId || !action) {
    return NextResponse.json({ error: "contentId and action required" }, { status: 400 });
  }

  updateContentAction(contentId, action);

  // On approve, route through Zernio. `mode=now` forces immediate posting;
  // otherwise we auto-schedule to the next optimal slot if we're outside
  // the posting window. publishContentRow mutates the row to either
  // 'published' (immediate success) or 'scheduled' (queued). On any
  // failure we return ok=false in `publish` so the client can offer
  // the manual fallback.
  if (action === "approved") {
    const publishMode: "auto" | "now" = mode === "now" ? "now" : "auto";
    const result = await publishContentRow(contentId, publishMode);
    return NextResponse.json({
      success: true,
      publish: result,
    });
  }

  return NextResponse.json({ success: true });
}
