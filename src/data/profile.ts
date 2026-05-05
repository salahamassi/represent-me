import type { ProfileData } from "@/types";

/**
 * Canonical profile data — source of truth for every AI agent in the app
 * (Job Matcher uses it to score fit %, Resume Agent writes PDFs off it,
 * Content Agent mines experience highlights, etc.).
 *
 * This file is the mirror of the CV PDF at SalahNahed_CV_Updated.pdf. When
 * the CV changes, update this file and rerun any agents that cached a copy.
 *
 * Private fields that the CV sanitizes for external recipients (e.g.
 * confidential company names Salah can't disclose to nearby employers)
 * are kept here in their real form — the dashboard is single-user.
 */
export const profile: ProfileData = {
  name: "Salah Nahed",
  role: "Senior Mobile Engineer · iOS & Cross-Platform · Open-Source Author",
  location: "Cairo, Egypt",
  email: "salahnahed@icloud.com",
  phone: "+201067332825",
  avatar: "/salah-avatar.jpg",
  summary:
    "Senior Mobile Engineer with 7+ years architecting, designing, and deploying production iOS and Flutter applications across telehealth, logistics, gaming, e-commerce, and enterprise platforms. Native iOS expertise in Swift, Clean Architecture, SwiftUI, UIKit, and modular codebases. Expert in integrating AI-driven workflows to accelerate mobile development lifecycles and code quality — from a 5-agent Claude-powered dashboard automating job hunting and GitHub presence, to QA pipelines and Claude Code workflows integrated into daily development. Creator of Flutter Bond (100+ stars) and AppRouter-UIKit. I set architectural standards before scaling teams, write clean, maintainable code others adopt as templates, and mentor juniors by leading first, then delegating with confidence.",
  links: {
    github: "https://github.com/salahamassi",
    linkedin: "https://www.linkedin.com/in/salah-nahed-a73250135",
    medium: "https://medium.com/@salahamassi",
    devto: "https://dev.to/salahamassi",
    stackoverflow: "https://stackoverflow.com/users/9690736/salah-amassi",
    // pub.dev requires a verified domain for a `/publishers/{slug}` page,
    // which Salah doesn't have — the old /publishers/salahamassi URL
    // returned 400. This search URL surfaces every Bond package he
    // authored (bond_form, bond_cache, bond_network, etc.) with download
    // counts and likes, which is what recruiters actually want to see.
    pubdev: "https://pub.dev/packages?q=bond_",
  },
  keyAchievements: [
    {
      title: "90% Order Flow Stability",
      description:
        "Increased iOS order flow stability by 90% at WiNCH through 47 XCTest files covering state machine exhaustive coverage, UI integration, compositor/spy patterns, and memory leak detection.",
    },
    {
      title: "30% Deployment Time Reduction",
      description:
        "Reduced deployment time by 30% by optimising CI/CD workflows through advanced Flutter and iOS development practices.",
    },
    {
      title: "AI Dashboard — Technical Innovation",
      description:
        "Built 'Represent Me' — a complex event-driven system with 5 interconnected Claude-powered agents handling job matching, resume generation, GitHub automation, and content creation. Demonstrates ability to architect multi-agent systems with structured outputs, persistence, and automated pipelines.",
    },
    {
      title: "Open-Source Frameworks",
      description:
        "Created Flutter Bond (100+ GitHub stars, main contributor) and AppRouter-UIKit (17 releases maintained) — both extracted from real production challenges.",
    },
    {
      title: "Telehealth Production Experience",
      description:
        "Shipped Famcare to iOS App Store and Google Play: an online mental-health teletherapy platform with Agora video sessions, diagnostic assessments, mood tracking, subscription billing, and deep-link campaign attribution. Built as Senior Flutter Developer to Mobile Team Lead over 8 months, with Code Magic CI/CD automating releases.",
    },
  ],
  aiIntegrationHighlights: [
    "Built \"Represent Me\" — a local AI agent dashboard with 5 interconnected Claude-powered agents (GitHub Agent, Job Matcher, Resume Agent, Content Agent, LinkedIn Agent) communicating over an event-driven pub/sub bus. Structured Claude API output via Zod schemas, cost tracking per call, SQLite persistence across 11 tables, Telegram Bot notifications, and 8 scheduled background tasks. Stack: Next.js, TypeScript, Claude API, GitHub API, pdf-lib, docx-js.",
    "Designed a two-agent QA pipeline for Trivia: a coverage-audit agent analyses existing tests against each feature and extracts missing/duplicated scenarios, then pipes output to a second agent that generates missing tests in Given/When/Then format — reducing manual test review overhead significantly.",
    "Configured Claude Code with strict approval-gate rules across Trivia development: no production code edits without explicit plan approval — after catching Claude silently modifying source code to make tests pass.",
    "Authored a custom Claude Code skill using the Ruby xcodeproj gem to automatically register new source files into Xcode's .xcodeproj, eliminating a recurring manual step that caused silent build failures.",
    "Explored generative video production with Runway Workflows for a physics explainer project; working knowledge of Gemini API for image generation pipelines.",
  ],
  experience: [
    {
      title: "Senior Mobile Engineer (Flutter + iOS)",
      company: "Trivia",
      period: "01/2026 - 04/2026",
      location: "Remote (Kuwait-based team)",
      description:
        "Cross-platform competitive trivia app (iOS, Android, Web) — real-time games, live chat, subscriptions, payments, push notifications.",
      highlights: [
        "Sole architect for the first month: architecting, designing, and deploying the full app structure (clean architecture layers, theme system, coding standards) before onboarding any junior developers",
        "Onboarded and managed a junior developer: implemented one full feature end-to-end as a reference (auth), then delegated remaining features while progressing to higher-complexity work (real-time game board, CometChat integration)",
        "Designed the core state layer: generic RemoteState hierarchy with RemoteCubit, PaginatedRemoteCubit, PaginatedExtraRemoteCubit — reducing every API screen to a single api() override with loading, error, pagination, and search debounce out of the box",
        "Authored internal widget-testing guides (pump vs pumpAndSettle, Dio async, golden tests) — adopted as team standards",
        "Configured GitHub Actions CI/CD running golden + feature tests on every PR with Codecov coverage reporting",
        "Worked with GetIt, GoRouter deep linking, Firebase Remote Config, and bond_form for scalable form handling",
      ],
      technologies: [
        "Flutter",
        "Dart",
        "BLoC",
        "Cubit",
        "GetIt",
        "GoRouter",
        "Firebase Remote Config",
        "CometChat",
        "Codecov",
        "GitHub Actions",
      ],
      employmentType: "contract",
    },
    {
      title: "Senior Mobile Developer (Flutter)",
      company: "Nologystore W.L.L",
      period: "02/2025 - 12/2025",
      location: "Cairo, Egypt",
      description:
        "Led complete mobile app rebuild in Flutter for a major relaunch, focusing on codebase quality and modern integrations.",
      highlights: [
        "Led complete mobile app rebuild in Flutter for a major relaunch, focusing on codebase quality and modern integrations",
        "Improved system efficiency by 30% by replacing deprecated MongoDB GraphQL integrations with new RESTful APIs",
        "Built a fully custom Firebase In-App Messaging experience using SwiftUI (iOS) and Kotlin Jetpack Compose (Android)",
        "Authored article: Design-Driven Firebase in Flutter",
      ],
      technologies: [
        "Flutter",
        "Dart",
        "SwiftUI",
        "Kotlin Jetpack Compose",
        "Firebase",
        "REST APIs",
      ],
    },
    {
      title: "iOS Engineer (Contract)",
      company: "WiNCHKSA",
      period: "12/2019 - Present",
      location: "Saudi Arabia (remote contract)",
      description:
        "Task-scoped remote contract maintaining the existing iOS codebase and providing architectural escalation on-call. Non-blocking for full-time employment — work is delivered against agreed deadlines, outside a new employer's core hours.",
      highlights: [
        "Achieved 90% order flow stability through 47 XCTest files covering state machine exhaustive coverage, UI integration tests, compositor/spy patterns, and memory leak detection across multiple iOS versions and edge case scenarios",
        "Designed and shipped a real-time order tracking experience used by thousands of users daily",
        "Developed a protocol-driven option selection system and pixel-perfect dynamic pricing interface — clean, maintainable code across all app variants",
        "Created and maintained WinchCore — a shared module powering all app variants (Client, Provider, Owner), consolidating UI components and business logic",
        "Authored AppRouter-UIKit — an open-source UIKit navigation framework with 24 XCTest cases covering all 4 navigation types, duplicate prevention, live route bookkeeping, and memory leak detection (17 releases maintained)",
        "Migrated codebase to Swift async/await, introduced SwiftUI, and implemented UIKit–SwiftUI interoperability",
        "Applied trunk-based development with Code Magic CI/CD on a modular codebase — WinchCore shared across Client/Provider/Owner variants; automated tests on every commit, staging on main merges, production on version tags",
      ],
      technologies: [
        "Swift",
        "UIKit",
        "SwiftUI",
        "async/await",
        "Protocol-Oriented Programming",
        "XCTest",
        "Code Magic",
      ],
      employmentType: "contract",
    },
    {
      title: "React Native Developer",
      company: "BIM Ventures",
      period: "06/2024 - 02/2025",
      location: "Cairo, Egypt",
      description:
        "Joined BIM Ventures to modernize a React Native app. Adapted to React Native from Flutter/iOS background.",
      highlights: [
        "Refactored fragile form logic in TypeScript with disabled type hints, replacing it with type-safe schemas using Zod + React Hook Form — improving developer confidence and reducing runtime bugs",
        "Applied automated CI/CD pipelines with Expo Application Services (EAS); leveraged EAS Update for instant hotfixes bypassing app store approval cycles",
      ],
      technologies: [
        "React Native",
        "TypeScript",
        "Expo",
        "Zod",
        "React Hook Form",
        "EAS",
      ],
    },
    {
      title: "VP of Innovation & Mobile Team Lead",
      company: "One Studio",
      period: "08/2022 - 06/2024",
      location: "Gaza Strip",
      description:
        "Promoted from Famcare to lead mobile engineering across the studio's full startup portfolio. Reported directly to studio leadership; supported every portfolio team rather than embedding inside one startup.",
      highlights: [
        "Founded and led development of Flutter Bond — a Laravel-inspired open-source Flutter framework with 100+ GitHub stars and 145+ tests across cache, network, and form packages. Extracted from real cross-portfolio mobile patterns; main contributor and architect.",
        "Set architectural standards and code-review baselines adopted across portfolio teams to ensure consistency and quality",
        "Introduced internal tooling and templates to accelerate startup launches",
        "Mentored developers and facilitated cross-functional collaboration between design, product, and tech teams",
      ],
      technologies: [
        "Flutter",
        "Dart",
        "Swift",
        "Firebase",
        "Mixpanel",
      ],
    },
    {
      title: "Senior Flutter Developer to Mobile Team Lead",
      company: "Famcare (One Studio portfolio company)",
      period: "12/2021 - 08/2022",
      location: "Gaza Strip",
      description:
        "Online mental-health teletherapy platform inside One Studio's portfolio. Offered individual and group video therapy sessions with subscription billing, diagnostic assessments, and campaign-attribution onboarding.",
      highlights: [
        "Promoted to Mobile Team Lead after 2 months, taking ownership of Flutter delivery",
        "Integrated Agora SDK for HD voice and video therapy sessions, supporting both 1:1 and group call modes",
        "Developed multi-step diagnostic assessment flows with branching logic for patient screening and intake",
        "Built daily mood tracker for patients to log emotional state between sessions, surfacing trends to their therapist",
        "Built recurring subscription and one-time package billing flows on iOS and Google Play",
        "Engineered deep-link campaign attribution that surfaced invite codes through onboarding to track marketing source",
        "Shipped Famcare to iOS App Store and Google Play; automated release builds and deployment with Code Magic CI/CD",
      ],
      technologies: [
        "Flutter",
        "Dart",
        "Agora SDK",
        "Firebase",
        "Appsflyer",
        "WebEngage",
        "Intercom",
        "Deep Linking",
        "Code Magic",
      ],
    },
    {
      title: "iOS Developer",
      company: "ITG Software",
      period: "06/2021 - 12/2021",
      location: "Gaza Strip",
      description:
        "Led iOS development of Hesabi — the official self-service app for Jawwal, the largest telecom operator in Palestine, serving thousands of daily users.",
      highlights: [
        "Implemented remote identity verification using real-time ID and face capture for SIM card activation",
        "Built a secure refresh token system using Keychain + biometric authentication (Face ID / Passcode), regenerating every 5 minutes",
        "Delivered a multi-theme UI system with 10+ unique themes customized by user type",
      ],
      technologies: ["Swift", "UIKit", "Keychain", "Face ID", "Agile"],
    },
  ],
  education: [
    {
      degree: "Bachelor's Degree, Computer Science",
      institution: "Islamic University of Gaza",
      period: "2014 - 2018",
    },
  ],
  skills: [
    {
      category: "Mobile",
      items: [
        "Swift",
        "Objective-C",
        "UIKit",
        "SwiftUI",
        "Dart",
        "Flutter",
        "React Native",
      ],
    },
    {
      category: "Testing",
      items: [
        "XCTest",
        "Unit Testing",
        "Snapshot Testing",
        "Automation Testing",
        "XCTest-style patterns (compositor/spy/DSL)",
        "Widget Tests",
        "Golden Tests",
        "TDD",
        "State Machine Testing",
        "Memory Leak Detection",
      ],
    },
    {
      category: "CS Fundamentals",
      items: [
        "Algorithms",
        "Data Structures",
        "Multithreading",
        "Memory Management",
        "Standard Collections",
        "OOP Patterns",
        "Clean, Secure & Maintainable Code",
      ],
    },
    {
      category: "State Management",
      items: ["BLoC", "Cubit", "GetX", "Riverpod"],
    },
    {
      category: "AI & Agents",
      items: [
        "Claude API",
        "Anthropic SDK",
        "MCP",
        "Gemini API",
        "Runway",
        "Prompt Engineering",
        "Structured Output (Zod)",
        "AI Agent Architecture",
        "LLM Integration in Mobile Apps",
      ],
    },
    {
      category: "Architecture",
      items: [
        "Clean Architecture",
        "Multi-Module Architecture",
        "MVVM",
        "Protocol-Oriented Programming",
        "Dependency Injection",
        "Backend-Driven UI",
      ],
    },
    {
      category: "Backend & APIs",
      items: [
        "HTTP/HTTPS",
        "REST",
        "Dio",
        "Firebase",
        "GraphQL",
        "CometChat",
        "A/B Testing",
      ],
    },
    {
      category: "CI/CD & Tools",
      items: [
        "GitHub Actions",
        "Code Magic",
        "EAS",
        "Fastlane",
        "Trunk-Based Development",
        "Scrum",
        "Agile",
        "GetIt",
        "GoRouter",
        "Bond Form",
        "Xcode",
        "Git",
      ],
    },
  ],
  openSource: [
    {
      name: "Flutter Bond — Creator & Lead Developer",
      description:
        "Laravel-inspired Flutter framework with 100+ GitHub stars and 145+ tests. Packages: Bond Form (validation, dirty tracking, dynamic logic), Bond Cache (in-memory + persistent, reactive streams, type-safe observers), Bond Network (declarative networking, interceptors), Bond Notification (native abstraction, deep linking), Bond Analytics (unified Firebase/Appsflyer/Mixpanel interface), CLI scaffolding tools.",
      url: "https://github.com/flutterbond/bond-core",
    },
    {
      name: "AppRouter-UIKit — Author",
      description:
        "Lightweight UIKit navigation framework extracted from the WiNCH production codebase. 24 XCTest cases covering all 4 navigation types, stack manipulation, duplicate prevention, live route bookkeeping, and memory leak detection. 17 releases maintained.",
      url: "https://github.com/salahamassi/AppRouter-UIKit",
    },
    {
      name: "PrayersTimes — Author",
      description:
        "Swift iOS project built as a showcase of TDD and Clean Architecture — separated domain, data, and presentation layers with full unit-test coverage, dependency inversion, and protocol-driven boundaries. Serves as a reference for disciplined, test-first iOS development.",
      url: "https://github.com/salahamassi/PrayersTimes",
    },
    {
      name: "Quran-svg-mobile — Author",
      description:
        "Tooling project that adapts SVG output from the Quran SVG repository for mobile applications. Uses XMLDocument to programmatically strip unneeded layers and Inkscape to remove white margins — producing clean, mobile-ready SVG assets.",
      url: "https://github.com/salahamassi/Quran-svg-mobile",
    },
    {
      name: "Represent Me — AI Agent Dashboard",
      description:
        "Personal project: a full AI agent system with 5 interconnected Claude-powered agents (Job Matcher, Resume Generator, GitHub Agent, Content Agent, LinkedIn Agent) communicating over an event-driven pub/sub bus. Structured outputs via Zod, SQLite persistence, Telegram Bot integration, and 8 scheduled background tasks.",
    },
    {
      name: "share_plus (Flutter)",
      description:
        "Fixed an Objective-C bug causing 'share text' not to show when sharing files in the widely used plus_plugins package — PR #907.",
      url: "https://github.com/fluttercommunity/plus_plugins/pull/907",
    },
    {
      name: "Flutterfire CLI",
      description:
        "Opened a PR to support flavors on the Flutterfire CLI, contributing to the improvement and expansion of the Flutter ecosystem — PR #92.",
      url: "https://github.com/invertase/flutterfire_cli/pull/92",
    },
    {
      name: "SwifterSwift library",
      description:
        "Contributed to SwifterSwift (Stackview / swap) — PR #989.",
      url: "https://github.com/SwifterSwift/SwifterSwift/pull/989",
    },
    {
      name: "Android-Mask-Date-EditText",
      description:
        "Kotlin UI component for Android: a date-masking EditText published as open source.",
      url: "https://github.com/salahamassi/Android-Mask-Date-EditText",
    },
  ],
  // Mirror of mediumArticles in src/data/medium-data.ts. Updated from
  // the live RSS feed at https://medium.com/feed/@salahamassi — every
  // URL is the real hash-slug URL (slug-only URLs 404 on Medium). When
  // a new article is published, update both arrays together.
  publications: [
    {
      title:
        "Design-Driven Firebase in Flutter: Building Custom In-App Messaging with SwiftUI & Compose",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/design-driven-firebase-in-flutter-building-custom-in-app-messaging-with-swiftui-compose-ff2b7875d8a7",
      date: "2025-04-10",
    },
    {
      title:
        "Swift Protocol Magic: Building a Beautiful, Reusable Option Selection System",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/swift-protocol-magic-building-a-beautiful-reusable-option-selection-system-bcb76adead7c",
      date: "2025-03-30",
    },
    {
      title: "A Start-up's Guide to the iOS User Notifications Framework",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/a-start-ups-guide-to-the-ios-user-notifications-framework-68d52de00ef8",
      date: "2023-08-17",
    },
    {
      title:
        "Understanding Service Providers in Flutter Bond: A Hands-on Approach",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/understanding-service-providers-in-flutter-bond-a-hands-on-approach-c124f9d50cfe",
      date: "2023-05-17",
    },
    {
      title:
        "Flutter Bond: An Innovative Framework for Accelerating Mobile Development",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/flutter-bond-a-laravel-inspired-framework-for-streamlined-mobile-development-8fb28b128ef7",
      date: "2023-04-23",
    },
    {
      title: "Flutter Dio Interceptors + Unit Test",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/flutter-dio-interceptors-unit-test-c2795867bbff",
      date: "2022-12-18",
    },
    {
      title: "Power of the Swift Extensions with Type Constraints",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/power-of-the-swift-extensions-with-type-constraints-97b1c8a4536e",
      date: "2022-12-10",
    },
    {
      title: "Stretchy Header Collection View with Images Slider",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/stretchy-header-collection-view-with-images-slider-8202a56b3cbf",
      date: "2022-07-03",
    },
    {
      title:
        "Present and Dismiss View Controller with Simple and Pretty Transition Animation",
      platform: "Medium",
      url: "https://medium.com/@salahamassi/present-and-dismiss-view-controller-with-simple-and-pretty-transition-animation-7fa42ddbda5f",
      date: "2019-05-17",
    },
  ],
};
