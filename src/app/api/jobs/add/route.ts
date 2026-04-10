import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { isJobSeen, markJobSeen, updateJobAIAnalysis } from "@/lib/db";
import { profile } from "@/data/profile";
import { jobPreferences } from "@/data/job-preferences";

export async function POST(request: NextRequest) {
  const { url, description, title, company } = await request.json();

  if (!description && !url) {
    return NextResponse.json({ error: "Provide a job URL or description" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude API not configured" }, { status: 500 });
  }

  let jobDescription = description || "";
  let jobTitle = title || "";
  let jobCompany = company || "";
  let jobUrl = url || "";

  // If URL provided, try to fetch the page content
  if (url && !description) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      });
      if (res.ok) {
        const html = await res.text();
        // Strip HTML tags for a rough text extraction
        jobDescription = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 4000);
      }
    } catch {
      // URL fetch failed — user needs to paste description manually
    }
  }

  if (!jobDescription && !jobTitle) {
    return NextResponse.json({
      error: "Could not fetch the job page. Please paste the job description text instead.",
    }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // Claude extracts job details AND analyzes fit in one call
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.2,
      system: "You extract job details and analyze candidate fit. Return ONLY valid JSON.",
      messages: [{
        role: "user",
        content: `Extract job details and analyze fit for this candidate:

CANDIDATE:
- ${profile.name}, ${profile.role}
- Skills: ${jobPreferences.techStack.primary.join(", ")}, ${jobPreferences.techStack.secondary.join(", ")}
- Created Flutter Bond framework (7 packages on pub.dev)
- 5+ years mobile development, former VP Innovation
- ${jobPreferences.highlights.slice(0, 3).join("; ")}

JOB:
Title: ${jobTitle || "(extract from description)"}
Company: ${jobCompany || "(extract from description)"}
URL: ${jobUrl}
Description: ${jobDescription.slice(0, 3000)}

Return JSON:
{
  "jobTitle": "Extracted or provided job title",
  "company": "Extracted or provided company name",
  "location": "Remote/City/Country",
  "fitPercentage": 75,
  "reasoning": "Why this job fits or doesn't",
  "matchedSkills": [{"skill": "Flutter", "evidence": "5+ years"}],
  "transferableSkills": [{"required": "React Native", "transferFrom": "Flutter", "confidence": "high"}],
  "missingSkills": ["skill not in profile"],
  "salaryEstimate": {"min": 4000, "max": 6000, "currency": "USD", "confidence": "medium"},
  "resumeEmphasis": ["what to highlight"],
  "applicationTips": "one string with advice"
}

Be realistic about fit percentage. Only count skills the candidate actually has.`,
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    let jsonText = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const analysis = JSON.parse(jsonText);

    // Generate a unique ID
    const jobId = `manual-${Date.now()}`;

    // Save to DB
    markJobSeen({
      id: jobId,
      source: "manual",
      title: analysis.jobTitle || jobTitle || "Unknown",
      company: analysis.company || jobCompany || "Unknown",
      url: jobUrl || undefined,
      fitPercentage: analysis.fitPercentage,
      matchedSkills: (analysis.matchedSkills || []).map((s: any) => typeof s === "string" ? s : s.skill),
      missingSkills: analysis.missingSkills || [],
    });

    updateJobAIAnalysis(
      jobId,
      JSON.stringify(analysis),
      analysis.salaryEstimate
        ? `${analysis.salaryEstimate.currency} ${analysis.salaryEstimate.min}-${analysis.salaryEstimate.max}`
        : undefined
    );

    return NextResponse.json({
      success: true,
      jobId,
      analysis,
      tokens: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
