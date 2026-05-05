/**
 * Outro slide — closes the carousel with the principle the reader
 * should remember, a CTA, and an optional question. No code, no
 * bullets — the reward for swiping is the takeaway, not more
 * implementation.
 *
 * Visual hierarchy: hook is largest (it's THE point), CTA mid-weight,
 * question dimmer (it's an invitation, not a demand). All three sit
 * left-aligned in the upper-middle band with the footer carrying the
 * author signature.
 */

import React from "react";
import type { CarouselBrand } from "@/lib/carousel-brands";
import type { OutroSlide } from "@/agents/schemas/carousel-deck.schema";
import {
  CarouselHeader,
  CarouselFooter,
  SlideIndex,
  type CarouselImageAsset,
} from "./shared";

export interface CarouselOutroSlideProps {
  slide: OutroSlide;
  brand: CarouselBrand;
  project: string;
  brandLogo: CarouselImageAsset | null;
  avatar: CarouselImageAsset | null;
  slideIndex: number;
  slideTotal: number;
  footerText?: string;
}

export function CarouselOutroSlide({
  slide,
  brand,
  project,
  brandLogo,
  avatar,
  slideIndex,
  slideTotal,
  footerText,
}: CarouselOutroSlideProps) {
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
        <span
          style={{
            fontSize: 16,
            color: brand.colors.primary,
            letterSpacing: 4,
            fontWeight: 700,
            marginBottom: 24,
            fontFamily: "JetBrains Mono",
          }}
        >
          THE TAKEAWAY
        </span>
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.15,
            color: brand.colors.text,
            display: "flex",
            marginBottom: 36,
          }}
        >
          {slide.hook}
        </div>
        <div
          style={{
            fontSize: 26,
            lineHeight: 1.4,
            color: brand.colors.primary,
            display: "flex",
            marginBottom: slide.question ? 28 : 0,
          }}
        >
          {slide.cta}
        </div>
        {slide.question ? (
          <div
            style={{
              fontSize: 22,
              lineHeight: 1.4,
              color: brand.colors.textDim,
              display: "flex",
              fontStyle: "italic",
            }}
          >
            {slide.question}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 18,
        }}
      >
        <SlideIndex brand={brand} index={slideIndex} total={slideTotal} />
      </div>

      <CarouselFooter brand={brand} avatar={avatar} footerText={footerText} />
    </div>
  );
}
