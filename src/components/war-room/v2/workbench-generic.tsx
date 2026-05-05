"use client";

/**
 * Generic Workbench template — used for every persona except Tariq.
 *
 * Three blocks, top to bottom (when in queue mode):
 *   1. "Now Working On" card — accent-tinted, persona's current task
 *   2. "Queue · Last 3"      — three live rows from /api/war-room/queue
 *   3. Big metric tile        — label + huge number in persona color
 *
 * When the user picks "Open detail" from a queue row's ⋯ menu, the
 * BODY swaps to a `LeadDetailPanel` (kept in this component's local
 * state so closing/reopening the workbench preserves which lead is
 * being viewed). "← Back" returns to the queue.
 *
 * "Now Working On" + the metric tile are still placeholder copy from
 * the design handoff — wiring those to live data is a separate pass.
 * The queue is the only block that's data-driven today; that's the
 * one Salah actually acts on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentOrchestrator } from "@/hooks/useAgentOrchestrator";
import {
  ArrowUpRight,
  Check,
  Download,
  ImageIcon,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  RefreshCw,
  Rocket,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import {
  WAR_ROOM_PERSONAS,
  type WarRoomPersonaKey,
} from "@/war-room/personas";
import type { QueueItem as QueueItemData } from "@/app/api/war-room/queue/route";
import type { AgentLogEntry } from "@/app/api/war-room/agent-activity/route";
import type { ActiveMission } from "./floor-plan";
import { QueueItem } from "./queue-item";
import { LeadDetailPanel } from "./lead-detail-panel";
import { cn } from "@/lib/utils";

// v3 Plan A Phase 4 — Synthetic-row pacing constants DELETED.
// `DRAFT_CHARS_PER_SECOND`, `COVER_LETTER_TARGET_CHARS`, `CV_SECTIONS`,
// `CV_SECONDS_PER_SECTION` were the timer fakery that drove the "live
// typing" row in Layla / Kareem panels. Real char counts now come
// from `GET /api/war-room/lead/{leadId}/content` which queries the
// `generated_content` row written by the content agent on
// `mission:started`. No row in the DB → "Queued"; row exists → real
// char count from the actual draft.

/** Shape returned by `GET /api/war-room/lead/{leadId}/content`. Matches
 *  `LeadContentRow` from `lib/db.ts`. */
interface LeadContentApi {
  id: number;
  contentType: string;
  generatedText: string;
  charCount: number;
  createdAt: string;
  userAction: string | null;
}

/** Shape returned by `GET /api/war-room/lead/{leadId}/resume`. Wraps
 *  `LeadResumeRow` from `lib/db.ts` with a public download URL. */
interface LeadResumeApi {
  id: number;
  jobTitle: string;
  company: string | null;
  fitPercentage: number | null;
  pdfFilename: string;
  downloadUrl: string | null;
  createdAt: string;
  userAction: string | null;
}

// v3 Plan A — `PLACEHOLDER` map DELETED. Both the "Now Working On"
// line and the metric tile are now derived from real DB queries:
//   - "Now Working On" reads the latest agent_activity_log entry for
//     this persona (overridden by an active-mission line when one
//     exists). When the DB is empty, the card shows "—" honestly.
//   - The metric tile fetches from /api/war-room/persona/{role}/metrics
//     which returns a real count (0 on a fresh DB).

interface GenericWorkbenchProps {
  role: WarRoomPersonaKey;
  /** Fired when the user clicks a queue row's body — the FloorPlan
   *  uses this to open the chat drawer with an autoSend prompt. */
  onBriefRequested: (payload: {
    role: WarRoomPersonaKey;
    text: string;
    item: QueueItemData;
  }) => void;
  /** Fired when the user picks "Trigger apply chain" from the ⋯ menu.
   *  The FloorPlan generates a per-lead chain script and runs it. */
  onChainRequested: (payload: {
    role: WarRoomPersonaKey;
    item: QueueItemData;
  }) => void;
  /** Fired when the user clicks a Ghada gallery tile. The FloorPlan
   *  opens the Ghada chat drawer in image-edit mode: pre-loads the
   *  post text as a system bubble, has Ghada speak first asking for
   *  edit instructions, and routes the next user reply to the visual
   *  regeneration endpoint instead of the normal chat API. */
  onEditVisual?: (item: QueueItemData) => void;
  /** v3 — Map of in-flight chains keyed by leadId. Used for two
   *  things in this component:
   *    1. Forwarded into LeadDetailPanel so its footer can swap the
   *       "Trigger apply chain" button for a "MISSION ACTIVE" pill.
   *    2. For Layla & Kareem, every active mission synthesises a
   *       top-pinned "live work" row in the queue with a ticking
   *       char count / section count, and overrides the static
   *       "Now Working On" line. This is what closes the apparent
   *       state desync between the radio chatter saying "drafting
   *       Polaris Labs" and Layla's panel showing only old drafts. */
  activeMissions?: Map<string, ActiveMission>;
}

