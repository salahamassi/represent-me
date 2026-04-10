import Anthropic from "@anthropic-ai/sdk";
import type { ArticleSuggestion } from "@/types";
import { profile } from "@/data/profile";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (_client) return _client;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export function isConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function generateLinkedInPost(
  suggestion: ArticleSuggestion
): Promise<string> {
  const client = getClient();
  if (!client) {
    return generateFallbackPost(suggestion);
  }

  const systemPrompt = `You are a professional content writer for LinkedIn. You write engaging, authentic posts for ${profile.name}, a ${profile.role} based in ${profile.location}.

Key facts about ${profile.name}:
- 5+ years of mobile development experience (Swift, Flutter, React Native)
- Created Flutter Bond, an open-source framework on pub.dev
- Former VP of Innovation at One Studio (venture studio)
- Published technical articles on Medium and Dev.to
- Currently at Nologystore W.L.L

Write in first person. Be authentic, not salesy. Use short paragraphs. Include a hook in the first line. End with a question or call to action. No hashtags. Keep under 300 words.`;

  const userPrompt = `Write a LinkedIn post about: "${suggestion.title}"

Outline:
${suggestion.outline.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Context: ${suggestion.rationale}

Make it engaging and practical. Share a real insight, not generic advice.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    return textBlock ? textBlock.text : generateFallbackPost(suggestion);
  } catch (err) {
    console.error("[Claude] Error generating post:", err);
    return generateFallbackPost(suggestion);
  }
}

function generateFallbackPost(suggestion: ArticleSuggestion): string {
  return `${suggestion.title}

${suggestion.outline.map((p, i) => `${i + 1}. ${p}`).join("\n\n")}

---
Based on my experience building mobile apps with ${profile.skills[0]?.items.slice(0, 3).join(", ")}. What's your take on this?

[Generated from template — Claude API not configured]`;
}
