import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("file");

  if (!filename) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  // Sanitize filename to prevent path traversal
  const safeName = path.basename(filename);
  const resumeDir = path.join(process.cwd(), "data", "resumes");
  const filePath = path.join(resumeDir, safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": safeName.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
