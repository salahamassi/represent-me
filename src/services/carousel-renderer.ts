/**
 * Carousel renderer — turns a `CarouselDeck` into N PNG buffers (one
 * per slide) via Satori (JSX → SVG) + Resvg (SVG → PNG). Pairs with
 * `carousel-pdf-service.ts` which assembles the buffers into a
 * multi-page PDF for LinkedIn document upload.
 *
 * Pure function — no DB, no Claude, no logging. Callers (the carousel
 * API route, the bus subscriber) own persistence + activity records.
 *
 * Mirrors the asset-loading cache pattern from `infographic-renderer.ts`
 * so fonts + brand assets are read once per process. Code slides get
 * pre-tokenised by Shiki here so the JSX stays sync.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { codeToTokens } from "shiki";
import type {
  CarouselDeck,
  CarouselSlide,
  CodeSlide,
} from "@/agents/schemas/carousel-deck.schema";
import { CarouselCoverSlide } from "@/components/carousels/carousel-cover-slide";
import {
  CarouselCodeSlide,
  type ShikiTokenisedCode,
} from "@/components/carousels/carousel-code-slide";
import { CarouselWhySlide } from "@/components/carousels/carousel-why-slide";
import { CarouselOutroSlide } from "@/components/carousels/carousel-outro-slide";
import type { CarouselImageAsset } from "@/components/carousels/shared";
import {
  resolveBrand,
  type CarouselBrand,
  type BrandLogoCandidate,
} from "@/lib/carousel-brands";

const FONT_BASE = path.join(process.cwd(), "node_modules", "@fontsource");
const INTER_REGULAR = path.join(FONT_BASE, "inter/files/inter-latin-400-normal.woff");
const INTER_BOLD = path.join(FONT_BASE, "inter/files/inter-latin-700-normal.woff");
const JETBRAINS_REGULAR = path.join(
  FONT_BASE,
  "jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff"
);

const BRAND_DIR = path.join(process.cwd(), "public", "brand");
const AVATAR_CANDIDATES: BrandLogoCandidate[] = [
  { abs: path.join(BRAND_DIR, "salah-avatar.jpg"), mime: "image/jpeg" },
  { abs: path.join(BRAND_DIR, "salah-avatar.png"), mime: "image/png" },
  { abs: path.join(BRAND_DIR, "salah-avatar.jpeg"), mime: "image/jpeg" },
];

interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

let cachedFonts: SatoriFont[] | null = null;
const cachedBrandLogos = new Map<string, CarouselImageAsset | null>();
let cachedAvatar: CarouselImageAsset | null | undefined;

async function loadFonts(): Promise<SatoriFont[]> {
  if (cachedFonts) return cachedFonts;
  const [interRegular, interBold, jetbrainsRegular] = await Promise.all([
    readFile(INTER_REGULAR),
    readFile(INTER_BOLD),
    readFile(JETBRAINS_REGULAR),
  ]);
  cachedFonts = [
    { name: "Inter", data: interRegular, weight: 400, style: "normal" },
    { name: "Inter", data: interBold, weight: 700, style: "normal" },
    { name: "JetBrains Mono", data: jetbrainsRegular, weight: 400, style: "normal" },
  ];
  return cachedFonts;
}

/** Width/height from a PNG's IHDR chunk. Returns null for non-PNG so
 *  callers can default to a square aspect. */
function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

async function probeImageAsset(
  candidates: BrandLogoCandidate[]
): Promise<CarouselImageAsset | null> {
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate.abs);
      const dims = readPngDimensions(bytes);
      return {
        dataUri: `data:${candidate.mime};base64,${bytes.toString("base64")}`,
        width: dims?.width ?? 100,
        height: dims?.height ?? 100,
      };
    } catch {
      // Try the next candidate extension.
    }
  }
  return null;
}

async function loadBrandLogo(
  brand: CarouselBrand
): Promise<CarouselImageAsset | null> {
  if (cachedBrandLogos.has(brand.id)) {
    return cachedBrandLogos.get(brand.id) ?? null;
  }
  if (brand.logoCandidates.length === 0) {
    cachedBrandLogos.set(brand.id, null);
    return null;
  }
  const asset = await probeImageAsset(brand.logoCandidates);
  cachedBrandLogos.set(brand.id, asset);
  return asset;
}

async function loadAvatar(): Promise<CarouselImageAsset | null> {
  if (cachedAvatar !== undefined) return cachedAvatar;
  cachedAvatar = await probeImageAsset(AVATAR_CANDIDATES);
  return cachedAvatar;
}

