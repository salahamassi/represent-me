import type { AgentResult, JobMatch, JobTemplate } from "@/types";
import { profile } from "@/data/profile";

const JOB_TEMPLATES: JobTemplate[] = [
  {
    id: "job-1",
    title: "Senior iOS Engineer",
    company: "Fintech Startup (Series B)",
    companyType: "Startup",
    location: "Remote (EMEA)",
    remote: true,
    requiredSkills: ["Swift", "SwiftUI", "UIKit", "REST APIs", "Unit Testing", "CI/CD"],
    niceToHaveSkills: ["Combine", "CoreData", "GraphQL", "Fastlane"],
    experienceYears: 5,
    description: "Build and maintain iOS apps for a growing fintech platform serving millions of users.",
  },
  {
    id: "job-2",
    title: "Senior Flutter Developer",
    company: "HealthTech Company",
    companyType: "Mid-size",
    location: "Remote (Global)",
    remote: true,
    requiredSkills: ["Flutter", "Dart", "REST APIs", "Firebase", "Clean Architecture"],
    niceToHaveSkills: ["iOS native", "Android native", "GraphQL", "Riverpod"],
    experienceYears: 4,
    description: "Lead Flutter development for patient-facing mobile apps in healthcare.",
  },
  {
    id: "job-3",
    title: "Mobile Tech Lead",
    company: "E-Commerce Platform",
    companyType: "Enterprise",
    location: "Cairo, Egypt (Hybrid)",
    remote: false,
    requiredSkills: ["Flutter", "Swift", "Team Leadership", "Clean Architecture", "CI/CD", "REST APIs"],
    niceToHaveSkills: ["React Native", "Kotlin", "Mentoring", "Agile"],
    experienceYears: 5,
    description: "Lead a team of 5 mobile engineers building the company's flagship shopping app.",
  },
  {
    id: "job-4",
    title: "Staff Mobile Engineer",
    company: "Large Tech Company",
    companyType: "Enterprise",
    location: "Remote (US/EU)",
    remote: true,
    requiredSkills: ["Swift", "SwiftUI", "System Design", "Performance Optimization", "Mentoring", "CI/CD"],
    niceToHaveSkills: ["Kotlin", "Cross-Platform", "Open Source", "Technical Writing"],
    experienceYears: 7,
    description: "Drive mobile architecture decisions across multiple product teams.",
  },
  {
    id: "job-5",
    title: "Cross-Platform Mobile Lead",
    company: "Series A Startup",
    companyType: "Startup",
    location: "Remote (MENA)",
    remote: true,
    requiredSkills: ["Flutter", "Dart", "iOS", "Android", "CI/CD", "Team Leadership"],
    niceToHaveSkills: ["React Native", "Firebase", "Fastlane", "Open Source"],
    experienceYears: 4,
    description: "Own the mobile stack from scratch for a growing Arabic-first product.",
  },
  {
    id: "job-6",
    title: "Senior React Native Developer",
    company: "Digital Agency",
    companyType: "Agency",
    location: "Cairo, Egypt",
    remote: false,
    requiredSkills: ["React Native", "TypeScript", "Expo", "REST APIs", "Unit Testing"],
    niceToHaveSkills: ["iOS native", "CI/CD", "Zod", "React Hook Form"],
    experienceYears: 3,
    description: "Build React Native apps for various clients in fintech, e-commerce, and logistics.",
  },
  {
    id: "job-7",
    title: "iOS Developer (SwiftUI)",
    company: "Entertainment Tech",
    companyType: "Mid-size",
    location: "Remote (EU)",
    remote: true,
    requiredSkills: ["Swift", "SwiftUI", "Combine", "async/await", "Unit Testing"],
    niceToHaveSkills: ["UIKit", "CoreAnimation", "Accessibility", "CI/CD"],
    experienceYears: 4,
    description: "Build next-gen streaming experiences with SwiftUI for millions of subscribers.",
  },
  {
    id: "job-8",
    title: "Mobile Engineer — Logistics",
    company: "Logistics Platform",
    companyType: "Enterprise",
    location: "Saudi Arabia (Remote OK)",
    remote: true,
    requiredSkills: ["Swift", "UIKit", "Real-time tracking", "REST APIs", "Protocol-Oriented Programming"],
    niceToHaveSkills: ["Flutter", "Maps SDK", "CI/CD", "Ruby"],
    experienceYears: 4,
    description: "Build and scale mobile apps for a last-mile delivery platform in the Gulf region.",
  },
];

