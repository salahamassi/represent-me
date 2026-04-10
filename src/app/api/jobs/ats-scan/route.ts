import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { profile } from "@/data/profile";
import { originalResumeText } from "@/data/resume-text";

export async function POST(request: NextRequest) {
  const { resumeText: inputText, jobDescription, jobTitle } = await request.json();

  // Use the real original resume if marker is passed
  const resumeText = inputText === "__USE_ORIGINAL__" ? originalResumeText : (inputText || originalResumeText);

  if (!resumeText) {
    return NextResponse.json({ error: "resumeText required" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude API not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.2,
      system: "You are an ATS (Applicant Tracking System) expert. You analyze resumes against job descriptions to predict if they will pass automated filters. Return ONLY valid JSON.",
      messages: [{
        role: "user",
        content: `Analyze this resume against the job description as an ATS system would.

RESUME:
${resumeText.slice(0, 3000)}

JOB DESCRIPTION:
${(jobDescription || "Senior Flutter/Mobile Developer role requiring: Flutter, Dart, Swift, iOS, Android, CI/CD, Clean Architecture, Unit Testing, Firebase").slice(0, 2000)}

JOB TITLE: ${jobTitle || "Senior Mobile Engineer"}

Return JSON with this EXACT structure:
{
  "atsScore": 75,
  "verdict": "PASS",
  "keywordMatch": {
    "found": ["Flutter", "Dart", "iOS"],
    "missing": ["Kubernetes", "AWS"],
    "percentage": 75
  },
  "sections": {
    "contactInfo": {"score": 100, "issues": []},
    "summary": {"score": 80, "issues": ["Could mention specific years of experience"]},
    "experience": {"score": 90, "issues": []},
    "skills": {"score": 70, "issues": ["Missing: Docker"]},
    "education": {"score": 100, "issues": []},
    "formatting": {"score": 85, "issues": ["Some bullet points too long"]}
  },
  "improvements": [
    {"priority": "high", "action": "Add 'Dart' to skills section", "reason": "Job requires Dart, not found in resume"},
    {"priority": "medium", "action": "Quantify achievements", "reason": "ATS favors metrics like '30% improvement'"}
  ],
  "overallFeedback": "Brief summary of the resume's ATS compatibility"
}

atsScore: 0-100 (below 60 = likely filtered out, 60-79 = borderline, 80+ = should pass)
verdict: "PASS" (80+), "BORDERLINE" (60-79), or "FAIL" (<60)
Be realistic and strict — real ATS systems are unforgiving.`
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    let jsonText = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonText);

    return NextResponse.json({
      success: true,
      ...result,
      tokens: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ATS scan failed" },
      { status: 500 }
    );
  }
}
