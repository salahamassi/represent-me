"use client";

/**
 * Chat Drawer — direct-message line to a single persona.
 *
 * Slides in from the right of the floor area (440px wide), backed by a
 * dim scrim that closes on click. Per-persona transcripts live in
 * `localStorage` under `warroom.chat.<key>` and are capped at 40 turns
 * so chat history doesn't grow unbounded.
 *
 * Each send fires `POST /api/agents/chat` with the role + last 12
 * messages of history. The route picks the persona's system prompt and
 * Haiku-generates a reply in-character.
 *
 * The drawer is mounted inside the floor area's relatively-positioned
 * container, NOT at the page root — so the scrim covers the floor only,
 * letting the rest of the page (sidebar etc.) stay interactive. Matches
 * the handoff prototype's ChatDrawer behaviour exactly.
 */

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Send, Trash2 } from "lucide-react";
import {
  WAR_ROOM_PERSONAS,
  type WarRoomPersonaKey,
} from "@/war-room/personas";
import type { AgentLogEntry } from "@/app/api/war-room/agent-activity/route";
import { cn } from "@/lib/utils";

/** Single chat turn — same shape as the handoff's localStorage payload.
 *  v3 — `kind` lets us distinguish three styles in the same transcript:
 *    - "msg"          : normal speech bubble (default if absent).
 *    - "system"       : centered mono "▸ ORDER SENT — …" plate. Used
 *                       when the floor fires a chain — bridges the
 *                       Yusuf chat log to the floor activity.
 *    - "interjection" : persona-coloured pop-in from another agent
 *                       (e.g. Layla speaking up in Yusuf's chat). The
 *                       `who` field still carries the speaker so the
 *                       avatar/colour resolve correctly. */
interface ChatMessage {
  /** "Salah" for the user, persona key for the agent. */
  who: "Salah" | WarRoomPersonaKey;
  text: string;
  /** Unix ms — used for ordering / future filtering. */
  ts: number;
  /** Set on transient failures so we can render the bubble red. */
  error?: boolean;
  kind?: "msg" | "system" | "interjection";
}

/** v3 Plan A — Honest empty-state lines. The previous strings claimed
 *  invented activity ("He's scouting right now") that lied on a
 *  fresh DB. Each persona now gets a neutral one-liner that describes
 *  WHAT they do, not what they're (supposedly) currently doing. The
 *  buildGreeting() function below replaces these with dynamic text
 *  the moment a real queue snapshot arrives. */
const STATIC_GREETING: Record<WarRoomPersonaKey, string> = {
  Yusuf: "Send a message.",
  Rashid: "Send a message.",
  Layla: "Send a message.",
  Ghada: "Send a message.",
  Kareem: "Send a message.",
  Tariq: "Send a message.",
};

/**
 * Build a dynamic in-character greeting line from the persona's live
 * queue. The chat drawer fetches the queue on open and feeds it here
 * so each agent's first message reflects what's actually on their
 * desk RIGHT NOW — Rashid greets with "I've found 8 leads, Polaris
 * is the strongest match" not a static "ask me anything".
 */
interface QueueSnapshot {
  /** Total items currently on this persona's desk. */
  count: number;
  /** Top item — usually the highest-fit lead, freshest draft, etc. */
  top?: { primary: string; secondary?: string };
}

