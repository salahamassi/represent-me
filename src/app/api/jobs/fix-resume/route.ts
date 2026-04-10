import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { originalResumeText } from "@/data/resume-text";

export async function POST(request: NextRequest) {
  const { jobTitle, company, jobDescription, atsImprovements, missingKeywords } = await request.json();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude API not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // Claude generates a tailored summary for this job
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      temperature: 0.4,
      system: "You write tailored resume summaries. Return ONLY the summary text. No JSON, no quotes, no markdown. Plain text only, 3-4 sentences.",
      messages: [{
        role: "user",
        content: `Write a tailored resume summary for applying to: ${jobTitle} at ${company}

${jobDescription ? `Job description: ${jobDescription.slice(0, 500)}` : ""}
${atsImprovements ? `ATS fixes needed: ${atsImprovements}` : ""}
${missingKeywords ? `Missing keywords to include: ${missingKeywords}` : ""}

Candidate highlights:
- 5+ years Flutter/Dart + Swift/iOS
- Created Flutter Bond framework (7 pub.dev packages)
- Former VP of Innovation, led mobile teams
- 100,000+ app downloads, 30% deployment improvement, 90% stability increase
- AI integration experience (Claude API, AI agents, automated QA)
- Open source contributor (share_plus, FlutterFire CLI, SwifterSwift)

Write 3-4 sentences. Include missing keywords naturally. Emphasize what matches this specific job.`,
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const tailoredSummary = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    // Generate DOCX using the script (with the tailored summary injected)
    const timestamp = Date.now();
    const safeName = jobTitle.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 50);
    const docxFilename = `SalahNahed-${safeName}-${timestamp}.docx`;
    const docxOutputPath = path.join(process.cwd(), "data", "resumes", docxFilename);

    fs.mkdirSync(path.join(process.cwd(), "data", "resumes"), { recursive: true });

    // Write tailored summary to tmp file for the script to read
    const tmpPath = path.join(process.cwd(), "data", `tmp-summary-${timestamp}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify({ summary: tailoredSummary, jobTitle, company }));

    const scriptPath = path.join(process.cwd(), "scripts", "create-resume-docx.js");
    const result = execSync(
      `node "${scriptPath}" "${docxOutputPath}" "${tmpPath}"`,
      { timeout: 15000, encoding: "utf-8" }
    );

    try { fs.unlinkSync(tmpPath); } catch {}

    const parsed = JSON.parse(result.trim());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      docxFilename,
      message: `Resume DOCX generated for ${jobTitle}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
