"use client";

import { useGitHubStore } from "@/store/github-store";
import { CopyButton } from "@/components/content/copy-button";
import { X, Loader2, FileText } from "lucide-react";

export function ReadmeGenerator() {
  const modal = useGitHubStore((s) => s.readmeModal);
  const closeModal = useGitHubStore((s) => s.closeReadmeModal);

  if (!modal || !modal.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-400" />
            <h2 className="font-semibold text-foreground">
              README for {modal.repoName}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!modal.loading && modal.readme && (
              <CopyButton text={modal.readme} />
            )}
            <button
              onClick={closeModal}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {modal.loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Claude is reading your repo and drafting a README...</p>
              <p className="mt-1 text-xs text-muted-foreground">This takes 10-20 seconds</p>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed font-mono">
              {modal.readme}
            </pre>
          )}
        </div>

        {/* Footer */}
        {!modal.loading && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Copy this README and paste it into your repo&apos;s README.md
            </p>
            <button
              onClick={closeModal}
              className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
