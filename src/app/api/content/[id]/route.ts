import { NextRequest, NextResponse } from "next/server";
import { getContentWithGem, updateContentText } from "@/lib/db";
import {
  findRepoContext,
  type GemForRegeneration,
} from "@/agents/ai/content-ai-agent";
import type { ContentSourceContext } from "@/types";

export const runtime = "nodejs";

/**
 * GET /api/content/:id
 * Returns the content row plus the source context Claude saw when generating it
 * (gem details + repo business-context blurb). Used by the chat panel's
 * "Sources" disclosure so the user can see what the post is grounded in.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentId = Number(id);
  if (!Number.isFinite(contentId)) {
    return NextResponse.json({ error: "Invalid content id" }, { status: 400 });
  }

  const result = getContentWithGem(contentId);
  if (!result) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const sources: ContentSourceContext = {
    repoName: result.gem?.repo_name || null,
    repoContext: result.gem ? findRepoContext(result.gem.repo_name) : "",
    gem: null,
  };

  if (result.gem?.ai_analysis) {
    try {
      const parsed = JSON.parse(result.gem.ai_analysis) as GemForRegeneration;
      sources.gem = {
        title: parsed.title,
        description: (result.gem as { description?: string }).description || "",
        gemType: parsed.gemType,
        filePath: parsed.filePath,
        codeSnippet: parsed.codeSnippet,
        usageExample: parsed.usageExample,
        realProblem: parsed.realProblem,
        whyInteresting: parsed.whyInteresting,
        contentAngle: parsed.contentAngle,
      };
    } catch {
      // Corrupt ai_analysis — fall back to bare gem row.
      sources.gem = {
        title: result.gem.title,
        description: (result.gem as { description?: string }).description || "",
        gemType: result.gem.gem_type,
        filePath: result.gem.file_path,
        codeSnippet: null,
        usageExample: null,
        realProblem: null,
        whyInteresting: null,
        contentAngle: null,
      };
    }
  }

  return NextResponse.json({ content: result.content, sources });
}

/**
 * PATCH /api/content/:id
 * Body: { text: string }
 *
 * Persists a refined draft (from the chat panel's "Accept" action) in place.
 * Bumps created_at so the card floats to the top of the list.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentId = Number(id);
  if (!Number.isFinite(contentId)) {
    return NextResponse.json({ error: "Invalid content id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const text: string = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // user_tips column is now unused in chat mode — pass empty string.
  updateContentText(contentId, text, "");
  return NextResponse.json({ success: true });
}
