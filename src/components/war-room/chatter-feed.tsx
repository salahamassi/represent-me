"use client";

/**
 * Messaging-app style chatter feed (think WhatsApp / iMessage).
 *
 * Each event becomes a bubble attributed to its persona (Saqr / Qalam /
 * Amin / Sifr / System). Before a new bubble appears we show a short
 * "<name> is typing…" indicator so the team *feels* like it's thinking
 * and responding to each other.
 *
 * Key design choices:
 *   - Oldest-first rendering (chronological, like every chat app) so new
 *     messages land at the bottom.
 *   - Bootstrap burst (first batch from the SSE handshake) is rendered
 *     instantly with no typing delay — otherwise a cold page would take
 *     a minute to populate.
 *   - Live events get a per-event typing indicator attributed to the
 *     right persona. Multiple stacked events process sequentially via a
 *     tiny in-component queue.
 *   - The raw title is translated via `toHumanSpeak()` into first-person
 *     copy — that's what humanises the feed.
 */

import { useEffect, useRef, useState } from "react";
import { PERSONA, type AgentRole } from "@/agents/base/agent-aliases";
import type { AgentBusFrame } from "@/hooks/useAgentOrchestrator";
import { toHumanSpeak, type HumanSpoken } from "@/lib/agent-voice";
import { AgentAvatar } from "./agent-avatar";
import { cn } from "@/lib/utils";

/** Enriched frame: original bus data + the humanised copy we render. */
interface ChatMessage {
  id: number;
  frame: AgentBusFrame;
  spoken: HumanSpoken;
}

/** Format SQLite "YYYY-MM-DD HH:MM:SS" to a short "HH:MM". */
function formatHHMM(iso: string): string {
  const parts = iso.includes("T") ? iso.split("T") : iso.split(" ");
  return (parts[1] || iso).slice(0, 5);
}

/** The little 3-dot "typing…" animation inside a bubble. */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="typing">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

/** A single message bubble — avatar on the left, bubble on the right. */
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const persona = PERSONA[msg.spoken.speaker];
  const toneBorder =
    msg.spoken.tone === "negative"
      ? "border-red-500/40"
      : msg.spoken.tone === "warning"
      ? "border-amber-500/40"
      : msg.spoken.tone === "positive"
      ? "border-emerald-500/40"
      : persona.border;

  return (
    <li className="flex items-end gap-2.5 px-3 py-1.5">
      <AgentAvatar role={msg.spoken.speaker} size="sm" />
      <div className="flex min-w-0 max-w-[85%] flex-col">
        <div className="mb-0.5 flex items-baseline gap-2 px-1">
          {/* Arabic name rendered as the primary label, Latin as the
              small secondary. The `lang="ar" dir="rtl"` hints help font
              rendering pick up Arabic glyphs without forcing the whole
              layout into RTL. */}
          <span
            className={cn("text-[13px] font-bold leading-none", persona.text)}
            lang="ar"
            dir="rtl"
          >
            {persona.name}
          </span>
          <span className={cn("text-[10px] font-semibold tracking-wide", persona.text)}>
            {persona.latin}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {persona.role}
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground/50 tabular-nums">
            {formatHHMM(msg.frame.createdAt)}
          </span>
        </div>
        <div
          className={cn(
            "rounded-2xl rounded-bl-sm border px-3.5 py-2 text-[13px] leading-relaxed text-foreground/95",
            persona.bubble,
            toneBorder
          )}
        >
          {msg.spoken.text}
        </div>
      </div>
    </li>
  );
}

/** Typing-indicator bubble shown while we're "waiting" for a persona. */
function TypingBubble({ role }: { role: AgentRole }) {
  const persona = PERSONA[role];
  return (
    <li className="flex items-end gap-2.5 px-3 py-1.5 opacity-90">
      <AgentAvatar role={role} size="sm" />
      <div className="flex min-w-0 flex-col">
        <div className="mb-0.5 flex items-baseline gap-2 px-1">
          <span
            className={cn("text-[13px] font-bold leading-none", persona.text)}
            lang="ar"
            dir="rtl"
          >
            {persona.name}
          </span>
          <span className={cn("text-[10px] font-semibold tracking-wide", persona.text)}>
            {persona.latin}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            is typing…
          </span>
        </div>
        <div
          className={cn(
            "inline-flex rounded-2xl rounded-bl-sm border px-4 py-2.5",
            persona.bubble,
            persona.border,
            persona.text
          )}
        >
          <TypingDots />
        </div>
      </div>
    </li>
  );
}

/**
 * The queue logic. `events` from the hook is newest-first. We want chat
 * order (oldest-first). On the FIRST render we dump everything we've got
 * as "history" (no typing delay). Every subsequent render, we diff the
 * incoming ids against what we've already shown and enqueue the new
 * ones for "typing → bubble" playback.
 */
const TYPING_DELAY_MS = 900;

export function ChatterFeed({
  events,
  isConnected,
}: {
  events: AgentBusFrame[];
  isConnected: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingFor, setTypingFor] = useState<AgentRole | null>(null);

  const seenIdsRef = useRef<Set<number>>(new Set());
  const queueRef = useRef<AgentBusFrame[]>([]);
  const processingRef = useRef(false);
  const bootstrappedRef = useRef(false);

  // Auto-scroll the chat list to the bottom as new bubbles land, so the
  // newest message is always in view (matches iMessage behaviour).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, typingFor]);

  useEffect(() => {
    // Reverse to chronological order (oldest first) for chat display.
    const chronological = [...events].reverse();

    if (!bootstrappedRef.current) {
      // First pass: treat the whole log as history — no typing delay,
      // otherwise 50 old rows would take ~45s to play out.
      const history: ChatMessage[] = [];
      for (const frame of chronological) {
        seenIdsRef.current.add(frame.id);
        history.push({
          id: frame.id,
          frame,
          spoken: toHumanSpeak(frame),
        });
      }
      setMessages(history);
      bootstrappedRef.current = true;
      return;
    }

    // Live updates: enqueue only the new frames.
    const fresh = chronological.filter((f) => !seenIdsRef.current.has(f.id));
    if (fresh.length === 0) return;
    for (const f of fresh) seenIdsRef.current.add(f.id);
    queueRef.current.push(...fresh);
    void processQueue();
  }, [events]);

  async function processQueue() {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        const spoken = toHumanSpeak(next);

        // If a burst landed (e.g. 5+ events in one tick), skip typing on
        // all but the last one to keep the feed snappy — feels "alive"
        // without forcing the user to watch a slow playback.
        const shouldType = queueRef.current.length === 0;

        if (shouldType) {
          setTypingFor(spoken.speaker);
          await new Promise((r) => setTimeout(r, TYPING_DELAY_MS));
          setTypingFor(null);
        }

        setMessages((prev) => [
          ...prev,
          { id: next.id, frame: next, spoken },
        ]);
      }
    } finally {
      processingRef.current = false;
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-background/40">
      {/* Header — doubles as the connection indicator. */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Team Chat
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isConnected
                ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                : "bg-red-400"
            )}
            aria-hidden
          />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isConnected ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[560px] min-h-[280px] overflow-y-auto py-2"
      >
        {messages.length === 0 && !typingFor ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground/60">
            {isConnected ? "Waiting for the team to speak up…" : "Not connected to the bus."}
          </div>
        ) : (
          <ul className="space-y-1">
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}
            {typingFor && <TypingBubble role={typingFor} />}
          </ul>
        )}
      </div>
    </div>
  );
}
