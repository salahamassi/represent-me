import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  fetchGitHubRepos,
  fetchRepoReadme,
  updateRepoDescription,
  updateRepoTopics,
} from "@/services/github-api-service";

// POST with action: "preview" → generate suggestions without applying
// POST with action: "apply" → apply specific approved suggestions
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, type, suggestions } = body;
  // type: "descriptions" | "topics" | "both"
  // suggestions: [{ repo, description?, topics? }] (only for "apply")

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: "GitHub token not configured" }, { status: 500 });
  }

  if (action === "apply") {
    return applyApproved(suggestions || []);
  }

  // Default: preview mode — generate suggestions
  return generatePreview(type || "both");
}

async function generatePreview(type: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude API not configured" }, { status: 500 });
  }

  const allRepos = await fetchGitHubRepos();
  const repos = allRepos.filter((r) => !r.isArchived && !r.isFork);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const needsWork = repos.filter((r) => {
    if (type === "descriptions") return !r.description;
    if (type === "topics") return r.topics.length === 0;
    return !r.description || r.topics.length === 0;
  });

  const suggestions: {
    repo: string;
    currentDescription: string | null;
    suggestedDescription: string | null;
    currentTopics: string[];
    suggestedTopics: string[] | null;
    language: string | null;
    stars: number;
  }[] = [];

  // Process in batches of 5
  for (let i = 0; i < needsWork.length; i += 5) {
    const batch = needsWork.slice(i, i + 5);

    const batchResults = await Promise.all(
      batch.map(async (repo) => {
        try {
          const readme = await fetchRepoReadme("salahamassi", repo.name);

          const message = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            temperature: 0.3,
            system: "You generate GitHub repo descriptions and topics. Return ONLY valid JSON.",
            messages: [{
              role: "user",
              content: `Generate a description and topics for this GitHub repo:

Name: ${repo.name}
Language: ${repo.language || "Unknown"}
Stars: ${repo.stars}
Current description: ${repo.description || "(none)"}
Current topics: ${repo.topics.length > 0 ? repo.topics.join(", ") : "(none)"}
README excerpt: ${readme.slice(0, 800)}

Return JSON:
{
  "description": "One-line description (max 100 chars, no period at end)",
  "topics": ["topic1", "topic2", "topic3"]
}

Topics should be lowercase, hyphenated, relevant. Max 8 topics.
Only generate what's missing — if description exists, return the current one.`,
            }],
          });

          const textBlock = message.content.find((b) => b.type === "text");
          let jsonText = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
          if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }

          const parsed = JSON.parse(jsonText) as { description: string; topics: string[] };

          return {
            repo: repo.name,
            currentDescription: repo.description,
            suggestedDescription: !repo.description ? parsed.description : null,
            currentTopics: repo.topics,
            suggestedTopics: repo.topics.length === 0 ? parsed.topics?.slice(0, 8) : null,
            language: repo.language,
            stars: repo.stars,
          };
        } catch (err) {
          return {
            repo: repo.name,
            currentDescription: repo.description,
            suggestedDescription: null,
            currentTopics: repo.topics,
            suggestedTopics: null,
            language: repo.language,
            stars: repo.stars,
          };
        }
      })
    );

    suggestions.push(...batchResults);
  }

  return NextResponse.json({
    success: true,
    suggestions,
    message: `Generated suggestions for ${suggestions.length} repos`,
  });
}

async function applyApproved(
  suggestions: { repo: string; description?: string; topics?: string[] }[]
) {
  const results: { repo: string; success: boolean; applied: string[]; error?: string }[] = [];

  for (const item of suggestions) {
    const applied: string[] = [];
    let error: string | undefined;

    try {
      if (item.description) {
        const ok = await updateRepoDescription(item.repo, item.description);
        if (ok) applied.push("description");
        else error = "Failed to update description";
      }

      if (item.topics && item.topics.length > 0) {
        const ok = await updateRepoTopics(item.repo, item.topics);
        if (ok) applied.push("topics");
        else error = (error ? error + "; " : "") + "Failed to update topics";
      }

      results.push({ repo: item.repo, success: applied.length > 0, applied, error });
    } catch (err) {
      results.push({
        repo: item.repo,
        success: false,
        applied,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  return NextResponse.json({
    success: true,
    message: `Applied changes to ${succeeded} of ${suggestions.length} repos`,
    results,
  });
}
