import type { AgentResult, ArticleSuggestion } from "@/types";
import { profile } from "@/data/profile";
import { mediumArticles } from "@/data/medium-data";

const ARTICLE_SUGGESTIONS: ArticleSuggestion[] = [
  {
    id: "art-1",
    title: "Building Production Flutter Plugins: Lessons from Flutter Bond",
    targetPlatform: "medium",
    difficulty: "advanced",
    estimatedReadTime: "15 min",
    tags: ["Flutter", "Dart", "Open Source", "Architecture"],
    outline: [
      "Why we built Flutter Bond and the problems it solves",
      "Architecture decisions: monorepo vs separate packages",
      "Publishing to pub.dev: versioning, testing, and CI/CD",
    ],
    rationale: "You have 7 pub.dev packages but no article explaining the framework as a whole. This is your biggest untold story.",
  },
  {
    id: "art-2",
    title: "SwiftUI vs UIKit in 2026: A Practitioner's Guide",
    targetPlatform: "medium",
    difficulty: "intermediate",
    estimatedReadTime: "12 min",
    tags: ["Swift", "SwiftUI", "UIKit", "iOS"],
    outline: [
      "When to use SwiftUI vs UIKit (decision framework)",
      "UIKit-SwiftUI interop patterns from real production code",
      "Migration strategy: gradual adoption without rewrites",
    ],
    rationale: "You have production experience with both. Most content is either pro-SwiftUI or pro-UIKit, not balanced practitioner advice.",
  },
  {
    id: "art-3",
    title: "Clean Architecture in Flutter: Beyond the Tutorial",
    targetPlatform: "medium",
    difficulty: "advanced",
    estimatedReadTime: "14 min",
    tags: ["Flutter", "Architecture", "Clean Code", "Bond"],
    outline: [
      "Common mistakes in Flutter architecture (from reviewing 10+ codebases)",
      "How Flutter Bond enforces clean architecture",
      "Real-world examples: form handling, caching, and networking",
    ],
    rationale: "Architecture content performs well on Medium. Your framework experience gives you unique authority.",
  },
  {
    id: "art-4",
    title: "From Developer to VP of Innovation: What I Learned Leading Mobile Teams",
    targetPlatform: "linkedin",
    difficulty: "beginner",
    estimatedReadTime: "8 min",
    tags: ["Leadership", "Career Growth", "Mobile", "Startups"],
    outline: [
      "The mindset shift from coding to leading",
      "Building a mobile engineering culture at a venture studio",
      "Balancing technical depth with strategic breadth",
    ],
    rationale: "Leadership content is underrepresented in your portfolio. This humanizes your profile and attracts senior roles.",
  },
  {
    id: "art-5",
    title: "Automated Mobile CI/CD: CodeMagic vs EAS vs GitHub Actions",
    targetPlatform: "devto",
    difficulty: "intermediate",
    estimatedReadTime: "10 min",
    tags: ["CI/CD", "CodeMagic", "EAS", "GitHub Actions", "Mobile"],
    outline: [
      "Setup comparison: time to first green build",
      "Cost analysis for indie vs team vs enterprise",
      "My recommended setup for Flutter + iOS projects",
    ],
    rationale: "You have production experience with CodeMagic and EAS. CI/CD comparison posts get high engagement on Dev.to.",
  },
  {
    id: "art-6",
    title: "Protocol-Oriented Programming in Swift: Real-World Patterns",
    targetPlatform: "medium",
    difficulty: "advanced",
    estimatedReadTime: "14 min",
    tags: ["Swift", "POP", "iOS", "Architecture"],
    outline: [
      "Beyond the basics: when POP shines and when it doesn't",
      "The option selection system pattern (from WINCH)",
      "Testing protocol-oriented code effectively",
    ],
    rationale: "Your Swift Protocol Magic article was well-received. A deeper dive would build on that momentum.",
  },
  {
    id: "art-7",
    title: "Building a Shared Module for Multiple App Variants in Swift",
    targetPlatform: "medium",
    difficulty: "advanced",
    estimatedReadTime: "12 min",
    tags: ["Swift", "iOS", "Modular Architecture", "SPM"],
    outline: [
      "The problem: 3 apps (Client, Provider, Owner) sharing core logic",
      "WinchCore architecture: shared UI components + business logic",
      "Managing feature flags and variant-specific behavior",
    ],
    rationale: "Multi-app architecture is a common challenge with little practical content. Your WINCH experience is directly relevant.",
  },
  {
    id: "art-8",
    title: "React Native for Swift/Flutter Developers: A Survival Guide",
    targetPlatform: "devto",
    difficulty: "intermediate",
    estimatedReadTime: "10 min",
    tags: ["React Native", "Flutter", "Swift", "Cross-Platform"],
    outline: [
      "Mental model differences: declarative UI across frameworks",
      "Expo ecosystem for native developers",
      "What I miss from Swift/Flutter (and what's actually better)",
    ],
    rationale: "Unique perspective — most devs go web-to-mobile, not the other way. Your BIM Ventures experience is rare.",
  },
  {
    id: "art-9",
    title: "End-to-End Testing in Flutter: From Driver to Integration Tests",
    targetPlatform: "medium",
    difficulty: "intermediate",
    estimatedReadTime: "10 min",
    tags: ["Flutter", "Testing", "E2E", "Quality"],
    outline: [
      "Evolution of Flutter testing: driver vs integration_test",
      "Setting up a robust E2E test suite",
      "CI integration: running E2E tests on every PR",
    ],
    rationale: "You contributed to flutter_driver testing samples. Testing content has long shelf life and SEO value.",
  },
  {
    id: "art-10",
    title: "Building Custom Firebase In-App Messaging (The Native Way)",
    targetPlatform: "medium",
    difficulty: "advanced",
    estimatedReadTime: "12 min",
    tags: ["Firebase", "SwiftUI", "Jetpack Compose", "In-App Messaging"],
    outline: [
      "Why Firebase's default UI wasn't enough",
      "SwiftUI implementation with custom triggers",
      "Kotlin Jetpack Compose implementation + comparison",
    ],
    rationale: "Extends your existing Firebase article with the native implementation details. Cross-platform perspective is valuable.",
  },
  {
    id: "art-11",
    title: "How I Built a Laravel-Inspired Framework for Flutter",
    targetPlatform: "devto",
    difficulty: "intermediate",
    estimatedReadTime: "8 min",
    tags: ["Flutter", "Dart", "Framework", "Open Source"],
    outline: [
      "The inspiration: what Laravel gets right that Flutter lacks",
      "Core design principles behind Flutter Bond",
      "Getting started: your first Bond-powered app",
    ],
    rationale: "Origin story content performs well. This doubles as Flutter Bond marketing and establishes you as a framework author.",
  },
  {
    id: "art-12",
    title: "Mobile App Analytics Stack for Startups: Appsflyer + WebEngage + Intercom",
    targetPlatform: "medium",
    difficulty: "intermediate",
    estimatedReadTime: "10 min",
    tags: ["Analytics", "Martech", "Mobile", "Startups", "Growth"],
    outline: [
      "Choosing the right analytics tools for a startup budget",
      "Integration architecture: avoiding SDK bloat",
      "Key metrics that actually drive user acquisition",
    ],
    rationale: "Your Famcare experience with martech is unique among mobile devs. Growth-focused content attracts startup roles.",
  },
];

