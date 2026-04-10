import type { AgentResult } from "@/types";
import { profile } from "@/data/profile";

const IN_DEMAND_KEYWORDS = [
  "SwiftUI", "Combine", "Swift Concurrency", "async/await",
  "Jetpack Compose", "Kotlin Multiplatform", "KMP",
  "Flutter", "Dart", "React Native", "Expo",
  "CI/CD", "Fastlane", "GitHub Actions",
  "Clean Architecture", "MVVM", "TDD",
  "GraphQL", "REST APIs", "Firebase",
  "App Store Optimization", "Mobile Performance",
  "Cross-Platform", "Modular Architecture",
  "Protocol-Oriented Programming", "Unit Testing",
];

export async function run(): Promise<AgentResult> {
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));

  const allSkills = profile.skills.flatMap((s) => s.items);
  const matchedKeywords = IN_DEMAND_KEYWORDS.filter((kw) =>
    allSkills.some((s) => s.toLowerCase().includes(kw.toLowerCase()))
  );
  const missingKeywords = IN_DEMAND_KEYWORDS.filter(
    (kw) => !allSkills.some((s) => s.toLowerCase().includes(kw.toLowerCase()))
  );

  return {
    findings: [
      {
        id: "li-no-data",
        agentId: "linkedin",
        severity: "warning",
        title: "LinkedIn profile could not be fetched directly",
        description:
          "All recommendations below are based on your resume. Visit your LinkedIn profile to verify current state.",
        category: "Data Quality",
      },
      {
        id: "li-headline",
        agentId: "linkedin",
        severity: "critical",
        title: "Headline should be keyword-optimized",
        description:
          'Recommended headline: "Senior Mobile Engineer | iOS (Swift/SwiftUI) & Flutter | Open Source Framework Author | VP Innovation"',
        category: "Headline",
        evidence: profile.role,
      },
      {
        id: "li-about",
        agentId: "linkedin",
        severity: "warning",
        title: "About section should tell your story",
        description:
          "Your About section should cover: (1) What drives you as an engineer, (2) Key achievements with metrics (100K+ downloads, 30% deployment time reduction, 90% stability improvement), (3) Flutter Bond framework and open-source leadership, (4) What you're looking for next.",
        category: "About",
      },
      {
        id: "li-keywords-match",
        agentId: "linkedin",
        severity: "positive",
        title: `${matchedKeywords.length} in-demand keywords match your skills`,
        description: `Your profile aligns with these trending keywords: ${matchedKeywords.join(", ")}`,
        category: "Keywords",
        evidence: `${matchedKeywords.length}/${IN_DEMAND_KEYWORDS.length} keywords matched`,
      },
      {
        id: "li-keywords-missing",
        agentId: "linkedin",
        severity: "info",
        title: `${missingKeywords.length} trending keywords missing`,
        description: `Consider adding experience or mentions of: ${missingKeywords.slice(0, 8).join(", ")}`,
        category: "Keywords",
      },
      {
        id: "li-featured",
        agentId: "linkedin",
        severity: "warning",
        title: "Use the Featured section",
        description:
          "Pin your best Medium articles, Flutter Bond repo, and AppRouter-UIKit to the Featured section for maximum visibility.",
        category: "Featured",
      },
      {
        id: "li-activity",
        agentId: "linkedin",
        severity: "info",
        title: "Post consistently to boost algorithm visibility",
        description:
          "LinkedIn rewards consistent posting. Aim for 2-3 posts per week: 1 technical insight, 1 project update, 1 community engagement.",
        category: "Activity",
      },
    ],
    actionItems: [
      {
        id: "li-action-headline",
        agentId: "linkedin",
        priority: "high",
        effort: "quick",
        title: "Update LinkedIn headline",
        description:
          'Change to: "Senior Mobile Engineer | iOS (Swift/SwiftUI) & Flutter | Open Source Framework Author"',
        completed: false,
        link: profile.links.linkedin,
      },
      {
        id: "li-action-about",
        agentId: "linkedin",
        priority: "high",
        effort: "moderate",
        title: "Rewrite About section with metrics",
        description:
          "Include: 5+ years experience, 100K+ downloads, Flutter Bond framework, VP Innovation role, and what you're seeking.",
        completed: false,
        link: profile.links.linkedin,
      },
      {
        id: "li-action-featured",
        agentId: "linkedin",
        priority: "high",
        effort: "quick",
        title: "Add 3 items to Featured section",
        description:
          "Pin: (1) Design-Driven Firebase article, (2) Flutter Bond GitHub, (3) Swift Protocol Magic article",
        completed: false,
        link: profile.links.linkedin,
      },
      {
        id: "li-action-skills",
        agentId: "linkedin",
        priority: "medium",
        effort: "quick",
        title: "Add missing skills to LinkedIn",
        description: `Add: ${missingKeywords.slice(0, 5).join(", ")} to your LinkedIn skills section.`,
        completed: false,
        link: profile.links.linkedin,
      },
      {
        id: "li-action-posting",
        agentId: "linkedin",
        priority: "medium",
        effort: "significant",
        title: "Start a 4-week posting schedule",
        description:
          "Week 1: Share Flutter Bond story. Week 2: Technical tip from WINCH. Week 3: Cross-post Medium article. Week 4: Share a lesson from leading mobile teams.",
        completed: false,
      },
      {
        id: "li-action-recommendations",
        agentId: "linkedin",
        priority: "low",
        effort: "moderate",
        title: "Request 3-5 LinkedIn recommendations",
        description:
          "Ask former colleagues at One Studio, ITG, or WINCH for recommendations highlighting your technical leadership and mentoring.",
        completed: false,
      },
    ],
  };
}
