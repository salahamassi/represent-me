"use client";

/**
 * Home — War Room v2.
 *
 * Layered surface, top to bottom:
 *
 *   1. CommandBar       — persistent action HUD. Top lead + downloads +
 *                         Drafts/Help buttons. Always visible.
 *   2. FloorPlan        — 1280×900 canvas with desks, packets, chatter.
 *                         The "office" view. Click a desk for workbench.
 *   3. OnboardingGuide  — overlay (modal). Auto-shows once, reopened
 *                         from the CommandBar's "?" button.
 *   4. DraftsPanel      — slide-down panel from the CommandBar. Layla's
 *                         recent drafts with copy + chat shortcuts.
 *
 * Page-level state coordinates "pending chat" — when the CommandBar or
 * DraftsPanel wants to open a chat with a persona (without opening
 * their full workbench), it sets `pendingChat` and the FloorPlan picks
 * it up via the `pendingChatRequest` controlled prop. Cleared by
 * FloorPlan via `onChatRequestConsumed`.
 */

import { useCallback, useState } from "react";
import { CommandBar } from "@/components/war-room/v2/command-bar";
import { FloorPlan } from "@/components/war-room/v2/floor-plan";
import { OnboardingGuide } from "@/components/war-room/v2/onboarding-guide";
import type { WarRoomPersonaKey } from "@/war-room/personas";

export default function HomePage() {
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingChat, setPendingChat] = useState<{
    role: WarRoomPersonaKey;
    autoSend?: string;
  } | null>(null);
  /** Approval celebration handoff — set when the Command Bar tells us
   *  a lead was just approved. The FloorPlan picks it up, pushes a
   *  chatter row + runs a sprint, then clears via the consume callback. */
  const [pendingApproval, setPendingApproval] = useState<{
    company: string;
    fitPercentage?: number | null;
  } | null>(null);

  // Adapter — the CommandBar exposes a narrow union of personas it
  // knows about; we widen to WarRoomPersonaKey before handing off.
  const askPersona = useCallback((role: WarRoomPersonaKey) => {
    setPendingChat({ role });
  }, []);

  return (
    <div className="relative -m-8 min-h-screen overflow-auto bg-wr-bg text-wr-fg">
      {/* Ambient gradient backdrop fills the viewport behind everything. */}
      <div className="wr-bg-ambient" />

      <div className="relative mx-auto flex max-w-[1320px] flex-col items-stretch px-4 pb-6 pt-4">
        {/* The Command Bar lives outside the floor canvas so it stays
            visible no matter what's open below. */}
        <CommandBar
          onOpenGuide={() => setGuideOpen(true)}
          onChatWith={askPersona}
          onApproved={(lead) =>
            setPendingApproval({
              company: lead.company,
              fitPercentage: lead.fitPercentage,
            })
          }
        />

        <div className="relative flex justify-center">
          <FloorPlan
            pendingChatRequest={pendingChat}
            onChatRequestConsumed={() => setPendingChat(null)}
            pendingApproval={pendingApproval}
            onApprovalConsumed={() => setPendingApproval(null)}
          />
        </div>
      </div>

      {/* v3 — DraftsPanel deleted. Drafts now live inside Yusuf's
          single-pane review (his queue surfaces the latest Layla
          draft inline) so there's one place to find them, not two. */}

      {/* Onboarding storyboard — auto-shows once on first visit, also
          reopenable via the Command Bar's "?" button. */}
      <OnboardingGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </div>
  );
}
