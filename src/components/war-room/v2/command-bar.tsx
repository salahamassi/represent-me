"use client";

/**
 * Command Bar — persistent action HUD at the top of `/`.
 *
 * Always visible, even when no agent is open on the floor below. Its
 * job is to answer the single question Salah keeps asking the system:
 * "what should I do RIGHT NOW?" — by surfacing the top lead and the
 * downloads needed to act on it as primary controls, not buried in a
 * desk workbench.
 *
 * Selection logic lives server-side in `/api/war-room/top-lead`:
 *   1. Most recent `kit-ready` manual lead (Obeida flow).
 *   2. Highest `fit_percentage` non-dismissed `seen_jobs` row.
 *
 * Pin behaviour: once a lead is showing in the bar, we persist its id
 * to localStorage and re-fetch with `?leadId=…` so a higher-fit job
 * landing on the next sweep doesn't yank the focus mid-application.
 * The pin clears on:
 *   - Explicit dismiss (the ✕ button on the bar).
 *   - The lead's apply chain completing (signalled by parent prop).
 *   - The pinned lead being deleted server-side (404 → fresh fetch).
 *
 * The "Go to job page" button is the most prominent control in the
 * entire app — solid emerald fill, large hit target — because applying
 * IS the goal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleX,
  HelpCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { TopLead } from "@/app/api/war-room/top-lead/route";
import { cn } from "@/lib/utils";

const PIN_KEY = "warroom.commandbar.pinnedLeadId";
/** Refresh interval — light enough not to thrash, fast enough that
 *  a freshly-arrived lead shows within a few seconds of completion. */
const REFRESH_MS = 8_000;

interface CommandBarProps {
  /** Open the onboarding/how-to guide on demand. */
  onOpenGuide: () => void;
  /** Open the chat drawer for a specific persona — used as a fallback
   *  affordance when no kit exists yet ("ask Rashid"). */
  onChatWith: (role: "Rashid" | "Layla" | "Kareem" | "Yusuf" | "Tariq") => void;
  /** Fired after the user clicks "Approve Mission" and the API call
   *  resolves successfully. The parent uses this to push the celebration
   *  into the FloorPlan (chatter row + chain script) so the desks visibly
   *  light up with the kit-assembly sprint. */
  onApproved?: (lead: TopLead) => void;
}

