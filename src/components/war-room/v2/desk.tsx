"use client";

/**
 * One operator's desk on the floor plan — v3 simplified card.
 *
 * v3 — Salah pushed for visual focus: cards display ONLY the persona
 * avatar, the persona name, and a red notification badge when there
 * are items requiring his manual attention. Everything else (the
 * status pill, the task line, the last-event peek, the dept tab, the
 * "↗ Open" hint) is gone — they were noise that made the floor read
 * like an ops dashboard rather than a focused command surface.
 *
 * The "busy" state still drives the persona-coloured border + glow
 * because that's the "lights are on" tell that matters at a glance.
 *
 * Click the card to open the workbench + chat drawer (the parent
 * owns those — this component just emits the click).
 */

import Image from "next/image";
import {
  WAR_ROOM_PERSONAS,
  type WarRoomPersonaKey,
} from "@/war-room/personas";
import { DESKS } from "@/war-room/floor-plan-config";
import { cn } from "@/lib/utils";

interface DeskProps {
  role: WarRoomPersonaKey;
  busy: boolean;
  /**
   * Number of items in this agent's local queue requiring Salah's
   * attention. Drives the red notification badge in the top-right
   * corner. Hidden when 0 — keeps idle desks visually quiet.
   */
  count?: number;
  onClick: () => void;
  /** Retained for back-compat with FloorPlan's prop wiring. v3 cards
   *  no longer render task text or the green notification dot — but
   *  removing them from the prop signature would force a parallel
   *  edit in FloorPlan. They're accepted and ignored here. */
  task?: string;
  notification?: boolean;
}

export function Desk({
  role,
  busy,
  count = 0,
  onClick,
}: DeskProps) {
  const persona = WAR_ROOM_PERSONAS[role];
  const rect = DESKS[role];
  const colorVar = `var(${persona.cssVar})`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${persona.latin} — ${persona.role}`}
      // v3 — render is fully deterministic from props, but Turbopack's
      // HMR cache can ship a stale className from a previous build,
      // tripping a hydration warning that's purely a build-cache
      // artifact (not a real server/client divergence). Suppress it
      // here so the warning overlay doesn't drown legitimate issues.
      suppressHydrationWarning
      className={cn(
        "group absolute z-10 flex cursor-pointer items-center justify-center gap-3 rounded-xl border bg-wr-panel p-4 text-left",
        "backdrop-blur-md transition-[box-shadow,border,transform] duration-300",
        "hover:-translate-y-0.5",
        busy ? "border-transparent" : "border-wr-border"
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        // Border + glow are persona-coloured when busy.
        boxShadow: busy
          ? `0 0 0 1px ${colorVar},
             0 0 40px color-mix(in oklch, ${colorVar} 30%, transparent),
             0 16px 40px oklch(0 0 0 / 0.35)`
          : "0 12px 24px oklch(0 0 0 / 0.25)",
      }}
    >
      {/* Pulsing radial halo behind the avatar — only while busy. */}
      {busy && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-0.5 animate-wr-breathe rounded-[14px]"
          style={{
            background: `radial-gradient(circle at 50% 0%, color-mix(in oklch, ${colorVar} 25%, transparent), transparent 70%)`,
          }}
        />
      )}

      {/* Notification badge — RED circle with the count of items
          requiring Salah's manual approval. v3 spec: this is the
          ONLY status indicator on the card. Hidden when count=0 so
          idle desks read as totally clean. */}
      {count > 0 && (
        <span
          aria-label={`${count} items needing approval`}
          className="absolute -right-1.5 -top-1.5 z-[15] flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white shadow-[0_0_0_2px_var(--wr-bg),_0_0_14px_rgba(239,68,68,0.6)]"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}

      {/* Avatar — slightly larger now that it's the centerpiece. */}
      <div className="relative shrink-0">
        <Image
          src={persona.avatar}
          alt=""
          width={56}
          height={56}
          className={cn(
            "h-14 w-14 rounded-full object-cover bg-wr-bg-deep",
            busy ? "border-[1.5px]" : "border border-wr-border"
          )}
          style={
            busy
              ? {
                  borderColor: colorVar,
                  boxShadow: `0 0 0 2px var(--wr-bg), 0 0 16px color-mix(in oklch, ${colorVar} 35%, transparent)`,
                }
              : undefined
          }
        />
      </div>

      {/* Persona name — single line, persona-coloured. The role label
          is dropped per v3 spec; the avatar carries the identity. */}
      <span
        className={cn(
          "text-[17px] font-semibold leading-tight",
          busy && "drop-shadow-[0_0_12px_currentColor]"
        )}
        style={{ color: colorVar }}
      >
        {persona.latin}
      </span>
    </button>
  );
}
