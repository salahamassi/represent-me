// Salah's job preferences — used by Job Matcher agent for scoring and searching

export const jobPreferences = {
  // Role preferences (ordered by interest)
  targetRoles: [
    "Developer Advocate",
    "DevRel Engineer",
    "Open Source Engineer",
    "Mobile Consultant",
    "Senior Flutter Developer",
    "Senior iOS Developer",
    "Senior Mobile Engineer",
    "Mobile Tech Lead",
    "Flutter Architect",
  ],

  // What makes you happy at work
  interests: [
    "Open source contributions",
    "Mentoring junior developers",
    "Technical writing and content",
    "Building frameworks and developer tools",
    "Clean architecture and code quality",
  ],

  // Stack (ordered by preference)
  techStack: {
    primary: ["Flutter", "Dart", "Swift", "SwiftUI"],
    secondary: ["React Native", "TypeScript", "Kotlin", "UIKit"],
    ai: ["Claude AI / Anthropic API", "AI Agent Architecture", "Prompt Engineering", "LLM Integration"],
    tools: ["Firebase", "CodeMagic", "EAS", "Fastlane", "CI/CD", "Git"],
  },

  // Work arrangement
  location: {
    preference: "remote-first",
    currentLocation: "Cairo, Egypt",
    openToRelocation: true,
    targetRegions: ["Europe", "Gulf (UAE, Saudi)", "US", "UK", "Canada"],
    timezone: "UTC+2",
  },

  // Salary
  salary: {
    minimum: 4000, // USD/month
    target: 6000,
    currency: "USD",
    period: "monthly",
  },

  // Experience highlights (for matching)
  highlights: [
    "5+ years mobile development",
    "Created Flutter Bond framework (7 packages on pub.dev)",
    "Built AI agent systems using Claude API (Represent Me dashboard, Trivia QA Agent)",
    "Former VP of Innovation at One Studio",
    "100,000+ app downloads",
    "Open source contributor (share_plus, FlutterfireCLI, SwifterSwift)",
    "Technical writer on Medium and Dev.to",
    "Led mobile teams across startup portfolio",
    "Hands-on experience integrating LLMs into production mobile apps",
  ],

  // Keywords to search for
  searchKeywords: [
    "flutter", "dart", "swift", "ios", "mobile",
    "react native", "cross-platform",
    "developer advocate", "devrel", "developer relations",
    "open source", "mobile architect",
    "mobile lead", "mobile consultant",
  ],

  // Companies of interest (for proactive outreach)
  targetCompanyTypes: [
    "Companies with open source culture",
    "Developer tooling companies",
    "Mobile-first startups",
    "Companies using Flutter in production",
    "DevRel-focused organizations",
  ],
};
