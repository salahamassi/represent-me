"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGitHubStore } from "@/store/github-store";
import { RefreshCw, AlertTriangle } from "lucide-react";
import type { GitHubProfile } from "@/types";

export function ProfileHeader() {
  const profile = useGitHubStore((s) => s.profile);
  const loading = useGitHubStore((s) => s.loading.profile);
  const fetchProfile = useGitHubStore((s) => s.fetchProfile);

  if (!profile && !loading) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Profile not loaded</p>
          <button onClick={fetchProfile} className="mt-2 text-xs text-blue-400 hover:underline">
            Load from GitHub
          </button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          Loading profile from GitHub...
        </CardContent>
      </Card>
    );
  }

  const p = profile as GitHubProfile;
  const bioIssue = !p.bio || p.bio.toLowerCase().includes("under learning");
  const companyIssue = !p.company;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">@{p.username}</h2>
            {p.location && <span className="text-sm text-muted-foreground">{p.location}</span>}
          </div>
          {p.bio && (
            <div className="mt-1 flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{p.bio}</p>
              {bioIssue && (
                <Badge variant="outline" className="text-xs text-amber-400">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Outdated bio
                </Badge>
              )}
            </div>
          )}
          {companyIssue && (
            <p className="mt-1 text-xs text-amber-400">Company not set — recruiters look for this</p>
          )}
        </div>
        <button
          onClick={fetchProfile}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { label: "Active Repos", value: p.publicRepos, color: "" },
          { label: "Original", value: p.originalRepos, color: "text-emerald-500" },
          { label: "Forks", value: p.forkedRepos, color: "text-muted-foreground" },
          { label: "Archived", value: p.archivedRepos || 0, color: "text-muted-foreground/60" },
          { label: "Stars", value: p.totalStars, color: "text-amber-400" },
          { label: "Followers", value: p.followers, color: "" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border bg-card">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`mt-0.5 text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