function buildGreeting(role: WarRoomPersonaKey, q: QueueSnapshot | null): string {
  if (!q) return STATIC_GREETING[role];
  const { count, top } = q;

  // Empty queues fall back to the persona's static line — there's
  // nothing dynamic to say.
  if (count === 0) return STATIC_GREETING[role];

  switch (role) {
    case "Rashid":
      return top
        ? `I've spotted ${count} lead${count === 1 ? "" : "s"} pending your approval. ${top.primary} is the strongest match.`
        : `${count} lead${count === 1 ? "" : "s"} on the radar.`;
    case "Kareem":
      return top
        ? `${count} pending audit${count === 1 ? "" : "s"} on my desk. Want me to start with ${top.primary.replace(/ · resume audit$/, "")}?`
        : `${count} audit${count === 1 ? "" : "s"} queued.`;
    case "Layla":
      return `${count} piece${count === 1 ? "" : "s"} in flight right now. Tell me what to ship.`;
    case "Ghada":
      return `${count} post${count === 1 ? "" : "s"} on the studio board. Want me to start sketching?`;
    case "Yusuf":
      return top
        ? `Brief for the day: ${top.primary}. ${count - 1 > 0 ? `${count - 1} more thing${count - 1 === 1 ? "" : "s"} on the board.` : ""}`.trim()
        : `${count} item${count === 1 ? "" : "s"} on the brief.`;
    case "Tariq":
      return STATIC_GREETING[role];
  }
}

interface ChatDrawerProps {
  /** Open the drawer for this persona. `null` = closed. */
  role: WarRoomPersonaKey | null;
  onClose: () => void;
  /**
   * One-shot prompt to auto-submit the next time the drawer becomes
   * visible for this `role`. Used by the workbench queue rows so
   * clicking "LifeMD · 94% · hot" opens Rashid's drawer with
   * "Brief me on LifeMD" already sent.
   *
   * The drawer fires the message exactly once, then calls
   * `onAutoSendConsumed` so the parent can clear the slot. We key
   * dedupe on the (role + text) tuple so closing/re-opening the same
   * drawer with the same prompt doesn't accidentally re-send.
   */
  autoSend?: string | null;
  onAutoSendConsumed?: () => void;
  // v3 Plan A — `intensity` prop deleted. The chat route now applies
  // Level-3 efficiency (terse, technical, kit-focused) for all v2
  // personas regardless of any client-side knob.
  /** v3 — Most-recent active mission, if any. Forwarded to the chat
   *  API so Yusuf's prompt can reference the live company + elapsed
   *  time in his answers ("Polaris Labs, started 3 min ago"). */
  activeMission?: { company: string; startedAt: number } | null;
  /** v3 — Inbox of system messages and cross-persona interjections
   *  to splice into transcripts. The drawer drains these into the
   *  matching `targetRole` history on every render where the queue
   *  is non-empty, then calls `onSystemMessagesConsumed` so the
   *  parent can clear its slot. The pattern mirrors `autoSend`. */
  pendingSystemMessages?: PendingSystemMessage[];
  onSystemMessagesConsumed?: (ids: number[]) => void;
  /** Image-edit mode for Ghada's chat. When set, the next user reply
   *  in Ghada's drawer routes to /api/war-room/visual?regenerate=true
   *  with the typed text as `briefOverride` instead of going through
   *  /api/agents/chat. Consumed (cleared via `onImageEditConsumed`)
   *  after the regen settles, success or failure. */
  imageEditTarget?: { contentId: number; style: "blueprint" | "spider-verse" } | null;
  onImageEditConsumed?: () => void;
}

/** v3 — Queue entry for splicing a non-user message into a persona's
 *  transcript. `id` lets the parent dedupe ack-ed entries; `targetRole`
 *  picks which transcript the message lands in (typically Yusuf, but
 *  flexible). `who` is the speaker — "system" for the centered plate,
 *  a persona key for an interjection bubble. */
export interface PendingSystemMessage {
  id: number;
  targetRole: WarRoomPersonaKey;
  who: "system" | WarRoomPersonaKey;
  text: string;
  ts: number;
  kind: "system" | "interjection";
}