/** Max characters per visual code line. The code window is 1080 −
 *  2×60 (slide padding) − 2×32 (window padding) = 896px wide; with
 *  JetBrains Mono at 22px the actual visual fit is ~64 chars before
 *  Satori's flex layout starts clipping or colliding tokens. Lines
 *  over this cap are wrapped via `wrapTokenLine`. */
const MAX_LINE_CHARS = 64;
/** Hanging indent prepended to wrap-continuation rows so the reader
 *  can tell at a glance that a row is a continuation, not a sibling
 *  statement. Two spaces matches what most editors render for soft
 *  wrap. */
const WRAP_CONTINUATION_INDENT = "  ";

interface MutableShikiToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

/** Total visible width of a token row in characters. */
function lineCharCount(line: MutableShikiToken[]): number {
  let n = 0;
  for (const tok of line) n += tok.content.length;
  return n;
}

/** Pick a natural break index for a string. Returns the byte offset
 *  AFTER which we'll split (so the prefix is `s.slice(0, idx)`). The
 *  preferred break points roll from "comment boundary" → punctuation
 *  separators → closing brackets → member-access dot → any space.
 *  Returns `-1` if no acceptable break exists below `maxChars` and
 *  the caller should fall through to camelCase / hard-split. */
function findBreakIndex(s: string, maxChars: number): number {
  if (s.length <= maxChars) return -1;
  const window = s.slice(0, maxChars);
  // Prefer breaking at the start of a comment so the comment lands on
  // its own row — matches how devs read wrapped code in editors.
  const commentMatch = window.lastIndexOf(" //");
  if (commentMatch > 0) return commentMatch + 1; // split at the space, comment moves down
  const commaMatch = window.lastIndexOf(", ");
  if (commaMatch > 0) return commaMatch + 2;
  const semiMatch = window.lastIndexOf("; ");
  if (semiMatch > 0) return semiMatch + 2;
  // Closing brackets are natural break points in code — splitting
  // after `)` keeps the call expression intact and pushes only the
  // trailing punctuation/chain to the next row.
  const closeBracketMatch = Math.max(
    window.lastIndexOf(")"),
    window.lastIndexOf("]"),
    window.lastIndexOf("}")
  );
  if (closeBracketMatch > 0) return closeBracketMatch + 1;
  // Member-access dot — splitting before the dot keeps the receiver
  // on one row and the chained call on the next, which reads cleanly
  // (`CachePolicy` / `.cacheElseNetwork`).
  const dotMatch = window.lastIndexOf(".");
  if (dotMatch > 0) return dotMatch;
  const spaceMatch = window.lastIndexOf(" ");
  if (spaceMatch > 0) return spaceMatch + 1;
  return -1;
}

/** Last-resort split for tokens with no natural break (e.g. a long
 *  identifier). Prefer a lowercase→uppercase camelCase boundary —
 *  `cacheElseNetwork` → split before `Network` rather than mid-word.
 *  Returns -1 when no boundary exists below `maxChars`. */
function findCamelCaseBreak(s: string, maxChars: number): number {
  const window = s.slice(0, Math.min(maxChars, s.length));
  for (let i = window.length - 1; i > 0; i--) {
    const prev = window.charCodeAt(i - 1);
    const curr = window.charCodeAt(i);
    const prevIsLower = prev >= 97 && prev <= 122;
    const currIsUpper = curr >= 65 && curr <= 90;
    if (prevIsLower && currIsUpper) return i;
  }
  return -1;
}

/** Split a tokenised line into N visual rows by walking the tokens
 *  and emitting a new row whenever the cumulative content exceeds the
 *  break point. Strategy:
 *    1. If a token doesn't fit but fits whole as a continuation row,
 *       flush current and put the token on the next row whole. This
 *       produces the cleanest splits (e.g. `CachePolicy` /
 *       `.cacheElseNetwork);` instead of mid-token cuts).
 *    2. If the token is too long to fit a continuation row alone,
 *       split it at a natural break (comment, comma, semicolon,
 *       closing bracket, dot, space).
 *    3. If no natural break, fall back to a camelCase boundary so we
 *       don't split mid-word.
 *    4. Last resort: hard split at the budget.
 *  The camelCase fallback prevents the worst-case mid-identifier
 *  split (`cacheElseNet` / `work);`). */