export function GenericWorkbench({
  role,
  onBriefRequested,
  onChainRequested,
  onEditVisual,
  activeMissions,
}: GenericWorkbenchProps) {
  if (role === "Tariq") return null;
  const persona = WAR_ROOM_PERSONAS[role];
  const colorVar = `var(${persona.cssVar})`;

  // v3 Plan A — Real metric tile state. Fetched from
  // /api/war-room/persona/{role}/metrics on mount + every 30s. 0 on a
  // fresh DB is the truth.
  const [metric, setMetric] = useState<{ label: string; value: number } | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    const fetchMetric = async () => {
      try {
        const res = await fetch(
          `/api/war-room/persona/${encodeURIComponent(role)}/metrics`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { label: string; value: number };
        if (!cancelled) setMetric({ label: data.label, value: data.value });
      } catch {
        // quiet — next tick retries
      }
    };
    fetchMetric();
    const id = setInterval(fetchMetric, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [role]);

  const [items, setItems] = useState<QueueItemData[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  // v3 Plan A Phase 4+B — Real per-lead artefact state. Layla's
  // panel reads `generated_content` rows (cover letters); Kareem's
  // panel reads `generated_resumes` rows (tailored CVs). Both
  // refetched on a 5s cadence while at least one mission is active.
  // null entry = "Queued"; non-null = real artefact from DB.
  const [leadContent, setLeadContent] = useState<
    Map<string, LeadContentApi | null>
  >(() => new Map());
  const [leadResume, setLeadResume] = useState<
    Map<string, LeadResumeApi | null>
  >(() => new Map());
  const hasActiveMission = (activeMissions?.size ?? 0) > 0;

  // v3 Plan A Phase D — SSE-driven refetch trigger. Bumped whenever a
  // relevant agent event arrives (`content:cover-letter-ready` for
  // Layla, `resume:cv-ready` for Kareem) so the polling effect below
  // re-runs immediately instead of waiting for its 5s interval. Cuts
  // worst-case latency from ~5s to ~100ms.
  const [refetchNonce, setRefetchNonce] = useState(0);

  // Subscribe to SSE inside the workbench so we can react to agent
  // completion events for active missions. Uses its own EventSource —
  // floor-plan has its own; modern browsers cap at 6 connections per
  // origin which is well above what we need. The hook auto-reconnects
  // on drop and dedupes by frame id at the hook layer.
  const { eventLog: missionEventLog } = useAgentOrchestrator();
  const seenMissionFrameIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (missionEventLog.length === 0) return;
    if (role !== "Layla" && role !== "Kareem") return;
    const relevantEvents = new Set(
      role === "Layla"
        ? ["content:cover-letter-ready", "content:cover-letter-start"]
        : ["resume:cv-ready"]
    );
    let bumped = false;
    for (const frame of missionEventLog) {
      if (seenMissionFrameIdsRef.current.has(frame.id)) continue;
      seenMissionFrameIdsRef.current.add(frame.id);
      if (relevantEvents.has(frame.eventType)) {
        bumped = true;
      }
    }
    if (bumped) setRefetchNonce((n) => n + 1);
  }, [missionEventLog, role]);

  useEffect(() => {
    if (!activeMissions || activeMissions.size === 0) return;
    if (role !== "Layla" && role !== "Kareem") return;

    let cancelled = false;
    const endpoint =
      role === "Layla" ? "content" : "resume";
    const fetchAll = async () => {
      const ids = Array.from(activeMissions.keys());
      const results = await Promise.all(
        ids.map(async (leadId) => {
          try {
            const res = await fetch(
              `/api/war-room/lead/${encodeURIComponent(leadId)}/${endpoint}`
            );
            if (!res.ok) return [leadId, null] as const;
            const data = await res.json();
            return [
              leadId,
              role === "Layla"
                ? (data.content as LeadContentApi | null)
                : (data.resume as LeadResumeApi | null),
            ] as const;
          } catch {
            return [leadId, null] as const;
          }
        })
      );
      if (cancelled) return;
      // Update the role-specific Map. We branch instead of assigning
      // a union setter to a variable because TS's narrowing fights
      // the inference across the union of (LeadContentApi | LeadResumeApi).
      if (role === "Layla") {
        setLeadContent((prev) => {
          const next = new Map(prev);
          for (const [leadId, artefact] of results) {
            next.set(leadId, artefact as LeadContentApi | null);
          }
          for (const key of next.keys()) {
            if (!activeMissions.has(key)) next.delete(key);
          }
          return next;
        });
      } else {
        setLeadResume((prev) => {
          const next = new Map(prev);
          for (const [leadId, artefact] of results) {
            next.set(leadId, artefact as LeadResumeApi | null);
          }
          for (const key of next.keys()) {
            if (!activeMissions.has(key)) next.delete(key);
          }
          return next;
        });
      }
    };
    fetchAll();
    const id = setInterval(fetchAll, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeMissions, role, refetchNonce]);

  // v3 Plan A Phase 4+B — Synthetic rows now read REAL data:
  //   - Layla reads `generated_content` (cover letter text, char count)
  //   - Kareem reads `generated_resumes` (tailored PDF, download URL)
  // Both surfaces show "Queued · awaiting first draft" when the row
  // doesn't exist yet, real status when it does, and a "✓ Ready"
  // affordance when user_action marks it approved.
  const syntheticItems: QueueItemData[] =
    activeMissions && (role === "Layla" || role === "Kareem")
      ? Array.from(activeMissions.values()).map((mission) =>
          buildSyntheticMissionRow(
            role,
            mission,
            role === "Layla"
              ? leadContent.get(mission.leadId) ?? null
              : leadResume.get(mission.leadId) ?? null
          )
        )
      : [];

  // Combined queue — synthetic rows first so they're top-pinned.
  // Real queue items follow in their server-returned order.
  const visibleItems: QueueItemData[] =
    syntheticItems.length > 0 ? [...syntheticItems, ...items] : items;

  // v3 — Override the static "Now Working On" copy whenever a mission
  // is active for this role. Tells Salah "you're not looking at stale
  // state — Layla is on Polaris Labs RIGHT NOW" the second he opens
  // the panel after triggering a chain.
  const liveNowLine = ((): string | null => {
    if (!syntheticItems.length || !activeMissions) return null;
    // Pick the most recently started mission as the headline.
    const latest = Array.from(activeMissions.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    )[0];
    if (!latest) return null;
    return role === "Layla"
      ? `Drafting cover letter · ${latest.company}`
      : `Tailoring CV · ${latest.company}`;
  })();

  // Recent logs — last 5 activity rows for this persona's underlying
  // agent ids. Pulled from `/api/war-room/agent-activity?role=…`.
  // Optional source — failures here don't block the queue render.
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Local detail state — when set, the body swaps from queue → detail.
  // We keep it inside this component (not lifted) because reopening a
  // workbench resets to the queue view, which is the right default.
  const [detailItem, setDetailItem] = useState<QueueItemData | null>(null);

  // Yusuf-only inline expansion. Tracks which queue row is expanded
  // to show the full draft preview + action buttons. Single-row at a
  // time so the workbench doesn't accordion to absurd heights.
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Per-content-id ship state. The button reflects exactly one of
  // these states at a time:
  //   "idle"     → "🚀 SHIP TO LINKEDIN"
  //   "sending"  → spinner + "Sending…", button locked
  //   "live"     → "✓ LIVE on LinkedIn", flash 2s, then archive
  //   "error"    → "Failed · retry" red flash, button unlocks
  type ShipState = "idle" | "sending" | "live" | "error";
  const [shipState, setShipState] = useState<Record<number, ShipState>>({});
  // Captured LinkedIn URLs per content id — populated by the PATCH
  // success response so the Archive section can render a live link.
  const [postUrls, setPostUrls] = useState<Record<number, string>>({});
  // Captured error messages — surfaced in the button area for ~3s when
  // Zernio fails so Salah knows what happened.
  const [shipErrors, setShipErrors] = useState<Record<number, string>>({});

  // Local archive set. Items here disappear from the main queue and
  // surface under the Archive section instead. Only added AFTER the
  // PATCH succeeds — that's the contract: Chains Active decrements
  // when LinkedIn confirms, not when Salah clicks.
  const [archivedIds, setArchivedIds] = useState<Set<number>>(
    () => new Set()
  );
  // Whether the Archive sub-section is expanded — defaults closed so
  // the workspace stays clean. Click the section header to toggle.
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Pull the live queue on mount + whenever the role changes.
  useEffect(() => {
    const ctrl = new AbortController();
    setQueueLoading(true);
    setQueueError(null);
    fetch(`/api/war-room/queue?role=${role}`, { signal: ctrl.signal })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Queue fetch failed");
        setItems((d.items as QueueItemData[]) || []);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setQueueError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setQueueLoading(false));
    return () => ctrl.abort();
  }, [role]);

  // Pull recent logs in parallel with the queue. Same scope-on-mount
  // pattern. Logs are quiet — empty array on miss, no error UI.
  useEffect(() => {
    const ctrl = new AbortController();
    setLogsLoading(true);
    fetch(`/api/war-room/agent-activity?role=${role}&limit=5`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) setLogs((d.entries as AgentLogEntry[]) || []);
      })
      .catch(() => {
        // Quiet — recent-logs is supplementary; the queue is the
        // primary signal.
      })
      .finally(() => setLogsLoading(false));
    return () => ctrl.abort();
  }, [role]);

  // ----- INLINE DRAFT ACTIONS (Yusuf only) ---------------------------
  /**
   * Ship to LinkedIn — direct publish via Zernio.
   *
   * Flow:
   *   1. Lock the button → spinner + "Sending…"
   *   2. PATCH /api/war-room/drafts with status=published. Server-side
   *      this calls publishContentRow → Zernio → LinkedIn. We WAIT for
   *      the response; no optimistic archive.
   *   3. On success → button flashes "✓ LIVE on LinkedIn" for 2s, then
   *      the row archives + Chains Active decrements. The post URL is
   *      stored locally so the Archive section can link straight to it.
   *   4. On failure → button flashes "Failed · retry" in red for 3s
   *      and unlocks. No archive, no decrement. Salah can hit again.
   *
   * The contract here matters for the metric tile: Chains Active only
   * drops when LinkedIn confirms, not when Salah clicks. That's the
   * difference between "I started something" and "it's officially out".
   */
  const shipToLinkedIn = useCallback(async (item: QueueItemData) => {
    if (!item.contentId) return;
    const cid = item.contentId;

    // 1. Lock — spinner state. Disabled prop on the button picks this
    //    up + cursor-default so a frantic double-click doesn't fire.
    setShipState((s) => ({ ...s, [cid]: "sending" }));
    setShipErrors((e) => {
      if (!(cid in e)) return e;
      const next = { ...e };
      delete next[cid];
      return next;
    });

    try {
      // 2. PATCH → Zernio → LinkedIn. Server only returns ok=true once
      //    the post is confirmed live (or scheduled — we still treat
      //    that as "out of Salah's hands").
      const res = await fetch("/api/war-room/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: cid, status: "published" }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || !data.ok) {
        const msg =
          (data as { error?: string }).error ||
          `HTTP ${res.status} — Zernio publish failed`;
        throw new Error(msg);
      }

      const url = (data as { postUrl?: string | null }).postUrl ?? null;
      if (url) {
        setPostUrls((u) => ({ ...u, [cid]: url }));
      }

      // 3. LIVE flash → 2s celebration, then archive + decrement.
      setShipState((s) => ({ ...s, [cid]: "live" }));
      setTimeout(() => {
        setShipState((s) => {
          if (s[cid] !== "live") return s;
          const next = { ...s };
          delete next[cid];
          return next;
        });
        setArchivedIds((prev) => {
          if (prev.has(cid)) return prev;
          const next = new Set(prev);
          next.add(cid);
          return next;
        });
        setExpandedItemId((cur) => (cur === item.id ? null : cur));
      }, 2000);
    } catch (err) {
      // 4. Error path — surface the message + unlock the button.
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[YusufWorkbench] ship failed", err);
      setShipErrors((e) => ({ ...e, [cid]: msg }));
      setShipState((s) => ({ ...s, [cid]: "error" }));
      // Auto-clear the error state after 3s so the button is usable
      // again — but leave the error message visible a bit longer if
      // the user wants to read it.
      setTimeout(() => {
        setShipState((s) => {
          if (s[cid] !== "error") return s;
          const next = { ...s };
          delete next[cid];
          return next;
        });
      }, 3000);
    }
  }, []);

  /** Request Edit — closes nothing locally; just routes a chat-brief
   *  to LAYLA (cross-persona handoff) with the draft pre-loaded as a
   *  revision request. Yusuf's workbench stays open so Salah can
   *  cross-reference while talking to Layla. */
  const requestEdit = useCallback(
    (item: QueueItemData) => {
      const text = (item.fullText || item.primary).slice(0, 1200);
      onBriefRequested({
        role: "Layla",
        item,
        text: `Hey Layla, can you revise this draft? Give me your two strongest angles for a v2.\n\n---\n${text}`,
      });
    },
    [onBriefRequested]
  );

  /** Approve a queue lead inline. Hits the same endpoint the Command
   *  Bar uses, then refetches the queue so the row drops out + badge
   *  updates without a full page reload. Bumps the page-level
   *  approval signal so the FloorPlan fires the celebration chain. */
  const approveLead = useCallback(
    async (item: QueueItemData) => {
      if (!item.leadId) return;
      try {
        const res = await fetch(
          `/api/war-room/lead/${encodeURIComponent(item.leadId)}/approve`,
          { method: "POST" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        // Refetch the queue — the approved lead drops out of Rashid's
        // pending filter and lands in Kareem's queue automatically
        // because the next /api/war-room/queue?role=… call sees the
        // new approval_status.
        const refetch = await fetch(`/api/war-room/queue?role=${role}`);
        if (refetch.ok) {
          const fresh = await refetch.json();
          setItems((fresh.items as QueueItemData[]) || []);
        }
      } catch (err) {
        console.error("[GenericWorkbench] approve failed", err);
      }
    },
    [role]
  );

  // ----- DETAIL MODE -------------------------------------------------
  if (detailItem) {
    return (
      <LeadDetailPanel
        item={detailItem}
        colorVar={colorVar}
        activeMissions={activeMissions}
        onBack={() => setDetailItem(null)}
        onTriggerChain={(it) => onChainRequested({ role, item: it })}
      />
    );
  }

  // ----- QUEUE MODE --------------------------------------------------
  // The chat-brief prompt template — we pass the item's `primary` text
  // so persona replies are anchored on the right thing ("Brief me on
  // LifeMD" not "Brief me on this row").
  const briefFor = (item: QueueItemData) => {
    if (item.kind === "draft")
      return `Read me back the latest version of "${item.primary}" — what works, what doesn't.`;
    if (item.kind === "audit")
      return `What's the audit status on ${item.primary}?`;
    return `Brief me on ${item.primary}.`;
  };

  // v3 Plan A — Compute the "Now Working On" line. Render the card
  // ONLY when we have a real signal to show. No fabricated copy, no
  // "— idle" placeholder when there's literally nothing.
  const nowWorkingLine = liveNowLine ?? (logs.length > 0 ? logs[0].title : null);

  return (
    <>
      {nowWorkingLine && (
        <div
          className="mb-4 rounded-[10px] border bg-wr-panel-2 p-4"
          style={{
            borderColor: `color-mix(in oklch, ${colorVar} 30%, transparent)`,
          }}
        >
          <SectionLabel color={colorVar}>Now Working On</SectionLabel>
          <div className="mt-1.5 text-[15px] text-wr-fg">{nowWorkingLine}</div>
        </div>
      )}

      {/* Local Queue — live items from /api/war-room/queue. Each row
          is interactive (chat-brief on body, ⋯ menu for detail + chain).
          For Layla we render TWO sub-groups (Drafting / Ready); for
          everyone else it's one flat list. */}
      <SectionLabel>{queueLabelFor(role)}</SectionLabel>
      <div className="mt-2 flex flex-col gap-1.5">
        {queueLoading ? (
          <div className="rounded-md border border-wr-border bg-wr-panel px-3 py-2.5 text-[12px] text-wr-fg-dim">
            Loading…
          </div>
        ) : queueError ? (
          <div className="rounded-md border border-wr-border bg-wr-panel px-3 py-2.5 text-[12px] text-wr-fg-dim">
            Couldn&rsquo;t load queue: {queueError}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-md border border-dashed border-wr-border bg-transparent px-3 py-3 text-center text-[12px] italic text-wr-fg-faint">
            {emptyQueueCopyFor(role)}
          </div>
        ) : role === "Layla" ? (
          // Layla's queue is grouped into Drafting vs Ready buckets.
          // We split the items by status and render each group under a
          // tiny mono sub-label. Synthetic mission rows live in the
          // "Drafting" bucket via their `status: "drafting"` flag, so
          // they sort to the top automatically.
          <LaylaGroupedQueue
            items={visibleItems}
            colorVar={colorVar}
            onBrief={(it) =>
              onBriefRequested({ role, text: briefFor(it), item: it })
            }
            onOpenDetail={(it) => setDetailItem(it)}
            onTriggerChain={(it) => onChainRequested({ role, item: it })}
          />
        ) : role === "Ghada" ? (
          // v3 — Ghada's panel is a gallery, not a queue. 3-col grid
          // of thumbnails with a fallback "no visual" tile.
          <GhadaGallery
            items={items}
            colorVar={colorVar}
            onEditVisual={(it) => {
              if (onEditVisual) {
                onEditVisual(it);
              } else {
                // Fallback to the brief flow if the floor-plan didn't
                // wire `onEditVisual` (defensive — should never hit
                // in practice now that the prop is plumbed through).
                onBriefRequested({ role, text: briefFor(it), item: it });
              }
            }}
          />
        ) : role === "Kareem" ? (
          // v3 — Kareem's panel is the CV history file cabinet. Each
          // row shows the company + job title + fit % + a download
          // pill linking to the actual PDF. Synthetic in-flight CV
          // rows are prepended above the real history.
          <KareemCvHistory
            items={visibleItems}
            colorVar={colorVar}
            onBrief={(it) =>
              onBriefRequested({ role, text: briefFor(it), item: it })
            }
          />
        ) : (
          // Filter out archived rows from the main queue. The archive
          // section below renders them on demand. We don't mutate the
          // upstream `items` array — just hide what's been promoted.
          items
            .filter(
              (it) => !it.contentId || !archivedIds.has(it.contentId)
            )
            .map((item) => {
            // Yusuf-only inline expansion — when the brief item carries
            // full draft text + a content id, we render the queue row
            // followed by an expandable preview slab the moment Salah
            // clicks. Other personas (and Yusuf items without a draft
            // payload) keep the standard chat-brief click behaviour.
            const isYusuf = role === "Yusuf";
            const isExpandable =
              isYusuf && !!item.fullText && !!item.contentId;
            const isExpanded =
              isExpandable && expandedItemId === item.id;

            return (
              <div key={item.id} className="flex flex-col gap-1.5">
                <QueueItem
                  item={item}
                  colorVar={colorVar}
                  onBrief={(it) => {
                    if (isExpandable) {
                      // Toggle inline expansion instead of firing the
                      // chat-brief — keeps Yusuf as the single pane
                      // for content review.
                      setExpandedItemId((cur) =>
                        cur === it.id ? null : it.id
                      );
                    } else {
                      onBriefRequested({
                        role,
                        text: briefFor(it),
                        item: it,
                      });
                    }
                  }}
                  onOpenDetail={(it) => setDetailItem(it)}
                  onTriggerChain={(it) =>
                    onChainRequested({ role, item: it })
                  }
                  // Approve only on Rashid's pending leads — that's
                  // where the gate actually lives. Kareem's items are
                  // already approved (he's waiting on the audit, not
                  // the approval). Other personas don't own the gate.
                  onApprove={
                    role === "Rashid" &&
                    item.leadId &&
                    item.status === "pending"
                      ? approveLead
                      : undefined
                  }
                />
                {/* v3 — Mission-specific kit pills. The minimalist top
                    bar no longer carries Resume PDF / Cover letter
                    downloads; they live here instead, attached to the
                    Yusuf brief row for the exact lead they belong to.
                    Hidden when the kit hasn't been generated yet. */}
                {isYusuf &&
                  item.kind === "brief" &&
                  (item.resumePath || item.coverPath) && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-1">
                      {item.resumePath && (
                        <a
                          href={item.resumePath}
                          download={item.resumeFilename}
                          className="wr-mono inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-wr-border-strong bg-wr-panel px-2.5 py-1 text-[10px] tracking-[0.06em] text-wr-fg hover:bg-wr-panel-2"
                        >
                          <Download className="h-3 w-3" />
                          Resume PDF
                        </a>
                      )}
                      {item.coverPath && (
                        <a
                          href={item.coverPath}
                          className="wr-mono inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-wr-border-strong bg-wr-panel px-2.5 py-1 text-[10px] tracking-[0.06em] text-wr-fg hover:bg-wr-panel-2"
                        >
                          <Mail className="h-3 w-3" />
                          Cover letter
                        </a>
                      )}
                    </div>
                  )}
                {isExpanded && (
                  <YusufDraftPreview
                    item={item}
                    colorVar={colorVar}
                    onShip={shipToLinkedIn}
                    onRequestEdit={requestEdit}
                    shipState={
                      item.contentId
                        ? shipState[item.contentId] || "idle"
                        : "idle"
                    }
                    postUrl={
                      item.contentId
                        ? postUrls[item.contentId] || null
                        : null
                    }
                    shipError={
                      item.contentId
                        ? shipErrors[item.contentId] || null
                        : null
                    }
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Archive — collapsible "what I just shipped" section. Hidden by
          default (Salah only opens it if he wants to revisit / re-copy
          something he already approved). The archive lives in component
          state only — refreshing the workbench wipes it, which is fine
          since the persisted lifecycle status (PUBLISHED) means those
          items won't reappear in the queue on the next fetch. */}
      {archivedIds.size > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            aria-expanded={archiveOpen}
            className={cn(
              "wr-mono inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-wr-border bg-wr-bg-deep px-3 py-2 text-[10px] tracking-[0.18em] text-wr-fg-dim hover:bg-wr-panel hover:text-wr-fg"
            )}
          >
            <span>
              Archive · {archivedIds.size} just shipped
            </span>
            <span className="text-[10px] opacity-70">
              {archiveOpen ? "Hide" : "Show"}
            </span>
          </button>
          {archiveOpen && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {items
                .filter((it) => it.contentId && archivedIds.has(it.contentId))
                .map((item) => {
                  const url = item.contentId
                    ? postUrls[item.contentId] || null
                    : null;
                  return (
                    <li
                      key={`archived-${item.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
                      style={{ borderLeft: "2px solid var(--wr-yusuf)" }}
                    >
                      <div className="min-w-0 flex-1 opacity-90">
                        <div className="text-[12px] text-wr-fg/90 line-through decoration-wr-fg-faint">
                          {item.primary}
                        </div>
                        <div className="wr-mono text-[10px] text-wr-fg-faint">
                          published · live on LinkedIn
                        </div>
                      </div>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="wr-mono inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/60 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                        >
                          <ArrowUpRight className="h-3 w-3" />
                          View post
                        </a>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

      {/* Recent Logs — terminal-style feed of the last 5 activity rows
          attributed to this persona's backend agent_id(s). Persona-
          coloured timestamps + mono everything to read like a war-
          room console. Hidden entirely when there's nothing to show
          (including during the initial loading flash on a fresh DB —
          we'd rather show no section than a "Loading…" placeholder
          that resolves to empty milliseconds later). */}
      {logs.length > 0 && (
        <div className="mt-4">
          <SectionLabel>Recent Logs · Last {logs.length || 5}</SectionLabel>
          <div className="mt-2 rounded-md border border-wr-border bg-wr-bg-deep p-3">
            {logsLoading ? (
              <div className="wr-mono text-[10px] text-wr-fg-faint">
                Loading…
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {logs.map((entry) => (
                  <li
                    key={entry.id}
                    className="font-wr-mono flex items-baseline gap-2 text-[10px] leading-tight"
                  >
                    <span
                      className="shrink-0 tabular-nums"
                      style={{ color: colorVar }}
                    >
                      {formatLogTime(entry.createdAt)}
                    </span>
                    <span className="shrink-0 truncate text-wr-fg-faint max-w-[140px]">
                      {entry.eventType}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-wr-fg-dim">
                      {entry.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* v3 Plan A — Real metric tile. Label + value both fetched from
          /api/war-room/persona/{role}/metrics — real DB count for the
          last 7 days (or active-mission count for Yusuf/Tariq). 0 on
          a fresh DB, which is the truth. Empty/loading state shows
          "—" rather than fabricating a number. */}
      <div
        className="mt-4 flex items-center justify-between rounded-lg border p-3.5"
        style={{
          background: `color-mix(in oklch, ${colorVar} 8%, transparent)`,
          borderColor: `color-mix(in oklch, ${colorVar} 25%, transparent)`,
        }}
      >
        <span className="wr-mono text-[11px] text-wr-fg-dim">
          {metric ? metric.label : "—"}
        </span>
        <span
          className="wr-mono text-[28px] font-semibold tabular-nums"
          style={{ color: colorVar }}
        >
          {metric ? metric.value : "—"}
        </span>
      </div>
    </>
  );
}

// ===== Helpers =======================================================

/** v3 — Build a synthetic in-flight QueueItem from an active mission.
 *
 *  This is the core of the "Layla state desync" fix. An active mission
 *  is a UI-only construct (no backend write happens when the chain
 *  fires), so without this synth Layla's panel keeps showing yesterday's
 *  drafts even though the chatter strip is shouting "drafting Polaris
 *  Labs cover letter NOW". Synthesising a row lets the panel reflect
 *  what the chatter is claiming.
 *
 *  Layla → ticking character count (typing animation).
 *  Kareem → ticking section count (CV is structured, not free-form).
 *
 *  Both reach 100% in roughly the same wall-clock time (~72s) so the
 *  two surfaces feel like they finish in lockstep. Once at 100% the
 *  row stays in the queue (showing "✓ drafted/tailored · awaiting
 *  review") until the mission lifetime expires upstream and the row
 *  drops on the next render.
 *
 *  The returned id is namespaced (`mission:{leadId}:{kind}`) so it
 *  can never collide with a real DB row id and React's reconciliation
 *  is stable across ticks. */
function buildSyntheticMissionRow(
  role: "Layla" | "Kareem",
  mission: ActiveMission,
  artefact: LeadContentApi | LeadResumeApi | null
): QueueItemData {
  // Layla — cover letter row backed by a real generated_content row
  // tagged with related_lead_id. No content row yet → "Queued".
  if (role === "Layla") {
    const content = artefact as LeadContentApi | null;
    if (!content) {
      return {
        id: `mission:${mission.leadId}:cover`,
        kind: "draft",
        primary: `${mission.company.toUpperCase()} · COVER LETTER`,
        secondary: "Queued · awaiting first draft",
        status: "drafting",
        leadId: mission.leadId,
      };
    }
    const ready =
      content.userAction === "approved" ||
      content.userAction === "published" ||
      content.userAction === "scheduled";
    return {
      id: `mission:${mission.leadId}:cover:${content.id}`,
      kind: "draft",
      primary: `${mission.company.toUpperCase()} · COVER LETTER`,
      secondary: ready
        ? `✓ Ready · ${content.charCount} chars · awaiting review`
        : `Drafting · ${content.charCount} chars`,
      status: ready ? "ready" : "drafting",
      leadId: mission.leadId,
      contentId: content.id,
      fullText: content.generatedText,
    };
  }

  // Kareem — tailored CV row backed by a real generated_resumes row
  // (job_id = leadId join). No resume yet → "Queued".
  const resume = artefact as LeadResumeApi | null;
  if (!resume) {
    return {
      id: `mission:${mission.leadId}:cv`,
      kind: "audit",
      primary: `${mission.company.toUpperCase()} · CV TAILORING`,
      secondary: "Queued · awaiting Kareem",
      status: "drafting",
      leadId: mission.leadId,
    };
  }
  const ready =
    resume.userAction === "approved" || resume.userAction === "published";
  return {
    id: `mission:${mission.leadId}:cv:${resume.id}`,
    kind: "audit",
    primary: `${mission.company.toUpperCase()} · CV TAILORING`,
    secondary: ready
      ? `✓ Ready · tailored PDF · awaiting review`
      : `Tailored · PDF generated · awaiting review`,
    status: ready ? "ready" : "drafting",
    leadId: mission.leadId,
    // Reuse the imageUrl slot for the download URL — Kareem's CV
    // history list already renders this as the "↓ PDF" pill.
    imageUrl: resume.downloadUrl || undefined,
  };
}

/** Persona-specific label for the Local Queue section. Reads as the
 *  agent's own framing ("Pending audits" for Kareem, "Unprocessed
 *  leads" for Rashid) so the copy matches the workbench's role. */
function queueLabelFor(role: WarRoomPersonaKey): string {
  switch (role) {
    case "Rashid":
      return "Local Queue · Unprocessed Leads";
    case "Kareem":
      return "Local Queue · Pending Audits";
    case "Layla":
      return "Local Queue · Content in Progress";
    case "Yusuf":
      return "Local Queue · Brief";
    default:
      return "Local Queue";
  }
}

/** Persona-specific empty-queue copy. Idle states should still feel
 *  in-character — Rashid's "all caught up" beats a generic "empty". */
function emptyQueueCopyFor(role: WarRoomPersonaKey): string {
  switch (role) {
    case "Rashid":
      return "All caught up — no new leads waiting for approval.";
    case "Kareem":
      return "No pending audits. Approve a lead to send work my way.";
    case "Layla":
      return "Nothing in flight. Ask me to draft something.";
    case "Yusuf":
      return "Quiet day on the brief.";
    default:
      return "Queue empty — agent on standby.";
  }
}

/** Pull "HH:MM:SS" out of sqlite's "YYYY-MM-DD HH:MM:SS". */
function formatLogTime(iso: string): string {
  const parts = iso.includes("T") ? iso.split("T") : iso.split(" ");
  return (parts[1] || iso).slice(0, 8);
}

/** Layla-only: render the queue as two labelled sub-groups (Drafting
 *  + Ready) with the same QueueItem rows underneath. Empty groups are
 *  hidden so the workbench never shows an awkward "Drafting · 0". */
function LaylaGroupedQueue({
  items,
  colorVar,
  onBrief,
  onOpenDetail,
  onTriggerChain,
}: {
  items: QueueItemData[];
  colorVar: string;
  onBrief: (item: QueueItemData) => void;
  onOpenDetail: (item: QueueItemData) => void;
  onTriggerChain: (item: QueueItemData) => void;
}) {
  const drafting = items.filter((i) => i.status !== "ready");
  const ready = items.filter((i) => i.status === "ready");

  return (
    <div className="flex flex-col gap-3">
      {drafting.length > 0 && (
        <div>
          <SubLabel color={colorVar}>Drafting · {drafting.length}</SubLabel>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {drafting.map((item) => (
              <QueueItem
                key={item.id}
                item={item}
                colorVar={colorVar}
                onBrief={onBrief}
                onOpenDetail={onOpenDetail}
                onTriggerChain={onTriggerChain}
              />
            ))}
          </div>
        </div>
      )}
      {ready.length > 0 && (
        <div>
          <SubLabel color={colorVar}>Ready · {ready.length}</SubLabel>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {ready.map((item) => (
              <QueueItem
                key={item.id}
                item={item}
                colorVar={colorVar}
                onBrief={onBrief}
                onOpenDetail={onOpenDetail}
                onTriggerChain={onTriggerChain}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Smaller mono sub-label under the main SectionLabel — used by
 *  Layla's "Drafting" and "Ready" group headers. */
/** v3 Ghada gallery — 3-column grid of generated visuals. Items
 *  WITHOUT an `imageUrl` are filtered out entirely (they aren't her
 *  deliverables — they belong in Layla / Yusuf panels). Click a tile
 *  to open Ghada's chat in image-edit mode: the post text loads as
 *  context, Ghada asks what to change, and Salah's reply triggers a
 *  regeneration of the underlying SVG/PNG. */
function GhadaGallery({
  items,
  colorVar,
  onEditVisual,
}: {
  items: QueueItemData[];
  colorVar: string;
  /** Click handler — opens Ghada chat with the tile's post pre-loaded
   *  + a proactive "what to change?" message from her. */
  onEditVisual: (item: QueueItemData) => void;
}) {
  // Only render tiles that actually have an image. A row with image_url
  // = NULL means Ghada hasn't (or won't) produce one — surfacing it as
  // a "No visual" placeholder is noise. The user wanted these hidden.
  const visible = items.filter((it) => !!it.imageUrl);
  if (visible.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-wr-border bg-transparent px-3 py-6 text-center text-[12px] italic text-wr-fg-faint">
        Studio empty — no visuals on the board yet.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onEditVisual(item)}
          className="group relative cursor-pointer overflow-hidden rounded-md border bg-wr-bg-deep transition-transform hover:-translate-y-0.5"
          style={{
            aspectRatio: "16 / 9",
            borderColor: `color-mix(in oklch, ${colorVar} 35%, transparent)`,
          }}
          title={`${item.primary} — click to edit visual`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl!}
            alt={item.primary}
            className="block h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 py-1.5">
            <div className="text-[10px] font-semibold text-white line-clamp-1">
              {item.primary}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/** v3 Kareem CV history — list of recently generated tailored CVs.
 *  Each row: company + job title + fit % + Download pill linking to
 *  the actual PDF served by `/api/jobs/resume?file=…`. */
function KareemCvHistory({
  items,
  colorVar,
  onBrief,
}: {
  items: QueueItemData[];
  colorVar: string;
  onBrief: (item: QueueItemData) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-wr-border bg-transparent px-3 py-6 text-center text-[12px] italic text-wr-fg-faint">
        File cabinet empty — no CVs generated yet.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-md border border-wr-border bg-wr-panel px-3 py-2.5"
          style={{ borderLeft: `2px solid ${colorVar}` }}
        >
          <button
            type="button"
            onClick={() => onBrief(item)}
            className="flex flex-1 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent text-left"
          >
            <span className="text-[13px] font-medium leading-tight text-wr-fg">
              {item.primary}
            </span>
            <span className="wr-mono text-[10px] text-wr-fg-faint">
              {item.secondary}
            </span>
          </button>
          {item.imageUrl && (
            <a
              href={item.imageUrl}
              download
              className="wr-mono inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-bold tracking-[0.12em]"
              style={{
                borderColor: `color-mix(in oklch, ${colorVar} 50%, transparent)`,
                color: colorVar,
                background: `color-mix(in oklch, ${colorVar} 12%, transparent)`,
              }}
            >
              ↓ PDF
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function SubLabel({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="wr-mono text-[9px] tracking-[0.18em] opacity-80"
      style={{ color }}
    >
      {children}
    </div>
  );
}

/**
 * Yusuf's inline draft preview — expanded slab that drops below a
 * content brief row when clicked. Shows the full draft text in a
 * paper-style mono box, then two action buttons:
 *
 *   🚀 SHIP TO LINKEDIN   — direct publish via Zernio. The button
 *                           cycles idle → sending → live → idle.
 *                           On success, archive + decrement metric.
 *                           On failure, surface the error + unlock.
 *   💬 Request edit        — routes to Layla's chat with the draft
 *                           pre-loaded as a v2 revision request.
 *
 * The slab uses Layla's rose accent (the draft is hers — Yusuf is
 * just the supervisor reviewing it) so visual ownership is preserved
 * even inside Yusuf's panel.
 */
function YusufDraftPreview({
  item,
  colorVar,
  onShip,
  onRequestEdit,
  shipState,
  postUrl,
  shipError,
}: {
  item: QueueItemData;
  /** Yusuf's accent — used on the slab's outer border. */
  colorVar: string;
  onShip: (item: QueueItemData) => void;
  onRequestEdit: (item: QueueItemData) => void;
  shipState: "idle" | "sending" | "live" | "error";
  postUrl: string | null;
  shipError: string | null;
}) {
  const text = item.fullText || "(no preview available)";
  // Layla's accent for the draft slab itself — visual ownership.
  const laylaVar = "var(--wr-layla)";
  // Ghada's accent for the visual preview block.
  const ghadaVar = "var(--wr-ghada)";

  // Local visual state — seeded from the queue payload so the preview
  // shows immediately if a Ghada image already exists, otherwise the
  // empty state offers a "Generate visual" CTA.
  const [visualUrl, setVisualUrl] = useState<string | null>(
    item.imageUrl || null
  );
  const [visualState, setVisualState] = useState<
    "idle" | "generating" | "error"
  >("idle");
  const [visualError, setVisualError] = useState<string | null>(null);

  /** Fire (or re-fire) Ghada for this content row. Called by the
   *  "Generate visual" CTA in the empty state and the Regenerate icon
   *  in the populated state. Locks the button + clears prior errors. */
  const generateVisual = useCallback(
    async (regenerate: boolean) => {
      if (!item.contentId) return;
      setVisualState("generating");
      setVisualError(null);
      try {
        const res = await fetch("/api/war-room/visual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId: item.contentId,
            regenerate,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        // Cache-bust the URL when regenerating so the browser fetches
        // the new bytes — the file path is the same (/wr-visuals/{id}.png)
        // but we want the new image, not the cached one.
        const url = regenerate
          ? `${data.imageUrl}?t=${Date.now()}`
          : data.imageUrl;
        setVisualUrl(url);
        setVisualState("idle");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[YusufWorkbench] visual generate failed", err);
        setVisualError(msg.slice(0, 200));
        setVisualState("error");
        // Auto-clear the error after 4s so the button is usable again.
        setTimeout(() => {
          setVisualState((s) => (s === "error" ? "idle" : s));
        }, 4000);
      }
    },
    [item.contentId]
  );

  // Per-state button content + style. Encapsulated as a switch so the
  // JSX below stays linear and the four visual states are obvious.
  const shipButton = (() => {
    switch (shipState) {
      case "sending":
        return {
          label: "Sending…",
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          locked: true,
          variant: "active",
        };
      case "live":
        return {
          label: "✓ LIVE on LinkedIn",
          icon: <Check className="h-3 w-3" />,
          locked: true,
          variant: "live",
        };
      case "error":
        return {
          label: "Failed · retry",
          icon: <TriangleAlert className="h-3 w-3" />,
          locked: false,
          variant: "error",
        };
      case "idle":
      default:
        return {
          label: "🚀 SHIP TO LINKEDIN",
          icon: <Rocket className="h-3 w-3" />,
          locked: false,
          variant: "idle",
        };
    }
  })();

  return (
    <div
      className="ml-3 rounded-md border bg-wr-panel-2 p-3 animate-wr-expand-in"
      style={{
        borderColor: `color-mix(in oklch, ${colorVar} 25%, transparent)`,
        borderLeft: `2px solid ${laylaVar}`,
      }}
    >
      {/* Header — attribution + word count + LIVE link if published. */}
      <div className="mb-2 flex items-center justify-between">
        <div className="wr-mono text-[9px] tracking-[0.18em] text-wr-fg-faint">
          Draft preview
        </div>
        <div className="wr-mono flex items-center gap-2 text-[9px] text-wr-fg-faint">
          <span>{item.secondary}</span>
          {postUrl && (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em] text-emerald-700 dark:text-emerald-300"
            >
              ↗ Live
            </a>
          )}
        </div>
      </div>

      {/* Visual preview — Phase 7+ carousel deck when Layla generated
          one for this row, otherwise Ghada's older single-image
          blueprint. Carousels are what actually publish to LinkedIn
          alongside the post text, so when one exists the review slab
          surfaces THAT — Yusuf shouldn't be reviewing an image that
          doesn't go up.
          Older rows (pre-carousel) keep falling through to Ghada's
          three-state visual block (empty / generating / has image). */}
      {item.carouselPdfUrl && item.contentId ? (
        <div
          className="mb-3 overflow-hidden rounded-sm border bg-wr-bg-deep"
          style={{
            borderColor: `color-mix(in oklch, ${laylaVar} 35%, transparent)`,
          }}
        >
          <div className="flex items-center justify-between border-b border-wr-border bg-wr-bg-2 px-3 py-1.5">
            <div className="wr-mono flex items-center gap-1.5 text-[9px] tracking-[0.18em] text-wr-fg-faint">
              Carousel · {item.carouselSlides ?? 4} slides
              {item.carouselBrandId
                ? ` · brand: ${item.carouselBrandId}`
                : ""}
            </div>
            <a
              href={item.carouselPdfUrl}
              download
              className="wr-mono inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-bold tracking-[0.12em]"
              style={{
                borderColor: `color-mix(in oklch, ${laylaVar} 50%, transparent)`,
                color: laylaVar,
                background: `color-mix(in oklch, ${laylaVar} 12%, transparent)`,
              }}
              title="Download the PDF carousel — upload manually to a LinkedIn document post"
            >
              ↓ PDF
            </a>
          </div>
          <div className="flex gap-1.5 overflow-x-auto p-2">
            {Array.from(
              { length: item.carouselSlides ?? 4 },
              (_, i) => i + 1
            ).map((page) => {
              const src = `/api/content/${item.contentId}/carousel/preview/${page}`;
              return (
                <a
                  key={page}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block shrink-0"
                  title={`Slide ${page} — open full-size in a new tab`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Slide ${page}`}
                    className="h-28 w-auto rounded border border-wr-border bg-wr-bg-deep transition-transform hover:scale-[1.02]"
                    loading="lazy"
                  />
                </a>
              );
            })}
          </div>
        </div>
      ) : (
      <div
        className="mb-3 overflow-hidden rounded-sm border bg-wr-bg-deep"
        style={{
          borderColor: `color-mix(in oklch, ${ghadaVar} 35%, transparent)`,
        }}
      >
        <div className="flex items-center justify-between border-b border-wr-border bg-wr-bg-2 px-3 py-1.5">
          <div className="wr-mono flex items-center gap-1.5 text-[9px] tracking-[0.18em] text-wr-fg-faint">
            <ImageIcon className="h-3 w-3" style={{ color: ghadaVar }} />
            Visual preview · غادة Ghada
          </div>
          {visualUrl && visualState !== "generating" && (
            <button
              type="button"
              onClick={() => generateVisual(true)}
              aria-label="Regenerate visual"
              title="Regenerate · ~$0.04"
              className="wr-mono flex items-center gap-1 rounded-md border border-wr-border bg-wr-bg px-2 py-0.5 text-[9px] text-wr-fg-dim hover:text-wr-fg"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Regenerate
            </button>
          )}
        </div>

        {visualState === "generating" ? (
          // Generating — animated overlay with persona-coloured glow.
          <div className="flex aspect-video items-center justify-center bg-wr-bg-deep">
            <div className="flex flex-col items-center gap-2">
              <Loader2
                className="h-6 w-6 animate-spin"
                style={{ color: ghadaVar }}
              />
              <span
                className="wr-mono text-[10px] tracking-[0.18em]"
                style={{ color: ghadaVar }}
              >
                Ghada is sketching…
              </span>
              <span className="wr-mono text-[9px] text-wr-fg-faint">
                ~10s · DALL-E 3
              </span>
            </div>
          </div>
        ) : visualUrl ? (
          // Show the image — fixed 16:9 ratio so the slab doesn't
          // jitter as different aspect-ratio outputs land.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={visualUrl}
            alt="Ghada visual preview"
            className="block aspect-video w-full object-cover"
          />
        ) : (
          // Empty state — primary CTA "Generate visual" using Ghada's
          // accent, plus a tiny explainer line so Salah knows what
          // pressing it actually does.
          <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-wr-bg-deep">
            <button
              type="button"
              onClick={() => generateVisual(false)}
              className="wr-mono inline-flex items-center gap-1.5 rounded-md border-0 px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-white shadow-[0_0_18px_color-mix(in_oklch,var(--wr-ghada)_45%,transparent)]"
              style={{ background: ghadaVar }}
            >
              <Wand2 className="h-3 w-3" />
              Generate visual
            </button>
            <span className="wr-mono text-[9px] text-wr-fg-faint">
              Blueprint-style diagram via DALL-E 3 · ~$0.04
            </span>
          </div>
        )}

        {visualError && visualState === "error" && (
          <div
            className="wr-mono border-t border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[10px] text-red-700 dark:text-red-300"
            role="alert"
          >
            {visualError}
          </div>
        )}
      </div>
      )}

      {/* The draft text — high-contrast mono. */}
      <div className="wr-scrollbar-slim max-h-[280px] overflow-y-auto rounded-sm border border-wr-border bg-wr-bg-deep p-3">
        <p className="font-wr-mono whitespace-pre-wrap text-[12px] leading-relaxed text-wr-fg">
          {text}
        </p>
      </div>

      {/* Inline error banner — only when the most recent ship attempt
          failed. Self-clears via shipState transition; keep readable. */}
      {shipError && shipState === "error" && (
        <div
          className="wr-mono mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-700 dark:text-red-300"
          role="alert"
        >
          {shipError.slice(0, 200)}
        </div>
      )}

      {/* Action buttons — Ship is the primary CTA; Request edit
          stays an outline pill. While sending, both lock. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="wr-mono text-[10px] text-wr-fg-faint">
          <Sparkles className="mr-1 inline h-3 w-3" />
          Single-pane review
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onRequestEdit(item)}
            disabled={shipState === "sending" || shipState === "live"}
            className={cn(
              "wr-mono inline-flex items-center gap-1.5 rounded-md border bg-transparent px-3 py-1.5 text-[11px] font-semibold tracking-[0.1em]",
              "border-rose-500/60 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300",
              (shipState === "sending" || shipState === "live") &&
                "cursor-default opacity-50"
            )}
          >
            <MessageSquare className="h-3 w-3" />
            <Pencil className="h-3 w-3 -ml-0.5" />
            Request edit
          </button>
          <button
            type="button"
            onClick={() => onShip(item)}
            disabled={shipButton.locked}
            className={cn(
              "wr-mono inline-flex items-center gap-1.5 rounded-md border-0 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.12em]",
              shipButton.variant === "idle" &&
                "cursor-pointer bg-emerald-500 text-emerald-950 shadow-[0_0_18px_rgba(52,211,153,0.45)] hover:bg-emerald-400",
              shipButton.variant === "active" &&
                "cursor-default bg-emerald-600 text-white shadow-[0_0_18px_rgba(52,211,153,0.55)]",
              shipButton.variant === "live" &&
                "cursor-default bg-emerald-400 text-emerald-950 shadow-[0_0_24px_rgba(52,211,153,0.7)]",
              shipButton.variant === "error" &&
                "cursor-pointer bg-red-500 text-red-950 hover:bg-red-400 shadow-[0_0_16px_rgba(239,68,68,0.45)]"
            )}
          >
            {shipButton.icon}
            {shipButton.label}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({
  color,
  children,
}: {
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="wr-mono text-[10px] tracking-[0.22em]"
      style={{ color: color ?? "var(--wr-fg-faint)" }}
    >
      {children}
    </div>
  );
}
