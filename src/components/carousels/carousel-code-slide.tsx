/**
 * Code slide — Shiki-tokenised snippet inside a mac-window frame. The
 * visual centrepiece of every carousel; everything else (cover, why,
 * outro) is scaffolding around this slide.
 *
 * Tokenisation happens upstream in `carousel-renderer.ts` so this
 * component stays sync. Each token carries its own colour from Shiki's
 * `github-dark` theme.
 */

import React from "react";
import type { CarouselBrand } from "@/lib/carousel-brands";
import type { CodeSlide } from "@/agents/schemas/carousel-deck.schema";
import {
  CarouselHeader,
  CarouselFooter,
  SlideIndex,
  type CarouselImageAsset,
} from "./shared";

/** Single Shiki-tokenised character span — mirrors `codeToTokens()`
 *  output `{ content, color, fontStyle? }`. */
export interface ShikiToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

export interface ShikiTokenisedCode {
  tokens: ShikiToken[][];
  bg?: string;
  fg?: string;
}

export interface CarouselCodeSlideProps {
  slide: CodeSlide;
  brand: CarouselBrand;
  project: string;
  brandLogo: CarouselImageAsset | null;
  avatar: CarouselImageAsset | null;
  slideIndex: number;
  slideTotal: number;
  footerText?: string;
  /** Pre-tokenised code from the renderer's Shiki pass. */
  codeTokens: ShikiTokenisedCode;
}

export function CarouselCodeSlide({
  slide,
  brand,
  project,
  brandLogo,
  avatar,
  slideIndex,
  slideTotal,
  footerText,
  codeTokens,
}: CarouselCodeSlideProps) {
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

      {slide.caption ? (
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.3,
            color: brand.colors.text,
            marginTop: 32,
            display: "flex",
          }}
        >
          {slide.caption}
        </div>
      ) : null}

      {/* Code window — mac chrome + Shiki tokens. flex: 1 so the
          window absorbs whatever vertical space remains after the
          header, optional caption, and footer claim theirs. */}
      <div
        style={{
          flex: 1,
          backgroundColor: codeTokens.bg || brand.colors.card,
          border: `1px solid ${brand.colors.cardBorder}`,
          borderRadius: 16,
          padding: 32,
          marginTop: slide.caption ? 24 : 32,
          marginBottom: 24,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#ef4444" }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#f59e0b" }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#10b981" }} />
          </div>
          {slide.filename ? (
            <span
              style={{
                fontSize: 14,
                color: brand.colors.textDim,
                fontFamily: "JetBrains Mono",
              }}
            >
              {slide.filename}
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "JetBrains Mono",
            fontSize: 22,
            lineHeight: 1.55,
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          {codeTokens.tokens.map((line, lineIdx) => (
            <div
              key={lineIdx}
              style={{
                display: "flex",
                minHeight: 32,
                maxWidth: "100%",
                overflow: "hidden",
              }}
            >
              {line.length === 0 ? (
                <span style={{ whiteSpace: "pre", flexShrink: 0 }}> </span>
              ) : (
                line.map((token, tokenIdx) => (
                  <span
                    key={tokenIdx}
                    style={{
                      color: token.color || codeTokens.fg || brand.colors.text,
                      whiteSpace: "pre",
                      flexShrink: 0,
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
