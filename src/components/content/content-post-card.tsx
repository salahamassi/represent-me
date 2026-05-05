"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import { CarouselPanel } from "./carousel-panel";
import type { GeneratedContent, ChatMessage, ContentSourceContext, ContentScore } from "@/types";
import { useContentStore } from "@/store/content-store";
import { cn } from "@/lib/utils";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Short badge-friendly label for scheduled posts, in Salah's local timezone.
 * Kept distinct from formatDate so we can display the scheduled time in AST
 * regardless of the viewer's locale, matching the Telegram reply.
 */
function formatScheduledLabel(isoUtc: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(isoUtc)) + " AST";
}

function getSourceLabel(contentType: string): string {
  if (contentType.includes("gem")) return "Code Gem";
  if (contentType.includes("contribution")) return "Contribution";
  if (contentType.includes("weekly") || contentType === "linkedin_post") return "Weekly";
  return contentType;
}

function isLinkedInContent(contentType: string): boolean {
  return contentType.includes("linkedin") || contentType === "gem_linkedin_post";
}

/** Posts with this prefix on suggestion_id can be refined from their source gem. */
function isGemSourced(suggestionId: string | null): boolean {
  return !!suggestionId && /^gem-\d+$/.test(suggestionId);
}

/**
 * Build a ContentScore from the DB row fields so the panel can render
 * immediately for already-scored posts without a round-trip to Claude.
 * Tips are stored as JSON — parse defensively.
 */
function hydrateScore(content: GeneratedContent): ContentScore | null {
  if (
    typeof content.score !== "number" ||
    !content.score_verdict ||
    !content.score_one_liner ||
    !content.scored_at
  ) {
    return null;
  }
  let tips: string[] = [];
  try {
    const parsed = content.score_tips ? JSON.parse(content.score_tips) : [];
    if (Array.isArray(parsed)) tips = parsed.filter((t): t is string => typeof t === "string");
  } catch {
    tips = [];
  }
  const verdict = content.score_verdict;
  if (verdict !== "clear" && verdict !== "needs-sharpening" && verdict !== "mysterious") {
    return null;
  }
  return {
    score: content.score,
    verdict,
    oneLineVerdict: content.score_one_liner,
    tips,
    scoredAt: content.scored_at,
  };
}

/** Map a 1-10 score to badge/background classes. */
function scoreColorClasses(score: number): { badge: string; ring: string } {
  if (score >= 8) return { badge: "bg-emerald-500/20 text-emerald-300", ring: "border-emerald-500/30" };
  if (score >= 5) return { badge: "bg-amber-500/20 text-amber-300", ring: "border-amber-500/30" };
  return { badge: "bg-red-500/20 text-red-300", ring: "border-red-500/30" };
}

