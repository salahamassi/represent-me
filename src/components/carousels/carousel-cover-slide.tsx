/**
 * Cover slide — first page of every carousel. Big title carries the
 * gem's headline; brand chip and author footer match the rest of the
 * deck so the document reads as one piece.
 *
 * No code, no bullets — those live on slides 2..N. The cover's only
 * job is to hook the swipe.
 */

import React from "react";
import type { CarouselBrand } from "@/lib/carousel-brands";
import type { CoverSlide } from "@/agents/schemas/carousel-deck.schema";
import {
  CarouselHeader,
  CarouselFooter,
  type CarouselImageAsset,
} from "./shared";

export interface CarouselCoverSlideProps {
  slide: CoverSlide;
  brand: CarouselBrand;
  project: string;
  brandLogo: CarouselImageAsset | null;
  avatar: CarouselImageAsset | null;
  slideIndex: number;
  slideTotal: number;
  footerText?: string;
}

export function CarouselCoverSlide({
  slide,
  brand,
  project,
  brandLogo,
  avatar,
  slideTotal,
  footerText,
}: CarouselCoverSlideProps) {
  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        display: "flex",
        flexDirection: "column",
        backgroundColor: brand.colors.bg,
        padding: 60,
        fontFamily: "Inter",
        color: brand.colors.text,
      }}
    >
      <CarouselHeader brand={brand} project={project} brandLogo={brandLogo} />

      {/* Title block — fills the vertical centre. flex: 1 with
          justifyContent: "center" so the title floats between header
          and footer regardless of subtitle presence. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingTop: 24,
          paddingBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.1,
            color: brand.colors.text,
            display: "flex",
          }}
        >
          {slide.title}
        </div>
        {slide.subtitle ? (
          <div
            style={{
              fontSize: 24,
              lineHeight: 1.4,
              color: brand.colors.textDim,
              marginTop: 28,
              display: "flex",
            }}
          >
            {slide.subtitle}
          </div>
        ) : null}
      </div>

      {/* Swipe hint — matches the deck's slide-count so the reader
          knows what they're committing to. Sits above the footer
          divider. */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 18,
        }}
      >
        <span
          style={{
            fontSize: 16,
            color: brand.colors.primary,
            fontFamily: "JetBrains Mono",
            letterSpacing: 2,
          }}
        >
          {/* `»` (U+00BB) instead of `→` (U+2192): the latin-subset
              JetBrains Mono woff doesn't carry mathematical operators,
              so the arrow falls back to .notdef. `»` is in Latin-1
              Supplement and reads as a forward chevron. */}
          {`SWIPE FOR THE BREAKDOWN  »  ${String(slideTotal).padStart(2, "0")} SLIDES`}
        </span>
      </div>

      <CarouselFooter brand={brand} avatar={avatar} footerText={footerText} />
    </div>
  );
}
