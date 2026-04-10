import type { PresenceScore, Finding } from "@/types";
import { SCORE_WEIGHTS } from "@/lib/constants";

function countBySeverity(findings: Finding[], agentId: string) {
  const agentFindings = findings.filter((f) => f.agentId === agentId);
  return {
    critical: agentFindings.filter((f) => f.severity === "critical").length,
    warning: agentFindings.filter((f) => f.severity === "warning").length,
    info: agentFindings.filter((f) => f.severity === "info").length,
    positive: agentFindings.filter((f) => f.severity === "positive").length,
    total: agentFindings.length,
  };
}

export function calculatePresenceScore(allFindings: Finding[]): PresenceScore {
  const gh = countBySeverity(allFindings, "github");
  const li = countBySeverity(allFindings, "linkedin");
  const ct = countBySeverity(allFindings, "content");
  const res = countBySeverity(allFindings, "resume");
  const jm = countBySeverity(allFindings, "job-matcher");

  // GitHub score: start at 50, penalize for issues, reward positives
  const githubScore = Math.max(
    0,
    Math.min(
      100,
      50 - gh.critical * 15 - gh.warning * 8 + gh.positive * 12 + gh.info * 2
    )
  );

  // LinkedIn score: start at 40 (lower because we can't verify)
  const linkedinScore = Math.max(
    0,
    Math.min(
      100,
      40 - li.critical * 15 - li.warning * 8 + li.positive * 12 + li.info * 2
    )
  );

  // Content score
  const contentScore = Math.max(
    0,
    Math.min(
      100,
      45 - ct.critical * 15 - ct.warning * 8 + ct.positive * 12 + ct.info * 2
    )
  );

  // Consistency score (from resume agent)
  const consistencyScore = Math.max(
    0,
    Math.min(
      100,
      55 - res.critical * 15 - res.warning * 8 + res.positive * 12 + res.info * 2
    )
  );

  // Job readiness (from job matcher)
  const highFitJobs = allFindings.filter(
    (f) => f.agentId === "job-matcher" && f.severity === "positive"
  ).length;
  const jobReadiness = Math.max(
    0,
    Math.min(100, 30 + highFitJobs * 15 + jm.info * 5)
  );

  const overall = Math.round(
    githubScore * SCORE_WEIGHTS.github +
      linkedinScore * SCORE_WEIGHTS.linkedin +
      contentScore * SCORE_WEIGHTS.content +
      consistencyScore * SCORE_WEIGHTS.consistency +
      jobReadiness * SCORE_WEIGHTS.jobReadiness
  );

  return {
    overall,
    github: Math.round(githubScore),
    linkedin: Math.round(linkedinScore),
    content: Math.round(contentScore),
    consistency: Math.round(consistencyScore),
    jobReadiness: Math.round(jobReadiness),
  };
}
