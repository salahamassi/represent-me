import type { Article } from "@/types";

/**
 * Salah's published Medium articles — the canonical list.
 *
 * Source of truth: https://medium.com/@salahamassi (RSS feed at
 * https://medium.com/feed/@salahamassi). Real Medium URLs always end
 * with a hash slug (e.g. `…-bcb76adead7c`); slug-only URLs 404. Any
 * change here must come from the live feed, not from memory.
 *
 * Tags drive the resume agent's role-relevance filter for the
 * Publications section (see `resume-ai-agent.ts` → `publicationsBlock`).
 * iOS roles get iOS/Swift entries; Flutter roles get Flutter/Dart
 * entries. Keep tags faithful to Medium's `<category>` list on each post.
 *
 * `readTime` is a rough estimate — Medium's RSS doesn't expose its own
 * computed value. Nothing in the app currently displays this field; it
 * exists only to satisfy the `Article` type.
 */
export const mediumArticles: Article[] = [
  {
    title:
      "Design-Driven Firebase in Flutter: Building Custom In-App Messaging with SwiftUI & Compose",
    url: "https://medium.com/@salahamassi/design-driven-firebase-in-flutter-building-custom-in-app-messaging-with-swiftui-compose-ff2b7875d8a7",
    publishDate: "2025-04-10",
    tags: [
      "Flutter",
      "Firebase",
      "SwiftUI",
      "Jetpack Compose",
      "Mobile App Development",
    ],
    readTime: "10 min",
    platform: "medium",
  },
  {
    title:
      "Swift Protocol Magic: Building a Beautiful, Reusable Option Selection System",
    url: "https://medium.com/@salahamassi/swift-protocol-magic-building-a-beautiful-reusable-option-selection-system-bcb76adead7c",
    publishDate: "2025-03-30",
    tags: [
      "iOS",
      "Swift",
      "Protocol-Oriented Programming",
      "iOS App Development",
      "Software Engineering",
    ],
    readTime: "12 min",
    platform: "medium",
  },
  {
    title: "A Start-up's Guide to the iOS User Notifications Framework",
    url: "https://medium.com/@salahamassi/a-start-ups-guide-to-the-ios-user-notifications-framework-68d52de00ef8",
    publishDate: "2023-08-17",
    tags: ["iOS", "Swift", "Notifications", "Startups"],
    readTime: "10 min",
    platform: "medium",
  },
  {
    title:
      "Understanding Service Providers in Flutter Bond: A Hands-on Approach",
    url: "https://medium.com/@salahamassi/understanding-service-providers-in-flutter-bond-a-hands-on-approach-c124f9d50cfe",
    publishDate: "2023-05-17",
    tags: ["Flutter", "Service Locator", "Mobile App Development"],
    readTime: "7 min",
    platform: "medium",
  },
  {
    title:
      "Flutter Bond: An Innovative Framework for Accelerating Mobile Development",
    url: "https://medium.com/@salahamassi/flutter-bond-a-laravel-inspired-framework-for-streamlined-mobile-development-8fb28b128ef7",
    publishDate: "2023-04-23",
    tags: ["Flutter", "Laravel", "Mobile App Development"],
    readTime: "8 min",
    platform: "medium",
  },
  {
    title: "Flutter Dio Interceptors + Unit Test",
    url: "https://medium.com/@salahamassi/flutter-dio-interceptors-unit-test-c2795867bbff",
    publishDate: "2022-12-18",
    tags: ["Flutter", "Networking", "HTTP Interceptors", "Unit Testing", "TDD"],
    readTime: "7 min",
    platform: "medium",
  },
  {
    title: "Power of the Swift Extensions with Type Constraints",
    url: "https://medium.com/@salahamassi/power-of-the-swift-extensions-with-type-constraints-97b1c8a4536e",
    publishDate: "2022-12-10",
    tags: ["iOS", "Swift", "Protocol-Oriented Programming", "Extensions"],
    readTime: "6 min",
    platform: "medium",
  },
  {
    title: "Stretchy Header Collection View with Images Slider",
    url: "https://medium.com/@salahamassi/stretchy-header-collection-view-with-images-slider-8202a56b3cbf",
    publishDate: "2022-07-03",
    tags: ["iOS", "Swift", "UIKit", "UICollectionView", "iOS App Development"],
    readTime: "5 min",
    platform: "medium",
  },
  {
    title:
      "Present and Dismiss View Controller with Simple and Pretty Transition Animation",
    url: "https://medium.com/@salahamassi/present-and-dismiss-view-controller-with-simple-and-pretty-transition-animation-7fa42ddbda5f",
    publishDate: "2019-05-17",
    tags: ["iOS", "Swift", "UIKit", "Animation", "UIViewController"],
    readTime: "5 min",
    platform: "medium",
  },
];