export function CommandBar({
  onOpenGuide,
  // v3 — `onChatWith` is no longer used inside the bar (the "Ask
  // Rashid" fallback was removed). Kept on the props interface so the
  // page-level wiring doesn't need a parallel edit and so a future
  // global "ask" affordance can re-use the slot without a new prop.
  onChatWith: _onChatWith,
  onApproved,
}: CommandBarProps) {
  void _onChatWith;
  const [lead, setLead] = useState<TopLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinId, setPinId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // Hydrate the pin from storage once on mount. Deliberately uses a
  // single read — we don't want React state oscillating with storage.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PIN_KEY);
      if (stored) setPinId(stored);
    } catch {
      // Storage blocked / SSR — bar still works without pinning.
    }
  }, []);

  /** Fetch the current top lead, honouring the pin if any. */
  const fetchLead = useCallback(
    async (signal?: AbortSignal) => {
      const url = pinId
        ? `/api/war-room/top-lead?leadId=${encodeURIComponent(pinId)}`
        : `/api/war-room/top-lead`;
      try {
        const res = await fetch(url, { signal });
        if (res.status === 404 && pinId) {
          // Pinned lead was deleted server-side — clear the pin and
          // let the next tick fetch the unpinned default.
          setPinId(null);
          try {
            localStorage.removeItem(PIN_KEY);
          } catch {
            // ignore
          }
          return;
        }
        const data = await res.json();
        // Stale-pin auto-clear — the API returns `{lead: null, stale: true}`
        // when the pinned leadId is now applied / shipped / dismissed /
        // deferred. Clear the pin and let the next tick fetch the real
        // top-of-funnel candidate. Without this, a stale pin shows an
        // empty bar permanently after a successful apply.
        if (data?.stale === true && pinId) {
          setPinId(null);
          try {
            localStorage.removeItem(PIN_KEY);
          } catch {
            // ignore
          }
          setLead(null);
          return;
        }
        setLead((data.lead as TopLead | null) ?? null);
        // First fetch: if we got a lead and there's no pin yet, pin it.
        // The pin acts as "this is the lead Salah is currently working
        // on" — preventing a higher-fit scout result from yanking focus.
        if (data.lead && !pinId) {
          const id = (data.lead as TopLead).leadId;
          setPinId(id);
          try {
            localStorage.setItem(PIN_KEY, id);
          } catch {
            // ignore
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          // Soft-fail — leave the previous lead visible if the network
          // hiccups. Better than blanking the bar.
          console.error("[CommandBar] fetch failed", err);
        }
      } finally {
        setLoading(false);
      }
    },
    [pinId]
  );

  // Initial fetch + lightweight polling. We don't subscribe to the bus
  // here because the polling cost is trivial and avoids us needing the
  // SSE bridge as a dependency for this component.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchLead(ctrl.signal);
    const id = setInterval(() => fetchLead(), REFRESH_MS);
    return () => {
      clearInterval(id);
      ctrl.abort();
    };
  }, [fetchLead]);

  /** Dismiss the current lead — clears the pin so the next refresh
   *  picks a fresh top lead. Doesn't mutate the DB; that's a separate
   *  affordance (per-lead "dismiss" lives on the lead detail page). */
  const dismiss = useCallback(() => {
    setPinId(null);
    setLead(null);
    setLoading(true);
    try {
      localStorage.removeItem(PIN_KEY);
    } catch {
      // ignore
    }
  }, []);

  /** Resolve the "Go to job page" target. External URL wins; falls
   *  back to the internal /jobs page so the button is never inert. */
  const goToHref = useMemo(() => {
    if (!lead) return null;
    return lead.jobUrl || `/jobs`;
  }, [lead]);

  /** Approval gate handoff. Disables the button while in flight,
   *  optimistically flips the local copy to `approved` so the next
   *  refetch tick has the right shape, then notifies the parent so
   *  the FloorPlan can fire its visual chain. The actual kit
   *  generation happens server-side asynchronously — Salah doesn't
   *  wait on it; the bar will pick up the kit URLs on its next poll. */
  const approve = useCallback(async () => {
    if (!lead || approving) return;
    setApproving(true);
    try {
      const res = await fetch(
        `/api/war-room/lead/${encodeURIComponent(lead.leadId)}/approve`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // Optimistic local update — flip status so the button swaps
      // immediately. The next poll will reconcile with the server.
      setLead((cur) =>
        cur
          ? { ...cur, approvalStatus: "approved", status: "Approved · kit assembling" }
          : cur
      );
      onApproved?.(lead);
    } catch (err) {
      console.error("[CommandBar] approve failed", err);
    } finally {
      setApproving(false);
    }
  }, [approving, lead, onApproved]);

  // Convenience flag — drives most of the conditional rendering below.
  const pending = lead?.approvalStatus === "pending_approval";

  // v3 minimalist rule: when there's no pinned lead, the entire
  // left-side action group disappears — including the Sparkles
  // overline and the "No active leads" prompt. The bar collapses to
  // just the global controls (Help) on the right, giving the floor
  // plan below max breathing room.
  const hasLead = !!lead;

  return (
    <header
      className={cn(
        "relative z-30 mx-auto mb-3 flex w-full max-w-[1280px] items-center gap-3 overflow-hidden rounded-2xl border border-wr-border-strong bg-wr-bg-2/95 px-4 py-3 backdrop-blur-md",
        // Subtle glow when a lead is loaded — the bar's own quiet "go" signal.
        hasLead && "shadow-[0_0_30px_color-mix(in_oklch,var(--wr-yusuf)_18%,transparent)]",
        // Slimmer footprint when empty — the bar visually recedes so
        // the floor plan is the focal point.
        !hasLead && "py-2"
      )}
    >
      {/* Left rail — Sparkles icon + "TOP LEAD" overline. Only renders
          when a lead is pinned. Empty bar = global controls only. */}
      {hasLead && (
        <div className="flex shrink-0 items-center gap-2 pl-1 pr-3 border-r border-wr-border">
          <Sparkles className="h-4 w-4 text-wr-yusuf" />
          <div className="leading-tight">
            <div className="wr-mono text-[9px] tracking-[0.22em] text-wr-fg-faint">
              Top lead
            </div>
            <div className="wr-mono text-[8px] tracking-[0.18em] text-wr-fg-faint/70">
              {pinId ? "Pinned" : "Auto"}
            </div>
          </div>
        </div>
      )}

      {/* Centre — lead identity. Only the lead branch renders content;
          loading + empty states are silent (no "Loading…" / "No leads"
          chrome) so the bar stays quiet until there's something to act on. */}
      <div className="min-w-0 flex-1">
        {loading && !lead ? null : !lead ? null : (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold text-wr-fg">
                {lead.company}
              </span>
              {lead.fitPercentage != null && (
                <FitChip pct={lead.fitPercentage} />
              )}
              {/* Pinned chip — only when this lead was deliberately
                  pinned (vs automatic top-lead selection). Tells Salah
                  "the bar is locked on this; new leads won't appear
                  here until you dismiss". The ✕ at the right side of
                  the bar is how you unpin. */}
              {pinId === lead.leadId && (
                <span
                  title="Pinned · new higher-fit leads won't appear here until you dismiss this one (✕)"
                  className="wr-mono inline-flex items-center gap-1 rounded-full border border-wr-yusuf/50 bg-wr-yusuf/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-wr-yusuf"
                >
                  📌 Pinned
                </span>
              )}
            </div>
            <div className="wr-mono mt-0.5 text-[10px] text-wr-fg-faint">
              {lead.jobTitle ? `${lead.jobTitle} · ` : ""}
              {lead.status}
            </div>
          </div>
        )}
      </div>

      {/* Right — actions. The lead's approval state drives the layout:
          - PENDING_APPROVAL → giant ✅ "Approve Mission" + "Go to job"
                                (no kit buttons; nothing to download yet)
          - APPROVED         → "Go to job" + Resume PDF + Cover Letter
                                (or "Ask Rashid" while kit is in flight) */}
      <div className="flex shrink-0 items-center gap-2">
        {lead && pending && (
          // ✅ APPROVE MISSION — the most prominent control whenever a
          // lead is gated. Solid emerald, with a stronger glow than the
          // standard "Go to job" pill so the user's eye lands here first.
          <button
            type="button"
            onClick={approve}
            disabled={approving}
            className="wr-mono inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-emerald-950 shadow-[0_0_30px_rgba(52,211,153,0.55)] transition-transform hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {approving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Approving…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Approve Mission
              </>
            )}
          </button>
        )}

        {lead && goToHref && (
          // GO TO JOB PAGE — visible in BOTH states. While pending, it
          // lets Salah read the JD before approving. When approved, it's
          // the apply CTA. Slightly less prominent than Approve when the
          // lead is gated; this is the apply-time hero otherwise.
          <a
            href={goToHref}
            target={lead.jobUrl ? "_blank" : undefined}
            rel={lead.jobUrl ? "noreferrer" : undefined}
            className={cn(
              "wr-mono inline-flex items-center gap-2 rounded-full transition-transform hover:-translate-y-0.5",
              pending
                ? // Outlined variant when a bigger Approve button is next to it.
                  "border border-emerald-500/60 bg-transparent px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                : // Hero variant — the primary action when the lead is approved.
                  "bg-emerald-500 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-emerald-950 shadow-[0_0_24px_rgba(52,211,153,0.45)] hover:bg-emerald-400"
            )}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Go to job
          </a>
        )}

        {/* v3 minimalist — Resume PDF / Cover letter / Ask Rashid pills
            removed from the global bar. Mission-specific kit downloads
            now live inside Yusuf's workbench, attached to the queue row
            for that exact lead. The top bar is global-only. */}

        {/* Vertical separator only when there's left-side content. */}
        {hasLead && (
          <span aria-hidden className="mx-1 h-6 w-px bg-wr-border" />
        )}

        <button
          type="button"
          onClick={onOpenGuide}
          aria-label="How to use"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-wr-border-strong bg-wr-panel text-wr-fg-dim hover:bg-wr-panel-2 hover:text-wr-fg"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {lead && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss this lead"
            title="Dismiss · the bar will pick a new top lead"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-wr-border bg-transparent text-wr-fg-faint hover:bg-wr-panel hover:text-wr-fg"
          >
            <CircleX className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </header>
  );
}

/** Color-graded fit pill — emerald ≥85, amber 70–84, red <70. Same
 *  bucketing as everywhere else in the War Room. */
function FitChip({ pct }: { pct: number }) {
  const tone =
    pct >= 85
      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : pct >= 70
      ? "border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "border-red-500/60 bg-red-500/15 text-red-700 dark:text-red-300";
  return (
    <span
      className={cn(
        "wr-mono shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        tone
      )}
    >
      {pct}%
    </span>
  );
}
