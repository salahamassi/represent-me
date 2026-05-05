/**
 * Agent personas used in the "War Room" UI.
 *
 * The server-side agent IDs (`job-matcher`, `content`, `resume`, `github`,
 * `linkedin`, `bureaucrat`, ...) are stable identifiers baked into event
 * sources and DB rows. The UI surfaces Arabic first names so the team
 * feels personal to Salah:
 *
 *   Saqr  (صقر)  — "Falcon."        Field Ops. Fast, sharp, finds targets.
 *   Qalam (قلم) — "Pen."            Creative Lead. Writes the story.
 *   Amin  (أمين) — "Trustworthy."    Compliance. Guards the documents.
 *   Sifr  (صفر) — "Zero / Origin."  Lead / Supervisor.
 *   System — infrastructure noise (bus, scheduler, telegram).
 *
 * Type identifiers stay Latin-transliterated so file paths, lookups, and
 * greps remain ergonomic. Each persona carries both its Arabic `name`
 * (rendered in the UI as the primary label) and its `latin` form
 * (rendered as a subtitle, and used as the avatar filename key).
 *
 * The map is intentionally MANY-to-ONE: multiple backend agents collapse
 * into a single persona. When an event's `source` doesn't have a mapping
 * we surface the System role — losing coverage beats silent drops.
 */

export type AgentRole = "Saqr" | "Qalam" | "Amin" | "Sifr" | "System";

const AGENT_ID_TO_ROLE: Record<string, AgentRole> = {
  // Saqr — Field Ops: discovers work in the wild.
  "job-matcher": "Saqr",
  "github": "Saqr",
  "issue-hunter": "Saqr",
  "linkedin": "Saqr",

  // Qalam — Creative Lead: ghostwrites posts, articles, social drafts.
  "content": "Qalam",

  // Amin — Compliance: guardian of Salah's professional documents.
  // Owns resume generation + ATS / visa / deadline checks.
  "resume": "Amin",
  "bureaucrat": "Amin",
  "ats-scanner": "Amin",

  // System — infrastructure events.
  "system": "System",
  "telegram": "System",
  "scheduler": "System",
};

/** Persona metadata. Used by the chatter bubbles, role cards, Sifr brief. */
export interface PersonaMeta {
  /** Arabic display name — primary label throughout the UI. */
  name: string;
  /** Latin transliteration — subtitle label, avatar filename key. */
  latin: string;
  /** One-line department ("Field Ops", "Creative Lead", ...). */
  role: string;
  /** Single-char fallback avatar glyph (shown if PNG fails to load). */
  letter: string;
  // Tailwind colour tokens, pre-composed strings.
  solid: string;
  bubble: string;
  text: string;
  border: string;
  ring: string;
}

// Dual-mode colour strategy: the `text` / `border` / `bubble` tokens are
// composed with `dark:` variants so the UI stays legible on both a white
// and a near-black background. The deeper shades (-700 / -800) are the
// light-mode foreground; the pale neon shades (-300 / -200) are the
// dark-mode look we originally designed. Solid avatar backgrounds and
// ring shadows stay unchanged — they read fine in either theme.
export const PERSONA: Record<AgentRole, PersonaMeta> = {
  Saqr: {
    name: "صقر",
    latin: "Saqr",
    role: "Field Ops",
    letter: "ص",
    solid: "bg-sky-500",
    bubble: "bg-sky-500/15 dark:bg-sky-500/10",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-500/50 dark:border-sky-500/30",
    ring: "ring-sky-500/40 dark:ring-sky-500/30",
  },
  Qalam: {
    name: "قلم",
    latin: "Qalam",
    role: "Creative Lead",
    letter: "ق",
    solid: "bg-rose-500",
    bubble: "bg-rose-500/15 dark:bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-500/50 dark:border-rose-500/30",
    ring: "ring-rose-500/40 dark:ring-rose-500/30",
  },
  Amin: {
    name: "أمين",
    latin: "Amin",
    role: "Compliance",
    letter: "أ",
    solid: "bg-amber-500",
    bubble: "bg-amber-500/20 dark:bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-500/60 dark:border-amber-500/30",
    ring: "ring-amber-500/50 dark:ring-amber-500/30",
  },
  Sifr: {
    // The lead / Level Zero. Violet/indigo supervisor palette.
    name: "صفر",
    latin: "Sifr",
    role: "Lead",
    letter: "٠",
    solid: "bg-gradient-to-br from-violet-500 to-indigo-600",
    bubble: "bg-violet-500/15 dark:bg-violet-500/10",
    text: "text-violet-700 dark:text-violet-200",
    border: "border-violet-500/60 dark:border-violet-500/40",
    ring: "ring-violet-500/50 dark:ring-violet-500/40",
  },
  System: {
    name: "System",
    latin: "System",
    role: "Infrastructure",
    letter: "•",
    solid: "bg-zinc-600",
    bubble: "bg-zinc-500/15 dark:bg-zinc-500/10",
    text: "text-zinc-700 dark:text-zinc-300",
    border: "border-zinc-500/50 dark:border-zinc-500/30",
    ring: "ring-zinc-500/40 dark:ring-zinc-500/30",
  },
};

/**
 * Back-compat shim — older components imported ROLE_COLOR. Kept as a
 * thin projection over PERSONA so nothing else breaks during renames.
 */
export const ROLE_COLOR: Record<AgentRole, { bg: string; text: string; border: string }> =
  Object.fromEntries(
    (Object.keys(PERSONA) as AgentRole[]).map((r) => [
      r,
      { bg: PERSONA[r].bubble, text: PERSONA[r].text, border: PERSONA[r].border },
    ])
  ) as Record<AgentRole, { bg: string; text: string; border: string }>;

/**
 * Look up the persona for a backend agent id. Falls back to "System" for
 * unknown ids so we never render an empty pill.
 */
export function toAlias(agentId: string): AgentRole {
  return AGENT_ID_TO_ROLE[agentId] ?? "System";
}

/** Inverse lookup: list all backend agent ids that map to a given persona. */
export function fromAlias(alias: AgentRole): string[] {
  return Object.entries(AGENT_ID_TO_ROLE)
    .filter(([, role]) => role === alias)
    .map(([id]) => id);
}
