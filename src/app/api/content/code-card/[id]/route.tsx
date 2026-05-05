import { ImageResponse } from "next/og";
import { codeToTokens } from "shiki";
import { getContentById } from "@/lib/db";

export const runtime = "nodejs";

/** Detect language from content heuristics */
function detectLanguage(code: string): string {
  if (/\bawait\b.*\bplatform\.invokeMethod\b|\bVoid\b.*Future|\bvoid\s+main\(/.test(code)) return "dart";
  if (/@MainActor|func\s+\w+\(|let\s+\w+\s*:|\bvar\s+\w+\s*:/.test(code)) return "swift";
  if (/\bfun\s+\w+\(|\bval\s+\w+\s*=|\bvar\s+\w+\s*=/.test(code)) return "kotlin";
  if (/=>|\bconst\s+\w+|\binterface\s+\w+|\btype\s+\w+\s*=/.test(code)) return "typescript";
  return "typescript";
}

/** Check if a line looks like code (has code-like patterns) */
function looksLikeCode(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) return false;
  // Code indicators: brackets, semicolons, operators, function calls
  return (
    /[{};()\[\]]/.test(trimmed) ||
    /^(const|let|var|function|class|def|fun|func|void|public|private|async|await|@)\s/.test(trimmed) ||
    /^\s*\/\/|^\s*#/.test(trimmed) ||  // comments
    /=>\s*|->\s*/.test(trimmed) ||      // arrows
    /^\w+\.\w+\(/.test(trimmed)         // method calls
  );
}

/** Extract a block of consecutive code-like lines from unfenced text */
function extractUnfencedCodeBlock(text: string): { code: string; language: string } {
  const lines = text.split("\n");
  let bestStart = -1;
  let bestEnd = -1;
  let bestScore = 0;

  let currentStart = -1;
  let currentScore = 0;
  for (let i = 0; i < lines.length; i++) {
    if (looksLikeCode(lines[i]) || (currentStart !== -1 && lines[i].trim() === "")) {
      if (currentStart === -1) currentStart = i;
      if (lines[i].trim() !== "") currentScore++;
    } else {
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestStart = currentStart;
        bestEnd = i;
      }
      currentStart = -1;
      currentScore = 0;
    }
  }
  if (currentScore > bestScore) {
    bestStart = currentStart;
    bestEnd = lines.length;
    bestScore = currentScore;
  }

  if (bestStart === -1 || bestScore < 2) {
    return { language: "", code: "" };
  }

  const codeBlock = lines.slice(bestStart, bestEnd).join("\n").trim();
  return { language: detectLanguage(codeBlock), code: codeBlock };
}

/** Extract the best code block from the post */
function extractCodeBlock(text: string): { code: string; language: string } {
  const blocks: { code: string; language: string }[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || detectLanguage(match[2]),
      code: match[2].trim(),
    });
  }

  if (blocks.length === 0) {
    // Fallback: find the best run of code-like lines
    return extractUnfencedCodeBlock(text);
  }

  const substantial = blocks.filter((b) => b.code.split("\n").length >= 3);
  if (substantial.length > 0) {
    return substantial.reduce((best, b) => b.code.length > best.code.length ? b : best);
  }
  return blocks[0];
}

/** Truncate code to fit the card */
function truncateCode(code: string, maxLines = 12): string {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;
  return lines.slice(0, maxLines).join("\n");
}

/** Extract the hook sentence */
function extractHook(text: string): string {
  const beforeCode = text.split("```")[0].trim();
  const sentences = beforeCode.split(/[.\n]/).filter((s) => s.trim().length > 10);
  const hook = sentences[0]?.trim() || "";
  if (hook.length <= 70) return hook;
  return hook.slice(0, 70).replace(/\s+\S*$/, "") + "...";
}

/** Map shiki language names to valid identifiers */
function mapLanguage(lang: string): string {
  const map: Record<string, string> = {
    dart: "dart",
    swift: "swift",
    kotlin: "kotlin",
    typescript: "typescript",
    tsx: "tsx",
    javascript: "javascript",
    java: "java",
    python: "python",
    go: "go",
    rust: "rust",
    code: "typescript",
  };
  return map[lang.toLowerCase()] || "typescript";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const content = getContentById(Number(id));

  if (!content) {
    return new Response("Not found", { status: 404 });
  }

  const { code, language } = extractCodeBlock(content.generated_text);
  const hook = extractHook(content.generated_text);
  const displayCode = truncateCode(code);
  const shikiLang = mapLanguage(language);

  // Language badge colors
  const langColors: Record<string, string> = {
    dart: "#00B4AB",
    swift: "#FA7343",
    kotlin: "#7F52FF",
    typescript: "#3178C6",
    tsx: "#3178C6",
    javascript: "#F7DF1E",
    java: "#ED8B00",
  };
  const langColor = langColors[language.toLowerCase()] || "#888";

  // Tokenize with Shiki
  let tokenLines: { content: string; color: string }[][] = [];
  try {
    const result = await codeToTokens(displayCode, {
      lang: shikiLang,
      theme: "github-dark",
    });
    tokenLines = result.tokens.map((line) =>
      line.map((token) => ({
        content: token.content,
        color: token.color || "#e1e4e8",
      }))
    );
  } catch {
    // Fallback: no highlighting
    tokenLines = displayCode.split("\n").map((line) => [
      { content: line, color: "#e1e4e8" },
    ]);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(145deg, #0d1117 0%, #161b22 50%, #0d1117 100%)",
          padding: "40px 44px",
          fontFamily: "monospace",
        }}
      >
        {/* Hook */}
        {hook && (
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#f0f6fc",
              marginBottom: 20,
              lineHeight: 1.3,
              display: "flex",
              fontFamily: "sans-serif",
            }}
          >
            {hook}
          </div>
        )}

        {/* Code Block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "#1a1f2b",
            borderRadius: 12,
            padding: "16px 20px",
            border: "1px solid #30363d",
            overflow: "hidden",
          }}
        >
          {/* Window dots + language badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
            </div>
            {language && (
              <div
                style={{
                  fontSize: 11,
                  color: langColor,
                  background: "rgba(255, 255, 255, 0.06)",
                  padding: "2px 10px",
                  borderRadius: 4,
                  display: "flex",
                }}
              >
                {language}
              </div>
            )}
          </div>

          {/* Syntax-highlighted code lines */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {tokenLines.map((line, i) => (
              <div key={i} style={{ display: "flex", whiteSpace: "pre" }}>
                {/* Line number */}
                <span
                  style={{
                    color: "#484f58",
                    minWidth: 28,
                    textAlign: "right",
                    marginRight: 16,
                    userSelect: "none",
                    fontSize: 12,
                  }}
                >
                  {i + 1}
                </span>
                {/* Tokens */}
                {line.map((token, j) => (
                  <span key={j} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div style={{ display: "flex", flex: 1 }} />

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                color: "white",
                fontFamily: "sans-serif",
              }}
            >
              S
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 14, color: "#f0f6fc", fontWeight: 600, fontFamily: "sans-serif" }}>
                Salah Nahed
              </span>
              <span style={{ fontSize: 11, color: "#8b949e", fontFamily: "sans-serif" }}>
                Mobile Developer
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#484f58", display: "flex", fontFamily: "sans-serif" }}>
            github.com/salahamassi
          </div>
        </div>
      </div>
    ),
    {
      width: 800,
      height: 520,
    }
  );
}
