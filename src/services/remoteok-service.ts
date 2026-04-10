import type { JobTemplate } from "@/types";

interface RemoteOKJob {
  id: string;
  slug: string;
  position: string;
  company: string;
  company_logo: string;
  tags: string[];
  location: string;
  url: string;
  description: string;
  date: string;
  salary_min?: number;
  salary_max?: number;
}

// Strong signals — if ANY of these match in tags, it's relevant
const STRONG_TAGS = [
  "ios", "swift", "swiftui", "flutter", "dart",
  "react-native", "react native", "expo",
];

// Title must contain one of these to be relevant
const RELEVANT_TITLE_KEYWORDS = [
  "mobile", "ios", "swift", "flutter", "dart",
  "react native", "cross-platform", "android",
  "developer advocate", "devrel", "developer relations",
];

// Exclude jobs with these in the title (even if tags match)
const EXCLUDE_TITLE_KEYWORDS = [
  "ui/ux", "ux/ui", "ux designer", "ui designer",
  "product manager", "project manager",
  "customer support", "customer service", "customer success",
  "security engineer", "cloud security", "devops",
  "data engineer", "data scientist", "machine learning",
  "sales", "marketing", "recruiter", "hr ",
  "qa manager", "test manager",
];

function isRelevantJob(job: RemoteOKJob): boolean {
  const tags = job.tags.map((t) => t.toLowerCase());
  const title = job.position.toLowerCase();

  // First: exclude obviously wrong roles
  if (EXCLUDE_TITLE_KEYWORDS.some((ex) => title.includes(ex))) {
    return false;
  }

  // Strong match: tags contain a mobile-specific technology
  if (STRONG_TAGS.some((st) => tags.includes(st))) {
    return true;
  }

  // Title match: must contain a relevant keyword
  if (RELEVANT_TITLE_KEYWORDS.some((kw) => title.includes(kw))) {
    return true;
  }

  return false;
}

function normalizeToJobTemplate(job: RemoteOKJob): JobTemplate {
  const tags = job.tags.map((t) => t.toLowerCase());

  // Map tags to skills
  const skillMap: Record<string, string> = {
    ios: "Swift",
    swift: "Swift",
    swiftui: "SwiftUI",
    flutter: "Flutter",
    dart: "Dart",
    "react native": "React Native",
    "react-native": "React Native",
    typescript: "TypeScript",
    kotlin: "Kotlin",
    android: "Android",
    firebase: "Firebase",
    graphql: "GraphQL",
    "rest api": "REST APIs",
    "ci/cd": "CI/CD",
    testing: "Unit Testing",
    mobile: "Mobile Development",
    expo: "Expo",
  };

  const requiredSkills = tags
    .map((t) => skillMap[t])
    .filter(Boolean) as string[];

  // Ensure at least some skills
  if (requiredSkills.length === 0) {
    requiredSkills.push("Mobile Development");
  }

  return {
    id: `remoteok-${job.id}`,
    title: job.position,
    company: job.company,
    companyType: "Company",
    location: job.location || "Remote",
    remote: true,
    requiredSkills: [...new Set(requiredSkills)],
    niceToHaveSkills: [],
    experienceYears: 3,
    description: (job.description || "").slice(0, 200).replace(/<[^>]*>/g, ""),
    url: `https://remoteok.com/remote-jobs/${job.slug || job.id}`,
  };
}

export async function fetchRemoteOKJobs(): Promise<{
  jobs: JobTemplate[];
  raw: RemoteOKJob[];
}> {
  const res = await fetch("https://remoteok.com/api", {
    headers: {
      "User-Agent": "RepresentMe/1.0 (salahnahed@icloud.com)",
    },
  });

  if (!res.ok) {
    throw new Error(`RemoteOK API error: ${res.status}`);
  }

  const data = (await res.json()) as RemoteOKJob[];

  // First element is metadata, skip it
  const jobs = data.slice(1).filter((j) => j.id && j.position);
  const relevant = jobs.filter(isRelevantJob);
  const normalized = relevant.map(normalizeToJobTemplate);

  return { jobs: normalized, raw: relevant };
}

export function getJobUrl(job: RemoteOKJob | { slug?: string; id: string }): string {
  if ("slug" in job && job.slug) {
    return `https://remoteok.com/remote-jobs/${job.slug}`;
  }
  return `https://remoteok.com/remote-jobs/${job.id}`;
}
