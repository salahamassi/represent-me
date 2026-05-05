"use client";

/**
 * Tariq's Workbench — the live-ticking countdown + deadline stack.
 *
 * Tariq is the extreme case in the design system: he doesn't get a
 * static "Now Working On" card; his whole job is enforcement, so his
 * panel is dominated by a primary countdown (Days/Hours/Minutes/Seconds)
 * to the next deadline plus a sorted stack of upcoming targets.
 *
 * The countdown is a `setInterval(1000)` against a memoized target
 * timestamp — re-renders every second. We compute days/hours/mins/secs
 * from the diff at render time so the component stays pure.
 *
 * Today the deadlines are static placeholder data from the handoff.
 * When Salah's real deadline tracker lands (job application closes,
 * visa CoS, sprint milestones), this component reads from that store
 * and sorts client-side. Engineering-only — no exam tracking.
 */

import { useEffect, useMemo, useState } from "react";
import type { ActiveMission } from "./floor-plan";

// v3 Plan A — Static `DEADLINES` array DELETED. The previous build
// hardcoded scholarship rows (Gates Cambridge / DAAD / UK CoS) that
// had no DB backing — they were design-handoff placeholders that
// stayed visible regardless of the user's actual state. Tariq's
// panel now shows ONLY: (1) the active mission countdown derived
// from `mission_started_at`, OR (2) an empty state when no mission
// is in flight. When a `seen_jobs.closing_date` column lands, this
// is where real per-application deadlines would render.

/** v3 — The shipping window for the freshest top lead. 30 minutes
 *  from `mission_started_at`, ticking down to zero. */
const APPLY_WINDOW_MS = 30 * 60_000;

export function TariqInlineWorkbench({
  activeMissions,
}: {
  activeMissions?: Map<string, ActiveMission>;
}) {
  // Re-render every second so the countdown ticks. The target is
  // derived below from the LATEST active mission's `startedAt`, so
  // even on reload the countdown picks up exactly where it was.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // v3 Plan A Phase 4 — Bind the countdown to the most recently-
  // started mission's DB timestamp instead of `Date.now()` at mount.
  // Reload-safe: the `mission_started_at` row survives the reload, so
  // the user sees the same remaining time they'd compute by hand.
  // When no mission is active the panel falls back to a "no active
  // mission" state — Tariq has nothing to enforce.
  const latestMission = useMemo(() => {
    if (!activeMissions || activeMissions.size === 0) return null;
    return Array.from(activeMissions.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    )[0];
  }, [activeMissions]);

  const target = latestMission ? latestMission.startedAt + APPLY_WINDOW_MS : 0;
  const diff = latestMission ? Math.max(0, target - now) : 0;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff / 3_600_000) % 24);
  const mins = Math.floor((diff / 60_000) % 60);
  const secs = Math.floor((diff / 1_000) % 60);
  // Once the window expires we flag the card critical so even idle
  // glances see "missed it". Useful as a soft prompt to either
  // ship or dismiss.
  const expired = !!latestMission && diff === 0;
  const noMission = !latestMission;

  return (
    <>
      {/* Closest threat — Tariq-tinted top card with the live 30-min
          apply window. Days/Hrs read 00 for the first 30 min, then
          everything is zero once expired. */}
      <div
        className="mb-3.5 rounded-[10px] border p-4"
        style={{
          background: "color-mix(in oklch, var(--wr-tariq) 8%, transparent)",
          borderColor: "color-mix(in oklch, var(--wr-tariq) 35%, transparent)",
        }}
      >
        <SectionLabel color="var(--wr-tariq)">
          {noMission
            ? "No active mission · countdown idle"
            : expired
              ? `Apply window · EXPIRED · ${latestMission!.company} · ship or dismiss`
              : `Apply window · ${latestMission!.company} · 30 min to ship`}
        </SectionLabel>
        <div className="mt-2.5 flex gap-2">
          <CountBlock value={days} label="Days" />
          <CountBlock value={hours} label="Hrs" />
          {/* Mins is the critical block now — that's the one Salah
              actually watches when the window is sub-hour. */}
          <CountBlock value={mins} label="Min" critical />
          <CountBlock value={secs} label="Sec" critical={expired} />
        </div>
      </div>

      {/* v3 Plan A — Deadline stack rendered ONLY when there's an
          active mission. The countdown card above is the live
          enforcement signal; the stack is reserved for future real
          per-application deadlines from `seen_jobs.closing_date`. */}
      {!noMission && (
        <>
          <SectionLabel>Deadline Stack</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5">
            <div
              className="grid grid-cols-[1fr_auto] items-center rounded-md border border-wr-border bg-wr-panel px-3 py-2.5"
              style={{ borderLeft: `3px solid var(--wr-tariq)` }}
            >
              <span className="text-[13px] text-wr-fg">
                {latestMission!.company} · apply window
              </span>
              <span
                className="wr-mono text-base font-semibold"
                style={{ color: "var(--wr-tariq)" }}
              >
                {expired ? "0m" : `${mins}m${secs.toString().padStart(2, "0")}s`}
              </span>
            </div>
          </div>
        </>
      )}

      {/* v3 Plan A — Catchphrase plate REMOVED. Was a fictional quote
          ('"I don\'t remind. I count down. Talk to me."') that read as
          fabricated content. Tariq's real voice is in his chat replies
          via the persona prompt; the panel itself stays clean. */}
    </>
  );
}

/** One of the four countdown digits. The "Days" block is the critical
 *  one — Tariq red text + glow + tinted border so the eye lands there
 *  first. The other three are neutral panel cells. */
function CountBlock({
  value,
  label,
  critical,
}: {
  value: number;
  label: string;
  critical?: boolean;
}) {
  return (
    <div
      className="flex-1 rounded-md border bg-wr-panel-2 py-2 text-center"
      style={{
        borderColor: critical
          ? "color-mix(in oklch, var(--wr-tariq) 50%, transparent)"
          : "var(--wr-border)",
      }}
    >
      <div
        className="wr-mono text-[28px] font-semibold leading-none tabular-nums"
        style={{
          color: critical ? "var(--wr-tariq)" : "var(--wr-fg)",
          textShadow: critical
            ? "0 0 18px color-mix(in oklch, var(--wr-tariq) 50%, transparent)"
            : "none",
        }}
      >
        {String(value).padStart(2, "0")}
      </div>
      <div className="wr-mono mt-1 text-[9px] text-wr-fg-faint">{label}</div>
    </div>
  );
}

function SectionLabel({
  color,
  children,
}: {
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="wr-mono text-[10px] tracking-[0.22em]"
      style={{ color: color ?? "var(--wr-fg-faint)" }}
    >
      {children}
    </div>
  );
}