export function ContentPostCard({ content }: { content: GeneratedContent }) {
  const approveContent = useContentStore((s) => s.approveContent);
  const rejectContent = useContentStore((s) => s.rejectContent);
  const refineDraft = useContentStore((s) => s.refineDraft);
  const acceptDraft = useContentStore((s) => s.acceptDraft);
  const fetchSources = useContentStore((s) => s.fetchSources);
  const scoreContent = useContentStore((s) => s.scoreContent);

  /**
   * Populated only when the primary Zernio auto-post path fails — the panel
   * gives the user the manual fallback (clipboard + PNG + open LinkedIn tab).
   * On Zernio success the card simply re-renders with `user_action="published"`
   * and the "View on LinkedIn ↗" link in the header, no panel needed.
   */
  const [shareResult, setShareResult] = useState<
    | { clipboardOk: boolean; text: string; zernioError?: string }
    | null
  >(null);
  const [publishing, setPublishing] = useState(false);

  // Chat state — all in-memory. Reset when chat closes (Cancel/Accept).
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tipDraft, setTipDraft] = useState("");
  /** What the post body shows. Starts as DB text, updates with each refine turn. */
  const [previewText, setPreviewText] = useState(content.generated_text);
  /** Phase 7 — toggle between the carousel-mode rewrite and the
   *  original code-heavy draft. Defaults to carousel-mode whenever a
   *  rewrite exists, since that's what the publish flow actually
   *  posts. Local-only; toggling never mutates the DB. */
  const hasCarouselPost = !!content.carousel_post_text;
  const [postVariant, setPostVariant] = useState<"carousel" | "original">(
    hasCarouselPost ? "carousel" : "original"
  );
  /** Effective text shown in the post body + sent to the copy button.
   *  When chat is open we keep the chat working copy in front (matches
   *  prior behaviour); otherwise the toggle picks the source. */
  const displayedText = chatOpen
    ? previewText
    : postVariant === "carousel" && content.carousel_post_text
      ? content.carousel_post_text
      : content.generated_text;
  /** Snapshot taken when chat opens — used for Cancel revert and as the anchor for Claude. */
  const [chatAnchor, setChatAnchor] = useState(content.generated_text);
  const [chatStatus, setChatStatus] = useState<"idle" | "sending" | "saving" | "error">("idle");
  const [chatError, setChatError] = useState<string | null>(null);

  // Carousel regen status — fired non-blocking after Accept so the
  // carousel deck stays anchored to the freshly refined post body.
  const [carouselRegen, setCarouselRegen] = useState<"idle" | "regenerating" | "error">("idle");
  const [carouselRegenError, setCarouselRegenError] = useState<string | null>(null);

  // Sources panel state
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sources, setSources] = useState<ContentSourceContext | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  // Score panel state — seeded from the row if we've already scored this post
  // so the panel is visible on page load without paying for another Claude call.
  const [score, setScore] = useState<ContentScore | null>(() => hydrateScore(content));
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const statusColors: Record<string, string> = {
    approved: "text-emerald-400 bg-emerald-500/10",
    scheduled: "text-purple-300 bg-purple-500/10",
    published: "text-cyan-300 bg-cyan-500/10",
    rejected: "text-red-400 bg-red-500/10",
    default: "text-muted-foreground bg-zinc-500/10",
  };
  const isPublished = content.user_action === "published";
  const isScheduled = content.user_action === "scheduled";

  const canRefine = isGemSourced(content.suggestion_id);
  const isDraftDirty = previewText !== content.generated_text;

  const handlePublish = async (mode: "auto" | "now" = "auto") => {
    if (publishing) return;
    setPublishing(true);

    // 1. Mark approved + kick off Zernio (auto = smart-schedule; now = override).
    const result = await approveContent(content.id, mode);

    // 2. On success the card has already refreshed with either 'published'
    //    (+ View on LinkedIn link) or 'scheduled' (+ date badge) — we're done.
    if (result.ok) {
      setPublishing(false);
      return;
    }

    // 3. Zernio failed. Fall back to the manual paste flow: copy to
    //    clipboard, download the code card PNG, open LinkedIn compose, then
    //    show the status panel so the user has everything they need to paste.
    const text = content.generated_text;

    let clipboardOk = false;
    try {
      await navigator.clipboard.writeText(text);
      clipboardOk = true;
    } catch {
      clipboardOk = false;
    }

    if (isLinkedInContent(content.content_type)) {
      window.open("https://www.linkedin.com/feed/?shareActive=true", "_blank");
    }

    setShareResult({
      clipboardOk,
      text,
      zernioError: result.error,
    });
    setPublishing(false);
  };

  /** Retry the clipboard write — used by the manual-copy fallback. */
  const retryClipboard = async () => {
    if (!shareResult) return;
    try {
      await navigator.clipboard.writeText(shareResult.text);
      setShareResult({ ...shareResult, clipboardOk: true });
    } catch {
      // Stay in the failed state — the textarea is still selectable for a manual copy.
    }
  };

  const reopenLinkedIn = () => {
    window.open("https://www.linkedin.com/feed/?shareActive=true", "_blank");
  };

  const openChat = () => {
    setChatOpen(true);
    setMessages([]);
    setTipDraft("");
    setPreviewText(content.generated_text);
    setChatAnchor(content.generated_text);
    setChatStatus("idle");
    setChatError(null);
  };

  const closeChat = () => {
    setChatOpen(false);
    setMessages([]);
    setTipDraft("");
    setPreviewText(content.generated_text);
    setChatAnchor(content.generated_text);
    setChatStatus("idle");
    setChatError(null);
  };

  const handleSend = async () => {
    const tip = tipDraft.trim();
    if (!tip || chatStatus === "sending" || chatStatus === "saving") return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: tip }];
    setMessages(nextMessages);
    setTipDraft("");
    setChatStatus("sending");
    setChatError(null);

    const result = await refineDraft(content.id, chatAnchor, nextMessages);
    if (result.ok && result.text) {
      const newText = result.text;
      setMessages([...nextMessages, { role: "assistant", content: newText }]);
      setPreviewText(newText);
      setChatStatus("idle");
    } else {
      setChatStatus("error");
      setChatError(result.error || "Refine failed");
      // Roll back the optimistic user message so the textarea retains the tip
      setMessages(messages);
      setTipDraft(tip);
    }
  };

  const handleAccept = async () => {
    if (!isDraftDirty || chatStatus === "saving") return;
    setChatStatus("saving");
    setChatError(null);
    const result = await acceptDraft(content.id, previewText);
    if (result.ok) {
      setChatOpen(false);
      setMessages([]);
      setTipDraft("");
      setChatStatus("idle");
      // Saving new text wipes the DB score (see updateContentText). Clear local
      // state too so the stale ScorePanel vanishes and the Score button returns.
      setScore(null);
      setScoreError(null);
      // Fire-and-forget carousel regen — the deck was anchored to the old
      // draft, so refining the post leaves it stale. Modal already closed;
      // surface progress via the header badge.
      if (canRefine) {
        regenerateCarousel();
      }
    } else {
      setChatStatus("error");
      setChatError(result.error || "Accept failed");
    }
  };

  const regenerateCarousel = async () => {
    setCarouselRegen("regenerating");
    setCarouselRegenError(null);
    try {
      const res = await fetch(
        `/api/content/${content.id}/carousel?regenerate=true`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCarouselRegen("error");
        setCarouselRegenError(data?.error || `Regen failed (${res.status})`);
        return;
      }
      // Pick up the fresh carousel_post_text and deck artefacts.
      await useContentStore.getState().fetchTab(useContentStore.getState().activeTab);
      setCarouselRegen("idle");
    } catch (err) {
      setCarouselRegen("error");
      setCarouselRegenError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleSources = async () => {
    const next = !sourcesOpen;
    setSourcesOpen(next);
    if (next && !sources && !sourcesLoading) {
      setSourcesLoading(true);
      const result = await fetchSources(content.id);
      if (result.ok && result.sources) setSources(result.sources);
      setSourcesLoading(false);
    }
  };

  const handleScore = async () => {
    if (scoring) return;
    setScoring(true);
    setScoreError(null);
    const result = await scoreContent(content.id);
    if (result.ok && result.score) {
      setScore(result.score);
    } else {
      setScoreError(result.error || "Score failed");
    }
    setScoring(false);
  };

  /**
   * Drop a score tip into the Refine-in-chat textarea so the user can edit
   * and send. If the chat isn't open we open it first (and snapshot the
   * current previewText as the anchor, matching openChat semantics).
   */
  const useTipInChat = (tip: string) => {
    if (!chatOpen) {
      setChatOpen(true);
      setMessages([]);
      setPreviewText(content.generated_text);
      setChatAnchor(content.generated_text);
      setChatStatus("idle");
      setChatError(null);
    }
    setTipDraft(tip);
  };

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-blue-400">
              {getSourceLabel(content.content_type)}
            </Badge>
            {content.user_action && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  statusColors[content.user_action] || statusColors.default
                )}
              >
                {content.user_action === "approved"
                  ? "approved · not published"
                  : content.user_action === "scheduled" && content.scheduled_for
                    ? `📅 scheduled · ${formatScheduledLabel(content.scheduled_for)}`
                    : content.user_action}
              </Badge>
            )}
            {isPublished && content.linkedin_post_url && (
              <a
                href={content.linkedin_post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cyan-300 hover:text-cyan-200 underline-offset-2 hover:underline"
              >
                View on LinkedIn ↗
              </a>
            )}
            {chatOpen && isDraftDirty && (
              <Badge variant="outline" className="text-xs text-amber-400 bg-amber-500/10">
                unsaved draft
              </Badge>
            )}
            {carouselRegen === "regenerating" && (
              <Badge variant="outline" className="text-xs text-cyan-400 bg-cyan-500/10">
                regenerating carousel…
              </Badge>
            )}
            {carouselRegen === "error" && (
              <Badge
                variant="outline"
                className="text-xs text-red-400 bg-red-500/10 cursor-pointer"
                title={carouselRegenError || "Carousel regen failed — click to retry"}
                onClick={() => regenerateCarousel()}
              >
                carousel regen failed · retry
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground/60">{formatDate(content.created_at)}</span>
        </div>

        {/* Phase 7 — variant toggle. Only visible when a carousel
            rewrite exists AND the chat is closed (chat panel has its
            own working copy). */}
        {hasCarouselPost && !chatOpen && (
          <div className="flex items-center gap-2 text-[10px]">
            <button
              onClick={() => setPostVariant("carousel")}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-colors",
                postVariant === "carousel"
                  ? "bg-cyan-600/20 text-cyan-300"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Narrative-only rewrite that pairs with the carousel — what actually gets published"
            >
              Carousel-mode
            </button>
            <button
              onClick={() => setPostVariant("original")}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-colors",
                postVariant === "original"
                  ? "bg-cyan-600/20 text-cyan-300"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Pre-rewrite source — kept for A/B comparison"
            >
              Original
            </button>
            <span className="text-muted-foreground/60">
              {postVariant === "carousel"
                ? "· this is what gets published"
                : "· pre-rewrite source (not published)"}
            </span>
          </div>
        )}

        <div className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-foreground leading-relaxed max-h-[300px] overflow-y-auto">
          {displayedText}
        </div>

        {/* Carousel panel — generates a 4-slide PDF from the post and
            shows a thumbnail strip + download. LinkedIn-specific; the
            renderer assumes code-heavy content. Phase 4 ships it as a
            manual button; Phase 5 wires the auto-trigger in the gem
            mining cron. The card-level "this is what gets published"
            view = post text + this carousel; nothing else. */}
        {isLinkedInContent(content.content_type) && (
          <CarouselPanel content={content} />
        )}

        {/* Score panel — visible once a score exists (persisted across reloads) */}
        {score && (
          <ScorePanel
            score={score}
            onRescore={canRefine ? handleScore : undefined}
            rescoring={scoring}
            onUseTip={canRefine ? useTipInChat : undefined}
          />
        )}

        {/* Inline score error (no panel yet) */}
        {scoreError && !score && (
          <p className="text-xs text-red-400">{scoreError}</p>
        )}

        {/* Chat panel */}
        {canRefine && chatOpen && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            {/* Sources disclosure */}
            <div>
              <button
                onClick={toggleSources}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {sourcesOpen ? "▼" : "▶"} Sources Claude saw
              </button>
              {sourcesOpen && (
                <div className="mt-2 space-y-2 rounded-md border border-border bg-background p-3 text-xs">
                  {sourcesLoading && (
                    <p className="text-muted-foreground">Loading…</p>
                  )}
                  {!sourcesLoading && sources && (
                    <SourcesPanel sources={sources} />
                  )}
                  {!sourcesLoading && !sources && (
                    <p className="text-muted-foreground">No source context available.</p>
                  )}
                </div>
              )}
            </div>

            {/* Chat history */}
            {messages.length > 0 && (
              <div className="max-h-[260px] space-y-2 overflow-y-auto rounded-md border border-border bg-background p-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs",
                      msg.role === "user"
                        ? "ml-8 border-blue-500/30 bg-blue-500/10 text-foreground"
                        : "mr-8 border-border bg-muted text-foreground/90"
                    )}
                  >
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {msg.role === "user" ? "you" : "claude"}
                    </div>
                    <div className="whitespace-pre-wrap">
                      {msg.role === "assistant"
                        ? `Updated draft (${msg.content.length} chars)`
                        : msg.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                {messages.length === 0 ? "What should change?" : "Next refinement"}
              </label>
              <textarea
                value={tipDraft}
                onChange={(e) => setTipDraft(e.target.value)}
                disabled={chatStatus === "sending" || chatStatus === "saving"}
                placeholder="e.g. make it shorter, drop the question at the end, lean harder on the marketing angle…"
                className="w-full min-h-[70px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
              />
              {chatError && (
                <p className="text-xs text-red-400">{chatError}</p>
              )}
              <div className="flex items-center justify-between">
                <button
                  onClick={closeChat}
                  disabled={chatStatus === "sending" || chatStatus === "saving"}
                  className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleSend}
                    disabled={
                      chatStatus === "sending" ||
                      chatStatus === "saving" ||
                      !tipDraft.trim()
                    }
                    className="rounded-md bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-600/30 disabled:opacity-50"
                  >
                    {chatStatus === "sending" ? "Refining…" : "Send"}
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={
                      !isDraftDirty ||
                      chatStatus === "sending" ||
                      chatStatus === "saving"
                    }
                    className="rounded-md bg-emerald-600/20 px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/30 disabled:opacity-50"
                    title={!isDraftDirty ? "Send a refinement first" : undefined}
                  >
                    {chatStatus === "saving" ? "Saving…" : "Accept"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Share status panel — appears after Approve & Share fires */}
        {!chatOpen && shareResult && (
          <ShareStatusPanel
            result={shareResult}
            onRetryClipboard={retryClipboard}
            onReopenLinkedIn={reopenLinkedIn}
            onDismiss={() => setShareResult(null)}
            isLinkedIn={isLinkedInContent(content.content_type)}
          />
        )}

        {/* Action row — hidden while chat is open to keep UX focused.
             The "Post now anyway" override lives on its own tiny row below
             the main action line so the primary line stays a clean
             horizontal: Score | Refine | Publish | Reject. */}
        {!chatOpen && (() => {
          const canPublish =
            !content.user_action || content.user_action === "approved";
          const showPostNowOverride =
            canPublish && isLinkedInContent(content.content_type);
          return (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <CopyButton text={displayedText} />

                <div className="flex gap-2">
                  {!score && (
                    <button
                      onClick={handleScore}
                      disabled={scoring}
                      className="rounded-md bg-purple-600/10 px-3 py-1 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-600/20 disabled:opacity-50"
                      title="Claude (Haiku) grades the post 1-10 on clarity"
                    >
                      {scoring ? "Scoring…" : "Score"}
                    </button>
                  )}
                  {canRefine && (
                    <button
                      onClick={openChat}
                      className="rounded-md bg-blue-600/10 px-3 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-600/20"
                    >
                      Refine in chat
                    </button>
                  )}
                  {/* Publish is available while state is pending OR "approved"
                       (row was approved manually/elsewhere but never landed on
                       LinkedIn). Once scheduled/published/rejected, this row
                       collapses to just Score + Refine. */}
                  {canPublish && (
                    <button
                      onClick={() => handlePublish("auto")}
                      disabled={publishing}
                      className="rounded-md bg-emerald-600/20 px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/30 disabled:opacity-50"
                      title="Posts now if within the window, otherwise schedules for next Tue/Wed/Thu 10:30 AM AST"
                    >
                      {publishing
                        ? "Publishing…"
                        : isLinkedInContent(content.content_type)
                          ? "Publish to LinkedIn"
                          : "Approve"}
                    </button>
                  )}
                  {/* Reject only on truly-pending rows. Once approved the user
                       has said yes — they can edit via Refine or just publish. */}
                  {!content.user_action && (
                    <button
                      onClick={() => rejectContent(content.id)}
                      className="rounded-md bg-red-600/20 px-3 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30"
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
              {showPostNowOverride && (
                <div className="flex justify-end">
                  <button
                    onClick={() => handlePublish("now")}
                    disabled={publishing}
                    className="text-[10px] text-muted-foreground/70 hover:text-foreground/80 disabled:opacity-50"
                    title="Skip scheduling, post immediately"
                  >
                    Post now anyway →
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

/**
 * Fallback panel shown when the Zernio auto-post failed. Gives the user the
 * manual paste path: clipboard status, code card download, LinkedIn compose
 * tab reopen, plus the Zernio error so they know why the auto-path didn't
 * work this time.
 */
function ShareStatusPanel({
  result,
  isLinkedIn,
  onRetryClipboard,
  onReopenLinkedIn,
  onDismiss,
}: {
  result: { clipboardOk: boolean; text: string; zernioError?: string };
  isLinkedIn: boolean;
  onRetryClipboard: () => void;
  onReopenLinkedIn: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <div className="font-semibold text-amber-300">
        {isLinkedIn ? "Auto-post failed — paste manually" : "Approved"}
      </div>

      {result.zernioError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-300">
          Zernio: {result.zernioError}
        </div>
      )}

      <ul className="space-y-1">
        <li className={result.clipboardOk ? "text-emerald-400" : "text-red-400"}>
          {result.clipboardOk
            ? "✓ Text copied to clipboard"
            : "✗ Clipboard blocked — copy manually below"}
        </li>
      </ul>

      {isLinkedIn && (
        <div className="text-muted-foreground">
          <div className="mb-1">In the LinkedIn tab:</div>
          <ol className="ml-4 list-decimal space-y-0.5">
            <li>Paste (⌘V / Ctrl-V) the post text</li>
            <li>If the post has a carousel, click the document icon and upload the PDF from the card&apos;s Download button</li>
          </ol>
          <div className="mt-2 italic opacity-70">
            LinkedIn doesn&apos;t support pre-filling post text or document attachments via URL — that&apos;s why the composer opens empty.
          </div>
        </div>
      )}

      {!result.clipboardOk && (
        <div className="space-y-2">
          <textarea
            readOnly
            value={result.text}
            onClick={(e) => e.currentTarget.select()}
            className="w-full min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
          />
          <button
            onClick={onRetryClipboard}
            className="rounded-md bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-600/30"
          >
            Try copy again
          </button>
        </div>
      )}

      <div className="flex justify-between">
        {isLinkedIn ? (
          <button
            onClick={onReopenLinkedIn}
            className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Open LinkedIn again
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={onDismiss}
          className="rounded-md bg-emerald-600/20 px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/30"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** Read-only display of the gem + repo context Claude was given. */
function SourcesPanel({ sources }: { sources: ContentSourceContext }) {
  return (
    <div className="space-y-3">
      {sources.repoName && (
        <Field label="Repo" value={sources.repoName} />
      )}
      {sources.gem?.filePath && (
        <Field label="File" value={sources.gem.filePath} />
      )}
      {sources.gem?.gemType && (
        <Field label="Gem type" value={sources.gem.gemType} />
      )}
      {sources.gem?.title && (
        <Field label="Title" value={sources.gem.title} />
      )}
      {sources.gem?.realProblem && (
        <Field label="Real problem" value={sources.gem.realProblem} multiline />
      )}
      {sources.gem?.whyInteresting && (
        <Field label="Why interesting" value={sources.gem.whyInteresting} multiline />
      )}
      {sources.gem?.contentAngle && (
        <Field label="Content angle" value={sources.gem.contentAngle} multiline />
      )}
      {sources.gem?.codeSnippet && (
        <CodeField label="Code snippet" value={sources.gem.codeSnippet} />
      )}
      {sources.gem?.usageExample && (
        <CodeField label="Usage example" value={sources.gem.usageExample} />
      )}
      {sources.repoContext && (
        <Field label="Repo context" value={sources.repoContext} multiline />
      )}
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-foreground/90", multiline && "whitespace-pre-wrap")}>
        {value}
      </div>
    </div>
  );
}

function CodeField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="mt-1 max-h-[160px] overflow-auto rounded bg-muted/50 p-2 text-[11px] leading-snug text-foreground/90">
        {value}
      </pre>
    </div>
  );
}

/**
 * Claude's self-critique panel. The big score on the left answers "ready to
 * publish?"; the tips on the right are one-click actionable — each one drops
 * into the Refine-in-chat textarea so the user can edit and send without
 * retyping.
 */
function ScorePanel({
  score,
  rescoring,
  onRescore,
  onUseTip,
}: {
  score: ContentScore;
  rescoring: boolean;
  onRescore?: () => void;
  onUseTip?: (tip: string) => void;
}) {
  const colors = scoreColorClasses(score.score);
  const verdictLabel =
    score.verdict === "clear"
      ? "Clear — ready to publish"
      : score.verdict === "needs-sharpening"
        ? "Needs sharpening"
        : "Mysterious — rewrite";

  return (
    <div className={cn("space-y-3 rounded-lg border bg-muted/20 p-3", colors.ring)}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold",
            colors.badge
          )}
        >
          {score.score}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground">{verdictLabel}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{score.oneLineVerdict}</div>
        </div>
        {onRescore && (
          <button
            onClick={onRescore}
            disabled={rescoring}
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Re-score with Claude (Haiku)"
          >
            {rescoring ? "Scoring…" : "Re-score"}
          </button>
        )}
      </div>

      {score.tips.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tips to refine
            </div>
            {onUseTip && score.tips.length > 1 && (
              <button
                onClick={() =>
                  onUseTip(
                    score.tips.map((t, idx) => `${idx + 1}. ${t}`).join("\n\n")
                  )
                }
                className="shrink-0 rounded bg-blue-600/20 px-2 py-0.5 text-[10px] font-medium text-blue-300 transition-colors hover:bg-blue-600/30"
                title="Send all tips to Refine in chat as a numbered list"
              >
                Send all to chat →
              </button>
            )}
          </div>
          <ul className="space-y-1.5">
            {score.tips.map((tip, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-md bg-background/60 p-2 text-xs"
              >
                <span className="flex-1 text-foreground/90">{tip}</span>
                {onUseTip && (
                  <button
                    onClick={() => onUseTip(tip)}
                    className="shrink-0 rounded bg-blue-600/20 px-2 py-0.5 text-[10px] font-medium text-blue-300 transition-colors hover:bg-blue-600/30"
                    title="Send this tip to Refine in chat"
                  >
                    Send to chat →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
