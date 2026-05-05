/**
 * Featured projects — curated list of Salah's public work the resume
 * agent can cite directly with real URLs. Sourced from `profile.openSource`
 * but flattened to a `{ name, url, blurb, tags }` shape the resume prompt
 * can pass through to Claude.
 *
 * The agent picks 2–4 of these per generated resume based on the role's
 * relevance (passed via the prompt). The PDF service renders the URL
 * inline beneath the project description.
 *
 * Publications (Medium articles, Dev.to posts) live in `medium-data.ts`
 * and are surfaced separately as a Publications section — never mix them
 * into this list.
 */

export interface FeaturedProject {
  /** Display name as it should appear on the resume. */
  name: string;
  /** Public URL — GitHub repo or PR. */
  url: string;
  /** Short blurb the LLM can rephrase per role. Kept to one sentence so
   *  it slots into the resume without truncation. */
  blurb: string;
  /** Tags so Claude can filter by role relevance (flutter, ios, swift,
   *  android, framework, contribution, open-source, etc). */
  tags: string[];
}

export const FEATURED_PROJECTS: FeaturedProject[] = [
  {
    name: "Flutter Bond — Form",
    url: "https://github.com/salahamassi/bond_form",
    blurb:
      "Form abstraction layer with built-in validation for the Flutter Bond framework.",
    tags: ["flutter", "dart", "framework", "open-source"],
  },
  {
    name: "Flutter Bond — Cache",
    url: "https://github.com/salahamassi/bond_cache",
    blurb: "Flexible caching layer for the Flutter Bond framework.",
    tags: ["flutter", "dart", "framework", "open-source"],
  },
  {
    name: "Flutter Bond — Network",
    url: "https://github.com/salahamassi/bond_network",
    blurb:
      "Declarative networking layer for the Flutter Bond framework.",
    tags: ["flutter", "dart", "framework", "open-source"],
  },
  {
    name: "AppRouter-UIKit",
    url: "https://github.com/salahamassi/AppRouter-UIKit",
    blurb:
      "Lightweight open-source navigation framework for UIKit-based iOS apps; 24 XCTest cases, 17 releases.",
    tags: ["ios", "swift", "uikit", "framework", "open-source"],
  },
  {
    name: "PrayersTimes",
    url: "https://github.com/salahamassi/PrayersTimes",
    blurb:
      "Swift iOS reference project showcasing TDD and Clean Architecture with separated domain/data/presentation layers and full unit-test coverage.",
    tags: ["ios", "swift", "tdd", "clean-architecture", "open-source"],
  },
  {
    name: "Quran-svg-mobile",
    url: "https://github.com/salahamassi/Quran-svg-mobile",
    blurb:
      "Tooling that adapts SVG output for mobile apps — strips unneeded layers via XMLDocument and removes white margins through Inkscape.",
    tags: ["ios", "tooling", "open-source"],
  },
  {
    name: "share_plus — Open-Source Contribution (PR #907)",
    url: "https://github.com/fluttercommunity/plus_plugins/pull/907",
    blurb:
      "Fixed an Objective-C bug in the widely-used plus_plugins package where 'share text' wasn't shown when sharing files.",
    tags: ["flutter", "ios", "objective-c", "contribution", "open-source"],
  },
  {
    name: "Flutterfire CLI — Open-Source Contribution (PR #92)",
    url: "https://github.com/invertase/flutterfire_cli/pull/92",
    blurb:
      "Added flavor support to the Flutterfire CLI, contributing to the broader Flutter + Firebase ecosystem.",
    tags: ["flutter", "firebase", "cli", "contribution", "open-source"],
  },
  {
    name: "SwifterSwift — Open-Source Contribution (PR #989)",
    url: "https://github.com/SwifterSwift/SwifterSwift/pull/989",
    blurb:
      "Contributed Stackview / swap helper to the SwifterSwift library used across the Swift community.",
    tags: ["ios", "swift", "contribution", "open-source"],
  },
  {
    name: "Android-Mask-Date-EditText",
    url: "https://github.com/salahamassi/Android-Mask-Date-EditText",
    blurb:
      "Kotlin UI component for Android: a date-masking EditText published as open source.",
    tags: ["android", "kotlin", "open-source"],
  },
  {
    name: "Represent Me — AI Agent Dashboard",
    url: "https://github.com/salahamassi/represent-me",
    blurb:
      "Multi-agent AI dashboard built with Next.js + Claude SDK; orchestrates 5 specialised agents (job matcher, resume, GitHub, content, LinkedIn) over an event-driven pub/sub bus.",
    tags: ["ai", "nextjs", "typescript", "agents", "claude"],
  },
  {
    name: "Trivia",
    url: "https://github.com/salahamassi/Trivia",
    blurb:
      "Cross-platform trivia game built in Flutter with BLoC state management and Firebase backend.",
    tags: ["flutter", "dart", "bloc", "firebase"],
  },
];
