"use client";

/**
 * Onboarding Guide — the "Where am I?" storyboard.
 *
 * Auto-shows on first visit (gated by a `warroom.guide.dismissed`
 * localStorage flag) and is reopenable on demand from the Command
 * Bar's `?` button. Renders a full-screen modal with four numbered
 * panels — each anchored on a persona avatar — that walks Salah
 * through the canonical workflow:
 *
 *   1. SCAN     · Rashid finds the lead
 *   2. ANALYZE  · Kareem audits the kit
 *   3. DRAFT    · Layla writes the cover
 *   4. APPLY    · Salah hits the Command Bar's GO TO JOB button
 *
 * The guide is intentionally simple — no animation gimmicks beyond the
 * standard expand-in. The job is to communicate the four steps and
 * dismiss. The "Don't show again" checkbox writes the dismissal flag
 * so this is the only time we ever block the floor on first paint.
 */

import Image from "next/image";
import { Fragment, useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import {
  WAR_ROOM_PERSONAS,
  type WarRoomPersonaKey,
} from "@/war-room/personas";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "warroom.guide.dismissed";

interface Step {
  /** Persona who owns this step. Avatar + accent color come from here. */
  persona: WarRoomPersonaKey | "Salah";
  /** Number shown on the badge. */
  n: number;
  /** Mono uppercase label — short verb. */
  verb: string;
  /** Two-line caption. */
  caption: string;
}

const STEPS: Step[] = [
  {
    persona: "Rashid",
    n: 1,
    verb: "Scan",
    caption:
      "Rashid scouts jobs from RemoteOK, Arc.dev, LinkedIn — and any JD you paste manually.",
  },
  {
    persona: "Kareem",
    n: 2,
    verb: "Analyze",
    caption:
      "Kareem audits your resume against each posting. ATS score, missing keywords, gaps.",
  },
  {
    persona: "Layla",
    n: 3,
    verb: "Draft",
    caption:
      "Layla writes the cover letter + LinkedIn post in your voice — no corporate clichés.",
  },
  {
    // The fourth step is Salah's action — represented by Yusuf
    // (his digital clone / chief-of-staff) handing it off.
    persona: "Yusuf",
    n: 4,
    verb: "Apply",
    caption:
      "You hit GO TO JOB in the Command Bar above. Resume + cover are one click each.",
  },
];

interface OnboardingGuideProps {
  /** Force-open from the parent (e.g. the Command Bar's "?" button). */
  open: boolean;
  onClose: () => void;
  /** Whether to auto-show on first mount when the dismiss flag is unset.
   *  Pass `false` to fully gate behind the parent's `open` prop. */
  autoOpenIfFresh?: boolean;
  /** Notified when the user ticks "Don't show again" — the parent can
   *  use this to cache the decision in higher-level state too. */
  onDismissedForever?: () => void;
}

export function OnboardingGuide({
  open,
  onClose,
  autoOpenIfFresh = true,
  onDismissedForever,
}: OnboardingGuideProps) {
  const [autoOpen, setAutoOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // First-mount: read the dismiss flag from localStorage, decide
  // whether to auto-open. We do this in an effect so SSR sees a
  // hidden guide (no flash on initial render).
  useEffect(() => {
    if (!autoOpenIfFresh) return;
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
      if (!dismissed) setAutoOpen(true);
    } catch {
      // No storage — default to showing the guide once per session.
      setAutoOpen(true);
    }
  }, [autoOpenIfFresh]);

  const visible = open || autoOpen;

  // Escape closes — same affordance as the chat drawer.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = useCallback(() => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // ignore
      }
      onDismissedForever?.();
    }
    setAutoOpen(false);
    onClose();
  }, [dontShowAgain, onClose, onDismissedForever]);

  if (!visible) return null;

  return (
    // Full-viewport backdrop + centered card. Backdrop click closes
    // (preserves the dismiss-forever pref if checked).
    <div
      role="dialog"
      aria-label="How to use the War Room"
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
    >
      <button
        type="button"
        aria-label="Close guide"
        onClick={handleClose}
        className="absolute inset-0 cursor-default border-0 bg-black/65 backdrop-blur-md"
      />

      <div className="relative w-full max-w-4xl animate-wr-expand-in rounded-2xl border border-wr-border-strong bg-wr-bg-2 p-7 shadow-2xl">
        {/* Header — title + dismiss X */}
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="wr-mono text-[10px] tracking-[0.22em] text-wr-fg-faint">
              War Room · how to use
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-wr-fg">
              Four steps. The team handles the middle.
            </h2>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-wr-fg-dim">
              You don&rsquo;t click desks to get work done — you read
              the Command Bar at the top and act on what it tells you.
              The agents below are doing the supporting work in real
              time.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-wr-border bg-transparent text-wr-fg-dim hover:bg-wr-panel hover:text-wr-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Storyboard — 4 columns on md+, stacked on mobile. Arrows
            between desktop steps reinforce direction of flow. */}
        {/* 4 step cards on a 1-col grid, with horizontal arrows
            between them on md+. We use a list of Fragments so each
            iteration renders [card, optional arrow]. */}
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
          {STEPS.map((step, i) => (
            <Fragment key={step.n}>
              <li className="flex flex-col items-center gap-2 rounded-xl border border-wr-border bg-wr-panel p-4 text-center">
                <StepAvatar persona={step.persona} n={step.n} />
                <div className="wr-mono text-[10px] tracking-[0.22em] text-wr-fg-faint">
                  Step {step.n}
                </div>
                <div
                  className="text-base font-semibold"
                  style={{ color: personaColor(step.persona) }}
                >
                  {step.verb}
                </div>
                <p className="text-[12px] leading-relaxed text-wr-fg-dim">
                  {step.caption}
                </p>
              </li>
              {i < STEPS.length - 1 && (
                <li
                  aria-hidden
                  className="hidden items-center justify-center md:flex"
                >
                  <ArrowRight className="h-5 w-5 text-wr-fg-faint" />
                </li>
              )}
            </Fragment>
          ))}
        </ol>

        {/* Footer — dismiss-forever + got-it CTA */}
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-wr-border pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-wr-fg-dim">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-wr-yusuf"
            />
            Don&rsquo;t show this again
          </label>
          <button
            type="button"
            onClick={handleClose}
            className="wr-mono inline-flex cursor-pointer items-center gap-2 rounded-full bg-wr-yusuf px-5 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-white"
          >
            <Check className="h-3.5 w-3.5" />
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Step avatar — persona PNG with the step number badged on the
 *  bottom-right. The "Salah" persona has no avatar; we render a
 *  monogram tile instead (mirrors the chat drawer's user bubble). */
function StepAvatar({
  persona,
  n,
}: {
  persona: WarRoomPersonaKey | "Salah";
  n: number;
}) {
  const color = personaColor(persona);
  return (
    <div className="relative">
      {persona === "Salah" ? (
        <div
          className="wr-mono flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] bg-wr-panel-2 text-lg font-semibold text-wr-fg"
          style={{ borderColor: color }}
        >
          S
        </div>
      ) : (
        <Image
          src={WAR_ROOM_PERSONAS[persona].avatar}
          alt={WAR_ROOM_PERSONAS[persona].latin}
          width={64}
          height={64}
          className="h-16 w-16 rounded-full border-[1.5px] object-cover bg-wr-bg-deep"
          style={{
            borderColor: color,
            boxShadow: `0 0 16px color-mix(in oklch, ${color} 30%, transparent)`,
          }}
        />
      )}
      <span
        className={cn(
          "wr-mono absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold text-white"
        )}
        style={{ background: color, borderColor: "var(--wr-bg-2)" }}
      >
        {n}
      </span>
    </div>
  );
}

/** Resolve a persona key (or "Salah") to its CSS-var color string. */
function personaColor(persona: WarRoomPersonaKey | "Salah"): string {
  if (persona === "Salah") return "var(--wr-yusuf)"; // borrow Yusuf's palette
  return `var(${WAR_ROOM_PERSONAS[persona].cssVar})`;
}