function wrapTokenLine(
  line: MutableShikiToken[],
  parentIndent?: string
): MutableShikiToken[][] {
  // Recursion sets parentIndent so we know to mark every emitted row
  // as a continuation of the outer logical line.
  const isContinuationCall = parentIndent !== undefined;
  // Indent of the original logical line (preserved on each
  // continuation so wrapped code stays visually anchored). When this
  // call is a recursion on a tail token that has no leading
  // whitespace of its own, fall back to the parent's indent.
  const leadingIndent =
    parentIndent ?? (line[0]?.content.match(/^\s*/)?.[0]) ?? "";
  // Continuation rows spend chars on the indent — they have less
  // budget than the first row.
  const continuationOverhead =
    leadingIndent.length + WRAP_CONTINUATION_INDENT.length;
  const continuationBudget = MAX_LINE_CHARS - continuationOverhead;

  // Short-circuit: line fits without splitting. In a recursive
  // continuation call, we still need to prepend the indent so the
  // tail row aligns under the original line.
  if (lineCharCount(line) <= MAX_LINE_CHARS) {
    if (isContinuationCall) {
      return [
        [
          { content: leadingIndent + WRAP_CONTINUATION_INDENT, color: undefined },
          ...line,
        ],
      ];
    }
    return [line];
  }

  const rows: MutableShikiToken[][] = [];
  let current: MutableShikiToken[] = [];
  let currentLen = 0;

  // Every flush after the first emits a continuation row (with
  // indent). Recursive calls treat ALL their flushes as continuations
  // because the whole call represents tail content of an outer line.
  const flush = () => {
    if (current.length === 0) return;
    const isContinuationRow = isContinuationCall || rows.length > 0;
    if (isContinuationRow) {
      current.unshift({
        content: leadingIndent + WRAP_CONTINUATION_INDENT,
        color: undefined,
      });
    }
    rows.push(current);
    current = [];
    currentLen = 0;
  };

  for (const token of line) {
    // Token fits in the current row.
    if (currentLen + token.content.length <= MAX_LINE_CHARS) {
      current.push(token);
      currentLen += token.content.length;
      continue;
    }

    // Strategy 1: token doesn't fit, but the whole token fits in a
    // continuation row alone AND the current row has content. Flush
    // the current row and put the token whole on the next row. This
    // is the cleanest split for "method-chain" cases like
    // `CachePolicy` + `.cacheElseNetwork);`.
    if (
      current.length > 0 &&
      token.content.length > 0 &&
      token.content.length <= continuationBudget
    ) {
      flush();
      current.push(token);
      currentLen = token.content.length;
      continue;
    }

    // Strategy 2: token is too long even for a continuation row.
    // Try to split inside the token at a natural break.
    const remaining = MAX_LINE_CHARS - currentLen;
    const innerBudget = remaining > 0 ? remaining : continuationBudget;

    const breakIdx = findBreakIndex(token.content, innerBudget);
    if (breakIdx > 0) {
      const head: MutableShikiToken = {
        content: token.content.slice(0, breakIdx),
        color: token.color,
        fontStyle: token.fontStyle,
      };
      const tail: MutableShikiToken = {
        content: token.content.slice(breakIdx),
        color: token.color,
        fontStyle: token.fontStyle,
      };
      current.push(head);
      flush();
      // Tail might still be too long — recurse on a single-token
      // line. Pass the parent's indent so continuation rows align
      // under the original line.
      const tailRows = wrapTokenLine([tail], leadingIndent);
      for (const r of tailRows) rows.push(r);
      currentLen = 0;
      continue;
    }

    // Strategy 3: no natural break — try a camelCase boundary.
    const camelIdx = findCamelCaseBreak(token.content, innerBudget);
    const splitIdx = camelIdx > 0 ? camelIdx : innerBudget;
    if (splitIdx > 0 && splitIdx < token.content.length) {
      const head: MutableShikiToken = {
        content: token.content.slice(0, splitIdx),
        color: token.color,
        fontStyle: token.fontStyle,
      };
      const tail: MutableShikiToken = {
        content: token.content.slice(splitIdx),
        color: token.color,
        fontStyle: token.fontStyle,
      };
      current.push(head);
      flush();
      const tailRows = wrapTokenLine([tail], leadingIndent);
      for (const r of tailRows) rows.push(r);
      currentLen = 0;
      continue;
    }

    // Strategy 4 (fallback) — just push the token even if oversize.
    // Better to overflow visibly on one row than lose content.
    current.push(token);
    currentLen += token.content.length;
  }

  flush();
  return rows.length > 0 ? rows : [line];
}

/** Tokenise a code slide via Shiki's `github-dark` theme — same theme
 *  as the existing single-PNG infographic so palettes stay consistent
 *  across both surfaces. Long lines are pre-wrapped here so the JSX
 *  renders one Shiki row per visual row — Satori's flex layout
 *  collides overflowing tokens otherwise. */
