import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchRepoTree, fetchRepoContents, fetchRepoReadme } from "@/services/github-api-service";
import { insertGeneratedContent } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { repoName } = body;

  if (!repoName) {
    return NextResponse.json({ error: "repoName required" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude API not configured" }, { status: 500 });
  }

  try {
    // Fetch repo files for context
    const tree = await fetchRepoTree("salahamassi", repoName);
    const currentReadme = await fetchRepoReadme("salahamassi", repoName);

    // Read up to 6 source files for context
    const selectedFiles = tree.slice(0, 6);
    const fileContents: string[] = [];
    for (const file of selectedFiles) {
      const content = await fetchRepoContents("salahamassi", repoName, file.path);
      if (content.length > 50) {
        fileContents.push(`--- ${file.path} ---\n${content.slice(0, 1000)}`);
      }
    }

    const filesContext = fileContents.join("\n\n");
    const fileList = tree.map((f) => f.path).join("\n");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      temperature: 0.4,
      system: "You are an expert technical writer who creates professional GitHub READMEs. Write clear, well-structured READMEs with proper markdown formatting. Include: project description, features, installation, usage, and contributing sections where relevant.",
      messages: [{
        role: "user",
        content: `Generate a professional README.md for the GitHub repository "${repoName}" by user salahamassi.

Current README (if any):
${currentReadme.slice(0, 500)}

File structure:
${fileList}

Source code samples:
${filesContext}

Generate a complete, professional README in markdown format. Include:
- A clear title and description
- Key features/highlights
- Installation instructions
- Usage examples (based on the actual code)
- Tech stack
- Contributing section
- License

Make it engaging and professional — this README represents the developer's work to recruiters and the community.

Return ONLY the markdown content, no JSON wrapping.`,
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const readme = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // Save to DB
    const contentId = insertGeneratedContent("readme", readme, repoName);

    return NextResponse.json({
      readme,
      contentId,
      tokens: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "README generation failed" },
      { status: 500 }
    );
  }
}
