import { NextRequest, NextResponse } from "next/server";
import { linkedInProfile, linkedInRecommendationsReceived, linkedInRecommendationsGiven, linkedInNetworkStats } from "@/data/linkedin-data";
import { profile as resumeProfile } from "@/data/profile";

export async function GET() {
  // Calculate LinkedIn score
  const scores = {
    headline: analyzeHeadline(linkedInProfile.headline),
    summary: analyzeSummary(linkedInProfile.summary),
    recommendations: Math.min(100, linkedInRecommendationsReceived.length * 20),
    network: Math.min(100, linkedInNetworkStats.incoming * 1.5),
    activity: linkedInRecommendationsGiven.length >= 3 ? 60 : 30,
  };

  const overallScore = Math.round(
    scores.headline * 0.2 +
    scores.summary * 0.25 +
    scores.recommendations * 0.25 +
    scores.network * 0.15 +
    scores.activity * 0.15
  );

  return NextResponse.json({
    profile: linkedInProfile,
    recommendations: {
      received: linkedInRecommendationsReceived,
      given: linkedInRecommendationsGiven,
    },
    network: linkedInNetworkStats,
    scores: { ...scores, overall: overallScore },
    actions: generateActions(linkedInProfile, scores),
  });
}

function analyzeHeadline(headline: string): number {
  let score = 40; // Base
  if (headline.length > 30) score += 10;
  if (headline.includes("|")) score += 10; // Has sections
  if (/swift|flutter|ios|mobile|react native/i.test(headline)) score += 15; // Has tech keywords
  if (/lead|senior|architect|vp|head/i.test(headline)) score += 10; // Has seniority
  if (/creator|author|founder|open source/i.test(headline)) score += 15; // Has differentiator
  return Math.min(100, score);
}

function analyzeSummary(summary: string): number {
  let score = 30;
  if (summary.length > 200) score += 15;
  if (summary.length > 500) score += 10;
  if (/flutter bond/i.test(summary)) score += 15; // Mentions key project
  if (/open.?source/i.test(summary)) score += 10;
  if (/led|lead|managed|mentored/i.test(summary)) score += 10;
  if (/📍|🔗|🚀/i.test(summary)) score += 5; // Has emojis (engagement)
  if (/relocation|remote|global/i.test(summary)) score += 5; // Shows availability
  return Math.min(100, score);
}

function generateActions(profile: typeof linkedInProfile, scores: Record<string, number>) {
  const actions: { id: string; title: string; description: string; priority: string; category: string }[] = [];

  if (scores.headline < 80) {
    actions.push({
      id: "improve-headline",
      title: "Optimize headline with stronger keywords",
      description: `Current: "${profile.headline}". Add differentiators like "Flutter Bond Creator" or "100K+ app downloads"`,
      priority: "high",
      category: "profile",
    });
  }

  if (!profile.summary.includes("100,000") && !profile.summary.includes("100K")) {
    actions.push({
      id: "add-metrics",
      title: "Add quantified achievements to summary",
      description: "Mention: 100K+ downloads, 30% deployment time reduction, 90% stability improvement",
      priority: "high",
      category: "profile",
    });
  }

  if (linkedInRecommendationsReceived.length < 10) {
    actions.push({
      id: "get-recommendations",
      title: `Get ${10 - linkedInRecommendationsReceived.length} more recommendations`,
      description: "You have 5 — aim for 10+. Ask former colleagues at WINCH, ITG, One Studio",
      priority: "medium",
      category: "network",
    });
  }

  actions.push({
    id: "featured-section",
    title: "Add Featured section",
    description: "Pin: Flutter Bond repo, Design-Driven Firebase article, PrayersTimes app",
    priority: "high",
    category: "profile",
  });

  actions.push({
    id: "post-weekly",
    title: "Post at least once per week",
    description: "LinkedIn algorithm rewards consistent posting. Use Content Agent to generate drafts",
    priority: "medium",
    category: "content",
  });

  if (linkedInNetworkStats.outgoing < 20) {
    actions.push({
      id: "grow-network",
      title: "Send 10+ connection requests per week",
      description: `You've only sent ${linkedInNetworkStats.outgoing} outgoing requests. Connect with mobile dev leads, recruiters, and Flutter/iOS community members`,
      priority: "medium",
      category: "network",
    });
  }

  return actions;
}
