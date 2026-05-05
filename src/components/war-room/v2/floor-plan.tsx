"use client";

/**
 * Floor Plan — the War Room v2 main surface.
 *
 * What's here today:
 *   - 5 desks laid out in the canonical positions.
 *   - SVG connection layer (DeskLines) that highlights active edges.
 *   - Animated handoff Packets that fly between desks during a chain.
 *   - Radio Chatter strip at the bottom showing the last 6 A2A msgs.
 *   - Intensity dial that auto-fires chain scripts on a timer.
 *   - One manual chain-trigger button (LifeMD Sprint). v3 removed
 *     the IELTS Pressure trigger — the system is engineering-only now.
 *   - Theme toggle (dark/light).
 *
 * What's deliberately deferred — these mount in the next steps but
 * the click handler + state slots already live here so the wire is
 * trivial when they land:
 *   - `expandedAgent` → Expanded Workbench overlay (700px panel).
 *   - `chatAgent`     → Chat Drawer (440px right slide-in).
 *
 * State shape mirrors the handoff exactly — a single component owns
 * everything; chain beats reduce over the same set of fields. We can
 * extract to Zustand later if a second surface needs the same state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WAR_ROOM_KEYS,
  WAR_ROOM_PERSONAS,
  type WarRoomPersonaKey,
} from "@/war-room/personas";
import { CANVAS, CORNER_LABELS } from "@/war-room/floor-plan-config";
// v3 Plan A Phase 5 — `chain-scripts.ts` imports trimmed. PROGRESS_LINES,
// MilestoneTag, ESTIMATED_COMPLETION_MIN are no longer referenced from
// this component (progress ticker deleted; mission lifetime now
// driven by DB state, not a wall-clock constant). The chain-scripts
// module still exists to avoid a cascade-delete; it's pruned in a
// later cleanup pass.
import type { QueueItem as QueueItemData } from "@/app/api/war-room/queue/route";
import { Desk } from "./desk";
import { DeskLines, type ActiveEdge } from "./desk-lines";
import { Packet } from "./packet";
import { RadioChatter, type ChatterEntry } from "./radio-chatter";
// v3 Plan A — IntensityDial deleted. The system used to flavour Yusuf's
// chat tone based on a 0-3 dial; the team now always communicates with
// Level-3 efficiency (concise, technical, kit-focused) and the floor
// only animates on real DB events.
import { ThemeToggle } from "./theme-toggle";
import { ExpandedWorkbench } from "./expanded-workbench";
import { ChatDrawer, type PendingSystemMessage } from "./chat-drawer";
import { useAgentOrchestrator } from "@/hooks/useAgentOrchestrator";

/** v3 Plan A — Initial desk-task lines start EMPTY. Real activity
 *  arrives via SSE (the handleEventLog effect writes `frame.title`
 *  into `tasks[persona]` whenever an agent event fires for that
 *  persona). On a fresh DB or quiet floor, the desk shows nothing —
 *  better than lying about work that isn't happening. */
const INITIAL_TASKS: Record<WarRoomPersonaKey, string> = {
  Yusuf: "",
  Rashid: "",
  Layla: "",
  Ghada: "",
  Kareem: "",
  Tariq: "",
};

interface PacketState {
  id: number;
  from: WarRoomPersonaKey;
  to: WarRoomPersonaKey;
  color: string;
  label: string;
}

/** v3 Plan A — Backend `agent_id` → War Room v2 persona mapping.
 *  Used by both the chatter seed (REST agent-activity fetch) and
 *  the SSE handler (real-time bus events) so the two paths agree
 *  on which persona owns which event. Rows whose agent_id isn't
 *  in this map are skipped — surfacing orphan rows would just
 *  confuse Salah. */
const AGENT_ID_TO_PERSONA: Record<string, WarRoomPersonaKey> = {
  "job-matcher": "Rashid",
  content: "Layla",
  ghada: "Ghada",
  "ghada-summariser": "Ghada",
  bureaucrat: "Kareem",
  resume: "Kareem",
  system: "Yusuf",
};

/** Defensive filter — historical activity rows or stale bus events
 *  that mention IELTS / exams / mock tests / prep are dropped before
 *  hitting the chatter UI. The current system writes none of these,
 *  but a DB rebuilt from a pre-v3 snapshot might replay them. */
const EXAM_TEXT_FILTER = /\b(ielts|exam|mock|prep)\b/i;

// v3 Plan A — `INTERJECTION_LINES` + `pickInterjection()` deleted.
// Both produced fake "Kareem speaking" / "Layla speaking" status
// updates ("Missing Riverpod", "Drafting cold") that fired on a
// timer regardless of whether any agent actually ran. Real
// interjections from real agent runs will arrive via SSE (Phase 2).

/** v3 Plan A — Shape returned by `GET /api/war-room/missions/active`.
 *  Mirrors `ActiveMissionRow` from `lib/db.ts` but with startedAt as
 *  ISO string (server) → converted to ms epoch when we build the
 *  client-side ActiveMission. */
interface ActiveMissionApiRow {
  leadId: string;
  company: string | null;
  fitPercentage: number | null;
  startedAt: string;
}

/** v3 — Per-mission metadata stored in `activeMissions`. Hydrated from
 *  the polling response of `/api/war-room/missions/active` (DB-backed
 *  source of truth). Used by:
 *    - LeadDetailPanel to lock the trigger button into MISSION ACTIVE
 *    - Workbench panels to surface synthetic "live work" rows backed
 *      by real generated_content rows
 *    - Tariq's countdown to derive its 30-min apply window. */
export interface ActiveMission {
  leadId: string;
  company: string;
  fitPercentage: number | null;
  /** ms epoch — derived from `seen_jobs.mission_started_at`. Survives
   *  page reloads because the DB row does. */
  startedAt: number;
}

