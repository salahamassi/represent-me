"use client";

import { create } from "zustand";
import type { CodeGem, OSSContribution, GeneratedContent } from "@/types";

interface ContentStore {
  posts: GeneratedContent[];
  articles: GeneratedContent[];
  gems: CodeGem[];
  contributions: OSSContribution[];
  activeTab: string;
  loading: boolean;

  fetchTab: (tab: string) => Promise<void>;
  setActiveTab: (tab: string) => void;
  approveContent: (contentId: number) => Promise<void>;
  rejectContent: (contentId: number) => Promise<void>;
}

export const useContentStore = create<ContentStore>((set, get) => ({
  posts: [],
  articles: [],
  gems: [],
  contributions: [],
  activeTab: "linkedin",
  loading: false,

  fetchTab: async (tab: string) => {
    set({ loading: true });
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

  approveContent: async (contentId: number) => {
    await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, action: "approved" }),
    });
    // Refresh current tab
    get().fetchTab(get().activeTab);
  },

  rejectContent: async (contentId: number) => {
    await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, action: "rejected" }),
    });
    get().fetchTab(get().activeTab);
  },
}));
