/**
 * Chain scripts — beat-by-beat A2A timelines used to demo agent
 * collaboration on the floor plan. Each script runs ~10s with one beat
 * fired every 1400ms.
 *
 * In production these would emerge from real agent orchestration (the
 * existing `manual-lead:submitted` → Saqr → Qalam → Amin chain in
 * Phase 6 is the live equivalent). The scripts here exist for two
 * reasons:
 *   1. Deterministic demo for marketing / screenshots.
 *   2. Stress-test the visual system at the "high intensity" setting
 *      where chains run every 8s and every desk lights up rapidly.
 *
 * To add a chain: push another entry to `CHAIN_SCRIPTS` with a unique
 * `name`. (Historical: an IntensityDial used to autopilot through them;
 * removed in v3 Plan A — the floor now only animates on real DB events.)
 */

import type { WarRoomPersonaKey } from "./personas";

/** A single moment in the script. The floor-plan reducer applies these
 *  in order at 1400ms intervals. */
export interface ChainBeat {
  /** Speaker — must be a real persona key. */
  from: WarRoomPersonaKey;
  /** Target — either a persona or "Salah" (terminal handoff to the user). */
  to: WarRoomPersonaKey | "Salah";
  /** Chatter line shown in the Radio Chatter strip. */
  text: string;
  /** Always "msg" today. Reserved for future "ack" / "alert" variants. */
  kind: "msg";
  /** Edges to highlight on the SVG connection layer. Each edge is a
   *  [from, to] pair of persona keys. */
  edges?: [WarRoomPersonaKey, WarRoomPersonaKey][];
  /** Persona keys whose desk should pulse "busy" during this beat. */
  busy?: WarRoomPersonaKey[];
  /** Per-desk task line updates (overwrites prior). */
  tasks?: Partial<Record<WarRoomPersonaKey, string>>;
  /** Persona keys that should show a green notification dot — used at
   *  the END of a chain when the work is back to Salah. */
  notifications?: WarRoomPersonaKey[];
  /** Optional flying packet from one desk to another. `color` resolves
   *  to a CSS-var reference like `var(--wr-kareem)`. */
  packet?: {
    from: WarRoomPersonaKey;
    to: WarRoomPersonaKey;
    color: string;
    label: string;
  };
}

export interface ChainScript {
  /** Display name shown on the chain-trigger buttons. */
  name: string;
  beats: ChainBeat[];
}

/** Beat cadence — every beat fires this many ms after the prior one.
 *  v3 — tightened from 1400 → 700 to make the floor feel snappy. The
 *  visible chain went from ~12s end-to-end to ~6s, matching the new
 *  "kit ready in 20 min, apply in 30" pace the rest of the system
 *  now advertises. Don't push this below ~500 — the eye loses the
 *  packet flight and bubbles start to overlap unreadably. */
export const BEAT_INTERVAL_MS = 700;

/** Tail buffer after the last beat before resetting busy/edges/packets.
 *  v3 — 2500 → 1000 to match the snappier beat cadence. */
export const CHAIN_TAIL_MS = 1000;

/** v3 — Single source of truth for the "kit assembly" SLA shown to
 *  Salah in chatter copy. The system advertises a 20-minute end-to-end
 *  kit assembly (Layla draft + Kareem ATS + Tariq window-lock) so the
 *  apply-in-30-minutes flow has runway. Tweak here, ripple everywhere. */
export const ESTIMATED_COMPLETION_MIN = 20;