interface FloorPlanProps {
  /** Called when a desk is clicked. The Floor Plan will eventually own
   *  expanded workbench + chat drawer locally; this prop is here so the
   *  page can wire those overlays in the parent until those components
   *  exist. Optional. */
  onDeskClick?: (role: WarRoomPersonaKey) => void;
  /**
   * External chat request — when the parent sets this (e.g. the Command
   * Bar's "Ask Rashid" button or the Drafts panel's "Open in chat"),
   * the Floor Plan opens the chat drawer for that persona without
   * touching the workbench overlay. Optional `autoSend` is fired into
   * the drawer's auto-submit slot.
   *
   * The Floor Plan calls `onChatRequestConsumed` once the request has
   * been applied so the parent can clear its slot.
   */
  pendingChatRequest?: {
    role: WarRoomPersonaKey;
    autoSend?: string;
  } | null;
  onChatRequestConsumed?: () => void;
  /**
   * Approval celebration handoff — the Command Bar fires this after a
   * successful POST to `/api/war-room/lead/[id]/approve`. The Floor
   * Plan reacts by refetching the active-missions endpoint immediately
   * (the approve route now also advances `mission_status` to
   * IN_PROGRESS, so the next refetch sees the lead as active and the
   * MISSION ACTIVE pill locks).
   *
   * v3 Plan A — The previous build also pushed a fake Yusuf chatter
   * row + ran a canned `buildLeadSprint` animation here. Both were
   * theatre and have been removed; real activity arrives via SSE.
   *
   * Cleared via `onApprovalConsumed` so the parent can drop the slot.
   */
  pendingApproval?: {
    company: string;
    fitPercentage?: number | null;
  } | null;
  onApprovalConsumed?: () => void;
}

