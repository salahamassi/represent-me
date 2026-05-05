/**
 * ATS-optimized profile data — a lean view built on top of profile.ts
 * for CVs submitted to recruiters through Applicant Tracking Systems
 * (Workday, Greenhouse, Lever, Taleo).
 *
 * Why a second dataset and not just "trim profile.ts everywhere":
 *   - The dashboard and the Full export keep the rich portfolio view.
 *   - Recruiters get a 2-page CV where section order, parseability, and
 *     keyword density matter more than storytelling.
 *
 * Transformations applied here vs the full profile:
 *   1. Summary compressed to ≤3 sentences, leading with the role line.
 *   2. Older roles (One Studio, ITG Software) trimmed to 2 key bullets.
 *   3. AI Integration Highlights section dropped — its strongest items
 *      are already surfaced in the Represent Me experience entry.
 *   4. Open Source condensed: top 4 projects keep full descriptions,
 *      the 3 community PRs collapse to one "Technical Contributions"
 *      bullet for scannability.
 *   5. Avatar intentionally excluded from the render (ATS parsers
 *      occasionally choke on images in headers).
 */

import type { ProfileData, Experience, OpenSourceContribution } from "@/types";
import { profile } from "./profile";

/** 3-sentence compressed summary targeting recruiter-scan + ATS keyword density. */
const ATS_SUMMARY =
  "Senior Mobile Engineer with 7+ years shipping production iOS (Swift/SwiftUI/UIKit) and Flutter apps across logistics, gaming, e-commerce, and enterprise platforms. Expert in integrating AI-driven workflows to accelerate mobile development lifecycles and code quality. Creator of Flutter Bond (100+ stars, 145+ tests) and AppRouter-UIKit (17 releases) — I set architectural standards before scaling teams and mentor juniors by leading first, then delegating.";

/**
 * Collapse older experience entries to 2-3 concise bullets so the CV
 * reads as "recent roles = detail, older roles = context" — the shape
 * recruiters expect on page 2.
 */
function compressOlderExperience(experience: Experience[]): Experience[] {
  return experience.map((exp) => {
    const isOldRole =
      exp.company === "One Studio" || exp.company === "ITG Software";
    if (!isOldRole) return exp;

    // Keep the strongest 2 bullets verbatim, drop the rest.
    const keptHighlights = exp.highlights.slice(0, 2);
    return {
      ...exp,
      highlights: keptHighlights,
    };
  });
}

/**
 * Open Source section for the ATS CV:
 *   - Keep the 4 headline projects (Flutter Bond, AppRouter-UIKit,
 *     PrayersTimes, Represent Me) with full descriptions.
 *   - Collapse the 3 community PRs + Quran-svg-mobile + Android-Mask-Date
 *     into one "Technical Contributions" bullet so older/smaller items
 *     don't eat recruiter skim time but are still credited.
 */
function condenseOpenSource(): OpenSourceContribution[] {
  const headline = new Set([
    "Flutter Bond — Creator & Lead Developer",
    "AppRouter-UIKit — Author",
    "PrayersTimes — Author",
    "Represent Me — AI Agent Dashboard",
  ]);

  const kept = profile.openSource.filter((os) => headline.has(os.name));

  // Collect the rest into a single concise entry.
  const rest = profile.openSource.filter((os) => !headline.has(os.name));
  if (rest.length > 0) {
    kept.push({
      name: "Technical Contributions",
      description:
        "Open source contributions: plus_plugins PR #907 (Objective-C share-text fix), Flutterfire CLI PR #92 (flavor support), SwifterSwift PR #989 (Stackview/swap), Quran-svg-mobile tooling, and Android-Mask-Date-EditText Kotlin UI component.",
    });
  }

  return kept;
}

/**
 * ATS-optimized view of the profile. Renders to a 2-page CV when run
 * through profile-pdf-service.ts / profile-docx-service.ts with the
 * `ats: true` flag.
 */
export const profileATS: ProfileData = {
  ...profile,
  summary: ATS_SUMMARY,
  // No avatar — the service layer already skips rendering it when ats=true,
  // but we also clear it here so JSON-based pipelines see the same thing.
  avatar: undefined,
  // AI Integration Highlights drop entirely — the Represent Me experience
  // entry and the Technical Innovation achievement cover the same ground.
  aiIntegrationHighlights: undefined,
  experience: compressOlderExperience(profile.experience),
  openSource: condenseOpenSource(),
};