export const CHAIN_SCRIPTS: ChainScript[] = [
  {
    name: "LifeMD Sprint",
    beats: [
      {
        from: "Rashid",
        to: "Yusuf",
        text: "Hot one just dropped. LifeMD · Flutter Lead · 94% fit · remote/UK.",
        kind: "msg",
        edges: [["Rashid", "Yusuf"]],
        busy: ["Rashid"],
        tasks: { Rashid: "Scouting · LifeMD Flutter Lead confirmed" },
      },
      {
        from: "Yusuf",
        to: "Rashid",
        text: "Green light. @Layla @Kareem — spin up the kit.",
        kind: "msg",
        edges: [
          ["Yusuf", "Layla"],
          ["Yusuf", "Kareem"],
        ],
        busy: ["Rashid", "Layla", "Kareem"],
        tasks: { Yusuf: "Orchestrating · LifeMD kit assembly" },
      },
      {
        from: "Layla",
        to: "Kareem",
        text: "Drafting the LinkedIn post now. No 'seeking new challenges' energy 🙅‍♀️",
        kind: "msg",
        edges: [["Layla", "Kareem"]],
        busy: ["Layla", "Kareem"],
        tasks: { Layla: "Drafting post · tone: bold, voice-y" },
      },
      {
        from: "Kareem",
        to: "Layla",
        text: "Ran JD against resume. Missing: Dart null-safety, Riverpod. Flag it.",
        kind: "msg",
        edges: [["Kareem", "Layla"]],
        busy: ["Layla", "Kareem"],
        tasks: { Kareem: "ATS scan · 8.4/10 · 2 gaps flagged" },
      },
      {
        from: "Kareem",
        to: "Tariq",
        text: "Kit is clean. @Tariq your move — timebox this.",
        kind: "msg",
        edges: [["Kareem", "Tariq"]],
        busy: ["Tariq"],
        tasks: { Kareem: "Passing kit downstream" },
        packet: {
          from: "Kareem",
          to: "Tariq",
          color: "var(--wr-kareem)",
          label: "Kit ready",
        },
      },
      {
        from: "Tariq",
        to: "Yusuf",
        text: "Apply window: 30 min. Ship now. Not asking.",
        kind: "msg",
        edges: [["Tariq", "Yusuf"]],
        busy: ["Tariq", "Yusuf"],
        tasks: { Tariq: "Enforcing · 30-min window" },
      },
      {
        from: "Yusuf",
        to: "Salah",
        text: `Brief ready in ${ESTIMATED_COMPLETION_MIN} min · kit's hot, hit it now.`,
        kind: "msg",
        edges: [],
        busy: [],
        notifications: ["Layla", "Kareem", "Tariq"],
        tasks: { Yusuf: "Brief posted · awaiting Salah" },
      },
    ],
  },
  // v3 — "IELTS Pressure" script removed. The system is now 100%
  // dedicated to Software Engineering & Professional Career Growth;
  // exam-prep sprints are no longer recognised. The autopilot
  // `scriptCursor` modulos over CHAIN_SCRIPTS.length, so the
  // intensity dial automatically stops cycling onto the deleted slot.
];

// v3 Plan A — `INTENSITY_INTERVAL_MS` deleted alongside the dial. The
// floor only animates on real DB events (mission start, milestone,
// kit ready) sourced through SSE. No autopilot, no chatter knob.

/**
 * Generate a per-lead apply chain by parametrising the LifeMD Sprint
 * template with a real company name and fit %. Used when the user
 * picks "Trigger apply chain" on a queue row — the visible chatter
 * lines, packet labels, and task copy all swap to reference the picked
 * lead instead of the demo's hardcoded "LifeMD".
 *
 * The structural shape (7 beats, same edge graph, same packet timing)
 * stays identical to the template — only the strings move.
 */
