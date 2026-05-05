/**
 * Phase 2 verification — renders a realistic 4-slide deck (cover →
 * code → why → outro) for the Bond Form / Coalesced-Logout case study
 * and writes it to `data/carousels/test-cover.pdf`. No Claude calls,
 * no DB, no UI.
 *
 * Run with:
 *   npx tsx scripts/test-carousel-render.ts
 */

import path from "node:path";
import { CarouselDeckSchema } from "@/agents/schemas/carousel-deck.schema";
import { renderCarousel } from "@/services/carousel-renderer";
import { assembleCarouselPdf } from "@/services/carousel-pdf-service";

async function main() {
  // Realistic deck — content is the kind of thing Layla will emit
  // once Phase 3 wires up the prompt. Code is verbatim from the
  // earlier Trivia post the user showed me.
  const deck = CarouselDeckSchema.parse({
    project: "Trivia Game",
    footerText: "Senior Mobile Engineer · Flutter · iOS",
    slides: [
      {
        type: "cover",
        title: "Bulletproof 401 Handling with Coalesced Logout",
        subtitle:
          "Five concurrent requests, five 401s, five logouts — and a user stuck on a spinner. The fix wasn't a lock.",
      },
      {
        type: "code",
        caption: "One in-flight future, shared by every caller.",
        filename: "auth_service.dart",
        language: "dart",
        code: `class AuthService {
  Future<void>? _pendingLogout;

  Future<void> _handle() async {
    if (_pendingLogout != null) {
      await _pendingLogout;
      return;
    }
    _pendingLogout = _performLogout();
    try {
      await _pendingLogout;
    } finally {
      _pendingLogout = null;
    }
  }
}`,
      },
      {
        type: "why",
        heading: "Why it works",
        bullets: [
          "Zero race conditions from concurrent 401s",
          "Timeout prevents hanging logout operations",
          "Always navigates the user to the login screen",
          "Network interceptor stays UI-agnostic",
        ],
      },
      {
        type: "outro",
        hook: "Don't queue concurrent callers — let them share the in-flight work.",
        cta: "Follow for more Flutter case studies.",
        question:
          "How does your team coordinate auth state with the network layer? Lock, debounce, coalesce, or something else?",
      },
    ],
  });

  console.log(
    `[test-carousel-render] rendering ${deck.slides.length} slide(s) for project="${deck.project}"`
  );
  const slideTypes = deck.slides.map((s) => s.type).join(" → ");
  console.log(`[test-carousel-render] deck shape: ${slideTypes}`);

  const result = await renderCarousel(deck);
  console.log(
    `[test-carousel-render] rendered in ${result.durationMs}ms — brand resolved to "${result.brand.name}" (id=${result.brand.id})`
  );

  const outPath = path.join(process.cwd(), "data", "carousels", "test-cover.pdf");
  const pdf = await assembleCarouselPdf(result.slides, outPath, {
    title:
      deck.slides[0]?.type === "cover"
        ? deck.slides[0].title
        : "Carousel test",
    author: "Salah Nahed",
  });

  console.log(
    `[test-carousel-render] wrote ${pdf.byteLength.toLocaleString()} bytes → ${pdf.path}`
  );
}

main().catch((err) => {
  console.error("[test-carousel-render] failed:", err);
  process.exit(1);
});
