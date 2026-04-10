"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface GitHubAction {
  id: string;
  category: string;
  title: string;
  description: string;
  action_type: string;
  priority: string;
  completed: number;
}

interface ScoreCategory {
  label: string;
  score: number;
  maxScore: number;
  color: string;
}

export function GitHubScore() {
  const [actions, setActions] = useState<GitHubAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/github/actions")
      .then((r) => r.json())
      .then((data) => setActions(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const completed = actions.filter((a) => a.completed);
  const pending = actions.filter((a) => !a.completed);
  const totalActions = actions.length;
  const completedCount = completed.length;

  // Calculate score from different categories
  const categories: ScoreCategory[] = [
    {
      label: "Profile",
      score: actions.filter((a) => a.category === "profile" && a.completed).length,
      maxScore: Math.max(1, actions.filter((a) => a.category === "profile").length),
      color: "text-blue-400",
    },
    {
      label: "Repos",
      score: actions.filter((a) => a.category === "repos" && a.completed).length,
      maxScore: Math.max(1, actions.filter((a) => a.category === "repos").length),
      color: "text-purple-400",
    },
    {
      label: "READMEs",
      score: actions.filter((a) => a.category === "readme" && a.completed).length,
      maxScore: Math.max(1, actions.filter((a) => a.category === "readme").length),
      color: "text-emerald-400",
    },
    {
      label: "Cleanup",
      score: actions.filter((a) => a.category === "cleanup" && a.completed).length,
      maxScore: Math.max(1, actions.filter((a) => a.category === "cleanup").length),
      color: "text-amber-400",
    },
  ];

  const overallScore = totalActions > 0
    ? Math.round((completedCount / totalActions) * 100)
    : 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "stroke-emerald-500";
    if (score >= 50) return "stroke-amber-500";
    return "stroke-red-500";
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Score Gauge */}
      <Card className="border-border bg-card">
        <CardContent className="p-5 flex items-center gap-5">
          {/* Circular gauge */}
          <div className="relative h-20 w-20 shrink-0">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                className="stroke-muted"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                className={getScoreBg(overallScore)}
                strokeWidth="3"
                strokeDasharray={`${overallScore}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn("text-xl font-bold", getScoreColor(overallScore))}>
                {overallScore}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">GitHub Score</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {completedCount}/{totalActions} actions done
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {categories.filter((c) => c.maxScore > 0).map((cat) => (
                <Badge
                  key={cat.label}
                  variant="outline"
                  className={cn("text-[10px]", cat.score === cat.maxScore ? "text-emerald-400" : cat.color)}
                >
                  {cat.label} {cat.score}/{cat.maxScore}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Todos */}
      <Card className="border-border bg-card lg:col-span-2">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Next Actions
              {pending.length > 0 && (
                <span className="ml-1.5 text-muted-foreground font-normal">({pending.length} remaining)</span>
              )}
            </h3>
            {overallScore === 100 && (
              <Badge className="bg-emerald-500/10 text-emerald-400 text-xs">All done!</Badge>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <Check className="h-4 w-4" />
              All GitHub actions completed! Your profile is optimized.
            </div>
          ) : (
            <div className="space-y-2">
              {pending.slice(0, 3).map((action) => (
                <div key={action.id} className="flex items-center gap-2.5">
                  <Circle className={cn(
                    "h-3 w-3 shrink-0",
                    action.priority === "high" ? "text-red-400" : action.priority === "medium" ? "text-amber-400" : "text-muted-foreground"
                  )} />
                  <span className="text-sm text-foreground truncate">{action.title}</span>
                  <Badge variant="outline" className={cn(
                    "text-[10px] shrink-0",
                    action.priority === "high" ? "text-red-400" : action.priority === "medium" ? "text-amber-400" : "text-muted-foreground"
                  )}>
                    {action.priority}
                  </Badge>
                </div>
              ))}
              {pending.length > 3 && (
                <p className="text-xs text-muted-foreground pl-5">
                  +{pending.length - 3} more in Action Plan tab
                </p>
              )}
            </div>
          )}

          {/* Completed summary */}
          {completed.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex flex-wrap gap-2">
                {completed.map((action) => (
                  <div key={action.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="line-through">{action.title.split(" ").slice(0, 4).join(" ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
