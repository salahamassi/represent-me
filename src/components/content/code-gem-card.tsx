"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CopyButton } from "./copy-button";
import type { CodeGem } from "@/types";

const GEM_TYPE_COLORS: Record<string, string> = {
  pattern: "text-purple-400",
  architecture: "text-blue-400",
  trick: "text-amber-400",
  optimization: "text-emerald-400",
};

export function CodeGemCard({ gem }: { gem: CodeGem }) {
  const [showCode, setShowCode] = useState(false);

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-foreground">💎 {gem.title}</h3>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${GEM_TYPE_COLORS[gem.gem_type] || "text-muted-foreground"}`}>
                {gem.gem_type}
              </Badge>
              <span className="text-xs text-muted-foreground">{gem.repo_name}</span>
              {gem.file_path && (
                <span className="text-xs text-muted-foreground/60">{gem.file_path}</span>
              )}
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-xs ${gem.status === "content_drafted" ? "text-emerald-400" : "text-muted-foreground"}`}
          >
            {gem.status}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">{gem.description}</p>

        {gem.code_snippet && (
          <div>
            <button
              onClick={() => setShowCode(!showCode)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showCode ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showCode ? "Hide code" : "Show code"}
            </button>
            {showCode && (
              <div className="mt-2 rounded-lg bg-muted p-3">
                <pre className="text-xs text-muted-foreground overflow-x-auto">
                  <code>{gem.code_snippet}</code>
                </pre>
                <div className="mt-2">
                  <CopyButton text={gem.code_snippet} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground/60">
          Found: {new Date(gem.found_at).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}