export function buildLeadSprint(args: {
  company: string;
  fitPercentage?: number | null;
}): ChainScript {
  const { company, fitPercentage } = args;
  const fitFragment =
    fitPercentage != null ? ` · ${fitPercentage}% fit` : "";

  return {
    name: `${company} Sprint`,
    beats: [
      {
        from: "Rashid",
        to: "Yusuf",
        text: `Hot one just dropped. ${company}${fitFragment} · remote/UK.`,
        kind: "msg",
        edges: [["Rashid", "Yusuf"]],
        busy: ["Rashid"],
        tasks: { Rashid: `Scouting · ${company} confirmed` },
      },
      {
        from: "Yusuf",
        to: "Rashid",
        text: "Green light. @Layla @Kareem — spin up the kit.",
        kind: "msg",
        edges: [
          ["Yusuf", "Layla"],
          ["Yusuf", "Kareem"],
        ],
        busy: ["Rashid", "Layla", "Kareem"],
        tasks: { Yusuf: `Orchestrating · ${company} kit assembly` },
      },
      {
        from: "Layla",
        to: "Kareem",
        text: `Drafting the LinkedIn post for ${company} now. No 'seeking new challenges' energy 🙅‍♀️`,
        kind: "msg",
        edges: [["Layla", "Kareem"]],
        busy: ["Layla", "Kareem"],
        tasks: { Layla: `Drafting post · ${company}` },
      },
      {
        from: "Kareem",
        to: "Layla",
        text: `Ran JD against resume. Flagging gaps — Layla, address them in the cover.`,
        kind: "msg",
        edges: [["Kareem", "Layla"]],
        busy: ["Layla", "Kareem"],
        tasks: { Kareem: `ATS scan · ${company}` },
      },
      {
        from: "Kareem",
        to: "Tariq",
        text: `Kit clean for ${company}. @Tariq your move — timebox this.`,
        kind: "msg",
        edges: [["Kareem", "Tariq"]],
        busy: ["Tariq"],
        tasks: { Kareem: "Passing kit downstream" },
        packet: {
          from: "Kareem",
          to: "Tariq",
          color: "var(--wr-kareem)",
          label: "Kit ready",
        },
      },
      {
        from: "Tariq",
        to: "Yusuf",
        text: `${company} apply window: 30 min. Ship now. Not asking.`,
        kind: "msg",
        edges: [["Tariq", "Yusuf"]],
        busy: ["Tariq", "Yusuf"],
        tasks: { Tariq: `Enforcing · ${company} 30-min window` },
      },
      {
        from: "Yusuf",
        to: "Salah",
        text: `Brief ready for ${company} in ${ESTIMATED_COMPLETION_MIN} min · kit's hot, hit it now.`,
        kind: "msg",
        edges: [],
        busy: [],
        notifications: ["Layla", "Kareem", "Tariq"],
        tasks: { Yusuf: `Brief posted · ${company}` },
      },
    ],
  };
}

/**
 * v3 — Per-mission progress milestones.
 *
 * Once a chain has fired and the mission is "in flight", the floor
 * stops re-running the noisy hand-off animation and instead emits ONE
 * chatter line per persona at each of these milestones, then goes
 * silent. Sync'd to ESTIMATED_COMPLETION_MIN so the 25/50/75/100
 * percentages map to clean wall-clock minutes (5 / 10 / 15 / 20 at
 * the current 20-min SLA).
 *
 * The `order-sent` tag is a sentinel — it's marked the moment the
 * chain fires (handled by handleChainRequested via the chat-drawer
 * bridge), so the progress ticker won't try to re-announce it.
 *
 * Lines support `{company}` interpolation. Engineering-themed only.
 */
export type MilestoneTag = "order-sent" | "25%" | "50%" | "75%" | "done";

export interface ProgressBeat {
  /** Speaker — also drives the bubble colour in chatter. */
  from: WarRoomPersonaKey;
  /** Always to Salah for progress beats — these are status reports,
   *  not A2A handoffs. */
  text: string;
}

export const PROGRESS_LINES: Record<
  Exclude<MilestoneTag, "order-sent">,
  ProgressBeat[]
> = {
  "25%": [
    {
      from: "Layla",
      text: "Drafting {company} cover · 25% complete. Building the Riverpod section now.",
    },
    {
      from: "Kareem",
      text: "CV pass 1/4 · summary tailored to {company}'s stack.",
    },
  ],
  "50%": [
    {
      from: "Layla",
      text: "Halfway. Opening hook landed; closing CTA next.",
    },
    {
      from: "Kareem",
      text: "CV pass 2/4 · experience reordered for {company} signal.",
    },
  ],
  "75%": [
    { from: "Layla", text: "Polish pass. Trimming buzzwords." },
    { from: "Kareem", text: "CV pass 3/4 · skills aligned." },
  ],
  done: [
    { from: "Layla", text: "Done. Cover letter ready for review." },
    { from: "Kareem", text: "CV tailored — sections locked. Awaiting Salah." },
    {
      from: "Tariq",
      text: "{company} kit clean. Apply window still open. Ship.",
    },
  ],
};
