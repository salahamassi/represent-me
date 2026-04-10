"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGitHubStore } from "@/store/github-store";
import { FixReview } from "./fix-review";
import { ProfileFixReview } from "./profile-fix-review";
import {
  Check,
  ExternalLink,
  FileText,
  User,
  FolderGit2,
  Trash2,
  Loader2,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GitHubAction {
  id: string;
  category: string;
  title: string;
  description: string;
  action_url: string | null;
  action_type: string;
  priority: string;
  completed: number;
  completed_at: string | null;
  created_at: string;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof User; label: string; color: string }> = {
  profile: { icon: User, label: "Profile", color: "text-blue-400" },
  repos: { icon: FolderGit2, label: "Repos", color: "text-purple-400" },
  readme: { icon: FileText, label: "README", color: "text-emerald-400" },
  cleanup: { icon: Trash2, label: "Cleanup", color: "text-amber-400" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "text-red-400 bg-red-500/10" },
  medium: { label: "Medium", color: "text-amber-400 bg-amber-500/10" },
  low: { label: "Low", color: "text-muted-foreground bg-muted" },
};

export function ActionPlan() {
  const [actions, setActions] = useState<GitHubAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const generateReadme = useGitHubStore((s) => s.generateReadme);

  const fetchActions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github/actions");
      const data = await res.json();
      setActions(data);
    } catch (err) {
      console.error("Failed to fetch actions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();
  }, []);

  const toggleAction = async (id: string, completed: boolean) => {
    setTogglingId(id);
    try {
      await fetch("/api/github/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed }),
      });
      setActions((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, completed: completed ? 1 : 0, completed_at: completed ? new Date().toISOString() : null }
            : a
        )
      );
    } catch (err) {
      console.error("Failed to toggle action:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showProfileReview, setShowProfileReview] = useState(false);

  const handleAction = async (action: GitHubAction) => {
    if (action.action_type === "generate-readme") {
      const repoName = action.id.replace("readme-", "");
      generateReadme(repoName);
      return;
    }

    if (action.action_type === "auto-fix") {
      if (action.id === "archive-old-forks") {
        // Archive doesn't need review — but confirm
        if (!confirm(`Archive all old forks? This cannot be undone.`)) return;
        setFixingId(action.id);
        try {
          const res = await fetch("/api/github/archive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const data = await res.json();
          setFixResult(data.message || data.error);
          if (data.success) {
            await toggleAction(action.id, true);
            await fetchActions();
          }
        } catch (err) {
          setFixResult(`Error: ${err}`);
        } finally {
          setFixingId(null);
        }
      } else {
        // Descriptions & Topics → open review modal
        setShowReview(true);
      }
      return;
    }

    if (action.action_type === "auto-fix-profile") {
      setShowProfileReview(true);
      return;
    }

    if (action.action_url) {
      window.open(action.action_url, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning your profile for actions...
      </div>
    );
  }

  const pending = actions.filter((a) => !a.completed);
  const completed = actions.filter((a) => a.completed);

  return (
    <div className="space-y-6">
      {/* Fix Review Modal */}
      {showReview && (
        <FixReview
          onClose={() => setShowReview(false)}
          onComplete={() => {
            setShowReview(false);
            fetchActions();
          }}
        />
      )}

      {/* Profile Fix Review Modal */}
      {showProfileReview && (
        <ProfileFixReview
          onClose={() => setShowProfileReview(false)}
          onComplete={() => {
            setShowProfileReview(false);
            fetchActions();
          }}
        />
      )}

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {completed.length} of {actions.length} completed
          </span>
          <span className="font-medium text-foreground">
            {actions.length > 0 ? Math.round((completed.length / actions.length) * 100) : 0}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${actions.length > 0 ? (completed.length / actions.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Fix result notification */}
      {fixResult && (
        <div className={`rounded-lg p-3 text-sm ${
          fixResult.startsWith("Error")
            ? "bg-red-500/10 text-red-400 border border-red-500/20"
            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
        }`}>
          {fixResult}
        </div>
      )}

      {/* Pending actions */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">To Do ({pending.length})</h3>
          {pending.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              toggling={togglingId === action.id}
              fixing={fixingId === action.id}
              onToggle={() => toggleAction(action.id, true)}
              onAction={() => handleAction(action)}
            />
          ))}
        </div>
      )}

      {/* Completed actions */}
      {completed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Done ({completed.length})</h3>
          {completed.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              toggling={togglingId === action.id}
              fixing={false}
              onToggle={() => toggleAction(action.id, false)}
              onAction={() => handleAction(action)}
            />
          ))}
        </div>
      )}

      {actions.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center text-center">
          <Check className="h-8 w-8 text-emerald-400 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No actions needed!</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Your GitHub profile looks great.</p>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  action,
  toggling,
  fixing,
  onToggle,
  onAction,
}: {
  action: GitHubAction;
  toggling: boolean;
  fixing: boolean;
  onToggle: () => void;
  onAction: () => void;
}) {
  const catConfig = CATEGORY_CONFIG[action.category] || CATEGORY_CONFIG.repos;
  const prioConfig = PRIORITY_CONFIG[action.priority] || PRIORITY_CONFIG.medium;
  const Icon = catConfig.icon;
  const isDone = !!action.completed;

  return (
    <Card className={cn("border-border bg-card transition-all", isDone && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={onToggle}
            disabled={toggling}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
              isDone
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border hover:border-emerald-400"
            )}
          >
            {toggling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isDone ? (
              <Check className="h-3 w-3" />
            ) : null}
          </button>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon className={cn("h-3.5 w-3.5", catConfig.color)} />
              <span className={cn("text-sm font-medium", isDone ? "line-through text-muted-foreground" : "text-foreground")}>
                {action.title}
              </span>
              <Badge variant="outline" className={cn("text-[10px]", prioConfig.color)}>
                {prioConfig.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
          </div>

          {/* Action button */}
          {!isDone && (
            <button
              onClick={onAction}
              disabled={fixing}
              className={cn(
                "shrink-0 flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                fixing
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : action.action_type === "auto-fix" || action.action_type === "auto-fix-profile"
                    ? "bg-blue-600 text-white hover:bg-blue-500"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
              )}
            >
              {fixing ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Fixing...</>
              ) : action.action_type === "auto-fix" || action.action_type === "auto-fix-profile" ? (
                <><WandSparkles className="h-3 w-3" /> Auto-fix</>
              ) : action.action_type === "generate-readme" ? (
                <><FileText className="h-3 w-3" /> Generate</>
              ) : (
                <><ExternalLink className="h-3 w-3" /> Do it</>
              )}
            </button>
          )}
        </div>

        {/* Completed at */}
        {isDone && action.completed_at && (
          <p className="mt-2 ml-8 text-xs text-muted-foreground/60">
            Done {new Date(action.completed_at).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
