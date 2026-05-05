/**
 * Floor-plan layout constants — the "physical office" of the agents.
 *
 * Coordinates are absolute pixels relative to the floor area's top-left,
 * inside the 1280×900 War Room canvas. They match the design handoff
 * verbatim. Iterating these constants drives:
 *   - desk rendering
 *   - connection-line SVG (every (from, to) pair)
 *   - packet flight start/end positions
 *   - chain-script "edge" lookups
 */

import type { WarRoomPersonaKey } from "./personas";

export interface DeskRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tab label shown floating above the desk's top-left corner. */
  label: string;
}

export const DESKS: Record<WarRoomPersonaKey, DeskRect> = {
  Yusuf:  { x: 490, y: 110, w: 220, h: 120, label: "Command" },
  Rashid: { x: 160, y: 300, w: 240, h: 130, label: "Radar" },
  // Layla + Ghada share the Creative quadrant — Layla on top
  // (Drafting), Ghada nested inside her area (Studio). Layla's height
  // shrinks slightly to make room; the visual handoff is meant to
  // read as "Ghada works downstream of Layla" so they're stacked.
  Layla:  { x: 800, y: 240, w: 240, h: 110, label: "Drafting" },
  Ghada:  { x: 800, y: 360, w: 240, h: 110, label: "Studio" },
  Kareem: { x: 800, y: 490, w: 240, h: 130, label: "Audit" },
  Tariq:  { x: 160, y: 490, w: 240, h: 130, label: "Countdown" },
};

/** Desk centre in floor-area coordinates — used by SVG lines and packets. */
export function deskCenter(role: WarRoomPersonaKey): { x: number; y: number } {
  const d = DESKS[role];
  return { x: d.x + d.w / 2, y: d.y + d.h / 2 };
}

/** Corner labels around the floor area perimeter. The handoff arranges
 *  them clockwise from NW so the order maps 1:1 to the four corners. */
export const CORNER_LABELS = [
  { text: "↖ NW · SCOUTING", pos: "left-4 top-3.5" },
  { text: "NE · CREATIVE ↗", pos: "right-4 top-3.5" },
  { text: "↙ SW · ENFORCEMENT", pos: "left-4 bottom-3.5" },
  { text: "SE · COMPLIANCE ↘", pos: "right-4 bottom-3.5" },
] as const;

/** Floor-area canvas size — the desks live inside a 1100×680 region. */
export const FLOOR_AREA = { w: 1240, h: 760 } as const;

/** Outer canvas (incl. top bar + radio chatter strip).
 *  v3 — bumped from 900 → 1000 to give 100px headroom after Radio
 *  Chatter grew from 110px to 220px (bubble feed). Without this,
 *  bottom-row desks (Kareem/Tariq at y=490 + h=130 = 620) get clipped
 *  by the taller chatter strip below the floor area. */
export const CANVAS = { w: 1280, h: 1000 } as const;
