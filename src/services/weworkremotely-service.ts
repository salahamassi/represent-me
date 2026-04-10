import type { JobTemplate } from "@/types";
import { jobPreferences } from "@/data/job-preferences";

/**
 * WeWorkRemotely doesn't have a public JSON API.
 * We fetch the RSS feed which is available as XML.
 */
const RSS_URL = "https://weworkremotely.com/categories/remote-programming-jobs.rss";

interface RSSJob {
  title: string;
  company: string;
  link: string;
  description: string;
  pubDate: string;
  region: string;
}

export async function fetchWeWorkRemotelyJobs(): Promise<{
  jobs: JobTemplate[];
  raw: RSSJob[];
}> {
  try {
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": "RepresentMe/1.0 (salahnahed@icloud.com)" },
    });

    if (!res.ok) {
      console.log(`[WWR] RSS fetch failed: ${res.status}`);
      return { jobs: [], raw: [] };
    }

    const xml = await res.text();
    const rawJobs = parseRSS(xml);
    const relevant = rawJobs.filter(isRelevantJob);
    const normalized = relevant.map(normalizeToJobTemplate);

    console.log(`[WWR] Found ${rawJobs.length} total, ${relevant.length} relevant`);

    return { jobs: normalized, raw: relevant };
  } catch (err) {
    console.error("[WWR] Fetch error:", err);
    return { jobs: [], raw: [] };
  }
}

function parseRSS(xml: string): RSSJob[] {
  const jobs: RSSJob[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, "title");
    const link = extractTag(item, "link");
    const description = extractTag(item, "description");
    const pubDate = extractTag(item, "pubDate");
    const region = extractTag(item, "region") || "Remote";

    // Parse company from title (usually "Company: Job Title")
    const titleParts = title.split(":");
    const company = titleParts.length > 1 ? titleParts[0].trim() : "Unknown";
    const jobTitle = titleParts.length > 1 ? titleParts.slice(1).join(":").trim() : title;

    if (jobTitle) {
      jobs.push({
        title: jobTitle,
        company,
        link,
        description: description.replace(/<[^>]*>/g, "").slice(0, 2000),
        pubDate,
        region,
      });
    }
  }

  return jobs;
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`, "s"));
  return match ? match[1].trim() : "";
}

function isRelevantJob(job: RSSJob): boolean {
  const text = `${job.title} ${job.description}`.toLowerCase();
  return jobPreferences.searchKeywords.some((kw) => text.includes(kw.toLowerCase()));
}

function normalizeToJobTemplate(job: RSSJob): JobTemplate {
  const text = `${job.title} ${job.description}`.toLowerCase();

  const skillMap: Record<string, string> = {
    flutter: "Flutter", dart: "Dart", swift: "Swift", swiftui: "SwiftUI",
    "react native": "React Native", typescript: "TypeScript", kotlin: "Kotlin",
    ios: "iOS", android: "Android", firebase: "Firebase", mobile: "Mobile Development",
  };

  const skills = Object.entries(skillMap)
    .filter(([kw]) => text.includes(kw))
    .map(([, skill]) => skill);

  if (skills.length === 0) skills.push("Mobile Development");

  return {
    id: `wwr-${Buffer.from(job.link).toString("base64").slice(0, 20)}`,
    title: job.title,
    company: job.company,
    companyType: "Company",
    location: job.region || "Remote",
    remote: true,
    requiredSkills: [...new Set(skills)],
    niceToHaveSkills: [],
    experienceYears: 3,
    description: job.description.slice(0, 300),
  };
}
