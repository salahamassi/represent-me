"use client";

import { useEffect } from "react";
import { useContentStore } from "@/store/content-store";
import { ContentPostCard } from "@/components/content/content-post-card";
import { CodeGemCard } from "@/components/content/code-gem-card";
import { ContributionCard } from "@/components/content/contribution-card";
import { AgentStatusBanner } from "@/components/content/agent-status-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { GeneratedContent, CodeGem, OSSContribution } from "@/types";

export default function ContentPage() {
  const posts = useContentStore((s) => s.posts);
  const articles = useContentStore((s) => s.articles);
  const gems = useContentStore((s) => s.gems);
  const contributions = useContentStore((s) => s.contributions);
  const activeTab = useContentStore((s) => s.activeTab);
  const loading = useContentStore((s) => s.loading);
  const setActiveTab = useContentStore((s) => s.setActiveTab);
  const fetchTab = useContentStore((s) => s.fetchTab);

  useEffect(() => {
    fetchTab(activeTab);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-generated content from your agents — posts, articles, code gems, and contributions
        </p>
      </div>

      <AgentStatusBanner />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="linkedin">
            LinkedIn Posts
            {posts.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-xs">
                {posts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="articles">
            Articles
            {articles.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-xs">
                {articles.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="gems">
            Code Gems
            {gems.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-xs">
                {gems.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contributions">
            Contributions
            {contributions.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-xs">
                {contributions.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="linkedin" className="mt-4">
          {loading ? (
            <LoadingState />
          ) : posts.length === 0 ? (
            <EmptyState
              title="No LinkedIn posts yet"
              description="Run the Content Agent or Code Gems to generate posts."
            />
          ) : (
            <div className="space-y-4">
              {(posts as GeneratedContent[]).map((post) => (
                <ContentPostCard key={post.id} content={post} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="articles" className="mt-4">
          {loading ? (
            <LoadingState />
          ) : articles.length === 0 ? (
            <EmptyState
              title="No articles yet"
              description="When a PR gets merged, the Content Agent will generate Medium and Dev.to articles."
            />
          ) : (
            <div className="space-y-4">
              {(articles as GeneratedContent[]).map((article) => (
                <ContentPostCard key={article.id} content={article} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="gems" className="mt-4">
          {loading ? (
            <LoadingState />
          ) : gems.length === 0 ? (
            <EmptyState
              title="No code gems found yet"
              description="Run Code Gems from the Automation page to mine patterns from your repos."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(gems as CodeGem[]).map((gem) => (
                <CodeGemCard key={gem.id} gem={gem} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contributions" className="mt-4">
          {loading ? (
            <LoadingState />
          ) : contributions.length === 0 ? (
            <EmptyState
              title="No OSS contributions tracked yet"
              description="Run Issue Hunter from the Automation page to find open-source issues to solve."
            />
          ) : (
            <div className="space-y-4">
              {(contributions as OSSContribution[]).map((c) => (
                <ContributionCard key={c.id} contribution={c} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/60">
      Loading...
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground/60">{description}</p>
    </div>
  );
}
