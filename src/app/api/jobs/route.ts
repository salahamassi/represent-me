import { NextResponse } from "next/server";
import { getSeenJobs, getContentByType } from "@/lib/db";
import { jobPreferences } from "@/data/job-preferences";
import { profile } from "@/data/profile";

export async function GET() {
  // Get jobs from DB (found by Job Matcher agent)
  const dbJobs = getSeenJobs(100) as {
    id: string;
    source: string;
    title: string;
    company: string | null;
    url: string | null;
    fit_percentage: number | null;
    matched_skills: string | null;
    missing_skills: string | null;
    ai_analysis: string | null;
    salary_estimate: string | null;
    first_seen_at: string;
    user_action: string | null;
    resume_id: number | null;
  }[];

  // Get all generated content to match with jobs
  const allContent = getContentByType("all") as { suggestion_id: string; content_type: string; generated_text: string }[];

  // Parse the jobs — only show 30%+ fit
  const jobs = dbJobs.filter((j) => (j.fit_percentage || 0) >= 30).map((j) => {
    const coverLetter = allContent.find((c) => c.suggestion_id === `job-${j.id}` && c.content_type === "cover_letter");
    return {
      ...j,
      matchedSkills: j.matched_skills ? JSON.parse(j.matched_skills) : [],
      missingSkills: j.missing_skills ? JSON.parse(j.missing_skills) : [],
      aiAnalysis: j.ai_analysis ? (() => { try { return JSON.parse(j.ai_analysis!); } catch { return null; } })() : null,
      coverLetter: coverLetter?.generated_text || null,
      hasResume: !!j.resume_id,
    };
  });

  // Separate by fit
  const highFit = jobs.filter((j) => (j.fit_percentage || 0) >= 70);
  const mediumFit = jobs.filter((j) => (j.fit_percentage || 0) >= 40 && (j.fit_percentage || 0) < 70);
  const lowFit = jobs.filter((j) => (j.fit_percentage || 0) < 40);

  // Generate proactive strategies when few jobs match
  const proactiveMode = highFit.length < 3;

  const targetCompanies = proactiveMode ? generateTargetCompanies() : [];
  const outreachTips = proactiveMode ? generateOutreachTips() : [];

  // Calculate job search score
  const score = calculateJobScore(jobs);

  return NextResponse.json({
    jobs,
    highFit,
    mediumFit,
    lowFit,
    score,
    preferences: jobPreferences,
    proactiveMode,
    targetCompanies,
    outreachTips,
    stats: {
      total: jobs.length,
      highFit: highFit.length,
      mediumFit: mediumFit.length,
      applied: jobs.filter((j) => j.user_action === "apply_later" || j.user_action === "applied").length,
      dismissed: jobs.filter((j) => j.user_action === "dismissed").length,
      withResume: jobs.filter((j) => j.resume_id).length,
    },
  });
}

function calculateJobScore(jobs: { fit_percentage: number | null; user_action: string | null }[]): {
  overall: number;
  categories: { label: string; score: number }[];
} {
  const hasJobs = jobs.length > 0 ? 30 : 0;
  const hasHighFit = jobs.some((j) => (j.fit_percentage || 0) >= 70) ? 25 : 0;
  const appliedScore = Math.min(25, jobs.filter((j) => j.user_action === "apply_later").length * 5);
  const diversityScore = Math.min(20, new Set(jobs.map((j) => j.fit_percentage)).size * 3);

  return {
    overall: hasJobs + hasHighFit + appliedScore + diversityScore,
    categories: [
      { label: "Job Pipeline", score: hasJobs },
      { label: "High Matches", score: hasHighFit },
      { label: "Applications", score: appliedScore },
      { label: "Diversity", score: diversityScore },
    ],
  };
}

function generateTargetCompanies() {
  return [
    {
      name: "Very Good Ventures",
      why: "Flutter consultancy — they build Flutter apps and contribute to the ecosystem. Your Flutter Bond framework aligns perfectly.",
      url: "https://verygood.ventures/careers",
    },
    {
      name: "Invertase",
      why: "Creators of FlutterFire. You've already contributed to their CLI. They hire remote Flutter developers.",
      url: "https://invertase.io/careers",
    },
    {
      name: "Codemagic (Nevercode)",
      why: "CI/CD for mobile — you use CodeMagic already. DevRel or engineering role would fit your CI/CD automation experience.",
      url: "https://codemagic.io/careers",
    },
    {
      name: "Stream",
      why: "Chat/feed API with Flutter SDK. They hire DevRel + Flutter engineers. Strong open source culture.",
      url: "https://getstream.io/careers",
    },
    {
      name: "Serverpod",
      why: "Dart backend framework — similar vision to Flutter Bond. They need Flutter-experienced engineers who understand full-stack Dart.",
      url: "https://serverpod.dev",
    },
    {
      name: "Widgetbook",
      why: "Flutter UI catalog tool (like Storybook). Your component architecture experience from Bond/WINCH is directly relevant.",
      url: "https://widgetbook.io",
    },
    {
      name: "Shorebird",
      why: "Code push for Flutter (by ex-Google Flutter team). Cutting-edge Flutter tooling — your framework building experience fits.",
      url: "https://shorebird.dev",
    },
    {
      name: "AppWrite",
      why: "Open source BaaS with Flutter SDK. DevRel + Flutter engineering. Strong community focus.",
      url: "https://appwrite.io/careers",
    },
  ];
}

function generateOutreachTips() {
  return [
    {
      title: "Lead with Flutter Bond",
      tip: "Don't open with 'I'm looking for a job.' Open with 'I built Flutter Bond, a framework used by X developers. I noticed your team uses Flutter...'",
    },
    {
      title: "Offer value first",
      tip: "Write a short article about how their product could integrate with Flutter Bond, or fix a small issue in their open source repo. Then reach out.",
    },
    {
      title: "Target DevRel teams",
      tip: "Companies like Stream, Firebase, and Codemagic hire DevRel who can write, code, and present. You do all three (Medium articles + OSS + framework).",
    },
    {
      title: "Use your recommendations",
      tip: "Your JPMorgan colleague called you 'most inspiring engineer.' Your ex-PM promoted you to VP. Quote these in outreach.",
    },
    {
      title: "Post your OSS work on LinkedIn",
      tip: "Every contribution you make via Issue Hunter → auto-generates a LinkedIn post. This attracts inbound opportunities.",
    },
  ];
}
