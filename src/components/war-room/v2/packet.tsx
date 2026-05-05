"use client";

/**
 * A flying handoff packet — a small mono-text pill that travels from
 * one desk's centre to another's over 1.5s, glowing in the source
 * agent's accent colour, then fading out on arrival.
 *
 * The animation is pure CSS transition on `left` / `top`. We mount the
 * packet at its `from` position, schedule a microtask to flip the
 * coords to the `to` position (which triggers the transition), then
 * fade opacity to 0 right before unmount.
 */

import { useEffect, useState } from "react";
import { deskCenter } from "@/war-room/floor-plan-config";
import type { WarRoomPersonaKey } from "@/war-room/personas";

interface PacketProps {
  from: WarRoomPersonaKey;
  to: WarRoomPersonaKey;
  /** CSS-var reference like `var(--wr-kareem)`. */
  color: string;
  label: string;
}

export function Packet({ from, to, color, label }: PacketProps) {
  // 3 stages: pending (mounted at source, dim) → moving (transitioning
  // to target) → done (faded to invisible, ready for parent to unmount).
  const [stage, setStage] = useState<"pending" | "moving" | "done">("pending");

  useEffect(() => {
    // Defer the move by one tick so the browser registers the start
    // position before transitioning. 30ms is a safe lower bound for HMR
    // reflows; matches the handoff prototype.
    const t1 = setTimeout(() => setStage("moving"), 30);
    const t2 = setTimeout(() => setStage("done"), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const target = stage === "moving" ? deskCenter(to) : deskCenter(from);
  // Centre the 80×22 pill on the desk centre (offsets are −half-w / −half-h).
  const left = target.x - 40;
  const top = target.y - 11;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-20"
      style={{
        left,
        top,
        opacity: stage === "done" ? 0 : stage === "moving" ? 1 : 0.4,
        transition:
          "left 1.5s cubic-bezier(0.65,0,0.35,1), top 1.5s cubic-bezier(0.65,0,0.35,1), opacity 0.3s",
      }}
    >
      <span
        className="wr-mono inline-block whitespace-nowrap rounded-[4px] px-2 py-0.5 text-[9px] font-bold"
        style={{
          background: color,
          color: "#0a0a0a",
          // Strong color glow + soft drop shadow — sells the "energetic
          // signal flying through the office" feel.
          boxShadow: `0 0 24px ${color}, 0 4px 12px rgba(0, 0, 0, 0.5)`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
