import { NextResponse } from "next/server";
import { getLatestGitHubInsights, getAllContributions, getCodeGems } from "@/lib/db";

export async function GET() {
  const insights = getLatestGitHubInsights();
  const contributions = getAllContributions(5);
  const gems = getCodeGems(20);

  return NextResponse.json({
    ...insights,
    contributions,
    gems,
  });
}