function calculateFit(job: JobTemplate): JobMatch {
  const allSkills = profile.skills.flatMap((s) => s.items);
  const allHighlights = profile.experience.flatMap((e) => e.highlights.join(" ").toLowerCase());
  const allTech = profile.experience.flatMap((e) => e.technologies);
  const combinedSkills = [...new Set([...allSkills, ...allTech])];

  const hasSkill = (skill: string) =>
    combinedSkills.some((s) => s.toLowerCase().includes(skill.toLowerCase())) ||
    allHighlights.some((h) => h.includes(skill.toLowerCase()));

  const matchedRequired = job.requiredSkills.filter(hasSkill);
  const missingRequired = job.requiredSkills.filter((s) => !hasSkill(s));
  const matchedNice = job.niceToHaveSkills.filter(hasSkill);

  const requiredScore = (matchedRequired.length / job.requiredSkills.length) * 50;
  const niceScore = (matchedNice.length / job.niceToHaveSkills.length) * 20;

  const totalYears = 5;
  const expScore = totalYears >= job.experienceYears ? 15 : (totalYears / job.experienceYears) * 15;

  const hasLeadership = profile.experience.some((e) =>
    e.title.toLowerCase().includes("lead") || e.title.toLowerCase().includes("vp")
  );
  const leadershipBonus = job.title.toLowerCase().includes("lead") && hasLeadership ? 10 : 5;

  const fitPercentage = Math.min(Math.round(requiredScore + niceScore + expScore + leadershipBonus), 100);

  return {
    ...job,
    fitPercentage,
    matchedSkills: matchedRequired,
    missingSkills: missingRequired,
    matchedNiceToHave: matchedNice,
  };
}

export async function run(): Promise<AgentResult> {
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 800));

  const matches: JobMatch[] = JOB_TEMPLATES.map(calculateFit).sort(
    (a, b) => b.fitPercentage - a.fitPercentage
  );

  const findings = matches.map((match, i) => ({
    id: `jm-match-${i}`,
    agentId: "job-matcher" as const,
    severity: (match.fitPercentage >= 75
      ? "positive"
      : match.fitPercentage >= 50
        ? "info"
        : "warning") as "positive" | "info" | "warning",
    title: `${match.fitPercentage}% fit — ${match.title} at ${match.company}`,
    description: `${match.description} Location: ${match.location}. Matched: ${match.matchedSkills.join(", ")}${match.missingSkills.length > 0 ? `. Missing: ${match.missingSkills.join(", ")}` : ""}`,
    category: "Job Match",
    evidence: JSON.stringify({
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
      matchedNiceToHave: match.matchedNiceToHave,
      fitPercentage: match.fitPercentage,
    }),
  }));

  // Aggregate skills gap
  const skillGap: Record<string, number> = {};
  matches
    .filter((m) => m.fitPercentage >= 50)
    .forEach((m) => {
      m.missingSkills.forEach((s) => {
        skillGap[s] = (skillGap[s] || 0) + 1;
      });
    });
  const sortedGaps = Object.entries(skillGap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const actionItems = [
    ...sortedGaps.map(([skill, count], i) => ({
      id: `jm-action-skill-${i}`,
      agentId: "job-matcher" as const,
      priority: (i < 2 ? "high" : "medium") as "high" | "medium",
      effort: "significant" as const,
      title: `Learn ${skill}`,
      description: `Missing from ${count} job matches. Adding this skill would improve your fit across multiple roles.`,
      completed: false,
    })),
    {
      id: "jm-action-portfolio",
      agentId: "job-matcher" as const,
      priority: "high" as const,
      effort: "moderate" as const,
      title: "Build portfolio pieces for top matches",
      description: `Your top match is "${matches[0]?.title}". Create a sample project showcasing the required skills for this role.`,
      completed: false,
    },
  ];

  return { findings, actionItems };
}

export { JOB_TEMPLATES, calculateFit };
