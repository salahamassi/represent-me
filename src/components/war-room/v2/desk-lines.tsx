"use client";

/**
 * SVG layer that draws every (from, to) pair between desks as a thin
 * connection line. There are 5 desks → 20 directional pairs. Inactive
 * lines render as the faintest grid line; active edges (driven by the
 * current chain beat) jump to 1.5px in the from-agent's accent color
 * with a dashed pattern + blink animation.
 */

import {
  WAR_ROOM_KEYS,
  WAR_ROOM_PERSONAS,
  type WarRoomPersonaKey,
} from "@/war-room/personas";
import { deskCenter } from "@/war-room/floor-plan-config";

export type ActiveEdge = [WarRoomPersonaKey, WarRoomPersonaKey];

export function DeskLines({ active }: { active: ActiveEdge[] }) {
  // Build a lookup so the per-line check is O(1) instead of O(active).
  const activeKeys = new Set(active.map(([f, t]) => `${f}->${t}`));

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
    >
      {WAR_ROOM_KEYS.flatMap((from) =>
        WAR_ROOM_KEYS.filter((to) => to !== from).map((to) => {
          const isActive = activeKeys.has(`${from}->${to}`);
          const a = deskCenter(from);
          const b = deskCenter(to);
          return (
            <line
              key={`${from}-${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={
                isActive
                  ? `var(${WAR_ROOM_PERSONAS[from].cssVar})`
                  : "var(--wr-grid-line)"
              }
              strokeWidth={isActive ? 1.5 : 0.5}
              strokeDasharray={isActive ? "2 6" : undefined}
              className={isActive ? "animate-wr-blink" : undefined}
            />
          );
        })
      )}
    </svg>
  );
}
