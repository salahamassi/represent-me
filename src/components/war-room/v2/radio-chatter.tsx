"use client";

/**
 * Radio Chatter 2.0 — taller bubble-style activity feed.
 *
 * v3 — replaces the previous mono terminal log with large chat bubbles
 * (think Slack channel, not syslog). Each entry shows:
 *   - Persona avatar on the left
 *   - Persona name + timestamp + recipient on top of the bubble
 *   - Persona-coloured rounded bubble with high-contrast text
 *
 * The bubble background uses the persona's `bubble` token (a soft
 * tint of their accent) and the text uses `persona.text` (which
 * already pairs deep-on-light + neon-on-dark via the `dark:` variant
 * we set on the PERSONA tokens). That gives us readable bubbles on
 * both themes without per-bubble overrides.
 *
 * Height bumped from 110px → 220px so 4-5 bubbles can breathe at
 * once. column-reverse so newest lands at the visible top of the
 * scrollable area.
 */

import Image from "next/image";
import { WAR_ROOM_PERSONAS, type WarRoomPersonaKey } from "@/war-room/personas";
import { cn } from "@/lib/utils";

export interface ChatterEntry {
  id: string | number;
  from: WarRoomPersonaKey;
  to: WarRoomPersonaKey | "Salah";
  text: string;
  /** Pre-formatted "HH:MM:SS". */
  time: string;
}

export function RadioChatter({ log }: { log: ChatterEntry[] }) {
  // Newest-first display. We slice to a sensible cap so the SSE
  // stream doesn't paint thousands of bubbles.
  const recent = log.slice(-12).reverse();

  return (
    <div className="relative flex h-[220px] flex-col gap-2 overflow-hidden rounded-[12px] border border-wr-border bg-wr-bg-deep px-4 py-2.5">
      {/* Header — same identity strip as v2 so the surface still reads
          as "Radio Chatter", just with louder content below. */}
      <div className="flex shrink-0 items-center justify-between border-b border-dashed border-wr-border pb-1.5">
        <span className="wr-mono text-[10px] tracking-[0.3em] text-wr-fg-faint">
          Radio Chatter
        </span>
        <span className="wr-mono text-[10px] text-emerald-400">● Live</span>
      </div>

      {/* Bubble feed — column-reverse so newest lands visually at top. */}
      <div className="wr-scrollbar-slim flex flex-1 flex-col-reverse gap-2 overflow-y-auto pr-1">
        {recent.length === 0 ? (
          <span className="m-auto text-[12px] italic text-wr-fg-faint">
            No chatter yet — trigger a mission to wake the floor.
          </span>
        ) : (
          recent.map((m, i) => (
            <ChatBubble entry={m} key={m.id} fadeIndex={i} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Single bubble row — avatar + persona-coloured speech bubble. Older
 * entries fade slightly (`opacity: 1 - i*0.08`) so the eye drifts to
 * the freshest message at the top of the column.
 */
function ChatBubble({
  entry,
  fadeIndex,
}: {
  entry: ChatterEntry;
  /** 0 = newest. Used to apply a gentle opacity step for older rows. */
  fadeIndex: number;
}) {
  const fromPersona = WAR_ROOM_PERSONAS[entry.from];
  const toLabel =
    entry.to === "Salah" ? "Salah" : WAR_ROOM_PERSONAS[entry.to].latin;
  const colorVar = `var(${fromPersona.cssVar})`;

  return (
    <div
      className="flex items-start gap-2"
      style={{ opacity: Math.max(0.4, 1 - fadeIndex * 0.08) }}
    >
      {/* Avatar — small + persona-bordered. Errors fall back to the
          persona-colour letter via the existing PNG fallback chain. */}
      <Image
        src={fromPersona.avatar}
        alt={fromPersona.latin}
        width={28}
        height={28}
        className="h-7 w-7 shrink-0 rounded-full border object-cover bg-wr-bg-deep"
        style={{ borderColor: colorVar }}
      />

      <div className="min-w-0 flex-1">
        {/* Header strip above the bubble — name · → recipient · time */}
        <div className="mb-0.5 flex items-baseline gap-1.5">
          <span
            className={cn("text-[11px] font-semibold leading-none")}
            style={{ color: colorVar }}
          >
            {fromPersona.latin}
          </span>
          <span className="wr-mono text-[9px] text-wr-fg-faint">
            → {toLabel}
          </span>
          <span className="wr-mono ml-auto text-[9px] tabular-nums text-wr-fg-faint">
            {entry.time}
          </span>
        </div>

        {/* The bubble itself — persona-tinted bg + persona text colour
            both derived from the CSS var so the contrast pairing is
            consistent (deep-on-light, neon-on-dark via the var's
            theme-aware definition in globals.css). The bottom-left
            corner is sharp so the bubble anchors visually to the
            avatar. */}
        <div
          className={cn(
            "rounded-2xl rounded-tl-sm border px-3 py-1.5 text-[12px] leading-relaxed"
          )}
          style={{
            // Soft tint of the persona accent for the bubble fill.
            background: `color-mix(in oklch, ${colorVar} 14%, transparent)`,
            borderColor: `color-mix(in oklch, ${colorVar} 35%, transparent)`,
            color: colorVar,
          }}
        >
          {entry.text}
        </div>
      </div>
    </div>
  );
}
