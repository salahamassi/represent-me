/**
 * BondInfographic — JSX template rendered by Satori into a 1080×1350
 * PNG that ships alongside each gem-mined LinkedIn post. Layout
 * mirrors the Osama-style "engineering case study" carousel: small
 * branded header, big technical title, syntax-highlighted code block
 * (the visual centrepiece), 3-4 "Why?" bullets, and an author footer.
 *
 * Satori notes — every container with multiple children must declare
 * `display: "flex"` (Satori errors otherwise). All measurements are
 * absolute px because Satori doesn't support most relative units.
 *
 * The component is pure presentation — `slots` comes from Layla's
 * structured output, `codeTokens` comes from a server-side Shiki pass
 * the renderer runs before invoking Satori.
 */

import React from "react";
import type { GemImageSlots } from "@/agents/schemas/gem-image-slots.schema";

/** A single Shiki-tokenised character span. Aligns with Shiki's
 *  `codeToTokens` output: `{ content, color, fontStyle? }`. */
export interface ShikiToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

/** Image asset loaded by the renderer with native dimensions, so the
 *  JSX can render it at its real aspect ratio rather than squishing
 *  it to a forced size. */
export interface InfographicImageAsset {
  dataUri: string;
  width: number;
  height: number;
}

export interface BondInfographicProps {
  slots: GemImageSlots;
  /** Pre-tokenised code from `shiki.codeToTokens()`. Each inner array
   *  is one source line; each token has its own color from the theme. */
  codeTokens: { tokens: ShikiToken[][]; bg?: string; fg?: string };
  /** Bond logo loaded from `public/brand/bond-logo.{png,svg,jpg}`.
   *  When present + brand is bond, renders at native aspect. When
   *  null + brand is bond, the inline block-mark fallback renders.
   *  Level Zero brand path doesn't consume this. */
  bondLogo?: InfographicImageAsset | null;
  /** Salah's author avatar from `public/brand/salah-avatar.{jpg,png}`.
   *  When present, replaces the "SN" initials chip in the footer.
   *  When null, the initials chip renders as before. */
  avatar?: InfographicImageAsset | null;
}

// Brand palette — matches Ghada's cyan+amber SVG aesthetic so the two
// image surfaces feel like the same product.
const COLORS = {
  bg: "#0f172a", // slate-900
  card: "#1e293b", // slate-800
  cardBorder: "#334155", // slate-700
  cyan: "#22d3ee", // primary accent
  cyanDim: "#67e8f9", // dimmer cyan for sublabels
  amber: "#fbbf24", // focal/secondary accent
  text: "#f1f5f9", // slate-100
  textDim: "#94a3b8", // slate-400
  textFaint: "#64748b", // slate-500
  // Bond brand — sampled from the Bond logo (pink "B" + cyan glyph
  // on navy). Used by the inline-fallback Bond mark when the actual
  // logo asset isn't on disk yet.
  bondPink: "#EE5266",
  bondNavy: "#2A2470",
  bondCyan: "#22D3EE",
};

/** Detect whether a project name should render with the Bond brand. */
function isBondBrand(project: string): boolean {
  return project.toLowerCase().includes("bond");
}

