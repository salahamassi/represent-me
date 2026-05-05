"use client";

/**
 * Expanded Workbench — slides in over the floor area when a desk is
 * clicked. 700px wide panel anchored top-left, leaving the right edge
 * clear for the Chat Drawer to land alongside.
 *
 * Header: 84px avatar + 38px persona name (with text-shadow glow) +
 * mono dept/age/sex line + huge decorative Arabic glyph (80px, 20%
 * persona alpha) floating right.
 *
 * Body: persona-specific content. Tariq gets a live-ticking countdown
 * + deadline stack (TariqInlineWorkbench). Everyone else gets the
 * GenericWorkbench template — "Now Working On" card, queue of last 3
 * items, big metric tile.
 *
 * Mounted inside the floor area's relatively-positioned container so
 * its absolute insets bound to the floor, not the page. Pointer events
 * are off on the wrapper so clicks on the floor still work outside the
 * panel; pointer events back on for the panel itself.
 */

import Image from "next/image";
import {
  WAR_ROOM_PERSONAS,
  type WarRoomPersonaKey,
} from "@/war-room/personas";
import type { QueueItem as QueueItemData } from "@/app/api/war-room/queue/route";
import type { ActiveMission } from "./floor-plan";
import { GenericWorkbench } from "./workbench-generic";
import { TariqInlineWorkbench } from "./workbench-tariq";

interface ExpandedWorkbenchProps {
  /** Open for this persona, or `null` to render nothing. */
  role: WarRoomPersonaKey | null;
  /** Forwarded to GenericWorkbench — fires when the user clicks a
   *  queue row's body. The FloorPlan opens the chat drawer with the
   *  text auto-sent. */
  onBriefRequested: (payload: {
    role: WarRoomPersonaKey;
    text: string;
    item: QueueItemData;
  }) => void;
  /** Forwarded to GenericWorkbench — fires when the user picks
   *  "Trigger apply chain" from a row's ⋯ menu. */
  onChainRequested: (payload: {
    role: WarRoomPersonaKey;
    item: QueueItemData;
  }) => void;
  /** Forwarded to GenericWorkbench — fires when the user clicks a
   *  Ghada gallery tile. The FloorPlan opens her chat in image-edit
   *  mode (post pre-loaded, Ghada speaks first, next reply triggers
   *  regen). */
  onEditVisual?: (item: QueueItemData) => void;
  /** v3 — Map of in-flight chains keyed by leadId. Forwarded down to
   *  GenericWorkbench so Layla & Kareem's panels can render synthetic
   *  "live work in progress" rows for each active mission. */
  activeMissions?: Map<string, ActiveMission>;
}

export function ExpandedWorkbench({
  role,
  onBriefRequested,
  onChainRequested,
  onEditVisual,
  activeMissions,
}: ExpandedWorkbenchProps) {
  if (!role) return null;
  const persona = WAR_ROOM_PERSONAS[role];
  const colorVar = `var(${persona.cssVar})`;

  return (
    // Outer wrapper — absolute over the floor, but pointer-events off
    // so clicks pass through to the floor outside the panel itself.
    //
    // z-index: 60 — above the chat-drawer scrim (z-50) so the workbench
    // stays fully visible when the chat opens. Without this lift the
    // scrim's 40% black dims the workbench mid-sequence and reads as
    // "the workbench closed and reopened" when it never actually did.
    <div className="pointer-events-none absolute inset-0 z-[60] flex items-start justify-start p-5">
      {/* v3 Plan A — Scrim behind the workbench panel. Without this, the
          floor's desks stay fully visible behind/beside the panel —
          the active persona's OWN desk would peek past the workbench
          (e.g. Yusuf desk at x=490 protrudes past a 700px-wide
          workbench, showing a duplicate Yusuf avatar). Scrim sits
          BELOW the panel (no z-index here, panel uses z-[1] to lift
          above it). Both share the wrapper's z-[60] stacking context. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div
        // Re-enable pointer events on the actual panel + slide-in entry.
        // z-[1] within the wrapper's z-[60] stacking context so the
        // panel renders above the scrim sibling.
        className="wr-scrollbar-slim relative z-[1] pointer-events-auto h-[calc(100%-40px)] w-[700px] max-w-[calc(100%-460px)] animate-wr-expand-in overflow-auto rounded-[14px] border bg-wr-bg-2 p-6"
        style={{
          borderColor: colorVar,
          // Border + outer halo + drop shadow stack — handoff recipe.
          // The inset 1px line is what makes the colour stripe pop;
          // the 80px coloured glow is the "office light" feel.
          boxShadow: `0 0 0 1px ${colorVar},
                      0 40px 80px oklch(0 0 0 / 0.5),
                      0 0 80px color-mix(in oklch, ${colorVar} 25%, transparent)`,
        }}
      >
        {/* Header row */}
        <div className="flex items-start gap-[18px]">
          <Image
            src={persona.avatar}
            alt={persona.latin}
            width={84}
            height={84}
            className="h-[84px] w-[84px] shrink-0 rounded-full border-[1.5px] object-cover bg-wr-bg-deep"
            style={{
              borderColor: colorVar,
              boxShadow: `0 0 24px color-mix(in oklch, ${colorVar} 35%, transparent)`,
            }}
          />

          <div className="min-w-0 flex-1">
            <div
              className="text-[38px] font-semibold leading-[1.05]"
              style={{
                color: colorVar,
                textShadow: `0 0 24px color-mix(in oklch, ${colorVar} 25%, transparent)`,
              }}
            >
              {persona.latin}
            </div>
            <div
              className="wr-mono mt-1.5 text-[11px] tracking-[0.25em]"
              style={{ color: colorVar }}
            >
              {persona.role}
            </div>
            <div className="wr-mono mt-1 text-[10px] text-wr-fg-faint">
              {persona.dept}
            </div>
          </div>

          {/* Decorative Arabic calligraphy — 80px, 20% persona alpha,
              floats top-right. Pointer events off so it doesn't block
              the panel's scroll. */}
          <div
            lang="ar"
            dir="rtl"
            className="ar-display pointer-events-none select-none text-[80px] leading-[0.85]"
            style={{
              color: `color-mix(in oklch, ${colorVar} 20%, transparent)`,
            }}
          >
            {persona.arDeco}
          </div>
        </div>

        {/* Body — Tariq is the extreme case, everyone else uses the
            template. The template will eventually pull live data; for
            now the copy is canonical from the handoff so the shape is
            visible even before the data layer lands. */}
        <div className="mt-5">
          {role === "Tariq" ? (
            <TariqInlineWorkbench activeMissions={activeMissions} />
          ) : (
            <GenericWorkbench
              role={role}
              onBriefRequested={onBriefRequested}
              onChainRequested={onChainRequested}
              onEditVisual={onEditVisual}
              activeMissions={activeMissions}
            />
          )}
        </div>
      </div>
    </div>
  );
}