async function tokeniseCode(slide: CodeSlide): Promise<ShikiTokenisedCode> {
  const result = await codeToTokens(slide.code, {
    lang: slide.language,
    theme: "github-dark",
  });
  const wrapped: MutableShikiToken[][] = [];
  for (const line of result.tokens) {
    const normalised: MutableShikiToken[] = line.map((tok) => ({
      content: tok.content,
      color: tok.color,
      fontStyle: tok.fontStyle,
    }));
    for (const row of wrapTokenLine(normalised)) wrapped.push(row);
  }
  return {
    tokens: wrapped,
    bg: result.bg,
    fg: result.fg,
  };
}

export interface RenderedSlide {
  /** 1-indexed position in the deck. */
  index: number;
  /** Slide type, propagated for caller-side logging. */
  type: CarouselSlide["type"];
  /** Rendered PNG bytes — 1080×1350. */
  png: Buffer;
}

export interface CarouselRenderResult {
  slides: RenderedSlide[];
  brand: CarouselBrand;
  /** End-to-end render time across all slides in ms. */
  durationMs: number;
}

/**
 * Render a full deck to PNGs. Iterates serially (Satori is CPU-bound;
 * parallelism doesn't help and slightly inflates peak memory on the
 * font cache).
 */
export async function renderCarousel(
  deck: CarouselDeck
): Promise<CarouselRenderResult> {
  const start = Date.now();
  const brand = resolveBrand(deck.project);
  const [fonts, brandLogo, avatar] = await Promise.all([
    loadFonts(),
    loadBrandLogo(brand),
    loadAvatar(),
  ]);

  const total = deck.slides.length;
  const slides: RenderedSlide[] = [];

  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i];
    const index = i + 1;

    // Tokenise upfront for code slides so the JSX render stays sync.
    const codeTokens =
      slide.type === "code" ? await tokeniseCode(slide) : null;

    const element = renderSlideElement({
      slide,
      brand,
      project: deck.project,
      brandLogo,
      avatar,
      slideIndex: index,
      slideTotal: total,
      footerText: deck.footerText,
      codeTokens,
    });

    const svg = await satori(element, {
      width: 1080,
      height: 1350,
      fonts: fonts as unknown as Parameters<typeof satori>[1]["fonts"],
    });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } })
      .render()
      .asPng();

    slides.push({ index, type: slide.type, png });
  }

  return {
    slides,
    brand,
    durationMs: Date.now() - start,
  };
}

interface SlideRenderInputs {
  slide: CarouselSlide;
  brand: CarouselBrand;
  project: string;
  brandLogo: CarouselImageAsset | null;
  avatar: CarouselImageAsset | null;
  slideIndex: number;
  slideTotal: number;
  footerText?: string;
  /** Pre-tokenised code — non-null only for code slides. */
  codeTokens: ShikiTokenisedCode | null;
}

function renderSlideElement(inputs: SlideRenderInputs): React.ReactElement {
  const { slide } = inputs;
  switch (slide.type) {
    case "cover":
      return React.createElement(CarouselCoverSlide, {
        slide,
        brand: inputs.brand,
        project: inputs.project,
        brandLogo: inputs.brandLogo,
        avatar: inputs.avatar,
        slideIndex: inputs.slideIndex,
        slideTotal: inputs.slideTotal,
        footerText: inputs.footerText,
      });
    case "code":
      if (!inputs.codeTokens) {
        throw new Error(
          "Internal: code slide reached renderSlideElement without tokens."
        );
      }
      return React.createElement(CarouselCodeSlide, {
        slide,
        brand: inputs.brand,
        project: inputs.project,
        brandLogo: inputs.brandLogo,
        avatar: inputs.avatar,
        slideIndex: inputs.slideIndex,
        slideTotal: inputs.slideTotal,
        footerText: inputs.footerText,
        codeTokens: inputs.codeTokens,
      });
    case "why":
      return React.createElement(CarouselWhySlide, {
        slide,
        brand: inputs.brand,
        project: inputs.project,
        brandLogo: inputs.brandLogo,
        avatar: inputs.avatar,
        slideIndex: inputs.slideIndex,
        slideTotal: inputs.slideTotal,
        footerText: inputs.footerText,
      });
    case "outro":
      return React.createElement(CarouselOutroSlide, {
        slide,
        brand: inputs.brand,
        project: inputs.project,
        brandLogo: inputs.brandLogo,
        avatar: inputs.avatar,
        slideIndex: inputs.slideIndex,
        slideTotal: inputs.slideTotal,
        footerText: inputs.footerText,
      });
  }
}
