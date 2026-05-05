"use client";

/**
 * Lead Detail Panel — read-only deep-dive on a single seen_jobs row.
 *
 * Shown by swapping the workbench BODY (not as a third overlay) when
 * the user picks "Open detail" from a queue row's ⋯ menu. A "← Back"
 * button at the top returns to the queue.
 *
 * The footer always carries the "Trigger apply chain" affordance so
 * Salah can act on the lead from the detail surface too — the same
 * action lives on the row's ⋯ menu, just mirrored here as a primary
 * CTA so he doesn't have to back out to fire it.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QueueItem } from "@/app/api/war-room/queue/route";

/** Shape of the detail payload — wider than QueueItem since it carries
 *  the analysis blob. Mirrors `seen_jobs` columns we render. */
interface LeadDetail {
  id: string;
  title: string | null;
  company: string | null;
  url: string | null;
  fit_percentage: number | null;
  ai_analysis: string | null; // JSON string, parsed below
  jd_text?: string | null;
  contact_name?: string | null;
  /** v3 Plan A Phase C — Lifecycle state read from the row directly so
   *  we can render KIT_READY / SHIPPED affordances even after the
   *  row drops out of the activeMissions polling set. */
  mission_status?: "READY" | "IN_PROGRESS" | "KIT_READY" | "SHIPPED" | null;
  mission_started_at?: string | null;
  /** v3 Plan A Phase F — Last error from a stalled mission. Format:
   *  "<which>: <message>" where which ∈ {layla, kareem, system}. NULL
   *  when clean. Drives the Retry / Force-advance affordances below. */
  mission_error?: string | null;
  mission_error_at?: string | null;
}

/** Parsed structure of the ai_analysis JSON. All fields optional —
 *  legacy rows may have only a subset. */
interface ParsedAnalysis {
  reasoning?: string;
  matchedSkills?: { skill: string; evidence?: string }[];
  transferableSkills?: { required: string; transferFrom: string; confidence?: string }[];
  missingSkills?: string[];
  resumeEmphasis?: string[];
  applicationTips?: string;
}

interface LeadDetailPanelProps {
  item: QueueItem;
  /** Persona accent — drives section labels + footer button. */
  colorVar: string;
  onBack: () => void;
  onTriggerChain: (item: QueueItem) => void;
  /** v3 — Map of `leadId` → mission metadata for chains currently
   *  in flight. We only need `.has()` here, but the type is the
   *  richer Map shape (vs the prior Set<string>) so downstream
   *  consumers can read company/startedAt for synthetic rows. */
  activeMissions?: Map<string, unknown>;
}

