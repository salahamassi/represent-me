/**
 * Shared carousel chrome — header (brand chip + project mark) and
 * footer (author + tagline) used by every slide template so the deck
 * looks like one cohesive document.
 *
 * Visual language is lifted from `bond-infographic.tsx` so the carousel
 * and the existing single-PNG infographic feel like the same product.
 *
 * Satori reminders:
 *   - Every multi-child container declares `display: "flex"`.
 *   - All measurements are absolute px.
 *   - `transform: "rotate(45deg)"` works (the diamond bullets and
 *     amber-square brand mark already rely on it elsewhere).
 */

import React from "react";
import type { CarouselBrand } from "@/lib/carousel-brands";

/** Image asset loaded by the renderer with native dimensions, so the
 *  JSX can render at the real aspect ratio rather than squishing. */
export interface CarouselImageAsset {
  dataUri: string;
  width: number;
  height: number;
}

export interface CarouselChromeProps {
  brand: CarouselBrand;
  /** Project display name — drawn in the header chip. */
  project: string;
  /** Loaded brand logo, or null if no asset on disk (falls back to
   *  the brand-mark placeholder). */
  brandLogo: CarouselImageAsset | null;
  /** Loaded author avatar, or null (falls back to initials chip). */
  avatar: CarouselImageAsset | null;
  /** 1-indexed position in the deck. */
  slideIndex: number;
  /** Total slides in the deck. */
  slideTotal: number;
  /** Footer tagline override. Defaults to `brand.defaultFooterText`. */
  footerText?: string;
}

const HEADER_LOGO_HEIGHT = 56;

/**
 * Top-of-slide brand band: tagline on the left, project chip on the
 * right. Renders the actual brand logo when present; otherwise an
 * amber-square + cyan-diamond placeholder mark.
 */
export function CarouselHeader({
  brand,
  project,
  brandLogo,
}: Pick<CarouselChromeProps, "brand" | "project" | "brandLogo">) {
  const logoHeight = HEADER_LOGO_HEIGHT;
  const logoWidth = brandLogo
    ? Math.round((logoHeight * brandLogo.width) / brandLogo.height)
    : logoHeight;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontSize: 16,
            color: brand.colors.textDim,
            fontFamily: "JetBrains Mono",
          }}
        >
          {brand.tagline}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandLogo.dataUri}
            alt={brand.name}
            width={logoWidth}
            height={logoHeight}
            style={{ display: "flex" }}
          />
        ) : (
          <BrandMarkPlaceholder
            primary={brand.colors.secondary}
            inset={brand.colors.bg}
          />
        )}
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: brand.colors.text,
          }}
        >
          {project}
        </span>
      </div>
    </div>
  );
}

/**
 * Author footer — avatar (or initials chip) + name + tagline. Used on
 * every slide so the deck feels signed throughout, not just on the
 * cover.
 */
export function CarouselFooter({
  brand,
  avatar,
  footerText,
}: Pick<CarouselChromeProps, "brand" | "avatar" | "footerText">) {
  const tagline = footerText || brand.defaultFooterText;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        borderTop: `1px solid ${brand.colors.cardBorder}`,
        paddingTop: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {avatar ? (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 8,
              border: `2px solid ${brand.colors.primary}`,
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
              border: `2px solid ${brand.colors.primary}`,
              backgroundColor: brand.colors.card,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              color: brand.colors.primary,
            }}
          >
            SN
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: brand.colors.text }}>
            Salah Nahed
          </span>
          <span
            style={{
              fontSize: 14,
              color: brand.colors.textDim,
              marginTop: 4,
              fontFamily: "JetBrains Mono",
            }}
          >
            {tagline}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Discrete slide-of-N indicator drawn in the lower-right corner of
 * non-cover slides. Cover slides hide it (handled by the cover
 * template's own layout).
 */
export function SlideIndex({
  brand,
  index,
  total,
}: {
  brand: CarouselBrand;
  index: number;
  total: number;
}) {
  return (
    <span
      style={{
        fontSize: 14,
        color: brand.colors.textDim,
        fontFamily: "JetBrains Mono",
        letterSpacing: 1,
      }}
    >
      {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
    </span>
  );
}

/**
 * Amber-square + inset-diamond brand mark, used as the placeholder
 * when a brand has no logo asset on disk yet (Trivia, WinchKSA, etc.).
 */
function BrandMarkPlaceholder({
  primary,
  inset,
}: {
  primary: string;
  inset: string;
}) {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        backgroundColor: primary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          backgroundColor: inset,
          transform: "rotate(45deg)",
        }}
      />
    </div>
  );
}
