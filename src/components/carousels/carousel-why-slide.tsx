/**
 * Why slide — the "this design choice held up because…" panel. Big
 * cyan section heading, 2-4 diamond-bulleted lines that read like
 * design principles, not implementation notes.
 *
 * Diamond bullets use the same rotated amber square trick as
 * `bond-infographic.tsx` so the carousel feels visually contiguous
 * with the existing single-PNG infographic.
 */

import React from "react";
import type { CarouselBrand } from "@/lib/carousel-brands";
import type { WhySlide } from "@/agents/schemas/carousel-deck.schema";
import {
  CarouselHeader,
  CarouselFooter,
  SlideIndex,
  type CarouselImageAsset,
} from "./shared";

export interface CarouselWhySlideProps {
  slide: WhySlide;
  brand: CarouselBrand;
  project: string;
  brandLogo: CarouselImageAsset | null;
  avatar: CarouselImageAsset | null;
  slideIndex: number;
  slideTotal: number;
  footerText?: string;
}

export function CarouselWhySlide({
  slide,
  brand,
  project,
  brandLogo,
  avatar,
  slideIndex,
  slideTotal,
  footerText,
}: CarouselWhySlideProps) {
  const heading = slide.heading || "Why it works";
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

      {/* Bullet column fills the vertical centre. We deliberately do
          NOT wrap the bullets in a card the way the single-PNG
          infographic does — the carousel has more room, so the panel
          frame would feel busy. The cyan label + amber diamonds carry
          enough visual structure on their own. */}
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
            fontSize: 18,
            color: brand.colors.primary,
            letterSpacing: 4,
            fontWeight: 700,
            marginBottom: 28,
          }}
        >
          {heading.toUpperCase()}
        </span>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {slide.bullets.map((bullet, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 20,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  backgroundColor: brand.colors.secondary,
                  marginTop: 14,
                  flexShrink: 0,
                  transform: "rotate(45deg)",
                }}
              />
              <span
                style={{
                  fontSize: 32,
                  color: brand.colors.text,
                  lineHeight: 1.35,
                  display: "flex",
                  flex: 1,
                }}
              >
                {bullet}
              </span>
            </div>
          ))}
        </div>
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
