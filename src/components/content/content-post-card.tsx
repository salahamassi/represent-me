"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import type { GeneratedContent } from "@/types";
import { useContentStore } from "@/store/content-store";
import { cn } from "@/lib/utils";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSourceLabel(contentType: string): string {
  if (contentType.includes("gem")) return "Code Gem";
  if (contentType.includes("contribution")) return "Contribution";
  if (contentType.includes("weekly") || contentType === "linkedin_post") return "Weekly";
  return contentType;
}

export function ContentPostCard({ content }: { content: GeneratedContent }) {
  const approveContent = useContentStore((s) => s.approveContent);
  const rejectContent = useContentStore((s) => s.rejectContent);

  const statusColors: Record<string, string> = {
    approved: "text-emerald-400 bg-emerald-500/10",
    rejected: "text-red-400 bg-red-500/10",
    default: "text-muted-foreground bg-zinc-500/10",
  };

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-blue-400">
              {getSourceLabel(content.content_type)}
            </Badge>
            {content.user_action && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  statusColors[content.user_action] || statusColors.default
                )}
              >
                {content.user_action}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground/60">{formatDate(content.created_at)}</span>
        </div>

        <div className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-foreground leading-relaxed max-h-[300px] overflow-y-auto">
          {content.generated_text}
        </div>

        <div className="flex items-center justify-between">
          <CopyButton text={content.generated_text} />

          {!content.user_action && (
            <div className="flex gap-2">
              <button
                onClick={() => approveContent(content.id)}
                className="rounded-md bg-emerald-600/20 px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/30"
              >
                Approve
              </button>
              <button
                onClick={() => rejectContent(content.id)}
                className="rounded-md bg-red-600/20 px-3 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
