import { NextRequest, NextResponse } from "next/server";
import { getContentByType, getCodeGems, getAllContributions, updateContentAction } from "@/lib/db";

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
  const { contentId, action } = body;

  if (!contentId || !action) {
    return NextResponse.json({ error: "contentId and action required" }, { status: 400 });
  }

  updateContentAction(contentId, action);
  return NextResponse.json({ success: true });
}
