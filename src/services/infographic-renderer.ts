/**
 * Infographic renderer — turns a `GemImageSlots` object into a 1080×1350
 * PNG via Satori (JSX → SVG) + Resvg (SVG → PNG). Code blocks get
 * tokenised by Shiki server-side first so each character span carries
 * its theme colour through to the final raster.
 *
 * Fonts are loaded once and cached at module level. They live in
 * `node_modules/@fontsource/...` (woff format — Satori uses opentype.js
 * which supports woff/ttf/otf, just not woff2). If we ever need woff2
 * we'd have to add a brotli decode step.
 *
 * The renderer is pure — no DB writes, no logging. Callers (the
 * gem-mining route) own persistence + activity records.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { codeToTokens } from "shiki";
import {
  BondInfographic,
  type ShikiToken,
} from "@/components/infographics/bond-infographic";
import type { GemImageSlots } from "@/agents/schemas/gem-image-slots.schema";

const FONT_BASE = path.join(process.cwd(), "node_modules", "@fontsource");
const INTER_REGULAR = path.join(FONT_BASE, "inter/files/inter-latin-400-normal.woff");
const INTER_BOLD = path.join(FONT_BASE, "inter/files/inter-latin-700-normal.woff");
const JETBRAINS_REGULAR = path.join(
  FONT_BASE,
  "jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff"
);

// Bond brand logo — loaded once at first render, cached for the lifetime
// of the process. We try a few file extensions so the user can drop
// either a PNG (preferred for raster fidelity) or an SVG (vector) at
// the same path stem. Missing file → null → JSX falls back to its
// inline block-mark approximation. No throw, no log spam.
const BRAND_DIR = path.join(process.cwd(), "public", "brand");
const BOND_LOGO_CANDIDATES = [
  { abs: path.join(BRAND_DIR, "bond-logo.png"), mime: "image/png" },
  { abs: path.join(BRAND_DIR, "bond-logo.svg"), mime: "image/svg+xml" },
  { abs: path.join(BRAND_DIR, "bond-logo.jpg"), mime: "image/jpeg" },
];
// Salah's author avatar — same probing pattern as the Bond logo. Used
// by the JSX template's footer to replace the "SN" initials chip when
// present. Missing → JSX falls back to initials.
const AVATAR_CANDIDATES = [
  { abs: path.join(BRAND_DIR, "salah-avatar.jpg"), mime: "image/jpeg" },
  { abs: path.join(BRAND_DIR, "salah-avatar.png"), mime: "image/png" },
  { abs: path.join(BRAND_DIR, "salah-avatar.jpeg"), mime: "image/jpeg" },
];

/**
 * Pull width/height out of a PNG buffer's IHDR chunk. PNGs always have
 * the IHDR as the first chunk after the 8-byte signature, with width
 * at bytes 16-19 and height at bytes 20-23 (big-endian uint32). Returns
 * null for non-PNG input so callers can fall back to a default aspect.
 */
function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // PNG signature: \x89 P N G \r \n \x1a \n
  if (buf[0] !== 0x89 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

/** Satori's font config shape. We pin font weights so Inter Bold is
 *  picked up automatically when JSX uses `fontWeight: 700`. */
interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

let cachedFonts: SatoriFont[] | null = null;

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

// Three states for the Bond logo cache: undefined = not yet probed,
// object = loaded successfully (data URI + native dimensions), null =
// probed but not on disk. We probe once per process; the JSX renders
// the inline fallback when null. Native dimensions let the JSX render
// the logo at its real aspect ratio instead of squishing it to square.
interface CachedImage {
  dataUri: string;
  width: number;
  height: number;
}
let cachedBondLogo: CachedImage | null | undefined;
let cachedAvatar: CachedImage | null | undefined;

async function loadBondLogo(): Promise<CachedImage | null> {
  if (cachedBondLogo !== undefined) return cachedBondLogo;
  for (const candidate of BOND_LOGO_CANDIDATES) {
    try {
      const bytes = await readFile(candidate.abs);
      const dims = readPngDimensions(bytes);
      cachedBondLogo = {
        dataUri: `data:${candidate.mime};base64,${bytes.toString("base64")}`,
        // Default 1:1 if dimensions can't be parsed (non-PNG); JSX
        // accepts these and the image just renders square.
        width: dims?.width ?? 100,
        height: dims?.height ?? 100,
      };
      return cachedBondLogo;
    } catch {
      // Try the next candidate extension.
    }
  }
  cachedBondLogo = null;
  return null;
}

async function loadAvatar(): Promise<CachedImage | null> {
  if (cachedAvatar !== undefined) return cachedAvatar;
  for (const candidate of AVATAR_CANDIDATES) {
    try {
      const bytes = await readFile(candidate.abs);
      const dims = readPngDimensions(bytes);
      cachedAvatar = {
        dataUri: `data:${candidate.mime};base64,${bytes.toString("base64")}`,
        // JPEGs won't parse via readPngDimensions; default to 1:1
        // since the JSX crops the avatar to a circle anyway.
        width: dims?.width ?? 100,
        height: dims?.height ?? 100,
      };
      return cachedAvatar;
    } catch {
      // Try the next candidate extension.
    }
  }
  cachedAvatar = null;
  return null;
}

export interface RenderInfographicResult {
  png: Buffer;
  /** End-to-end render time in ms — useful for cost/perf logging at
   *  the caller. Local render so this is the *only* "cost" — no API. */
  durationMs: number;
}

/**
 * Render a 1080×1350 PNG from the provided slots.
 *
 * Throws if Satori or Resvg can't produce an image — the gem-mining
 * route catches and logs.
 */
export async function renderInfographic(
  slots: GemImageSlots
): Promise<RenderInfographicResult> {
  // bumpForReload — touched to invalidate Turbopack's module cache
  // when bond-infographic.tsx changes don't propagate through the
  // nested import chain. Cheap no-op.
  const start = Date.now();
  const [fonts, bondLogo, avatar] = await Promise.all([
    loadFonts(),
    loadBondLogo(),
    loadAvatar(),
  ]);

  // 1. Tokenise the code via Shiki. github-dark is a neutral dark
  //    theme that reads well on the slate background — its blues and
  //    purples coexist with the cyan/amber brand without fighting it.
  const tokenised = await codeToTokens(slots.code_snippet, {
    lang: slots.code_language,
    theme: "github-dark",
  });

  // Shiki's token shape: tokens[][] where each inner item has
  // { content, color, fontStyle? }. Reshape to our renderer's
  // ShikiToken interface (which is already a subset).
  const codeTokens: { tokens: ShikiToken[][]; bg?: string; fg?: string } = {
    tokens: tokenised.tokens.map((line) =>
      line.map((tok) => ({
        content: tok.content,
        color: tok.color,
        fontStyle: tok.fontStyle,
      }))
    ),
    bg: tokenised.bg,
    fg: tokenised.fg,
  };

  // 2. JSX → SVG via Satori.
  const svg = await satori(
    React.createElement(BondInfographic, {
      slots,
      codeTokens,
      bondLogo,
      avatar,
    }),
    {
      width: 1080,
      height: 1350,
      // Satori expects fonts typed as its own internal shape; the
      // structural fields (name, data, weight, style) match ours.
      fonts: fonts as unknown as Parameters<typeof satori>[1]["fonts"],
    }
  );

  // 3. SVG → PNG via Resvg. fitTo locks the output width at 1080
  //    so the PNG matches the JSX viewport exactly.
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } })
    .render()
    .asPng();

  return {
    png,
    durationMs: Date.now() - start,
  };
}
