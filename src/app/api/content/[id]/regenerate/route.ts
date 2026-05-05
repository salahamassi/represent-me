import { NextRequest, NextResponse } from "next/server";
import { getContentWithGem } from "@/lib/db";
import { getAgentBus } from "@/agents/base/agent-bus";
import {
  ContentAIAgent,
  findRepoContext,
  type GemForRegeneration,
} from "@/agents/ai/content-ai-agent";
import type { ChatMessage } from "@/types";

export const runtime = "nodejs";

/**
 * POST /api/content/:id/regenerate
 * Body: {
 *   currentDraft: string,                // post text shown when chat opened
 *   messages: ChatMessage[]              // alternating user/assistant; ends with `user`
 * }
 *
 * Performs ONE chat turn: replays the gem prompt + currentDraft as the opening
 * exchange, then the chat history, asks Claude to produce the next draft.
 *
 * Returns { text } — the new draft. Does NOT persist; the client calls
 * PATCH /api/content/:id with the final text once the user clicks Accept.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contentId = Number(id);
  if (!Number.isFinite(contentId)) {
    return NextResponse.json({ error: "Invalid content id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const currentDraft: string = typeof body?.currentDraft === "string" ? body.currentDraft : "";
  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
  const messages: ChatMessage[] = rawMessages
    .filter((m: unknown): m is ChatMessage =>
      !!m &&
      typeof m === "object" &&
      "role" in m &&
      "content" in m &&
      ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
      typeof (m as ChatMessage).content === "string"
    );

  if (!currentDraft.trim()) {
    return NextResponse.json({ error: "currentDraft is required" }, { status: 400 });
  }
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "last message must be a user turn" }, { status: 400 });
  }

  const result = getContentWithGem(contentId);
  if (!result) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }
  if (!result.gem || !result.gem.ai_analysis) {
    return NextResponse.json(
      { error: "This post has no linked source gem — refinement not supported" },
      { status: 400 }
    );
  }

  let gemData: GemForRegeneration;
  try {
    gemData = JSON.parse(result.gem.ai_analysis) as GemForRegeneration;
  } catch {
    return NextResponse.json({ error: "Source gem data is corrupt" }, { status: 500 });
  }

  const repoContext = findRepoContext(gemData.repoName);
  const agent = new ContentAIAgent(getAgentBus());

  try {
    const newText = await agent.refineGemPostInChat(gemData, repoContext, currentDraft, messages);
    return NextResponse.json({ text: newText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