export function LeadDetailPanel({
  item,
  colorVar,
  onBack,
  onTriggerChain,
  activeMissions,
}: LeadDetailPanelProps) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** v3 — Local "click intent" state for the trigger button. We need
   *  a brief LOADING beat between the user's click and the parent's
   *  state propagating back as ACTIVE so the button visibly responds
   *  on the same frame as the click (otherwise the user can't tell
   *  if the click registered until React flushes). Resets via a
   *  600ms safety timeout in case the parent never updates. */
  const [clickState, setClickState] = useState<"idle" | "loading">("idle");

  /** v3 Plan A Phase C — Effective mission status. Composite source:
   *  the parent's activeMissions Set (which the floor-plan rebuilds
   *  every 10 s from /missions/active) covers IN_PROGRESS authoritatively.
   *  But that endpoint excludes KIT_READY / SHIPPED, so for those
   *  states we read from the lead detail row's own `mission_status`
   *  column. The combined view drives the four-state footer button. */
  const isActive = !!(item.leadId && activeMissions?.has(item.leadId));
  const rowStatus = detail?.mission_status ?? null;
  const effectiveStatus: "READY" | "IN_PROGRESS" | "KIT_READY" | "SHIPPED" =
    isActive
      ? "IN_PROGRESS"
      : rowStatus === "KIT_READY"
        ? "KIT_READY"
        : rowStatus === "SHIPPED"
          ? "SHIPPED"
          : "READY";

  // Once the parent confirms ACTIVE, drop our local LOADING — it has
  // been superseded by the real state. Same effect handles re-arming
  // when the chain ends (active flips back to false → leave clickState
  // alone since it's already idle by that point).
  useEffect(() => {
    if (isActive) setClickState("idle");
  }, [isActive]);

  /** Click handler for the trigger button. Flips to LOADING immediately
   *  for visible acknowledgement, calls the parent (which will add the
   *  leadId to activeMissions and re-render us into ACTIVE on the next
   *  frame), and arms a safety timeout to revert to idle if for some
   *  reason the parent never updates. */
  const handleTriggerClick = () => {
    if (clickState === "loading" || isActive) return;
    setClickState("loading");
    // Yield once so the LOADING paint flushes BEFORE the synchronous
    // parent update (which would otherwise batch with our setState
    // and skip the loading flash entirely).
    Promise.resolve().then(() => onTriggerChain(item));
    // Safety net: if the parent doesn't flip activeMissions within
    // 600ms (no leadId, network failure, etc.), unstick the button.
    setTimeout(() => setClickState("idle"), 600);
  };

  // v3 Plan A Phase F — Helper for re-fetching the detail row after
  // any mission-state-mutating action (ship / retry / advance). Same
  // pattern duplicated three times so we hoist it.
  const refetchDetail = useCallback(async () => {
    if (!item.leadId) return;
    try {
      const res = await fetch(
        `/api/war-room/lead/${encodeURIComponent(item.leadId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setDetail(data.lead as LeadDetail);
      }
    } catch {
      // non-fatal — next render still has the prior state
    }
  }, [item.leadId]);

  const [retrying, setRetrying] = useState(false);
  const handleRetryClick = async () => {
    if (!item.leadId || retrying) return;
    setRetrying(true);
    try {
      await fetch(
        `/api/war-room/lead/${encodeURIComponent(item.leadId)}/mission/retry`,
        { method: "POST" }
      );
      await refetchDetail();
    } catch (err) {
      console.error("[LeadDetail] /mission/retry network error", err);
    } finally {
      setRetrying(false);
    }
  };

  const [advancing, setAdvancing] = useState(false);
  const handleAdvanceClick = async () => {
    if (!item.leadId || advancing) return;
    if (
      !window.confirm(
        "Force-advance to KIT_READY without a tailored CV? You'll be able to ship immediately, but Salah's resume won't be customised for this role."
      )
    ) {
      return;
    }
    setAdvancing(true);
    try {
      await fetch(
        `/api/war-room/lead/${encodeURIComponent(item.leadId)}/mission/advance`,
        { method: "POST" }
      );
      await refetchDetail();
    } catch (err) {
      console.error("[LeadDetail] /mission/advance network error", err);
    } finally {
      setAdvancing(false);
    }
  };

  /** v3 Plan A Phase C — Ship-it click. Posts to `/mission/ship`,
   *  re-fetches the detail row so `mission_status` updates to SHIPPED,
   *  drops the panel into its terminal "✓ Shipped" pill state. */
  const [shipping, setShipping] = useState(false);
  const handleShipClick = async () => {
    if (!item.leadId || shipping) return;
    setShipping(true);
    try {
      const res = await fetch(
        `/api/war-room/lead/${encodeURIComponent(item.leadId)}/mission/ship`,
        { method: "POST" }
      );
      if (!res.ok && res.status !== 409) {
        console.error("[LeadDetail] /mission/ship failed", res.status);
      }
      await refetchDetail();
    } catch (err) {
      console.error("[LeadDetail] /mission/ship network error", err);
    } finally {
      setShipping(false);
    }
  };

  // Fetch the lead detail on mount / when the row changes. The endpoint
  // path mirrors the existing manual-lead pattern (`/api/manual-lead/
  // [leadId]/...`) but we just want the row, no kit assets.
  useEffect(() => {
    if (!item.leadId) {
      setError("No leadId on this row");
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/war-room/lead/${encodeURIComponent(item.leadId)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Lead not found");
        setDetail(d.lead as LeadDetail);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [item.leadId]);

  // Best-effort JSON parse — ai_analysis is text in the DB. If it's
  // truncated or missing, we render the partial detail without crashing.
  const analysis: ParsedAnalysis | null = (() => {
    if (!detail?.ai_analysis) return null;
    try {
      return JSON.parse(detail.ai_analysis) as ParsedAnalysis;
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar — back affordance + lead title */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="wr-mono inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-wr-border bg-transparent px-2.5 py-1 text-[11px] text-wr-fg-dim hover:bg-wr-panel hover:text-wr-fg"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
        <span className="wr-mono text-[10px] text-wr-fg-faint">
          Lead detail
        </span>
      </div>

      {loading && (
        <div className="rounded-md border border-wr-border bg-wr-panel p-4 text-sm text-wr-fg-dim">
          Loading lead…
        </div>
      )}
      {error && (
        <div
          className="rounded-md border p-4 text-sm"
          style={{
            borderColor: "color-mix(in oklch, var(--wr-tariq) 50%, transparent)",
            color: "var(--wr-tariq)",
            background: "color-mix(in oklch, var(--wr-tariq) 8%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      {detail && (
        <>
          {/* Header card — company, title, fit pill, link */}
          <div
            className="rounded-[10px] border bg-wr-panel-2 p-4"
            style={{
              borderColor: `color-mix(in oklch, ${colorVar} 30%, transparent)`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="text-[18px] font-semibold leading-tight"
                  style={{ color: colorVar }}
                >
                  {detail.company || "Unknown company"}
                </div>
                <div className="mt-1 text-[13px] text-wr-fg-dim">
                  {detail.title || "Untitled role"}
                </div>
              </div>
              {detail.fit_percentage != null && (
                <FitChip pct={detail.fit_percentage} />
              )}
            </div>
            {detail.url && (
              <a
                href={detail.url}
                target="_blank"
                rel="noreferrer"
                className="wr-mono mt-2 inline-block text-[10px] text-wr-fg-faint hover:text-wr-fg-dim"
              >
                ↗ View posting
              </a>
            )}
          </div>

          {/* Reasoning + skills block */}
          {analysis && (
            <div className="space-y-3">
              {analysis.reasoning && (
                <Section label="Why this fits">
                  <p className="text-[13px] leading-relaxed text-wr-fg">
                    {analysis.reasoning}
                  </p>
                </Section>
              )}

              {analysis.matchedSkills && analysis.matchedSkills.length > 0 && (
                <Section label="Matched skills">
                  <ul className="flex flex-col gap-1">
                    {analysis.matchedSkills.slice(0, 6).map((s, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-wr-border bg-wr-panel px-2.5 py-1.5 text-[12px] text-wr-fg"
                      >
                        <span className="font-semibold" style={{ color: colorVar }}>
                          {s.skill}
                        </span>
                        {s.evidence && (
                          <span className="text-wr-fg-dim"> — {s.evidence}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {analysis.missingSkills && analysis.missingSkills.length > 0 && (
                <Section label="Gaps">
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.missingSkills.map((s, i) => (
                      <span
                        key={i}
                        className="wr-mono rounded-full border px-2 py-0.5 text-[10px]"
                        style={{
                          borderColor:
                            "color-mix(in oklch, var(--wr-tariq) 50%, transparent)",
                          color: "var(--wr-tariq)",
                          background:
                            "color-mix(in oklch, var(--wr-tariq) 8%, transparent)",
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {analysis.applicationTips && (
                <Section label="Application tip">
                  <p className="text-[12px] italic leading-relaxed text-wr-fg-dim">
                    {analysis.applicationTips}
                  </p>
                </Section>
              )}
            </div>
          )}

          {/* Footer CTA — three-state machine driven by activeMissions
              and a brief local LOADING beat:
                · ACTIVE  → disabled emerald pill, persona pulse, "Mission
                            active · agents working". Replaces the trigger
                            entirely so Salah can't double-fire.
                · LOADING → disabled spinner pill. ~50–600ms flash between
                            click and the parent's ACTIVE confirmation —
                            ensures the click visibly registers.
                · IDLE    → normal "Trigger apply chain" red button. */}
          {/* v3 Plan A Phase F — Mission error pill. Shows when an
              agent caught an exception (or skipped due to missing
              ai_analysis). Lets Salah retry the run, or — if Kareem
              can't run at all — force-advance past the artefact gate
              so he can ship with just the cover letter. */}
          {detail.mission_error && effectiveStatus === "IN_PROGRESS" && (
            <div
              className="mt-2 rounded-md border p-3"
              style={{
                borderColor:
                  "color-mix(in oklch, var(--wr-tariq) 50%, transparent)",
                background:
                  "color-mix(in oklch, var(--wr-tariq) 8%, transparent)",
              }}
            >
              <div
                className="wr-mono mb-1.5 text-[10px] tracking-[0.18em]"
                style={{ color: "var(--wr-tariq)" }}
              >
                Mission stalled
              </div>
              <div className="text-[12px] leading-relaxed text-wr-fg">
                {detail.mission_error}
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={handleRetryClick}
                  disabled={retrying}
                  className="wr-mono inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-wr-border-strong bg-wr-panel px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-wr-fg hover:bg-wr-panel-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {retrying ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Retrying…
                    </>
                  ) : (
                    <>↻ Retry</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleAdvanceClick}
                  disabled={advancing}
                  className="wr-mono inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-wr-border bg-transparent px-2.5 py-1 text-[10px] tracking-[0.12em] text-wr-fg-dim hover:bg-wr-panel hover:text-wr-fg disabled:cursor-not-allowed disabled:opacity-60"
                  title="Force-advance to KIT_READY without waiting on the missing artefact"
                >
                  {advancing ? "Advancing…" : "Skip & advance"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-2 border-t border-wr-border pt-4">
            {effectiveStatus === "SHIPPED" ? (
              // Terminal state — disabled emerald pill, no further
              // affordance. The lead is done; Salah moves on.
              <div
                role="status"
                aria-live="polite"
                className="wr-mono flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-[12px] font-semibold tracking-[0.15em]"
                style={{
                  borderColor:
                    "color-mix(in oklch, oklch(0.7 0.16 155) 50%, transparent)",
                  background:
                    "color-mix(in oklch, oklch(0.7 0.16 155) 10%, transparent)",
                  color: "oklch(0.5 0.16 155)",
                }}
              >
                ✓ Shipped
              </div>
            ) : effectiveStatus === "KIT_READY" ? (
              // KIT_READY — actionable. Salah's clicked Approve, Layla
              // wrote the cover letter, the kit is complete. Pressing
              // this fires /mission/ship and flips us to SHIPPED.
              <button
                type="button"
                onClick={handleShipClick}
                disabled={shipping}
                className={cn(
                  "wr-mono inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 py-2.5 text-[12px] font-semibold tracking-[0.15em]"
                )}
                style={{
                  background: "oklch(0.7 0.16 155)",
                  color: "var(--wr-bg)",
                  opacity: shipping ? 0.6 : 1,
                  cursor: shipping ? "not-allowed" : "pointer",
                }}
              >
                {shipping ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Shipping…
                  </>
                ) : (
                  <>✓ Kit ready · Mark shipped</>
                )}
              </button>
            ) : effectiveStatus === "IN_PROGRESS" ? (
              <div
                role="status"
                aria-live="polite"
                className="wr-mono flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-[12px] font-semibold tracking-[0.15em]"
                style={{
                  borderColor:
                    "color-mix(in oklch, oklch(0.8 0.18 155) 60%, transparent)",
                  background:
                    "color-mix(in oklch, oklch(0.8 0.18 155) 14%, transparent)",
                  color: "oklch(0.55 0.18 155)",
                }}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 animate-wr-blink rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]"
                />
                Mission active · agents working
              </div>
            ) : clickState === "loading" ? (
              <button
                type="button"
                disabled
                className={cn(
                  "wr-mono inline-flex w-full items-center justify-center gap-2 rounded-md border-0 px-4 py-2.5 text-[12px] font-semibold tracking-[0.15em] opacity-80"
                )}
                style={{
                  background: `var(--wr-tariq)`,
                  color: "var(--wr-bg)",
                  cursor: "not-allowed",
                }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTriggerClick}
                className={cn(
                  "wr-mono inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border-0 px-4 py-2.5 text-[12px] font-semibold tracking-[0.15em]"
                )}
                style={{
                  background: `var(--wr-tariq)`,
                  color: "var(--wr-bg)",
                }}
              >
                <Zap className="h-3.5 w-3.5" />
                Trigger apply chain
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="wr-mono mb-1.5 text-[10px] tracking-[0.22em] text-wr-fg-faint">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Tiny color-graded fit % chip — emerald / amber / red by bucket. */
function FitChip({ pct }: { pct: number }) {
  const tone =
    pct >= 85
      ? { fg: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/15", bd: "border-emerald-500/40" }
      : pct >= 70
      ? { fg: "text-amber-700 dark:text-amber-300", bg: "bg-amber-500/15", bd: "border-amber-500/40" }
      : { fg: "text-red-700 dark:text-red-300", bg: "bg-red-500/15", bd: "border-red-500/40" };
  return (
    <span
      className={cn(
        "wr-mono shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums",
        tone.fg,
        tone.bg,
        tone.bd
      )}
    >
      {pct}%
    </span>
  );
}