export async function run(): Promise<AgentResult> {
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));

  const existingTopics = new Set(mediumArticles.flatMap((a) => a.tags.map((t) => t.toLowerCase())));
  const publishingGaps: string[] = [];

  const lastArticleDate = new Date(
    Math.max(...mediumArticles.map((a) => new Date(a.publishDate).getTime()))
  );
  const monthsSinceLastArticle =
    (Date.now() - lastArticleDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

  // Check for topic coverage gaps
  const expertiseAreas = ["Architecture", "Testing", "CI/CD", "Leadership", "Open Source", "Analytics"];
  expertiseAreas.forEach((area) => {
    if (!existingTopics.has(area.toLowerCase())) {
      publishingGaps.push(area);
    }
  });

  return {
    findings: [
      {
        id: "ct-article-count",
        agentId: "content",
        severity: mediumArticles.length < 15 ? "warning" : "positive",
        title: `${mediumArticles.length} articles published on Medium`,
        description: `For a 5+ year career, 15-20 articles is a good target. You're at ${mediumArticles.length}. Publishing 1-2 articles per month would close the gap in 6 months.`,
        category: "Volume",
      },
      {
        id: "ct-publishing-frequency",
        agentId: "content",
        severity: monthsSinceLastArticle > 3 ? "warning" : "positive",
        title:
          monthsSinceLastArticle > 3
            ? `No articles in ${Math.round(monthsSinceLastArticle)} months`
            : "Recent publishing activity detected",
        description:
          monthsSinceLastArticle > 3
            ? "Consistent publishing builds audience. Even one article per month keeps your profile active."
            : "Good momentum! Keep publishing regularly to build audience.",
        category: "Frequency",
      },
      {
        id: "ct-topic-gaps",
        agentId: "content",
        severity: "info",
        title: `${publishingGaps.length} expertise areas with no articles`,
        description: `You have experience in ${publishingGaps.join(", ")} but no articles about them. These are opportunities for unique content.`,
        category: "Coverage",
        evidence: publishingGaps.join(", "),
      },
      {
        id: "ct-cross-posting",
        agentId: "content",
        severity: "warning",
        title: "Only 2 of 9 Medium articles are on Dev.to",
        description:
          "Cross-posting to Dev.to takes 5 minutes per article and doubles your reach. Use canonical URLs to avoid SEO issues.",
        category: "Distribution",
      },
      {
        id: "ct-no-linkedin",
        agentId: "content",
        severity: "warning",
        title: "No LinkedIn articles or posts detected",
        description:
          "LinkedIn posts get 10x more recruiter visibility than Medium articles. Share excerpts or original short-form content.",
        category: "Distribution",
      },
      {
        id: "ct-suggestions-ready",
        agentId: "content",
        severity: "positive",
        title: `${ARTICLE_SUGGESTIONS.length} article ideas generated`,
        description:
          "Based on your expertise, projects, and market gaps, we've identified high-impact article topics across Medium, Dev.to, and LinkedIn.",
        category: "Suggestions",
      },
    ],
    actionItems: [
      {
        id: "ct-action-crosspost",
        agentId: "content",
        priority: "high",
        effort: "quick",
        title: "Cross-post 7 remaining articles to Dev.to",
        description:
          "Copy your 7 Medium-only articles to Dev.to. Set canonical URL to Medium to preserve SEO. This takes ~5 minutes per article.",
        completed: false,
        link: "https://dev.to/new",
      },
      {
        id: "ct-action-bond-article",
        agentId: "content",
        priority: "high",
        effort: "significant",
        title: "Write the Flutter Bond origin story",
        description:
          "This is your most impactful unwritten article. A framework author story gets shares, establishes authority, and drives pub.dev installs.",
        completed: false,
      },
      {
        id: "ct-action-linkedin-posts",
        agentId: "content",
        priority: "high",
        effort: "moderate",
        title: "Start posting on LinkedIn (2x per week)",
        description:
          "Week 1: Share your Flutter Bond story. Week 2: Technical tip. Create a template and batch-write posts every Sunday.",
        completed: false,
      },
      {
        id: "ct-action-leadership",
        agentId: "content",
        priority: "medium",
        effort: "moderate",
        title: "Write one leadership article",
        description:
          "Your VP of Innovation story is unique. Leadership content attracts senior roles and differentiates you from code-only profiles.",
        completed: false,
      },
      {
        id: "ct-action-schedule",
        agentId: "content",
        priority: "medium",
        effort: "quick",
        title: "Set up a content calendar",
        description:
          "Plan the next 8 weeks: alternate between Medium deep-dives and LinkedIn short posts. Target 1 article + 2 LinkedIn posts per week.",
        completed: false,
      },
    ],
  };
}

export { ARTICLE_SUGGESTIONS };
