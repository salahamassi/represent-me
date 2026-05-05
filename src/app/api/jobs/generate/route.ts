import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { profile } from "@/data/profile";
import { jobPreferences } from "@/data/job-preferences";
import { insertGeneratedContent, updateJobKit } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { jobId, jobTitle, company, description, fitPercentage } = await request.json();

  if (!jobTitle || !company) {
    return NextResponse.json({ error: "jobTitle and company required" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude API not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build full experience context
  const experienceContext = profile.experience.map((e) =>
    `${e.title} at ${e.company} (${e.period}):\n${e.highlights.map((h) => `  - ${h}`).join("\n")}\n  Tech: ${e.technologies.join(", ")}`
  ).join("\n\n");

  try {
    // Generate BOTH cover letter AND resume content in one call (saves cost + ensures consistency)
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      temperature: 0.5,
      system: `You are a career consultant helping ${profile.name} apply for jobs. You produce two things:
1. A cover letter (authentic, first-person, 300-400 words)
2. Tailored resume content sections to paste into an existing resume template

The candidate already has a professional, well-designed resume. They need the TEXT CONTENT tailored for each job — not a new format. Each section should be ready to copy-paste.`,
      messages: [{
        role: "user",
        content: `Generate a cover letter AND tailored resume content for:

JOB: ${jobTitle} at ${company}
DESCRIPTION: ${(description || "").slice(0, 1500)}

CANDIDATE FULL PROFILE:
Name: ${profile.name}
Current Role: ${profile.role}
Location: ${profile.location}
Email: ${profile.email} | Phone: ${profile.phone}
GitHub: ${profile.links.github} | LinkedIn: ${profile.links.linkedin}
Medium: ${profile.links.medium} | Dev.to: ${profile.links.devto}

FULL EXPERIENCE:
${experienceContext}

SKILLS:
${profile.skills.map((s) => `${s.category}: ${s.items.join(", ")}`).join("\n")}

OPEN SOURCE:
${profile.openSource.map((o) => `- ${o.name}: ${o.description}`).join("\n")}

PUBLICATIONS:
${profile.publications.map((p) => `- ${p.title} (${p.platform}, ${p.date})`).join("\n")}

EDUCATION:
${profile.education.map((e) => `${e.degree} — ${e.institution} (${e.period})`).join("\n")}

KEY ACHIEVEMENTS: 100,000+ app downloads, 30% deployment time reduction, 90% order flow stability, 7 pub.dev packages

---

Return your response in this EXACT format (use these exact headers):

===COVER_LETTER===
[Write the full cover letter here, 300-400 words, authentic first-person]

===SUMMARY===
[Write a 2-3 sentence tailored summary/headline for this specific job. Ready to paste into the resume header.]

===EXPERIENCE_BULLETS===
[For each relevant role, write tailored bullet points emphasizing what matters for THIS job. Include ALL roles but reorder bullets by relevance. Format:]

**[Job Title] — [Company]** ([Period])
• [Bullet point tailored for this application]
• [Another bullet point]
Tech: [relevant technologies]

[Repeat for each role]

===SKILLS_ORDER===
[List skills reordered with most relevant to THIS job first. Group by category.]

===WHAT_TO_ADD===
[List specific things to ADD to the resume for this job that aren't there yet]

===WHAT_TO_REMOVE===
[List things to DE-EMPHASIZE or remove for this specific application]

===APPLICATION_TIPS===
[3-5 specific tips for this application]`,
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const fullResponse = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // Parse sections
    const sections: Record<string, string> = {};
    const sectionNames = ["COVER_LETTER", "SUMMARY", "EXPERIENCE_BULLETS", "SKILLS_ORDER", "WHAT_TO_ADD", "WHAT_TO_REMOVE", "APPLICATION_TIPS"];

    for (const name of sectionNames) {
      const regex = new RegExp(`===${name}===\\s*([\\s\\S]*?)(?====\\w|$)`);
      const match = fullResponse.match(regex);
      sections[name] = match ? match[1].trim() : "";
    }

    // Save cover letter
    const coverLetter = sections.COVER_LETTER || "";
    const coverLetterId = insertGeneratedContent("cover_letter", coverLetter, `job-${jobId}`);

    // Persist Bulk Reviewer kit fields onto the same row. Top-3 bullets
    // are extracted by pulling the first three lines that start with `•`
    // out of EXPERIENCE_BULLETS — Claude formats them consistently per
    // the prompt template above. Falls back to an empty array if the
    // section is missing or malformed; the modal renders the empty
    // state honestly rather than fabricating bullets.
    const tailoredSummary = sections.SUMMARY || "";
    const bulletLines = (sections.EXPERIENCE_BULLETS || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("•") || line.startsWith("- "))
      .map((line) => line.replace(/^•\s*|^-\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (jobId) {
      updateJobKit(jobId, {
        tailoredSummary,
        resumeBullets: bulletLines,
      });
    }

    // Save resume content
    const resumeContent = [
      sections.SUMMARY && `📝 TAILORED SUMMARY\n${sections.SUMMARY}`,
      sections.EXPERIENCE_BULLETS && `💼 EXPERIENCE (reordered for this job)\n${sections.EXPERIENCE_BULLETS}`,
      sections.SKILLS_ORDER && `🛠 SKILLS (reordered)\n${sections.SKILLS_ORDER}`,
      sections.WHAT_TO_ADD && `➕ ADD THESE\n${sections.WHAT_TO_ADD}`,
      sections.WHAT_TO_REMOVE && `➖ REMOVE/DE-EMPHASIZE\n${sections.WHAT_TO_REMOVE}`,
      sections.APPLICATION_TIPS && `💡 TIPS\n${sections.APPLICATION_TIPS}`,
    ].filter(Boolean).join("\n\n---\n\n");

    insertGeneratedContent("resume_content", resumeContent, `job-${jobId}`);

    return NextResponse.json({
      success: true,
      coverLetter,
      coverLetterId,
      resumeSections: {
        summary: sections.SUMMARY || "",
        experienceBullets: sections.EXPERIENCE_BULLETS || "",
        skillsOrder: sections.SKILLS_ORDER || "",
        whatToAdd: sections.WHAT_TO_ADD || "",
        whatToRemove: sections.WHAT_TO_REMOVE || "",
        applicationTips: sections.APPLICATION_TIPS || "",
      },
      tokens: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
