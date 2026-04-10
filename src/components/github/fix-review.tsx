"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, CheckSquare, Square } from "lucide-react";

interface Suggestion {
  repo: string;
  currentDescription: string | null;
  suggestedDescription: string | null;
  currentTopics: string[];
  suggestedTopics: string[] | null;
  language: string | null;
  stars: number;
  approved: boolean;
}

export function FixReview({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "review" | "applying" | "done">("loading");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  // Auto-start generating on mount
  useEffect(() => {
    generateSuggestions();
  }, []);

  async function generateSuggestions() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/github/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", type: "both" }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to generate suggestions");
        return;
      }

      setSuggestions(
        (data.suggestions || []).map((s: Omit<Suggestion, "approved">) => ({
          ...s,
          approved: true, // Default all approved
        }))
      );
      setPhase("review");
    } catch (err) {
      setError(`Error: ${err}`);
    }
  }

  function toggleAll(approved: boolean) {
    setSuggestions((prev) => prev.map((s) => ({ ...s, approved })));
  }

  function toggleOne(repo: string) {
    setSuggestions((prev) =>
      prev.map((s) => (s.repo === repo ? { ...s, approved: !s.approved } : s))
    );
  }

  async function applySelected() {
    const selected = suggestions
      .filter((s) => s.approved)
      .map((s) => ({
        repo: s.repo,
        description: s.suggestedDescription || undefined,
        topics: s.suggestedTopics || undefined,
      }))
      .filter((s) => s.description || s.topics);

    if (selected.length === 0) {
      setError("No suggestions selected");
      return;
    }

    setPhase("applying");
    try {
      const res = await fetch("/api/github/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", suggestions: selected }),
      });
      const data = await res.json();
      setApplyResult(data.message);
      setPhase("done");
      onComplete();
    } catch (err) {
      setError(`Apply failed: ${err}`);
      setPhase("review");
    }
  }

  const approvedCount = suggestions.filter((s) => s.approved).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold text-foreground">
            {phase === "loading" && "Generating suggestions..."}
            {phase === "review" && `Review suggestions (${approvedCount}/${suggestions.length} selected)`}
            {phase === "applying" && "Applying changes..."}
            {phase === "done" && "Done!"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[65vh] overflow-y-auto p-5">
          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Claude is reading your repos and generating suggestions...</p>
              <p className="mt-1 text-xs text-muted-foreground">This takes 30-60 seconds</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 mb-4">
              {error}
            </div>
          )}

          {phase === "review" && (
            <div className="space-y-3">
              {/* Select all / none */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => toggleAll(true)}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  Select all
                </button>
                <button
                  onClick={() => toggleAll(false)}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Deselect all
                </button>
              </div>

              {suggestions.map((s) => (
                <Card
                  key={s.repo}
                  className={`border-border transition-all cursor-pointer ${
                    s.approved ? "bg-card" : "bg-card opacity-50"
                  }`}
                  onClick={() => toggleOne(s.repo)}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      {s.approved ? (
                        <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium text-sm text-foreground">{s.repo}</span>
                      {s.language && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {s.language}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{s.stars} stars</span>
                    </div>

                    {s.suggestedDescription && (
                      <div className="ml-6 text-xs space-y-0.5">
                        <span className="text-muted-foreground">Description: </span>
                        <span className="text-emerald-400">{s.suggestedDescription}</span>
                      </div>
                    )}

                    {s.suggestedTopics && s.suggestedTopics.length > 0 && (
                      <div className="ml-6 flex flex-wrap items-center gap-1">
                        <span className="text-xs text-muted-foreground">Topics: </span>
                        {s.suggestedTopics.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px] text-blue-400">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {phase === "applying" && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Applying {approvedCount} changes to GitHub...</p>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center justify-center py-16">
              <Check className="h-8 w-8 text-emerald-400 mb-3" />
              <p className="text-sm font-medium text-foreground">{applyResult}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Click a repo to toggle. Only selected repos will be updated.
            </p>
            <button
              onClick={applySelected}
              disabled={approvedCount === 0}
              className={`flex items-center gap-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                approvedCount > 0
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Check className="h-3 w-3" />
              Apply {approvedCount} selected
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="border-t border-border px-5 py-3 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
