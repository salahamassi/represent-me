import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { updateJobSkills } from "@/lib/db";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const jobId = formData.get("jobId") as string || "";
  const jobTitle = formData.get("jobTitle") as string || "";
  const jobDescription = formData.get("jobDescription") as string || "";

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude API not configured" }, { status: 500 });
  }

  // Read the uploaded PDF as base64 for Claude
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.2,
      system: "You are an ATS expert. Analyze the uploaded resume PDF against the job description. Return ONLY valid JSON.",
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: `Analyze this uploaded resume against the job.

JOB: ${jobTitle}
DESCRIPTION: ${jobDescription.slice(0, 1500) || "Senior Flutter/Mobile Developer role"}

Return JSON:
{
  "atsScore": 85,
  "verdict": "PASS",
  "keywordMatch": {
    "found": ["Flutter", "Dart"],
    "missing": ["keyword"],
    "percentage": 85
  },
  "sections": {
    "contactInfo": {"score": 100, "issues": []},
    "summary": {"score": 90, "issues": []},
    "experience": {"score": 85, "issues": []},
    "skills": {"score": 90, "issues": []},
    "education": {"score": 100, "issues": []},
    "formatting": {"score": 80, "issues": []}
  },
  "improvements": [
    {"priority": "high", "action": "suggestion", "reason": "why"}
  ],
  "overallFeedback": "summary"
}

atsScore: 0-100. Below 60 = FAIL, 60-79 = BORDERLINE, 80+ = PASS. Be realistic.`,
          },
        ],
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    let jsonText = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonText);

    // Update the job's matched/missing skills in DB based on the new CV scan
    if (jobId && result.keywordMatch) {
      const foundSkills = result.keywordMatch.found || [];
      const missingSkills = result.keywordMatch.missing || [];
      updateJobSkills(jobId, foundSkills, missingSkills);
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}
