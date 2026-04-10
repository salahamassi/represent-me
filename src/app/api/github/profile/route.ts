import { NextResponse } from "next/server";
import { fetchGitHubProfile } from "@/services/github-api-service";

export async function GET() {
  try {
    const profile = await fetchGitHubProfile();
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
