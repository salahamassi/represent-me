"use client";

import { create } from "zustand";
import type {
  CodeGem,
  OSSContribution,
  GeneratedContent,
  ChatMessage,
  ContentSourceContext,
  ContentScore,
} from "@/types";

interface ContentStore {
  posts: GeneratedContent[];
  articles: GeneratedContent[];
  gems: CodeGem[];
  contributions: OSSContribution[];
  activeTab: string;
  loading: boolean;

  fetchTab: (tab: string) => Promise<void>;
  setActiveTab: (tab: string) => void;
  /**
   * Approve a content row and auto-post to LinkedIn via Zernio. `mode`:
   *   - "auto" (default): publish immediately if within the posting window,
   *     otherwise schedule for the next Tue/Wed/Thu 10:30 AM AST slot.
   *   - "now": force immediate publish regardless of time (UI override).
   * Returns the publish result so the UI can render the right outcome
   * (success with URL, scheduled with timestamp, or manual fallback on error).
   */
  approveContent: (
    contentId: number,
    mode?: "auto" | "now"
  ) => Promise<{
    ok: boolean;
    url?: string;
    scheduledAt?: string;
    error?: string;
  }>;
  rejectContent: (contentId: number) => Promise<void>;
  /**
   * Run one chat turn: send the existing draft + chat history (ending with the
   * latest user tip) to Claude. Returns the new draft text without persisting.
   * Caller (the card) appends this as the next assistant message in its local
   * chat state and updates the on-screen preview.
   */
  refineDraft: (
    contentId: number,
    currentDraft: string,
    messages: ChatMessage[]
  ) => Promise<{ ok: boolean; text?: string; error?: string }>;
  /**
   * Persist the final refined draft to the DB once the user clicks Accept.
   * Refreshes the active tab so the card shows the new text.
   */
  acceptDraft: (
    contentId: number,
    finalText: string
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Lazy-fetch the source context (gem + repo blurb) for the Sources panel. */
  fetchSources: (
    contentId: number
  ) => Promise<{ ok: boolean; sources?: ContentSourceContext; error?: string }>;
  /**
   * Ask Claude (Haiku) to score the post from 1-10 on the clarity bar. Side
   * effect: persists the score on the DB row so future page loads get it for
   * free. Returns the fresh score without refreshing the full tab (the card
   * shows the score via its own local state so we don't unmount other cards).
   */
  scoreContent: (
    contentId: number
  ) => Promise<{ ok: boolean; score?: ContentScore; error?: string }>;
}

export const useContentStore = create<ContentStore>((set, get) => ({
  posts: [],
  articles: [],
  gems: [],
  contributions: [],
  activeTab: "linkedin",
  loading: false,

  fetchTab: async (tab: string) => {
    // Only show the loading state on first load for a tab. Subsequent refreshes
    // (from approve/reject/accept) silently swap data in — otherwise cards
    // unmount and lose their local state (e.g. the share status panel).
    const state = get();
    const hasData =
      (tab === "linkedin" && state.posts.length > 0) ||
      (tab === "articles" && state.articles.length > 0) ||
      (tab === "gems" && state.gems.length > 0) ||
      (tab === "contributions" && state.contributions.length > 0);
    if (!hasData) set({ loading: true });
    try {
      const res = await fetch(`/api/content?tab=${tab}`);
      const data = await res.json();

      switch (tab) {
        case "linkedin":
          set({ posts: data });
          break;
        case "articles":
          set({ articles: data });
          break;
        case "gems":
          set({ gems: data });
          break;
        case "contributions":
          set({ contributions: data });
          break;
      }
    } catch (err) {
      console.error("Failed to fetch content:", err);
    } finally {
      set({ loading: false });
    }
  },

  setActiveTab: (tab: string) => {
    set({ activeTab: tab });
    get().fetchTab(tab);
  },

  approveContent: async (contentId: number, mode: "auto" | "now" = "auto") => {
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, action: "approved", mode }),
    });
    // Refresh the tab so the card picks up user_action='published' or
    // 'scheduled' (plus the matching URL/timestamp). Runs even on failure so
    // the "approved · not published" badge shows up.
    await get().fetchTab(get().activeTab);

    if (!res.ok) {
      return { ok: false, error: `Approve failed (${res.status})` };
    }
    const data = await res.json().catch(() => ({}));
    const publish = data?.publish as
      | { ok: boolean; url?: string; scheduledAt?: string; error?: string }
      | undefined;
    return publish || { ok: false, error: "Zernio result missing" };
  },

  rejectContent: async (contentId: number) => {
    await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, action: "rejected" }),
    });
    get().fetchTab(get().activeTab);
  },

  refineDraft: async (contentId, currentDraft, messages) => {
    const res = await fetch(`/api/content/${contentId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentDraft, messages }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error || `Refine failed (${res.status})` };
    }
    const data = await res.json();
    return { ok: true, text: data.text };
  },

  acceptDraft: async (contentId, finalText) => {
    const res = await fetch(`/api/content/${contentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: finalText }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error || `Accept failed (${res.status})` };
    }
    await get().fetchTab(get().activeTab);
    return { ok: true };
  },

  fetchSources: async (contentId) => {
    const res = await fetch(`/api/content/${contentId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error || `Fetch sources failed (${res.status})` };
    }
    const data = await res.json();
    return { ok: true, sources: data.sources };
  },

  scoreContent: async (contentId) => {
    const res = await fetch(`/api/content/${contentId}/score`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error || `Score failed (${res.status})` };
    }
    const data = await res.json();
    return { ok: true, score: data as ContentScore };
  },
}));
