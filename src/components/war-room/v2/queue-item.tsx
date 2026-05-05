"use client";

/**
 * QueueItem — one row inside a Generic Workbench's queue.
 *
 * Two interactive zones:
 *   1. The row body (left side) — primary action: chat-brief.
 *   2. The "⋯" button (right side) — opens a small popover with the
 *      secondary actions ("Open detail", "Trigger apply chain").
 *
 * The "apply chain" action only renders for items that have a backing
 * `leadId`. Drafts and non-job briefs hide it.
 *
 * Visually:
 *   - Persona-coloured 2px left-border (handed in by the parent so this
 *     component stays persona-agnostic).
 *   - Hover lifts the bg slightly so the row feels affordant.
 *   - The ⋯ button is opacity-0 until row hover so the queue stays clean
 *     at rest.
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MoreHorizontal } from "lucide-react";
import type { QueueItem as QueueItemData } from "@/app/api/war-room/queue/route";
import { cn } from "@/lib/utils";

interface QueueItemProps {
  item: QueueItemData;
  /** Persona accent — `var(--wr-rashid)` etc. Drives the left border. */
  colorVar: string;
  /** Primary action — fired when the row body is clicked. */
  onBrief: (item: QueueItemData) => void;
  /** Secondary action — open a detail panel on this lead. Hidden when
   *  the item has no backing `leadId`. */
  onOpenDetail?: (item: QueueItemData) => void;
  /** Tertiary action — kick off an apply chain for this lead. Hidden
   *  for `kind === "draft"` or items without a leadId. */
  onTriggerChain?: (item: QueueItemData) => void;
  /**
   * In-row Approve action. Renders an emerald "✅ Approve" pill on
   * the right side of the row when set — Rashid + Kareem use it so
   * Salah doesn't have to walk back to the Command Bar to act on a
   * pending lead. Async; the row locks while in flight.
   */
  onApprove?: (item: QueueItemData) => Promise<void> | void;
}

export function QueueItem({
  item,
  colorVar,
  onBrief,
  onOpenDetail,
  onTriggerChain,
  onApprove,
}: QueueItemProps) {
  // Only "job" / "audit" / "brief" rows with a leadId can be detailed
  // and apply-chained. The condition is computed once here so the menu
  // markup below stays declarative.
  const hasDetail = !!item.leadId && !!onOpenDetail;
  const canChain =
    !!item.leadId && item.kind !== "draft" && !!onTriggerChain;
  // Approve only renders for items the parent allows it on (Rashid +
  // Kareem rows backed by a real lead) AND only while the lead is
  // still pending — once approved the parent drops the row from
  // queue, so this only fires once per lead.
  const canApprove = !!item.leadId && !!onApprove;

  const [menuOpen, setMenuOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside closes the menu. We attach the listener only while
  // the menu is open to avoid the per-render hit when it's not.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <div
      // No `overflow-hidden` here on purpose — the ⋯ popover menu is
      // positioned absolutely inside this row, and clipping it kills
      // the entire dropdown (it appears as a sliver under the row).
      // The 2px persona-coloured left border still respects the
      // `rounded-md` corners without clipping needed.
      className="group relative flex items-stretch rounded-md border border-wr-border bg-wr-panel transition-colors hover:bg-wr-panel-2"
      style={{ borderLeft: `2px solid ${colorVar}` }}
    >
      {/* Row body — primary action. Whole left column is clickable. */}
      <button
        type="button"
        onClick={() => onBrief(item)}
        className="flex flex-1 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent px-3 py-2.5 text-left"
      >
        <span className="text-[13px] leading-tight text-wr-fg">
          {item.primary}
        </span>
        <span className="wr-mono text-[10px] text-wr-fg-faint">
          {item.secondary}
        </span>
      </button>

      {/* In-row Approve — emerald pill on the right side of the row.
          Only renders when the parent passes `onApprove` (Rashid +
          Kareem workbenches set this for their pending leads). The
          row stays interactive after approve fires; the parent
          refetches the queue and the row drops out naturally. */}
      {canApprove && (
        <div className="flex items-center pr-1.5">
          <button
            type="button"
            disabled={approving}
            onClick={async (e) => {
              e.stopPropagation();
              if (approving) return;
              setApproving(true);
              try {
                await onApprove!(item);
              } finally {
                setApproving(false);
              }
            }}
            className={cn(
              "wr-mono inline-flex items-center gap-1 rounded-full border-0 px-2.5 py-1 text-[10px] font-bold tracking-[0.1em]",
              approving
                ? "cursor-default bg-emerald-600 text-white"
                : "cursor-pointer bg-emerald-500 text-emerald-950 shadow-[0_0_12px_rgba(52,211,153,0.4)] hover:bg-emerald-400"
            )}
          >
            {approving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Approving…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Approve
              </>
            )}
          </button>
        </div>
      )}

      {/* "⋯" trigger — only renders when there's at least one
          secondary action. Otherwise the row is brief-only. */}
      {(hasDetail || canChain) && (
        <div ref={menuRef} className="relative flex items-center pr-2">
          <button
            type="button"
            aria-label="More actions"
            aria-expanded={menuOpen}
            onClick={(e) => {
              // Stop the click bubbling to the row body — opening the
              // menu must NOT also trigger a brief.
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            // Always at 60% opacity so touch users see the affordance
            // immediately (no `:hover` on touch). Mouse users get a
            // full-opacity tell on row hover; both fade to clear-as-
            // day when the menu is open.
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-wr-border bg-wr-bg-deep text-wr-fg-dim transition-opacity hover:bg-wr-panel hover:text-wr-fg",
              menuOpen
                ? "opacity-100"
                : "opacity-60 group-hover:opacity-100"
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              // High z so it sits above neighbouring rows + the
              // workbench panel content. The workbench panel is at
              // z-60; the menu needs to clear the next row beneath it
              // but stay below modal overlays (z-100+).
              className="wr-mono absolute right-2 top-9 z-[70] flex min-w-[160px] flex-col rounded-md border border-wr-border-strong bg-wr-bg-2 py-1 text-[11px] shadow-2xl"
            >
              {hasDetail && (
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenDetail!(item);
                  }}
                >
                  Open detail
                </MenuItem>
              )}
              {canChain && (
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    onTriggerChain!(item);
                  }}
                  // Tariq red — this is the "kick the team into gear"
                  // action so it gets the urgency colour.
                  accentVar="--wr-tariq"
                >
                  Trigger apply chain
                </MenuItem>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  accentVar,
  children,
}: {
  onClick: () => void;
  accentVar?: `--wr-${string}`;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-wr-fg hover:bg-wr-panel"
      style={accentVar ? { color: `var(${accentVar})` } : undefined}
    >
      {children}
    </button>
  );
}
