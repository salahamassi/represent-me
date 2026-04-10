"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGitHubStore } from "@/store/github-store";
import { Pin, ExternalLink } from "lucide-react";

export function PinnedReposEditor() {
  const repos = useGitHubStore((s) => s.repos);
  const insights = useGitHubStore((s) => s.insights);

  // Try to get pinned recommendations from the latest AI analysis
  // The AI analysis stores pinnedRepos in the GitHubAnalysis result
  const latestRun = insights?.latestRun;

  // Get pinned repo names from insights (activities may contain the analysis)
  // For now, recommend top repos by a combo of stars + health score
  const pinnedCandidates = [...repos]
    .filter((r) => !r.isFork)
    .sort((a, b) => (b.stars * 3 + b.healthScore) - (a.stars * 3 + a.healthScore))
    .slice(0, 6);

  if (pinnedCandidates.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Load repos first to see pin recommendations.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These repos best showcase your skills to recruiters. Pin them on your GitHub profile.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {pinnedCandidates.map((repo, i) => (
          <Card key={repo.name} className="border-border bg-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Pin className="h-4 w-4 text-emerald-400" />
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground hover:text-blue-400"
                  >
                    {repo.name}
                    <ExternalLink className="ml-1 inline h-3 w-3" />
                  </a>
                </div>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  #{i + 1}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                {repo.language && (
                  <Badge variant="outline" className="text-xs">{repo.language}</Badge>
                )}
                <span className="text-xs text-muted-foreground">{repo.stars} stars</span>
                <span className={`text-xs ${repo.healthScore >= 60 ? "text-emerald-400" : "text-amber-400"}`}>
                  Health: {repo.healthScore}
                </span>
              </div>

              {repo.description && (
                <p className="text-xs text-muted-foreground">{repo.description}</p>
              )}

              <div className="rounded-lg bg-muted p-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Why pin this?</span>{" "}
                  {getWhyPin(repo, i)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function getWhyPin(repo: { name: string; stars: number; language: string | null; healthScore: number; description: string | null }, rank: number): string {
  const reasons: string[] = [];

  if (repo.stars >= 10) reasons.push(`${repo.stars} stars shows community validation`);
  if (repo.healthScore >= 70) reasons.push("well-documented and maintained");
  if (repo.language === "Swift" || repo.language === "Dart") reasons.push(`showcases your ${repo.language} expertise`);
  if (repo.name.toLowerCase().includes("bond")) reasons.push("part of your Flutter Bond framework — your signature project");
  if (repo.name.includes("AppRouter")) reasons.push("demonstrates your open-source navigation framework");
  if (repo.description) reasons.push("has a clear description that recruiters can scan");

  if (reasons.length === 0) reasons.push("strong original project that represents your skills");

  return reasons.join(". ") + ".";
}
