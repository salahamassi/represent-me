"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileFixReview({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "review" | "applying" | "done">("loading");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [currentBio, setCurrentBio] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [bioOptions, setBioOptions] = useState<string[]>([]);
  const [selectedBio, setSelectedBio] = useState(0);
  const [suggestedCompany, setSuggestedCompany] = useState("");
  const [applyBio, setApplyBio] = useState(true);
  const [applyCompany, setApplyCompany] = useState(true);

  useEffect(() => {
    generateSuggestions();
  }, []);

  async function generateSuggestions() {
    try {
      const res = await fetch("/api/github/fix-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview" }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to generate");
        return;
      }

      setCurrentBio(data.currentBio || "");
      setCurrentCompany(data.currentCompany || "");
      setBioOptions(data.bioOptions || [data.suggestedBio]);
      setSuggestedCompany(data.suggestedCompany || "");
      setPhase("review");
    } catch (err) {
      setError(`Error: ${err}`);
    }
  }

  async function applyChanges() {
    setPhase("applying");
    try {
      const updates: { action: string; bio?: string; company?: string } = { action: "apply" };
      if (applyBio && bioOptions[selectedBio]) updates.bio = bioOptions[selectedBio];
      if (applyCompany && suggestedCompany) updates.company = suggestedCompany;

      const res = await fetch("/api/github/fix-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setResult(data.message);
      setPhase("done");
      onComplete();
    } catch (err) {
      setError(`Apply failed: ${err}`);
      setPhase("review");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 max-h-[85vh] w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold text-foreground">
            {phase === "loading" && "Generating profile suggestions..."}
            {phase === "review" && "Review Profile Changes"}
            {phase === "applying" && "Updating profile..."}
            {phase === "done" && "Done!"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Claude is crafting your profile...</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {phase === "review" && (
            <>
              {/* Bio section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Bio</h3>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={applyBio}
                      onChange={(e) => setApplyBio(e.target.checked)}
                      className="rounded"
                    />
                    Apply
                  </label>
                </div>

                <div className="rounded-lg bg-muted p-3 text-xs">
                  <span className="text-muted-foreground">Current: </span>
                  <span className="text-foreground">{currentBio || "(empty)"}</span>
                </div>

                <div className="space-y-2">
                  {bioOptions.map((option, i) => (
                    <Card
                      key={i}
                      className={cn(
                        "border-border cursor-pointer transition-all",
                        selectedBio === i ? "ring-2 ring-emerald-500 bg-emerald-500/5" : "bg-card hover:bg-muted"
                      )}
                      onClick={() => setSelectedBio(i)}
                    >
                      <CardContent className="p-3 flex items-start gap-2">
                        <div className={cn(
                          "mt-0.5 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center",
                          selectedBio === i ? "border-emerald-500 bg-emerald-500" : "border-border"
                        )}>
                          {selectedBio === i && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <p className="text-sm text-foreground">{option}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Company section */}
              {(!currentCompany && suggestedCompany) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">Company</h3>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={applyCompany}
                        onChange={(e) => setApplyCompany(e.target.checked)}
                        className="rounded"
                      />
                      Apply
                    </label>
                  </div>

                  <div className="rounded-lg bg-muted p-3 text-xs">
                    <span className="text-muted-foreground">Current: </span>
                    <span className="text-foreground">{currentCompany || "(not set)"}</span>
                  </div>

                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-sm text-foreground">
                    Suggested: <span className="font-medium">{suggestedCompany}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {phase === "applying" && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Updating your GitHub profile...</p>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Check className="h-8 w-8 text-emerald-400 mb-3" />
              <p className="text-sm font-medium text-foreground">{result}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Pick your favorite bio option, then apply.
            </p>
            <button
              onClick={applyChanges}
              disabled={!applyBio && !applyCompany}
              className={cn(
                "flex items-center gap-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                applyBio || applyCompany
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <Check className="h-3 w-3" /> Apply Changes
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
