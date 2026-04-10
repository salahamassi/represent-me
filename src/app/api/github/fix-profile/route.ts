import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchGitHubProfile, updateUserProfile } from "@/services/github-api-service";
import { profile as resumeProfile } from "@/data/profile";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, bio, company } = body;
  // action: "preview" | "apply"

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: "GitHub token not configured" }, { status: 500 });
  }

  if (action === "apply") {
    const updates: { bio?: string; company?: string } = {};
    if (bio) updates.bio = bio;
    if (company) updates.company = company;

    const ok = await updateUserProfile(updates);
    return NextResponse.json({
      success: ok,
      message: ok ? "Profile updated!" : "Failed to update profile",
    });
  }

  // Preview: generate suggestions
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude API not configured" }, { status: 500 });
  }

  const githubProfile = await fetchGitHubProfile();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    temperature: 0.5,
    system: "You help developers optimize their GitHub profile. Return ONLY valid JSON.",
    messages: [{
      role: "user",
      content: `Suggest an optimized GitHub bio and company for this developer:

Name: ${resumeProfile.name}
Current role: ${resumeProfile.role}
Current GitHub bio: "${githubProfile.bio || "(empty)"}"
Current company: "${githubProfile.company || "(not set)"}"
Location: ${resumeProfile.location}
Experience: ${resumeProfile.experience.map((e) => `${e.title} at ${e.company}`).join(", ")}
Skills: ${resumeProfile.skills.map((s) => s.items.slice(0, 3).join(", ")).join(", ")}
Open Source: Created Flutter Bond framework, contributed to share_plus, SwifterSwift

Return JSON:
{
  "bio": "Professional bio (max 160 chars). Should mention: role, key skills, notable projects",
  "company": "Current company or status (e.g. 'Nologystore W.L.L' or '@nologystore')",
  "bioOptions": ["option 1", "option 2", "option 3"]
}

Generate 3 bio options so the developer can pick their favorite.`,
    }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  let jsonText = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(jsonText);
    return NextResponse.json({
      success: true,
      currentBio: githubProfile.bio,
      currentCompany: githubProfile.company,
      suggestedBio: parsed.bio,
      suggestedCompany: parsed.company,
      bioOptions: parsed.bioOptions || [parsed.bio],
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse suggestions" }, { status: 500 });
  }
}