export function BondInfographic({
  slots,
  codeTokens,
  bondLogo,
  avatar,
}: BondInfographicProps) {
  const bondBrand = isBondBrand(slots.project);
  // Bond logo target height — width derives from the asset's native
  // aspect so the logo never squishes. 56 matches the Level Zero
  // amber-square placeholder for visual weight parity.
  const BOND_LOGO_HEIGHT = 56;
  const bondLogoWidth = bondLogo
    ? Math.round((BOND_LOGO_HEIGHT * bondLogo.width) / bondLogo.height)
    : BOND_LOGO_HEIGHT;
  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        display: "flex",
        flexDirection: "column",
        backgroundColor: COLORS.bg,
        padding: 60,
        fontFamily: "Inter",
        color: COLORS.text,
      }}
    >
      {/* HEADER — left: brand label (suppressed for Bond posts so the
          Bond brand owns the header outright) / right: project chip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 36,
        }}
      >
        {bondBrand ? (
          // Bond brand — left side is just the engineering-case-study
          // tagline. No "LEVEL ZERO" wordmark on Bond posts; the Bond
          // logo + project name on the right carries the brand.
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 16,
                color: COLORS.textDim,
                fontFamily: "JetBrains Mono",
              }}
            >
              // engineering case study
            </span>
          </div>
        ) : (
          // Non-Bond posts — full Level Zero brand label as the umbrella.
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 18,
                color: COLORS.cyan,
                letterSpacing: 4,
                fontWeight: 700,
              }}
            >
              LEVEL ZERO
            </span>
            <span
              style={{
                fontSize: 16,
                color: COLORS.textDim,
                marginTop: 4,
                fontFamily: "JetBrains Mono",
              }}
            >
              // engineering case study
            </span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* Logo mark — Bond brand uses the actual asset rendered at
              its native aspect ratio; Level Zero uses the amber-square
              + cyan-diamond placeholder mark. */}
          {bondBrand ? (
            bondLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bondLogo.dataUri}
                alt="Bond"
                width={bondLogoWidth}
                height={BOND_LOGO_HEIGHT}
                style={{ display: "flex" }}
              />
            ) : (
              // Inline fallback — pink+navy "B" pixel-block + cyan+navy
              // companion glyph, approximating the Bond logo until the
              // actual asset lands at public/brand/bond-logo.png.
              <BondInlineMark />
            )
          ) : (
            // Level Zero brand — amber square with cyan diamond.
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: COLORS.amber,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  backgroundColor: COLORS.bg,
                  transform: "rotate(45deg)",
                }}
              />
            </div>
          )}
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: COLORS.text,
            }}
          >
            {slots.project}
          </span>
        </div>
      </div>

      {/* TITLE — the gem's headline */}
      <div
        style={{
          fontSize: 44,
          fontWeight: 700,
          lineHeight: 1.15,
          marginBottom: 32,
          color: COLORS.text,
          display: "flex",
        }}
      >
        {slots.title}
      </div>

      {/* CODE BLOCK — Shiki-tokenised, JetBrains Mono */}
      <div
        style={{
          flex: 1,
          backgroundColor: codeTokens.bg || COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 16,
          padding: 32,
          marginBottom: 28,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Tiny window-chrome dots so the block reads as "code editor" */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#ef4444" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#f59e0b" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#10b981" }} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "JetBrains Mono",
            fontSize: 20,
            lineHeight: 1.55,
          }}
        >
          {codeTokens.tokens.map((line, lineIdx) => (
            <div
              key={lineIdx}
              style={{
                display: "flex",
                minHeight: 30,
              }}
            >
              {line.length === 0 ? (
                <span style={{ whiteSpace: "pre" }}> </span>
              ) : (
                line.map((token, tokenIdx) => (
                  <span
                    key={tokenIdx}
                    style={{
                      color: token.color || codeTokens.fg || COLORS.text,
                      whiteSpace: "pre",
                    }}
                  >
                    {token.content}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* WHY PANEL — 3-4 short bullets */}
      <div
        style={{
          backgroundColor: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: COLORS.cyan,
            letterSpacing: 3,
            fontWeight: 700,
          }}
        >
          WHY IT WORKS
        </span>
        {slots.bullet_points.slice(0, 4).map((bullet, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: COLORS.amber,
                marginTop: 9,
                flexShrink: 0,
                transform: "rotate(45deg)",
              }}
            />
            <span
              style={{
                fontSize: 19,
                color: COLORS.text,
                lineHeight: 1.4,
                display: "flex",
                flex: 1,
              }}
            >
              {bullet}
            </span>
          </div>
        ))}
      </div>

      {/* FOOTER — author card. The right-hand "level-zero.dev" pill
          was removed because that domain isn't live; we don't ship
          dead links onto LinkedIn images. The author block now spans
          full width inside the footer row. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderTop: `1px solid ${COLORS.cardBorder}`,
          paddingTop: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Avatar — uses Salah's photo from public/brand/salah-avatar.*
              when present, rendered as a SQUARE chip with a slightly
              rounded corner so it matches the brand's geometric
              aesthetic. Falls back to the SN initials chip when the
              file isn't on disk yet. */}
          {avatar ? (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                border: `2px solid ${COLORS.cyan}`,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatar.dataUri}
                alt="Salah Nahed"
                width={56}
                height={56}
                style={{ display: "flex", objectFit: "cover" }}
              />
            </div>
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                border: `2px solid ${COLORS.cyan}`,
                backgroundColor: COLORS.card,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.cyan,
              }}
            >
              SN
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: COLORS.text }}>
              Salah Nahed
            </span>
            <span
              style={{
                fontSize: 14,
                color: COLORS.textDim,
                marginTop: 4,
                fontFamily: "JetBrains Mono",
              }}
            >
              {slots.footer_text || "iOS · Flutter · Bond Framework"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline fallback for the Bond mark — used when the asset file at
 * `public/brand/bond-logo.png` hasn't been dropped yet. Two pixel-block
 * glyphs side-by-side: a pink "B" shape (left) and a cyan companion
 * glyph (right), both with navy accents — the Bond brand colors.
 *
 * Block grid is 5×5 per glyph at 9px per cell = 45×45 each, with a
 * 6px gap between the two glyphs. Total mark: 96×45.
 */
function BondInlineMark() {
  const CELL = 9;
  // 1 = pink/cyan, 2 = navy, 0 = empty. The two grids approximate the
  // attached logo's silhouette without trying to be pixel-perfect —
  // when the user drops the actual asset, this block stops rendering.
  const leftGrid = [
    [1, 1, 0, 0, 0],
    [2, 1, 1, 0, 0],
    [1, 1, 2, 0, 0],
    [1, 0, 1, 1, 0],
    [1, 1, 1, 0, 0],
  ];
  const rightGrid = [
    [0, 2, 2, 2, 0],
    [0, 1, 0, 2, 0],
    [0, 1, 2, 2, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0],
  ];
  const renderGrid = (
    grid: number[][],
    primaryColor: string
  ): React.ReactElement => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {grid.map((row, ri) => (
        <div key={ri} style={{ display: "flex" }}>
          {row.map((cell, ci) => (
            <div
              key={ci}
              style={{
                width: CELL,
                height: CELL,
                backgroundColor:
                  cell === 1
                    ? primaryColor
                    : cell === 2
                      ? COLORS.bondNavy
                      : "transparent",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {renderGrid(leftGrid, COLORS.bondPink)}
      {renderGrid(rightGrid, COLORS.bondCyan)}
    </div>
  );
}
