"use client";

/**
 * Shared persona avatar — renders the generated PNG at
 * /avatars/{role}.png, with a graceful fallback to a persona-colored
 * circle + initial letter if the image is missing or fails to load.
 *
 * Used by ChatterFeed (message bubble + typing indicator) and any
 * other surface that needs a consistent persona avatar with fallback.
 * (RoleCard / SifrBrief references removed in v3 dead-code cleanup.)
 *
 * Sizes map to pixel heights (Tailwind `h-*` classes) rather than
 * literal pixel props so the avatar inherits the rest of the UI's
 * rhythm:
 *   sm → h-7  (chatter-feed bubbles, compact rows)
 *   md → h-9  (default, medium-density layouts)
 *   lg → h-11 (header rows)
 *   xl → h-14 (zero hero banner)
 */

import { useState } from "react";
import { PERSONA, type AgentRole } from "@/agents/base/agent-aliases";
import { cn } from "@/lib/utils";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
  xl: "h-14 w-14 text-xl",
};

/** File path convention: /avatars/{lower-case role}.png in /public. */
function srcFor(role: AgentRole): string {
  return `/avatars/${role.toLowerCase()}.png`;
}

export function AgentAvatar({
  role,
  size = "md",
  className,
  /** Sifr gets a subtle violet glow to read as "the lead"; everyone else
   *  stays flat. Overridable if callers want a different vibe. */
  glow,
}: {
  role: AgentRole;
  size?: AvatarSize;
  className?: string;
  glow?: boolean;
}) {
  const p = PERSONA[role];
  const sz = SIZE_CLASSES[size];
  const [failed, setFailed] = useState(false);
  const shouldGlow = glow ?? role === "Sifr";

  // Fallback: persona-color circle with the initial letter. This is what
  // shipped in Phase 4 — we keep it as a safety net so a missing PNG
  // never leaves an empty avatar.
  if (failed) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm",
          p.solid,
          sz,
          shouldGlow && "ring-2 ring-violet-500/40",
          className
        )}
        aria-label={p.name}
      >
        {p.letter}
      </div>
    );
  }

  // Happy path: rendered PNG, circle-masked, persona-color border so it
  // ties into the existing palette without fighting the image's own
  // colours. Object-cover keeps the focal subject (beak / quill tip /
  // orb core) centered in the circle crop.
  return (
    <img
      src={srcFor(role)}
      alt={`${p.name} — ${p.role}`}
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0 rounded-full border object-cover shadow-sm",
        p.border,
        sz,
        shouldGlow &&
          "ring-2 ring-violet-500/40 shadow-[0_0_20px_rgba(139,92,246,0.35)]",
        className
      )}
    />
  );
}