export function FloorPlan({
  onDeskClick,
  pendingChatRequest,
  onChatRequestConsumed,
  pendingApproval,
  onApprovalConsumed,
}: FloorPlanProps) {
  // ----- Live state ----------------------------------------------------
  // v3 Plan A — `intensity` state deleted. The team always replies at
  // Level-3 efficiency (configured server-side in chat/route.ts).
  // Yusuf is "always busy" by design — he's command, never idle.
  const [busyDesks, setBusyDesks] = useState<Set<WarRoomPersonaKey>>(
    () => new Set<WarRoomPersonaKey>(["Yusuf"])
  );
  const [activeEdges, setActiveEdges] = useState<ActiveEdge[]>([]);
  const [packets, setPackets] = useState<PacketState[]>([]);
  const [notifications, setNotifications] = useState<Set<WarRoomPersonaKey>>(
    () => new Set<WarRoomPersonaKey>()
  );
  const [tasks, setTasks] =
    useState<Record<WarRoomPersonaKey, string>>(INITIAL_TASKS);
  const [chatter, setChatter] = useState<ChatterEntry[]>([]);

  // Overlay state — expandedAgent flips first, then chatAgent 350ms
  // later so the workbench animates in before the chat drawer slides
  // over the right edge of the floor. Closing reverses the order.
  const [expandedAgent, setExpandedAgent] = useState<WarRoomPersonaKey | null>(
    null
  );
  const [chatAgent, setChatAgent] = useState<WarRoomPersonaKey | null>(null);
  /** One-shot prompt the ChatDrawer auto-submits on next open. Cleared
   *  by the drawer via `onAutoSendConsumed`. */
  const [briefAutoSend, setBriefAutoSend] = useState<string | null>(null);
  /** Image-edit mode for Ghada's chat. When set, the next user message
   *  in Ghada's drawer routes to /api/war-room/visual?regenerate=true
   *  (with the typed text as `briefOverride`) instead of the normal
   *  chat-completion API. Cleared by the ChatDrawer via
   *  `onImageEditConsumed` after the regen completes (or fails). */
  const [imageEditTarget, setImageEditTarget] = useState<{
    contentId: number;
    style: "blueprint" | "spider-verse";
  } | null>(null);

  /** Live queue counts per persona — drives the numeric badge on each
   *  desk. Polled every 10s so adding a lead in another tab eventually
   *  reflects here without forcing a full refresh. */
  const [counts, setCounts] = useState<Partial<Record<WarRoomPersonaKey, number>>>({});
  /** Per-persona "last-seen" timestamps. Treats the desk badge as a
   *  notification ("N new since you last looked") instead of a true
   *  backlog count. Persisted to localStorage so the seen state
   *  survives reloads. Updated to `Date.now()` whenever a desk is
   *  clicked or a brief is requested for that persona. */
  const SEEN_AT_KEY = "warroom.deskSeenAt.v1";
  const [seenAt, setSeenAt] = useState<Partial<Record<WarRoomPersonaKey, number>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(SEEN_AT_KEY);
      return raw ? (JSON.parse(raw) as Partial<Record<WarRoomPersonaKey, number>>) : {};
    } catch {
      return {};
    }
  });
  // Persist on every change. Cheap (1 short JSON string) so no debounce.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SEEN_AT_KEY, JSON.stringify(seenAt));
    } catch {
      // storage blocked / quota — non-fatal; the in-memory state still works.
    }
  }, [seenAt]);

  /** v3 Plan A — Active missions, polled from `/api/war-room/missions/
   *  active` (10 s cadence). DB is source of truth: any tab that polls
   *  sees the same set, reloads survive trivially. The map is rebuilt
   *  from the server response on every poll; `messagedMilestones` is
   *  the only client-side concern preserved across polls (so a mission
   *  that was already at 25% in this session doesn't re-announce 25%
   *  on the next poll tick).
   *
   *  Source of truth for:
   *    1. LeadDetailPanel footer — gates the trigger button into
   *       MISSION ACTIVE state when the panel's leadId is a key.
   *    2. Layla & Kareem workbench panels — each active mission
   *       synthesises a "live work in progress" row at the top of
   *       their queue + overrides the static "Now Working On" line.
   *    3. Progress-phase chatter ticker.
   *
   *  Initial value is empty; the first poll runs in a useEffect on
   *  mount so SSR doesn't try to read the DB. */
  const [activeMissions, setActiveMissions] = useState<Map<string, ActiveMission>>(
    () => new Map<string, ActiveMission>()
  );

  /** v3 — Inbox of system messages + cross-persona interjections that
   *  should be spliced into chat transcripts when the user opens the
   *  matching drawer (or right now if it's already open). Drained by
   *  ChatDrawer's effect once consumed; ids removed via the consume
   *  callback. We use a monotonic counter for the id so React keys
   *  stay stable across renders. */
  const [pendingSysMsgs, setPendingSysMsgs] = useState<PendingSystemMessage[]>([]);
  const sysMsgIdRef = useRef(0);

  /** v3 — Transient toast for the "Mission fired" success notification.
   *  Single-slot (we don't queue toasts; if one fires while another is
   *  visible the new one replaces it, since multiple chains in quick
   *  succession is the only realistic collision and the latest action
   *  is the most useful signal). Auto-dismisses ~2.5s after firing. */
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  // v3 Plan A — `scriptCursor` was used by the deleted demo autopilot
  // to round-robin through CHAIN_SCRIPTS. With the autopilot gone the
  // ref has no consumers — left absent. Manual triggers always run a
  // per-lead `buildLeadSprint(...)`, never an indexed CHAIN_SCRIPTS row.

  // Track timeouts so unmount can clean them up (toast auto-dismiss,
  // chain-bridge interjection delays, etc.). Mission lifetime cleanup
  // moved to the DB; no longer scheduled here.
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** Format the current wall clock as HH:MM:SS — used on chatter rows. */
  const timeStamp = useCallback(() => {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  }, []);

  // v3 Plan A — `runScript()`, `runChain()`, and the chain-script
  // engine deleted. They drove the floor's packet/chatter animation
  // from canned `ChainScript` arrays. Every call site played beats
  // that didn't correspond to real agent activity. The chatter strip
  // now fills only via:
  //   - The seed effect on mount (real `agent_activity_log` rows)
  //   - The progress ticker (Phase 4 will replace this with SSE)
  //   - SSE bus events from real agent runs (Phase 2)
  // Removed types: ChainScript, BEAT_INTERVAL_MS / CHAIN_TAIL_MS
  // imports kept until the progress ticker is rewritten.

  // v3 Plan A — Demo autopilot DELETED.
  //
  // The previous build ran a `setInterval` keyed on the IntensityDial
  // that fired CHAIN_SCRIPTS[0] (the static LifeMD demo) every
  // 8/15/30 s depending on the dial. It existed to make the floor
  // feel "alive" before real triggers existed. Now that the trigger
  // button writes to seen_jobs.mission_status and the floor reflects
  // actual DB state, the demo loop is just noise that re-fires LifeMD
  // beats every few seconds whenever the floor is otherwise idle —
  // exactly what Salah complained about. The IntensityDial component
  // is still mounted (it controls Yusuf's "hurry mode" tone in chat
  // via the chat-route prompt) but no longer drives any chain firing.

  /** v3 Plan A — Refetch the active-missions set from the DB. Called
   *  on mount, on a 10 s polling interval, and immediately after the
   *  trigger POST so the UI reflects the new IN_PROGRESS state without
   *  waiting for the next tick. Stateless: the response IS the truth. */
  const refetchActiveMissions = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/war-room/missions/active", { signal });
      if (!res.ok) return;
      const data = (await res.json()) as { missions: ActiveMissionApiRow[] };
      const incoming = data.missions || [];
      setActiveMissions(() => {
        const next = new Map<string, ActiveMission>();
        for (const row of incoming) {
          next.set(row.leadId, {
            leadId: row.leadId,
            company: row.company || "Unknown",
            fitPercentage: row.fitPercentage,
            startedAt: new Date(row.startedAt).getTime(),
          });
        }
        return next;
      });
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        // Quiet — next tick will retry.
        console.error("[FloorPlan] missions/active fetch failed", err);
      }
    }
  }, []);

  /** v3 Plan A — 10 s polling for IN_PROGRESS missions. Initial fetch
   *  on mount; cleanup aborts the in-flight request. Same cadence as
   *  the existing agent-counts poller. */
  useEffect(() => {
    const ctrl = new AbortController();
    refetchActiveMissions(ctrl.signal);
    const id = setInterval(() => refetchActiveMissions(), 10_000);
    return () => {
      clearInterval(id);
      ctrl.abort();
    };
  }, [refetchActiveMissions]);

  // v3 Plan A Phase 5 — Progress-phase ticker DELETED.
  //
  // Used to fire canned chatter strings at 25/50/75/100% elapsed wall-
  // clock time per mission ("Drafting · 25% complete · Building the
  // Riverpod section now"). Pure timer theatre — no agent had actually
  // produced any of those things. Real agent progress now arrives
  // through SSE: `content:cover-letter-start` / `content:cover-letter-
  // ready` events from the content agent's `mission:started` subscriber
  // map directly to chatter entries via the SSE handler above.

  // v3 Plan A — localStorage persist + re-arm cleanup effects DELETED.
  //
  // Both existed because activeMissions was the source of truth on the
  // client. With Plan A the DB is the source of truth — the polling
  // refetch above replaces both effects:
  //   - Persistence is automatic (the row sits in seen_jobs).
  //   - Cleanup is automatic (the row drops out of the IN_PROGRESS
  //     set when its mission_status advances to KIT_READY/SHIPPED,
  //     which is the next pass).

  /** Clean up any pending beat timeouts on unmount. */
  useEffect(() => {
    return () => {
      for (const t of timeoutsRef.current) clearTimeout(t);
      timeoutsRef.current = [];
    };
  }, []);

  /** Poll the agent-counts endpoint so the desk badges stay fresh.
   *  Quiet failures — if the network hiccups we just keep the old
   *  numbers visible rather than blanking them.
   *
   *  Sends the per-persona `seenAt` map base64-encoded so the server
   *  can return "new since you last looked" counts instead of a flat
   *  14-day backlog. When seenAt changes (desk clicked → entry set to
   *  Date.now()), the next tick fetches fresh counts that drop the
   *  visited persona's badge to 0. */
  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const seenParam =
          Object.keys(seenAt).length > 0
            ? `?seenAt=${encodeURIComponent(JSON.stringify(seenAt))}`
            : "";
        const res = await fetch(`/api/war-room/agent-counts${seenParam}`);
        if (!res.ok) return;
        const data = (await res.json()) as Partial<
          Record<WarRoomPersonaKey, number>
        >;
        if (!cancelled) setCounts(data);
      } catch {
        // ignore — quiet retry on next interval tick
      }
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [seenAt]);

  /** v3 — Seed Radio Chatter on mount from the persisted agent activity
   *  log so the panel isn't empty after a page reload. Without this,
   *  the bubble feed is reset to [] on every navigation and only fills
   *  again when the user manually triggers a chain or raises intensity.
   *
   *  We map each backend `agent_id` back to a persona via the same
   *  table the per-persona endpoint uses. Rows whose agent doesn't
   *  belong to any persona (e.g. stray `system` events outside Yusuf's
   *  scope) are skipped so they don't render as orphan bubbles.
   *
   *  The `to` field has no source in agent_activity_log — those rows
   *  are unicast events, not A2A messages — so we always attribute the
   *  recipient as "Salah" (which is the truthful framing: every action
   *  ultimately reports up to him). New chain-script beats appended
   *  later land on top of this seed in chronological order. */
  useEffect(() => {
    let cancelled = false;
    const seedChatter = async () => {
      try {
        const res = await fetch("/api/war-room/agent-activity?role=all&limit=20");
        if (!res.ok) return;
        const data = (await res.json()) as {
          entries: {
            id: number;
            agentId: string;
            title: string;
            createdAt: string;
          }[];
        };
        if (cancelled || !data.entries?.length) return;
        // API returns newest-first; reverse so chronological order is
        // preserved when SSE events arrive later (they append to the end).
        const seeded: ChatterEntry[] = [];
        for (const e of [...data.entries].reverse()) {
          const from = AGENT_ID_TO_PERSONA[e.agentId];
          if (!from) continue;
          if (EXAM_TEXT_FILTER.test(e.title)) continue;
          // SQLite returns "YYYY-MM-DD HH:MM:SS"; grab the time half.
          // Fall back to the full string if the format is unexpected.
          const time = e.createdAt.includes(" ")
            ? e.createdAt.split(" ")[1]?.slice(0, 8) || e.createdAt
            : e.createdAt;
          seeded.push({
            id: `seed-${e.id}`,
            from,
            to: "Salah",
            text: e.title,
            time,
          });
        }
        // Only seed if the chatter is still empty — avoids clobbering
        // any chain-script beats that fired while the fetch was in flight.
        setChatter((prev) => (prev.length === 0 ? seeded : prev));
      } catch {
        // Quiet — empty state is the existing fallback copy.
      }
    };
    seedChatter();
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== v3 Plan A — SSE subscription =================================
  //
  // Real-time agent-bus events delivered via /api/agent-bus/stream.
  // The hook owns connection management (auto-reconnect, dedup by
  // frame id, bootstrap replay). We just consume `eventLog` as it
  // grows. Each NEW frame:
  //   1. Pushed to the chatter buffer as a persona-attributed entry.
  //   2. Updates `busyDesks` (run_start → busy, run_end → idle).
  //   3. Updates `tasks[persona]` so the panel's "Now Working On"
  //      reflects the current operation in real time.
  // Frames whose agent_id isn't in AGENT_ID_TO_PERSONA are dropped
  // (we only surface events from the v2 squad).

  const { eventLog } = useAgentOrchestrator();

  /** Track which SSE frame ids have already been processed into UI
   *  state. Necessary because the hook's eventLog grows over time
   *  and React renders walk the whole array; we only want to apply
   *  each frame's side-effects (chatter push, busy flip) ONCE. */
  const processedFrameIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (eventLog.length === 0) return;
    const newChatter: ChatterEntry[] = [];
    const busyDeltas: { persona: WarRoomPersonaKey; busy: boolean }[] = [];
    const taskUpdates: Partial<Record<WarRoomPersonaKey, string>> = {};
    // v3 Plan A Phase E — Yusuf chat interjections triggered by REAL
    // agent completion events. These are the honest replacement for
    // the canned "@Kareem · ATS scan back · missing Riverpod" lies
    // we deleted in Phase 1. Each entry pushed here lands as a
    // persona-coloured pop-in inside Yusuf's chat drawer transcript.
    const newSysMsgs: PendingSystemMessage[] = [];

    // eventLog is newest-first. Walk oldest → newest so chronological
    // ordering is preserved in the chatter buffer (newer events end up
    // at the tail; the RadioChatter UI flips for display).
    for (let i = eventLog.length - 1; i >= 0; i--) {
      const frame = eventLog[i];
      if (processedFrameIdsRef.current.has(frame.id)) continue;
      processedFrameIdsRef.current.add(frame.id);

      const persona = AGENT_ID_TO_PERSONA[frame.agentId];
      if (!persona) continue;
      if (EXAM_TEXT_FILTER.test(frame.title)) continue;
      // v3 Plan A — Drop `bus_event` debug self-logs. Every publish()
      // through the bus auto-creates one of these; surfacing them in
      // chatter / chat / desk-task lines floods the UI with "Event:
      // mission:started" repeats. Real agent work flows through
      // logStep with semantic event_types (e.g. "layla:mission-start",
      // "amin:cv-error") — those still surface. Defensive title check
      // catches anything that bypasses the event_type filter.
      if (frame.eventType === "bus_event") continue;
      if (frame.title.startsWith("Event: ")) continue;
      // run_start / run_end / lead:approved are also debug-grain in
      // the chat surface — they describe the agent lifecycle, not the
      // work itself. We use them ONLY for the busy-desk + task-line
      // state (handled below). They DON'T get pushed to chatter.
      const isLifecycleOnly =
        frame.eventType === "run_start" ||
        frame.eventType === "run_end" ||
        frame.eventType === "lead:approved";

      // Build the chatter entry. We prefix with `sse-` so the React
      // key cannot collide with seed-* or progress-* entries.
      // Skip lifecycle-only frames (run_start / run_end / lead:approved)
      // — those still drive busy-desk state below, but they don't
      // belong as standalone chatter bubbles.
      const time = frame.createdAt.includes("T")
        ? new Date(frame.createdAt).toLocaleTimeString("en-GB", {
            hour12: false,
          })
        : frame.createdAt;
      if (!isLifecycleOnly) {
        newChatter.push({
          id: `sse-${frame.id}`,
          from: persona,
          to: "Salah",
          text: frame.title,
          time,
        });
      }

      // Desk busy state — `run_start` flips on, `run_end` flips off.
      // Anything else (`bus_event`, etc) we leave alone so a stray
      // log row doesn't mark a desk idle while it's working.
      const t = frame.eventType.toLowerCase();
      const isCompletion =
        t === "run_end" ||
        t.endsWith(":complete") ||
        t.endsWith(":done") ||
        t.endsWith(":shipped") ||
        t.endsWith(":kit-ready") ||
        t.endsWith(":ready");
      if (t === "run_start" || t.endsWith(":start")) {
        busyDeltas.push({ persona, busy: true });
      } else if (isCompletion) {
        busyDeltas.push({ persona, busy: false });
      }

      // Task line — most recent event title becomes the desk's
      // current-task label IF it's an in-flight event. Completion
      // events (`:shipped`, `:done`, `run_end`, …) reset the label
      // to "Standing by" — without this, "Now Working On" keeps
      // displaying e.g. "Mission shipped · Speechify" hours after
      // the work actually finished.
      taskUpdates[persona] = isCompletion
        ? "Standing by"
        : frame.title.slice(0, 60);

      // v3 Plan A Phase E — Yusuf chat pop-ins for the three mission
      // milestones that map to real agent work. We re-use the
      // pendingSysMsgs queue Phase 1 already wired (chat-drawer
      // drains it into the target persona's transcript).
      if (frame.eventType === "content:cover-letter-start") {
        // v3 Plan A Phase G — Drafting bubble. Persona-coloured pop-in
        // the moment Layla starts writing, so Yusuf's chat shows
        // movement before the *-ready event arrives ~5–10s later.
        newSysMsgs.push({
          id: ++sysMsgIdRef.current,
          targetRole: "Yusuf",
          who: "Layla",
          text: `Drafting cover letter…`,
          ts: Date.now(),
          kind: "interjection",
        });
      } else if (frame.eventType === "resume:cv-start") {
        newSysMsgs.push({
          id: ++sysMsgIdRef.current,
          targetRole: "Yusuf",
          who: "Kareem",
          text: `Tailoring CV…`,
          ts: Date.now(),
          kind: "interjection",
        });
      } else if (frame.eventType === "content:cover-letter-ready") {
        newSysMsgs.push({
          id: ++sysMsgIdRef.current,
          targetRole: "Yusuf",
          who: "Layla",
          text: frame.title,
          ts: Date.now(),
          kind: "interjection",
        });
      } else if (frame.eventType === "resume:cv-ready") {
        newSysMsgs.push({
          id: ++sysMsgIdRef.current,
          targetRole: "Yusuf",
          who: "Kareem",
          text: frame.title,
          ts: Date.now(),
          kind: "interjection",
        });
      } else if (frame.eventType === "mission:kit-ready") {
        // System-bubble framing, not a persona pop-in — this is the
        // moment the mission itself crossed a state boundary.
        newSysMsgs.push({
          id: ++sysMsgIdRef.current,
          targetRole: "Yusuf",
          who: "system",
          text: `KIT READY — ${frame.title.replace(/^Event:\s*/, "")} · review and ship.`,
          ts: Date.now(),
          kind: "system",
        });
      }
    }

    if (newChatter.length > 0) {
      setChatter((prev) => [...prev, ...newChatter].slice(-30));
    }
    if (busyDeltas.length > 0) {
      setBusyDesks((prev) => {
        const next = new Set(prev);
        for (const { persona, busy } of busyDeltas) {
          // Yusuf is permanently busy by design — the supervisor
          // never goes idle in the visual hierarchy. Skip his deltas.
          if (persona === "Yusuf") continue;
          if (busy) next.add(persona);
          else next.delete(persona);
        }
        return next;
      });
    }
    if (Object.keys(taskUpdates).length > 0) {
      setTasks((prev) => ({ ...prev, ...taskUpdates }));
    }
    if (newSysMsgs.length > 0) {
      setPendingSysMsgs((prev) => [...prev, ...newSysMsgs]);
    }
  }, [eventLog]);

  /** Apply external chat requests from the parent (Command Bar /
   *  Drafts panel). Opens the drawer for the requested persona,
   *  optionally with an autoSend prompt. Doesn't open the workbench —
   *  these flows are about quick chat access, not deep-dive. */
  useEffect(() => {
    if (!pendingChatRequest) return;
    setChatAgent(pendingChatRequest.role);
    if (pendingChatRequest.autoSend) {
      setBriefAutoSend(pendingChatRequest.autoSend);
    }
    onChatRequestConsumed?.();
  }, [pendingChatRequest, onChatRequestConsumed]);

  /** v3 Plan A unification — Approval-celebration THEATRE removed.
   *
   *  This effect previously ran a `runScript(buildLeadSprint(...))`
   *  animation and pushed a fake "Command received" Yusuf bubble
   *  directly to the chatter buffer when the user clicked Approve.
   *  Both were lies — no agent had actually run, no work was being
   *  done. The visceral feedback was visual theatre.
   *
   *  Now: Approve hits the same `startMission` path as Trigger (see
   *  `approve/route.ts`), which advances `mission_status` to
   *  IN_PROGRESS in the DB. We just refetch the active-missions
   *  poll immediately so the UI catches up without waiting for the
   *  next 10-second tick. Real progress events will arrive via SSE
   *  from agents that ACTUALLY ran. */
  useEffect(() => {
    if (!pendingApproval) return;
    refetchActiveMissions();
    onApprovalConsumed?.();
  }, [pendingApproval, onApprovalConsumed, refetchActiveMissions]);

  /** Desk click — clear the persona's notification dot, mount the
   *  workbench overlay immediately, then 350ms later slide in the chat
   *  drawer. Matches the handoff timing exactly.
   *
   *  Idempotent: clicking the same desk again is a no-op (prevents
   *  React StrictMode double-fires + accidental double clicks from
   *  stacking the open animation). Clicking a DIFFERENT desk while
   *  one is already open swaps cleanly — we just flip the role and
   *  let the existing overlays re-render with new content. */
  const handleDeskClick = useCallback(
    (role: WarRoomPersonaKey) => {
      // Same desk re-clicked while open → ignore. The user can close
      // via the X / scrim / Escape; re-clicking shouldn't restart the
      // animation or fire the chat-drawer timeout twice.
      if (expandedAgent === role) return;

      setNotifications((prev) => {
        if (!prev.has(role)) return prev;
        const next = new Set(prev);
        next.delete(role);
        return next;
      });
      // Mark the desk as seen — the next agent-counts poll will return
      // 0 for this persona until new items arrive after `Date.now()`.
      // Optimistically zero the visible badge so the UI doesn't lag
      // the 10s polling interval.
      const now = Date.now();
      setSeenAt((prev) => ({ ...prev, [role]: now }));
      setCounts((prev) => ({ ...prev, [role]: 0 }));
      setExpandedAgent(role);
      onDeskClick?.(role);

      // If we're swapping from another open desk, the chat drawer is
      // already on screen — flip its role immediately. Otherwise wait
      // 350ms so the workbench has time to expand-in first.
      if (chatAgent && chatAgent !== role) {
        setChatAgent(role);
      } else if (!chatAgent) {
        const t = setTimeout(() => setChatAgent(role), 350);
        timeoutsRef.current.push(t);
      }
    },
    [chatAgent, expandedAgent, onDeskClick]
  );

  /** Close both overlays. Reverse order — drawer first (so its slide-out
   *  isn't visually clipped by the workbench unmounting under it),
   *  workbench 300ms later when the drawer's transition completes. */
  const closeOverlays = useCallback(() => {
    setChatAgent(null);
    setBriefAutoSend(null);
    const t = setTimeout(() => setExpandedAgent(null), 300);
    timeoutsRef.current.push(t);
  }, []);

  /** Queue-row chat brief — open / focus the chat drawer for this
   *  persona and queue an auto-submit message. If the drawer is
   *  already open for the same persona, the autoSend swap fires
   *  immediately; otherwise the slide-in plays then the message lands. */
  const handleBriefRequested = useCallback(
    ({
      role: targetRole,
      text,
    }: {
      role: WarRoomPersonaKey;
      text: string;
      item: QueueItemData;
    }) => {
      // Clear notification on this desk if any (matches desk-click).
      setNotifications((prev) => {
        if (!prev.has(targetRole)) return prev;
        const next = new Set(prev);
        next.delete(targetRole);
        return next;
      });
      // Mirror the desk-click "mark seen" behaviour so opening Layla
      // via a queue-row click also drops her badge to 0.
      const now = Date.now();
      setSeenAt((prev) => ({ ...prev, [targetRole]: now }));
      setCounts((prev) => ({ ...prev, [targetRole]: 0 }));
      // If the drawer isn't already open for this persona, open it.
      if (chatAgent !== targetRole) {
        setChatAgent(targetRole);
      }
      // Stage the message — the drawer's autoSend effect will pick it
      // up and fire it once.
      setBriefAutoSend(text);
    },
    [chatAgent]
  );

  /** Ghada gallery click → image-edit mode.
   *
   *  Opens Ghada's chat drawer, queues TWO pending system messages:
   *    1. A `system` plate showing the post text as context.
   *    2. A `Ghada` interjection asking what to change.
   *  Then sets `imageEditTarget` so the user's next reply in that
   *  drawer routes to the visual regen endpoint instead of chat. */
  const handleEditVisual = useCallback(
    (item: QueueItemData) => {
      if (!item.contentId) return;
      // Detect raster vs SVG path from the existing image_url. PNGs are
      // Spider-Verse / DALL-E; SVGs are blueprint Sonnet — regen should
      // stay on whichever path produced the original.
      const isPng = !!item.imageUrl && /\.png(\?|$)/i.test(item.imageUrl);
      const style: "blueprint" | "spider-verse" = isPng
        ? "spider-verse"
        : "blueprint";

      // Open Ghada's drawer (skip the slide-in delay if she's already
      // the active persona). Also mark her desk as seen so the badge
      // count drops to 0 — clicking a tile counts as opening her.
      if (chatAgent !== "Ghada") setChatAgent("Ghada");
      const ghadaSeenTs = Date.now();
      setSeenAt((prev) => ({ ...prev, Ghada: ghadaSeenTs }));
      setCounts((prev) => ({ ...prev, Ghada: 0 }));

      // Inject the post-text context bubble and Ghada's proactive
      // opening into the pending-messages queue. Both targetRole=Ghada
      // so they land in her transcript regardless of which drawer was
      // open before.
      const now = Date.now();
      const postText = (item.fullText || item.primary || "(no text)").slice(0, 1800);
      setPendingSysMsgs((prev) => [
        ...prev,
        {
          id: now,
          targetRole: "Ghada",
          who: "system",
          kind: "system",
          text: `📄 Post in scope:\n${postText}`,
          ts: now,
        },
        {
          id: now + 1,
          targetRole: "Ghada",
          who: "Ghada",
          kind: "interjection",
          text: `I see the visual for "${item.primary.slice(0, 80)}". What would you like changed? — different metaphor, swap the focal node, new layout, or rebuild from scratch? Tell me and I'll regenerate.`,
          ts: now + 1,
        },
      ]);

      // Arm image-edit mode. The ChatDrawer reads this and routes the
      // next user submission to /api/war-room/visual instead of /chat.
      setImageEditTarget({ contentId: item.contentId, style });
    },
    [chatAgent]
  );

  /** Queue-row chain trigger — generate a per-lead sprint script using
   *  the picked item's `primary` (company name) and run it. Closes the
   *  overlays first so the user sees the floor light up. */
  const handleChainRequested = useCallback(
    ({ item }: { role: WarRoomPersonaKey; item: QueueItemData }) => {
      const company = item.primary;
      // Best-effort fit % — for "Rashid" rows the secondary is "94% · hot".
      const fitMatch = item.secondary.match(/^(\d+)%/);
      const fitPercentage = fitMatch ? Number(fitMatch[1]) : null;

      // v3 — Build the script up-front. The chain ANIMATION runs for
      // ~6s (script.beats.length * BEAT_INTERVAL_MS + CHAIN_TAIL_MS),
      // but the mission itself stays active for the full kit-assembly
      // SLA (ESTIMATED_COMPLETION_MIN, currently 20 min) so:
      //   1. The synthetic "drafting" row in Layla's panel has time to
      //      tick its char count to completion (~72s at 25 chars/sec)
      //      and then settle into "✓ drafted · awaiting review".
      //   2. The MISSION ACTIVE pill on the trigger button locks for
      //      the right amount of time — Salah can't double-fire while
      //      the kit is still being assembled.
      // v3 Plan A — Theatre script construction REMOVED. The previous
      // build called `runScript(buildLeadSprint(...))` after the POST
      // to play a 6-second packet animation through canned beats like
      // "Hot one just dropped" and "Drafting the LinkedIn post now".
      // None of those events corresponded to real agent runs — pure
      // visual theatre. Real chain activity now arrives via SSE
      // (Phase 2) from agents that actually executed.

      // v3 Plan A — Real DB transition. POST to the mission-start
      // endpoint, then immediately refetch the active set so the UI
      // reflects IN_PROGRESS without waiting for the 10 s poll. The
      // server's WHERE-guarded UPDATE prevents double-fires; we also
      // do an optimistic local toast for instant feedback. If the
      // server returns 409 (someone else already fired) we still
      // refetch — the UI converges to the truth.
      if (item.leadId) {
        // Optimistic toast — shows the moment the user clicks, even
        // before the network round-trip resolves. Confirms "click
        // registered" regardless of whether the trigger or the
        // refetch wins the race.
        setToast({ id: Date.now(), text: `Mission fired · ${company}` });
        const tt = setTimeout(() => {
          setToast((cur) =>
            cur && cur.text === `Mission fired · ${company}` ? null : cur
          );
        }, 2_500);
        timeoutsRef.current.push(tt);

        const leadIdForFetch = item.leadId;
        (async () => {
          try {
            const res = await fetch(
              `/api/war-room/lead/${encodeURIComponent(leadIdForFetch)}/mission/start`,
              { method: "POST" }
            );
            // Both 200 (started) and 409 (already in progress) are
            // valid outcomes from the user's perspective — the truth
            // is "this lead is now IN_PROGRESS". We refetch in either
            // case so the activeMissions map matches the DB.
            if (!res.ok && res.status !== 409) {
              console.error(
                "[FloorPlan] mission/start failed",
                res.status,
                await res.text()
              );
            }
          } catch (err) {
            console.error("[FloorPlan] mission/start network error", err);
          } finally {
            // Refetch regardless of outcome — even on network failure
            // a subsequent poll will eventually reconcile.
            refetchActiveMissions();
          }
        })();
      }

      // v3 Plan A — Single honest system bubble. Used to be three
      // entries (system + Kareem interjection + Layla interjection)
      // but the two interjections were canned strings claiming agent
      // work that hadn't happened ("ATS scan back. Missing Riverpod"
      // — Kareem hadn't run, no scan existed). Stripped to one truth:
      // the mission was queued. Real status updates from real agent
      // runs will arrive via SSE in Phase 2.
      const orderId = ++sysMsgIdRef.current;
      setPendingSysMsgs((prev) => [
        ...prev,
        {
          id: orderId,
          targetRole: "Yusuf",
          who: "system",
          text: `MISSION QUEUED — ${company}. Agents notified; awaiting first run.`,
          ts: Date.now(),
          kind: "system",
        },
      ]);

      // v3 Plan A — Canned chain animation deleted. The previous build
      // ran `runScript(buildLeadSprint(...))` here to play 7 fake beats
      // ("Drafting the LinkedIn post now", "Apply window: 30 min. Ship
      // now") through the floor's packet/chatter system. None of those
      // claims corresponded to real agent activity. The floor now stays
      // calm until SSE delivers real run-start/run-end events.
    },
    []
  );

  // ----- Derived ------------------------------------------------------
  const yusufVar = useMemo(() => WAR_ROOM_PERSONAS.Yusuf.cssVar, []);

  // ----- Render -------------------------------------------------------
  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-[18px] border border-wr-border p-5"
      style={{
        width: CANVAS.w,
        height: CANVAS.h,
        background:
          "linear-gradient(180deg, var(--wr-bg-2), var(--wr-bg-deep))",
      }}
    >
      {/* ===== Top bar ================================================ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="wr-mono text-[10px] text-wr-fg-faint">War Room</div>
            <div className="mt-0.5 text-[17px] font-semibold text-wr-fg">
              Floor Plan — Live
            </div>
          </div>
          <span className="wr-mono inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] tracking-[0.14em] text-emerald-400">
            <span
              aria-hidden
              className="h-1.5 w-1.5 animate-wr-blink rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]"
            />
            {Object.keys(WAR_ROOM_PERSONAS).length} Agents Online
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          {/* v3 Plan A — LifeMD Sprint demo button + IntensityDial both
              removed. Demo autopilot is gone (real missions only); the
              dial is gone because the team always replies at Level-3
              efficiency. ThemeToggle is the lone control here. */}
        </div>
      </div>

      {/* ===== Floor area ============================================ */}
      <div
        className="relative flex-1 overflow-hidden rounded-[14px] border border-wr-border"
        style={{
          background: `
            radial-gradient(ellipse 50% 40% at 50% 35%, color-mix(in oklch, var(${yusufVar}) 12%, transparent), transparent 70%),
            linear-gradient(180deg, var(--wr-bg-2), var(--wr-bg-deep))
          `,
        }}
      >
        {/* 40×40 grid pattern, masked to a soft radial so the edges
            fade naturally and the desks don't look "stuck on a graph". */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(var(--wr-grid-line) 1px, transparent 1px),
              linear-gradient(90deg, var(--wr-grid-line) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
            mask: "radial-gradient(ellipse at 50% 50%, black 50%, transparent 90%)",
            WebkitMask:
              "radial-gradient(ellipse at 50% 50%, black 50%, transparent 90%)",
          }}
        />

        <DeskLines active={activeEdges} />

        {/* v3 Plan A — Hide the desk whose workbench is currently open.
            Without this, the active persona's avatar+name peeks past
            the workbench panel (e.g. Yusuf desk at canvas x=490 w=220
            extends past the 700px-wide workbench) and reads as a
            duplicate of the same persona. */}
        {WAR_ROOM_KEYS.map((role) =>
          role === expandedAgent ? null : (
            <Desk
              key={role}
              role={role}
              busy={busyDesks.has(role)}
              task={tasks[role]}
              notification={notifications.has(role)}
              count={counts[role] ?? 0}
              onClick={() => handleDeskClick(role)}
            />
          )
        )}

        {packets.map((pk) => (
          <Packet
            key={pk.id}
            from={pk.from}
            to={pk.to}
            color={pk.color}
            label={pk.label}
          />
        ))}

        {/* Corner labels — tiny mono captions in each of the four corners
            of the floor area. Pure decoration to anchor the "compass"
            metaphor (Scouting NW, Creative NE, etc.). */}
        {CORNER_LABELS.map((c) => (
          <span
            key={c.text}
            aria-hidden
            className={`wr-mono absolute text-[9px] tracking-[0.3em] text-wr-fg-faint ${c.pos}`}
          >
            {c.text}
          </span>
        ))}

        {/* Overlays — both bound by this relatively-positioned floor
            container so the workbench panel and chat drawer never
            escape the floor area. Mounted last so they sit above the
            desks (z-40 / z-60) on the stacking layer. */}
        <ExpandedWorkbench
          role={expandedAgent}
          activeMissions={activeMissions}
          onBriefRequested={handleBriefRequested}
          onChainRequested={handleChainRequested}
          onEditVisual={handleEditVisual}
        />

        {/* v3 — Mission-fired toast. Floats at the top of the floor
            canvas so it's visible regardless of whether the user is
            looking at the panel or the desks. Single-slot; emerald
            pill; auto-dismisses ~2.5s after firing. */}
        {toast && (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2 animate-wr-expand-in"
          >
            <div className="wr-mono inline-flex items-center gap-2 rounded-full border border-emerald-500/60 bg-emerald-500/15 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-emerald-700 shadow-[0_0_24px_rgba(52,211,153,0.45)] backdrop-blur-md dark:text-emerald-300">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              {toast.text}
            </div>
          </div>
        )}
        <ChatDrawer
          role={chatAgent}
          onClose={closeOverlays}
          autoSend={briefAutoSend}
          onAutoSendConsumed={() => setBriefAutoSend(null)}
          // v3 Plan A — `intensity` prop removed alongside the dial.
          // The chat route applies Level-3 efficiency rules globally now.
          // v3 — Latest active mission (most recently started) so
          // Yusuf's prompt can reference it as live context. Picked
          // by max(startedAt). null when no chain is in flight.
          activeMission={(() => {
            if (activeMissions.size === 0) return null;
            const latest = Array.from(activeMissions.values()).sort(
              (a, b) => b.startedAt - a.startedAt
            )[0];
            return latest
              ? { company: latest.company, startedAt: latest.startedAt }
              : null;
          })()}
          // v3 — System bubble + interjection inbox. Drained inside
          // ChatDrawer; ack callback removes by id so we don't keep
          // re-emitting the same entries on every render.
          pendingSystemMessages={pendingSysMsgs}
          onSystemMessagesConsumed={(ids) => {
            const idSet = new Set(ids);
            setPendingSysMsgs((prev) =>
              prev.filter((m) => !idSet.has(m.id))
            );
          }}
          imageEditTarget={imageEditTarget}
          onImageEditConsumed={() => setImageEditTarget(null)}
        />
      </div>

      {/* ===== Radio Chatter ========================================= */}
      {/* HelpStrip removed — replaced by the page-level OnboardingGuide
          (auto-shown on first visit, reopenable via the Command Bar's
          "?" button). The floor plan now stays focused on the team's
          live activity, with all "how do I use this" copy living above
          in the Command Bar's storyboard guide. */}
      <RadioChatter log={chatter} />
    </div>
  );
}

// v3 Plan A — `ChainTriggerButton` deleted alongside the LifeMD Sprint
// demo button it backed. No remaining call sites.
