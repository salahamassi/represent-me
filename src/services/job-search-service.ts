/**
 * Multi-source job search.
 * Arc.dev is the primary source — fetched server-side via HTML parsing.
 */

import type { JobTemplate } from "@/types";

interface SearchedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
}

export async function fetchArcDevFlutterJobs(): Promise<SearchedJob[]> {
  const categories = ["flutter", "ios-swift", "react-native", "mobile"];
  const allJobs: SearchedJob[] = [];

  for (const cat of categories) {
    try {
      const res = await fetch(`https://arc.dev/remote-jobs/${cat}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html",
        },
      });
      if (!res.ok) {
        console.log(`[JobSearch] Arc.dev ${cat}: ${res.status}`);
        continue;
      }

      const html = await res.text();

      // Arc.dev job links follow pattern: /remote-jobs/j/company-slug-title-slug-JOBID
      // Extract from <a> tags
      const regex = /href="(\/remote-jobs\/j\/([^"]+))"[^>]*>/g;
      let match;
      const slugsSeen = new Set<string>();

      while ((match = regex.exec(html)) !== null) {
        const path = match[1];
        const slug = match[2];

        if (slugsSeen.has(slug)) continue;
        slugsSeen.add(slug);

        // Parse company and title from slug
        // Slugs look like: dutchie-senior-software-engineer-ii-ofadqx7lch
        const parts = slug.split("-");
        const jobId = parts[parts.length - 1]; // Last part is usually the ID

        // Find where company ends and title begins
        const titleWords = ["senior", "junior", "lead", "staff", "principal", "software", "engineer",
          "developer", "mobile", "flutter", "ios", "react", "full", "remote", "volunteer",
          "tech", "mid", "head", "vp", "director", "architect", "intern"];

        let splitIdx = parts.length - 1; // before job ID
        for (let i = 0; i < parts.length - 1; i++) {
          if (titleWords.includes(parts[i].toLowerCase())) {
            splitIdx = i;
            break;
          }
        }

        const company = parts.slice(0, splitIdx)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        const title = parts.slice(splitIdx, -1) // exclude job ID
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        if (title.length > 3 && company.length > 1) {
          allJobs.push({
            title,
            company,
            location: "Remote",
            url: `https://arc.dev${path}`,
            source: "arc.dev",
          });
        }
      }

      console.log(`[JobSearch] Arc.dev ${cat}: ${slugsSeen.size} jobs found`);
    } catch (err) {
      console.error(`[JobSearch] Arc.dev ${cat} failed:`, err);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allJobs.filter((j) => {
    if (seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });
}

/**
 * Normalize searched jobs to JobTemplate format for AI analysis
 */
export function normalizeSearchedJob(job: SearchedJob): JobTemplate {
  const text = `${job.title} ${job.company}`.toLowerCase();

  const skillMap: Record<string, string> = {
    flutter: "Flutter", dart: "Dart", swift: "Swift", swiftui: "SwiftUI",
    "react native": "React Native", "react-native": "React Native",
    typescript: "TypeScript", kotlin: "Kotlin",
    ios: "iOS", android: "Android", mobile: "Mobile Development",
  };

  const skills = Object.entries(skillMap)
    .filter(([kw]) => text.includes(kw))
    .map(([, skill]) => skill);

  if (skills.length === 0) skills.push("Software Engineering");

  return {
    id: `${job.source}-${Buffer.from(job.url).toString("base64url").slice(0, 30)}`,
    title: job.title,
    company: job.company,
    companyType: "Company",
    location: job.location,
    remote: true,
    requiredSkills: [...new Set(skills)],
    niceToHaveSkills: [],
    experienceYears: 3,
    description: "",
    url: job.url,
  };
}
