import path from "node:path";

/**
 * Carousel brand registry. Each gold-mine project resolves to exactly
 * one brand via case-insensitive substring match on `CarouselDeck.project`.
 * The first matching entry wins; `defaultBrand` falls through.
 *
 * Adding a new brand is a one-line entry here plus a logo PNG drop
 * into `public/brand/`. Logo loading is the renderer's job — this
 * module only describes WHERE the asset might live.
 *
 * Phase 1 ships Bond + default. Per-repo Trivia / WinchKSA logos are
 * deferred (the user prefers shipping Bond-only first; the default
 * brand handles every other project with the Level Zero amber-square
 * mark until real logos arrive).
 */

const BRAND_DIR = path.join(process.cwd(), "public", "brand");

export interface BrandColors {
  /** Slide background. */
  bg: string;
  /** Card / panel background. */
  card: string;
  /** Card border. */
  cardBorder: string;
  /** Primary accent — used for the brand label, swipe-hint, avatar
   *  border. */
  primary: string;
  /** Secondary accent — used for the diamond bullets, focal callouts. */
  secondary: string;
  /** Body text. */
  text: string;
  /** De-emphasised text (subtitle, footer tagline). */
  textDim: string;
}

export interface BrandLogoCandidate {
  abs: string;
  mime: string;
}

export interface CarouselBrand {
  /** Stable identifier — used for telemetry and DB persistence. */
  id: string;
  /** Display name on slides. */
  name: string;
  /** Tag line shown above the title on the cover slide ("// engineering
   *  case study" by default — matches the existing infographic). */
  tagline: string;
  /** Default footer line when `CarouselDeck.footerText` is omitted. */
  defaultFooterText: string;
  /** Tier-1 visual brand colours. */
  colors: BrandColors;
  /** Possible logo file paths (probed in order by the renderer).
   *  Empty array = no logo asset; renderer falls back to a brand mark. */
  logoCandidates: BrandLogoCandidate[];
  /** Case-insensitive substring matched against `CarouselDeck.project`. */
  matchTokens: string[];
}

const SHARED_PALETTE = {
  bg: "#0f172a",
  card: "#1e293b",
  cardBorder: "#334155",
  text: "#f1f5f9",
  textDim: "#94a3b8",
  cyan: "#22d3ee",
  amber: "#fbbf24",
} as const;

const bondBrand: CarouselBrand = {
  id: "bond",
  name: "Bond",
  tagline: "// engineering case study",
  defaultFooterText: "iOS · Flutter · Bond Framework",
  colors: {
    bg: SHARED_PALETTE.bg,
    card: SHARED_PALETTE.card,
    cardBorder: SHARED_PALETTE.cardBorder,
    primary: SHARED_PALETTE.cyan,
    secondary: SHARED_PALETTE.amber,
    text: SHARED_PALETTE.text,
    textDim: SHARED_PALETTE.textDim,
  },
  logoCandidates: [
    { abs: path.join(BRAND_DIR, "bond-logo.png"), mime: "image/png" },
    { abs: path.join(BRAND_DIR, "bond-logo.svg"), mime: "image/svg+xml" },
    { abs: path.join(BRAND_DIR, "bond-logo.jpg"), mime: "image/jpeg" },
  ],
  matchTokens: ["bond"],
};

const defaultBrand: CarouselBrand = {
  id: "default",
  name: "Level Zero",
  tagline: "// engineering case study",
  defaultFooterText: "Senior Mobile Engineer · Flutter · iOS",
  colors: {
    bg: SHARED_PALETTE.bg,
    card: SHARED_PALETTE.card,
    cardBorder: SHARED_PALETTE.cardBorder,
    primary: SHARED_PALETTE.cyan,
    secondary: SHARED_PALETTE.amber,
    text: SHARED_PALETTE.text,
    textDim: SHARED_PALETTE.textDim,
  },
  logoCandidates: [],
  matchTokens: [],
};

/** Ordered registry — first match wins. */
const BRANDS: CarouselBrand[] = [bondBrand];

/**
 * Resolve a project name to a brand. Substring match is intentional
 * so "Bond Form", "Bond Network", and "Bond Analytics" all map to
 * the single Bond brand. Falls through to `defaultBrand` when nothing
 * matches.
 */
export function resolveBrand(project: string): CarouselBrand {
  const haystack = project.toLowerCase();
  for (const brand of BRANDS) {
    if (brand.matchTokens.some((token) => haystack.includes(token))) {
      return brand;
    }
  }
  return defaultBrand;
}

export { bondBrand, defaultBrand };

/**
 * Map a repo identifier (e.g. `flutterbond/bond-core:packages/form`,
 * `devmatrash/trivia`, or just `bond-core`) to the display project
 * name the carousel schema expects (e.g. `Bond Form`, `Trivia Game`).
 *
 * Substring matching downstream (`resolveBrand`) tolerates variations,
 * but giving Layla a clean starting point makes the cover slide read
 * like a brand artefact, not a slug.
 */
export function projectNameFromRepo(repoName: string): string {
  if (/bond.*form/i.test(repoName)) return "Bond Form";
  if (/bond.*network/i.test(repoName)) return "Bond Network";
  if (/bond.*analytics/i.test(repoName)) return "Bond Analytics";
  if (/bond/i.test(repoName)) return "Bond";
  if (/trivia/i.test(repoName)) return "Trivia Game";
  if (/winch/i.test(repoName)) return "WinchKSA";
  // Fall back: take the slug after the last `/`, drop any `:subpath`,
  // and title-case dash/underscore-separated parts.
  const slug = (repoName.split("/").pop() || repoName).split(":")[0];
  return slug
    .split(/[-_]/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}
