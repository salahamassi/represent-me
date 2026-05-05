import { NextRequest, NextResponse } from "next/server";
import { getContentWithGem, saveContentScore } from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";
import {
  ContentAIAgent,
  findRepoContext,
  type GemForRegeneration,
} from "@/agents/ai/content-ai-agent";
import type { ContentSourceContext } from "@/types";

export const runtime = "nodejs";

/**
 * POST /api/content/:id/score
 *
 * Claude self-critiques the current post text against the "clear vs mysterious"
 * bar. Uses Haiku 4.5 (cheap) and grounds the critique in the same Sources
 * context (gem + repo blurb) the generator originally saw.
 *
 * Side effect: persists the score on the content row. Returns the fresh score.
 */
export async function POST(
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

  const postText = result.content.generated_text;
  if (!postText?.trim()) {
    return NextResponse.json({ error: "Content has no text to score" }, { status: 400 });
  }

  // Rebuild the Sources context Claude saw — same shape used by the chat panel.
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
      // Fall back to bare row data — scoring still works, just with less context.
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

  const agent = new ContentAIAgent(getAgentBus());

  try {
    const score = await agent.scoreContent(postText, sources);
    saveContentScore(contentId, score.score, score.verdict, score.oneLineVerdict, score.tips);
    return NextResponse.json({
      score: score.score,
      verdict: score.verdict,
      oneLineVerdict: score.oneLineVerdict,
      tips: score.tips,
      scoredAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
