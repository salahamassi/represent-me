import { NextRequest, NextResponse } from "next/server";
import { getAllContributions, getContributionsByStatus } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  if (status) {
    return NextResponse.json(getContributionsByStatus(status));
  }

  return NextResponse.json(getAllContributions(100));
}