export function ChatDrawer({
  role,
  onClose,
  autoSend,
  onAutoSendConsumed,
  activeMission,
  pendingSystemMessages,
  onSystemMessagesConsumed,
  imageEditTarget,
  onImageEditConsumed,
}: ChatDrawerProps) {
  // Per-persona transcript storage. We keep ALL personas' history in
  // state so swapping between agents is instant (no localStorage
  // round-trip in between).
  const [history, setHistory] = useState<
    Record<WarRoomPersonaKey, ChatMessage[]>
  >({
    Yusuf: [],
    Rashid: [],
    Layla: [],
    Ghada: [],
    Kareem: [],
    Tariq: [],
  });

  // v3 Plan A — One-shot stale-transcript purge. Old conversations
  // persisted to localStorage from before the SLA-injection landed
  // contain Yusuf saying "90 minutes" or Tariq saying "72 hour"
  // window — both pure model hallucinations. We sweep ALL persona
  // transcripts once per browser (gated on a sentinel key), drop any
  // message whose text matches the stale regex, write back. Runs
  // BEFORE the per-role hydration effect below so the cleaned blob
  // is what gets loaded into state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const PURGE_KEY = "warroom.chat.purged.v1";
      if (window.localStorage.getItem(PURGE_KEY)) return;
      const STALE = /\b(90\s*min(?:ute)?s?|72\s*hour)\b/i;
      const personaKeys: WarRoomPersonaKey[] = [
        "Yusuf",
        "Rashid",
        "Layla",
        "Ghada",
        "Kareem",
        "Tariq",
      ];
      for (const key of personaKeys) {
        const storageKey = `warroom.chat.${key}`;
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as ChatMessage[];
          if (!Array.isArray(parsed)) continue;
          const cleaned = parsed.filter(
            (m) => typeof m?.text !== "string" || !STALE.test(m.text)
          );
          if (cleaned.length !== parsed.length) {
            window.localStorage.setItem(storageKey, JSON.stringify(cleaned));
          }
        } catch {
          // Malformed entry — clear it rather than choke on it.
          window.localStorage.removeItem(storageKey);
        }
      }
      window.localStorage.setItem(PURGE_KEY, String(Date.now()));
    } catch {
      // Storage blocked / quota / etc — non-fatal.
    }
  }, []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  /** Per-persona live queue snapshot — drives the dynamic greeting in
   *  the empty-state header. We fetch on open so the line reflects the
   *  agent's actual workload at that moment, not stale state. */
  const [queueSnapshots, setQueueSnapshots] = useState<
    Partial<Record<WarRoomPersonaKey, QueueSnapshot>>
  >({});
  /** v3 paper trail — agent's recent activity-log entries, interleaved
   *  into the message feed as inline "action" bubbles so Salah sees
   *  the agent's work alongside the chat. Pulled on every open from
   *  `/api/war-room/agent-activity?role=…`. */
  const [actionLog, setActionLog] = useState<
    Partial<Record<WarRoomPersonaKey, AgentLogEntry[]>>
  >({});

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const open = role !== null;
  const persona = role ? WAR_ROOM_PERSONAS[role] : null;
  const messages = role ? history[role] : [];

  // Hydrate the active persona's transcript from localStorage on open.
  // We do this per-open rather than once at mount so swapping between
  // personas always picks up the latest persisted state.
  useEffect(() => {
    if (!role) return;
    try {
      const raw = localStorage.getItem(`warroom.chat.${role}`);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
      setHistory((h) => ({ ...h, [role]: parsed }));
    } catch {
      // Bad JSON or storage blocked — start fresh for this persona.
      setHistory((h) => ({ ...h, [role]: [] }));
    }
  }, [role]);

  // Persist the active persona's transcript on every change (capped at
  // 40 turns to stay well under the 5MB localStorage cap).
  useEffect(() => {
    if (!role) return;
    try {
      localStorage.setItem(
        `warroom.chat.${role}`,
        JSON.stringify(messages.slice(-40))
      );
    } catch {
      // ignore — incognito / blocked
    }
    // Auto-scroll to bottom on new messages.
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, role]);

  // Autofocus the input when the drawer opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open, role]);

  // v3 — fetch the persona's recent activity log on open. Each entry
  // becomes an inline "action bubble" interleaved with chat messages
  // so Salah sees what the agent has been doing alongside the chat.
  useEffect(() => {
    if (!role || role === "Tariq") return;
    const ctrl = new AbortController();
    fetch(`/api/war-room/agent-activity?role=${role}&limit=10`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setActionLog((prev) => ({
          ...prev,
          [role]: (d.entries as AgentLogEntry[]) || [],
        }));
      })
      .catch(() => {
        // Quiet — the chat still works without the paper trail.
      });
    return () => ctrl.abort();
  }, [role, open]);

  /** Interleave chat messages + action-log entries by timestamp into
   *  a single chronological feed. Tagged with `kind` so the renderer
   *  can pick the right bubble style for each. */
  const interleaved = useMemo(() => {
    if (!role) return [] as Array<
      | { kind: "msg"; ts: number; data: ChatMessage }
      | { kind: "action"; ts: number; data: AgentLogEntry }
    >;
    const msgEntries = messages.map((m) => ({
      kind: "msg" as const,
      ts: m.ts,
      data: m,
    }));
    const actionEntries = (actionLog[role] || []).map((a) => {
      // SQLite "YYYY-MM-DD HH:MM:SS" → unix ms (UTC)
      const norm = a.createdAt.includes("T")
        ? a.createdAt
        : a.createdAt.replace(" ", "T") + "Z";
      return {
        kind: "action" as const,
        ts: new Date(norm).getTime(),
        data: a,
      };
    });
    return [...msgEntries, ...actionEntries].sort((a, b) => a.ts - b.ts);
  }, [actionLog, messages, role]);

  // v3 — Drain pending system messages into the matching transcripts.
  // We splice into history regardless of which drawer is currently
  // open: the goal is for Salah to find the system bubble already
  // there when he opens Yusuf's drawer 30 seconds after triggering
  // a chain on the floor. Each message is keyed by id so the parent
  // can re-emit safely (we won't double-insert).
  useEffect(() => {
    if (!pendingSystemMessages || pendingSystemMessages.length === 0) return;
    const consumed: number[] = [];
    setHistory((prev) => {
      const next = { ...prev };
      for (const m of pendingSystemMessages) {
        const target = next[m.targetRole];
        // Idempotency — skip if a message with the same `ts` and
        // `text` already lives in the target transcript. The parent
        // shouldn't re-emit, but storage hydration on a reload could
        // race the ack callback.
        const dupe = target.some(
          (existing) => existing.ts === m.ts && existing.text === m.text
        );
        if (!dupe) {
          next[m.targetRole] = [
            ...target,
            {
              who: m.who === "system" ? m.targetRole : m.who,
              text: m.text,
              ts: m.ts,
              kind: m.kind,
            },
          ];
        }
        consumed.push(m.id);
      }
      return next;
    });
    if (consumed.length > 0 && onSystemMessagesConsumed) {
      onSystemMessagesConsumed(consumed);
    }
  }, [pendingSystemMessages, onSystemMessagesConsumed]);

  // Fetch the persona's live queue when the drawer opens, so the
  // empty-state greeting can reflect their current workload. Tariq
  // doesn't have a queue endpoint — skip him quietly.
  useEffect(() => {
    if (!role || role === "Tariq") return;
    const ctrl = new AbortController();
    fetch(`/api/war-room/queue?role=${role}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const items: { primary: string; secondary?: string }[] =
          d.items || [];
        setQueueSnapshots((prev) => ({
          ...prev,
          [role]: {
            count: items.length,
            top: items[0],
          },
        }));
      })
      .catch(() => {
        // Quiet — fallback to the static line.
      });
    return () => ctrl.abort();
  }, [role, open]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** Underlying send routine — accepts text directly so it can be
   *  called both from the composer (`send()`) and from the autoSend
   *  effect below (`sendText("Brief me on …")`) without going through
   *  the input state.
   *
   *  When Ghada's chat is in image-edit mode (imageEditTarget set),
   *  the user's text routes to /api/war-room/visual?regenerate=true
   *  with the text as `briefOverride` — Ghada draws the change instead
   *  of replying in chat. The mode auto-clears after one regen so a
   *  follow-up message goes back to normal chat. */
  const sendText = useCallback(
    async (rawText: string) => {
      if (!role || busy) return;
      const text = rawText.trim();
      if (!text) return;

      const userMsg: ChatMessage = { who: "Salah", text, ts: Date.now() };
      const next = [...history[role], userMsg];
      setHistory((h) => ({ ...h, [role]: next }));
      setBusy(true);

      // Image-edit branch — Ghada-only. Skip the normal chat API and
      // hit the visual regen endpoint with Salah's typed brief.
      const editing = role === "Ghada" && imageEditTarget;
      if (editing) {
        try {
          const res = await fetch("/api/war-room/visual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contentId: imageEditTarget.contentId,
              regenerate: true,
              style: imageEditTarget.style,
              briefOverride: text,
            }),
          });
          const data = await res.json();
          if (!res.ok || data?.ok === false) {
            throw new Error(data?.error || `HTTP ${res.status}`);
          }
          setHistory((h) => ({
            ...h,
            [role]: [
              ...h[role],
              {
                who: "Ghada",
                text: `✓ New visual ready. Refresh the gallery — content ${imageEditTarget.contentId}.`,
                ts: Date.now(),
              },
            ],
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setHistory((h) => ({
            ...h,
            [role]: [
              ...h[role],
              {
                who: "Ghada",
                text: `[regen failed — ${msg.slice(0, 120)}]`,
                ts: Date.now(),
                error: true,
              },
            ],
          }));
        } finally {
          setBusy(false);
          // Clear image-edit mode regardless of outcome — one shot per
          // click. The user can click the tile again for another pass.
          if (onImageEditConsumed) onImageEditConsumed();
        }
        return;
      }

      try {
        const apiMessages = next.slice(-12).map((m) => ({
          role:
            m.who === "Salah" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));
        const res = await fetch("/api/agents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            messages: apiMessages,
            activeMission: activeMission || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setHistory((h) => ({
          ...h,
          [role]: [
            ...h[role],
            {
              who: role,
              text: String(data.reply || "").trim(),
              ts: Date.now(),
            },
          ],
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setHistory((h) => ({
          ...h,
          [role]: [
            ...h[role],
            {
              who: role,
              text: `[connection dropped — ${msg.slice(0, 80)}]`,
              ts: Date.now(),
              error: true,
            },
          ],
        }));
      } finally {
        setBusy(false);
      }
    },
    [busy, history, role, activeMission, imageEditTarget, onImageEditConsumed]
  );

  const send = useCallback(async () => {
    if (!role || busy) return;
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendText(text);
  }, [busy, input, role, sendText]);

  /** v3 Plan A — Clear THIS persona's chat history. Wipes both the
   *  in-memory state AND the localStorage blob (the persist effect
   *  would write the empty array back anyway, but doing it explicitly
   *  removes the key entirely so a stale entry doesn't linger).
   *  Confirms before destruction so an accidental click doesn't lose
   *  a long thread. */
  const clearHistoryForActiveRole = useCallback(() => {
    if (!role) return;
    if (
      !window.confirm(
        `Clear chat history with ${WAR_ROOM_PERSONAS[role].latin}? This can't be undone.`
      )
    ) {
      return;
    }
    setHistory((h) => ({ ...h, [role]: [] }));
    try {
      window.localStorage.removeItem(`warroom.chat.${role}`);
    } catch {
      // storage blocked — the in-memory wipe still landed
    }
  }, [role]);

  // Auto-send a one-shot prompt the moment the drawer opens with a
  // pending `autoSend` for the active role. We dedupe via a ref so
  // re-renders don't re-trigger; the ref resets when the role changes
  // so a new persona's autoSend can fire fresh.
  const lastAutoSendRef = useRef<{ role: string; text: string } | null>(null);
  useEffect(() => {
    if (!role || !open || !autoSend) return;
    const fingerprint = { role, text: autoSend };
    if (
      lastAutoSendRef.current &&
      lastAutoSendRef.current.role === fingerprint.role &&
      lastAutoSendRef.current.text === fingerprint.text
    ) {
      return;
    }
    lastAutoSendRef.current = fingerprint;
    // Defer so the drawer slide-in finishes first; matches the chat
    // brief feeling of "I clicked, then it asked".
    const t = setTimeout(() => {
      sendText(autoSend);
      onAutoSendConsumed?.();
    }, 200);
    return () => clearTimeout(t);
  }, [autoSend, open, role, sendText, onAutoSendConsumed]);

  // (the old monolithic `send` body has been extracted into `sendText`
  // above — `send` now just clears the input and delegates.)

  return (
    <>
      {/* Scrim — covers the floor area only (we're inside its relatively-
          positioned container, so absolute inset:0 fills the floor). */}
      <button
        type="button"
        aria-label="Close chat"
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "absolute inset-0 z-[50] cursor-default border-0 bg-black/40 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Panel — 440px right slide-in. Border + shadow are persona-coloured
          via inline style because the colour is data-driven. */}
      <aside
        role="dialog"
        aria-label={persona ? `Chat with ${persona.latin}` : "Chat"}
        className={cn(
          "absolute bottom-0 right-0 top-0 z-[60] flex w-[440px] max-w-full flex-col bg-wr-bg-2 transition-transform duration-[350ms]",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={
          persona
            ? {
                borderLeft: `1px solid var(${persona.cssVar})`,
                boxShadow: `-20px 0 60px oklch(0 0 0 / 0.4), -1px 0 0 0 var(${persona.cssVar})`,
                transitionTimingFunction:
                  "cubic-bezier(0.65, 0, 0.35, 1)",
              }
            : undefined
        }
      >
        {role && persona && (
          <>
            {/* Header */}
            <header
              className="flex items-center gap-3.5 border-b border-wr-border px-5 py-4"
              style={{
                background: `linear-gradient(180deg, color-mix(in oklch, var(${persona.cssVar}) 15%, transparent), transparent)`,
              }}
            >
              <Image
                src={persona.avatar}
                alt={persona.latin}
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded-full border-[1.5px] object-cover"
                style={{
                  borderColor: `var(${persona.cssVar})`,
                  boxShadow: `0 0 16px color-mix(in oklch, var(${persona.cssVar}) 35%, transparent)`,
                }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className="text-[22px] font-semibold leading-[1.1]"
                  style={{ color: `var(${persona.cssVar})` }}
                >
                  {persona.latin}
                </div>
                <div className="wr-mono mt-0.5 text-[10px] text-wr-fg-faint">
                  {persona.role}
                </div>
              </div>
              <button
                type="button"
                onClick={clearHistoryForActiveRole}
                aria-label={`Clear chat history with ${persona.latin}`}
                title={`Clear chat history with ${persona.latin}`}
                disabled={messages.length === 0}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-wr-border bg-transparent text-wr-fg-dim hover:bg-wr-panel hover:text-wr-fg disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close chat"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-wr-border bg-transparent text-wr-fg-dim hover:bg-wr-panel hover:text-wr-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            {/* Transcript */}
            <div
              ref={scrollRef}
              className="wr-scrollbar-slim flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4"
            >
              {interleaved.length === 0 ? (
                <div className="m-auto p-5 text-center text-[13px] leading-relaxed text-wr-fg-faint">
                  <div
                    className="mb-1.5 text-sm font-medium"
                    style={{ color: `var(${persona.cssVar})` }}
                  >
                    Direct line to {persona.latin}
                  </div>
                  {/* Dynamic greeting — pulled from this persona's live
                      queue when available; falls back to the static
                      flavour line when the queue hasn't loaded yet
                      (network slow, Tariq, etc). */}
                  {buildGreeting(role, queueSnapshots[role] ?? null)}
                </div>
              ) : (
                interleaved.map((entry) => {
                  if (entry.kind === "action") {
                    return (
                      <ActionBubble
                        key={`action-${entry.data.id}`}
                        entry={entry.data}
                        agentRole={role}
                      />
                    );
                  }
                  // entry.kind === "msg" — but the underlying ChatMessage
                  // may carry its own kind (system / interjection) that
                  // determines which bubble shape we render.
                  const m = entry.data;
                  if (m.kind === "system") {
                    return (
                      <SystemBubble
                        key={`sys-${entry.ts}-${m.text.slice(0, 12)}`}
                        text={m.text}
                      />
                    );
                  }
                  return (
                    <ChatBubble
                      key={`msg-${entry.ts}-${m.who}`}
                      msg={m}
                      agentRole={role}
                      isInterjection={m.kind === "interjection"}
                    />
                  );
                })
              )}
              {busy && <TypingIndicator agentRole={role} />}
            </div>

            {/* Composer */}
            <div className="border-t border-wr-border p-3.5">
              <div className="flex items-center gap-2 rounded-[10px] border border-wr-border bg-wr-panel-2 p-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={`Message ${persona.latin}…`}
                  disabled={busy}
                  className="flex-1 border-none bg-transparent px-2 py-1 text-[13px] text-wr-fg outline-none placeholder:text-wr-fg-faint disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={busy || !input.trim()}
                  className="wr-mono inline-flex items-center gap-1.5 rounded-md border-0 px-3 py-1.5 text-[12px] font-semibold tracking-[0.1em] transition-opacity"
                  style={{
                    background: input.trim()
                      ? `var(${persona.cssVar})`
                      : "var(--wr-border)",
                    color: input.trim() ? "var(--wr-bg)" : "var(--wr-fg-faint)",
                    opacity: busy ? 0.5 : 1,
                    cursor: input.trim() && !busy ? "pointer" : "default",
                  }}
                >
                  <Send className="h-3 w-3" />
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/** A single message bubble. User → right-aligned with monogram tile.
 *  Agent → left-aligned with avatar + persona-tinted bubble.
 *
 *  v3 — Interjection support: when `isInterjection` is true the
 *  message came from a different persona than the chat owner (e.g.
 *  Layla speaking up in Yusuf's drawer). We resolve the avatar +
 *  colour from `msg.who` (the speaker) instead of `agentRole` (the
 *  chat owner) and prepend a small "@Layla →" label so Salah reads
 *  it as a pop-in, not as Yusuf speaking. */
function ChatBubble({
  msg,
  agentRole,
  isInterjection,
}: {
  msg: ChatMessage;
  agentRole: WarRoomPersonaKey;
  isInterjection?: boolean;
}) {
  const isUser = msg.who === "Salah";
  // For interjections the speaker IS the message author; otherwise the
  // chat-owner persona supplies the avatar/colour as before.
  const speakerKey: WarRoomPersonaKey =
    isInterjection && msg.who !== "Salah" ? msg.who : agentRole;
  const persona = WAR_ROOM_PERSONAS[speakerKey];
  const ownerPersona = WAR_ROOM_PERSONAS[agentRole];

  return (
    <div
      className={cn(
        "flex items-start gap-2.5",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {isUser ? (
        <span className="wr-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-wr-border bg-wr-panel-2 text-[10px] text-wr-fg-dim">
          S
        </span>
      ) : (
        <Image
          src={persona.avatar}
          alt={persona.latin}
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full border border-wr-border object-cover bg-wr-bg-deep"
          style={
            isInterjection
              ? { borderColor: `var(${persona.cssVar})` }
              : undefined
          }
        />
      )}
      <div className="min-w-0 max-w-[300px]">
        {isInterjection && (
          // "@Layla → @Yusuf" label so the pop-in reads as cross-talk,
          // not as the chat-owner speaking. Sized small so it doesn't
          // crowd the bubble itself.
          <div
            className="wr-mono mb-0.5 text-[9px] tracking-[0.12em]"
            style={{ color: `var(${persona.cssVar})` }}
          >
            @{persona.latin} → @{ownerPersona.latin}
          </div>
        )}
        <div
          className={cn(
            "rounded-[10px] border px-3 py-2 text-[13px] leading-[1.5] text-wr-fg",
            msg.error && "border-red-500/60"
          )}
          style={
            isUser
              ? {
                  background: "var(--wr-panel)",
                  borderColor: "var(--wr-border)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }
              : {
                  background: `color-mix(in oklch, var(${persona.cssVar}) 10%, transparent)`,
                  borderColor: msg.error
                    ? undefined
                    : `color-mix(in oklch, var(${persona.cssVar}) 30%, transparent)`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }
          }
        >
          {msg.text}
        </div>
      </div>
    </div>
  );
}

/** v3 — Centered "system" plate. Used when the floor fires a chain
 *  to bridge that event into the Yusuf chat log ("▸ ORDER SENT — …").
 *  Visually distinct from speech bubbles (no avatar, centered, mono,
 *  emerald accent so it reads as a system event, not a person). */
function SystemBubble({ text }: { text: string }) {
  return (
    <div className="my-1 flex justify-center">
      <div
        className="wr-mono inline-flex max-w-[420px] items-center gap-2 rounded-full border px-3 py-1.5 text-[10.5px] font-semibold tracking-[0.06em]"
        style={{
          borderColor:
            "color-mix(in oklch, oklch(0.8 0.18 155) 50%, transparent)",
          background:
            "color-mix(in oklch, oklch(0.8 0.18 155) 10%, transparent)",
          color: "oklch(0.55 0.18 155)",
        }}
      >
        <span aria-hidden className="text-[12px] leading-none">▸</span>
        <span className="leading-snug">{text}</span>
      </div>
    </div>
  );
}

/**
 * v3 — inline action-log bubble. Renders an activity-log entry as a
 * subdued, mono-styled "system action" inside the chat thread —
 * distinct from chat bubbles (no avatar, no rounded chat shape) so
 * Salah can tell what's a conversation vs what's the agent doing
 * background work. Persona-tinted left border keeps the visual link
 * to who's acting.
 */
function ActionBubble({
  entry,
  agentRole,
}: {
  entry: AgentLogEntry;
  agentRole: WarRoomPersonaKey;
}) {
  const persona = WAR_ROOM_PERSONAS[agentRole];
  const colorVar = `var(${persona.cssVar})`;
  return (
    <div
      className="my-1 ml-9 rounded-md border border-wr-border bg-wr-bg-deep/60 py-1.5 pl-3 pr-2"
      style={{ borderLeft: `2px solid ${colorVar}` }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="wr-mono text-[9px] tracking-[0.18em]"
          style={{ color: colorVar }}
        >
          {entry.eventType}
        </span>
        <span className="wr-mono text-[9px] text-wr-fg-faint">
          · {entry.createdAt.slice(11, 19)}
        </span>
      </div>
      <p className="wr-mono mt-0.5 text-[11px] leading-snug text-wr-fg-dim">
        {entry.title}
      </p>
    </div>
  );
}

/** "<NAME> IS TYPING" + 3 pulsing dots in the persona's accent colour. */
function TypingIndicator({ agentRole }: { agentRole: WarRoomPersonaKey }) {
  const persona = WAR_ROOM_PERSONAS[agentRole];
  return (
    <div className="flex items-center gap-2 pl-11">
      <span
        className="wr-mono text-[10px] tracking-[0.2em]"
        style={{ color: `var(${persona.cssVar})` }}
      >
        {persona.latin.toUpperCase()} IS TYPING
      </span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 w-1 animate-wr-blink rounded-full"
            style={{
              background: `var(${persona.cssVar})`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </span>
    </div>
  );
}
