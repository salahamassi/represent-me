import type { JobTemplate } from "@/types";
import { jobPreferences } from "@/data/job-preferences";

interface ArcDevJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
}

export async function fetchArcDevJobs(): Promise<{
  jobs: JobTemplate[];
  raw: ArcDevJob[];
}> {
  const searches = ["flutter", "ios-swift", "mobile"];
  const allJobs: ArcDevJob[] = [];

  for (const search of searches) {
    try {
      const res = await fetch(`https://arc.dev/remote-jobs/${search}`, {
        headers: { "User-Agent": "RepresentMe/1.0 (salahnahed@icloud.com)" },
      });

      if (!res.ok) continue;

      const html = await res.text();
      const parsed = parseArcDevHTML(html, search);
      allJobs.push(...parsed);
    } catch (err) {
      console.error(`[ArcDev] Failed to fetch ${search}:`, err);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allJobs.filter((j) => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  const normalized = unique.map(normalizeToJobTemplate);
  console.log(`[ArcDev] Found ${unique.length} unique jobs`);

  return { jobs: normalized, raw: unique };
}

function parseArcDevHTML(html: string, category: string): ArcDevJob[] {
  const jobs: ArcDevJob[] = [];

  // Extract job links and titles from the HTML
  // Arc.dev uses /remote-jobs/j/ pattern for job links
  const linkRegex = /href="(\/remote-jobs\/j\/[^"]+)"[^>]*>([^<]*)</g;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = `https://arc.dev${match[1]}`;
    const title = match[2].trim();

    if (title && title.length > 5 && !title.includes("remote-jobs")) {
      // Try to extract company from the URL slug
      const slug = match[1].replace("/remote-jobs/j/", "");
      const parts = slug.split("-");
      // Company name is usually at the start of the slug
      const companyGuess = parts.slice(0, 2).join(" ").replace(/^\w/, (c) => c.toUpperCase());

      jobs.push({
        title,
        company: companyGuess,
        location: "Remote",
        url,
        description: `${category} position`,
      });
    }
  }

  return jobs;
}

function normalizeToJobTemplate(job: ArcDevJob): JobTemplate {
  const text = job.title.toLowerCase();

  const skillMap: Record<string, string> = {
    flutter: "Flutter", dart: "Dart", swift: "Swift", swiftui: "SwiftUI",
    "react native": "React Native", typescript: "TypeScript", kotlin: "Kotlin",
    ios: "iOS", android: "Android", mobile: "Mobile Development",
    "full stack": "Full Stack", "full-stack": "Full Stack",
  };

  const skills = Object.entries(skillMap)
    .filter(([kw]) => text.includes(kw))
    .map(([, skill]) => skill);

  if (skills.length === 0) skills.push("Mobile Development");

  return {
    id: `arc-${Buffer.from(job.url).toString("base64").slice(0, 20)}`,
    title: job.title,
    company: job.company,
    companyType: "Company",
    location: job.location,
    remote: true,
    requiredSkills: [...new Set(skills)],
    niceToHaveSkills: [],
    experienceYears: 3,
    description: job.description,
  };
}
