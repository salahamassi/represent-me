/**
 * Profile DOCX export — generates a fresh CV in Word format directly from
 * profile.ts. Companion to profile-pdf-service.ts, same sections, same
 * order, same visual hierarchy. Returns a Buffer for API streaming.
 *
 * Primary use: open in Word / Google Docs for light edits before applying
 * to a specific job.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
} from "docx";
import fs from "fs";
import path from "path";
import type { ProfileData } from "@/types";
import { profile as fullProfile } from "@/data/profile";
import { profileATS } from "@/data/profile-ats";

const HEADER_BLUE = "2563EB"; // hex without #
const TEXT_DARK = "1F2937";
const TEXT_MUTED = "6B7280";

function findProjectRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, "package.json")) &&
      fs.existsSync(path.join(dir, "node_modules", "docx"))
    ) {
      return dir;
    }
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const AVATAR_PATH = path.join(PROJECT_ROOT, "public", "salah-avatar.jpg");

/** Blue all-caps section heading with a thin underline via a bottom border. */
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "E5E7EB", space: 2 },
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 22, // 11pt
        color: HEADER_BLUE,
        characterSpacing: 20,
      }),
    ],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: 360 },
    children: [
      new TextRun({
        text: `•  ${text}`,
        size: 19, // 9.5pt
        color: TEXT_DARK,
      }),
    ],
  });
}

function body(text: string, extras: { italic?: boolean; bold?: boolean; color?: string } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({
        text,
        size: 19,
        color: extras.color ?? TEXT_DARK,
        italics: extras.italic,
        bold: extras.bold,
      }),
    ],
  });
}

/**
 * Build the name/role/contact block. Two shapes:
 *   - Full mode: 2-cell table with avatar on the right (docx tables are
 *     the idiomatic way to flow an image next to text without the image
 *     breaking the paragraph flow of later content).
 *   - ATS mode: a flat stack of paragraphs, single-column, no image — ATS
 *     parsers handle this far more reliably than tables or embedded images.
 */
function headerBlock(
  profile: ProfileData,
  ats: boolean
): (Paragraph | Table)[] {
  const contactLines = [
    [profile.phone, profile.email, profile.links.linkedin].filter(Boolean).join("  |  "),
    [profile.links.github, profile.location].filter(Boolean).join("  |  "),
  ];

  // ATS mode: single-column, no table, no image.
  if (ats) {
    return [
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: profile.name.toUpperCase(),
            bold: true,
            size: 48,
            color: TEXT_DARK,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: profile.role,
            size: 22,
            color: HEADER_BLUE,
          }),
        ],
      }),
      ...contactLines.map(
        (line) =>
          new Paragraph({
            spacing: { after: 30 },
            children: [
              new TextRun({
                text: line,
                size: 17,
                color: HEADER_BLUE,
              }),
            ],
          })
      ),
    ];
  }

  const leftCellChildren: Paragraph[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: profile.name.toUpperCase(),
          bold: true,
          size: 48, // 24pt
          color: TEXT_DARK,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: profile.role,
          size: 22, // 11pt
          color: HEADER_BLUE,
        }),
      ],
    }),
    ...contactLines.map(
      (line) =>
        new Paragraph({
          spacing: { after: 30 },
          children: [
            new TextRun({
              text: line,
              size: 17, // 8.5pt
              color: HEADER_BLUE,
            }),
          ],
        })
    ),
  ];

  const rightCellChildren: Paragraph[] = [];
  if (fs.existsSync(AVATAR_PATH)) {
    rightCellChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new ImageRun({
            data: fs.readFileSync(AVATAR_PATH),
            transformation: { width: 90, height: 90 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any),
        ],
      })
    );
  } else {
    rightCellChildren.push(new Paragraph({ children: [] }));
  }

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: noBorder.top,
        bottom: noBorder.bottom,
        left: noBorder.left,
        right: noBorder.right,
        insideHorizontal: noBorder.top,
        insideVertical: noBorder.top,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 78, type: WidthType.PERCENTAGE },
              borders: noBorder,
              children: leftCellChildren,
            }),
            new TableCell({
              width: { size: 22, type: WidthType.PERCENTAGE },
              borders: noBorder,
              children: rightCellChildren,
            }),
          ],
        }),
      ],
    }),
  ];
}

/**
 * @param ats  When true, uses the compressed `profileATS` view, skips
 *             the avatar, and flattens the header to single-column.
 */
export async function generateProfileDOCX(
  options: { ats?: boolean } = {}
): Promise<Buffer> {
  const { ats = false } = options;
  const profile: ProfileData = ats ? profileATS : fullProfile;
  const children: (Paragraph | Table)[] = [];

  // Header — avatar next to name block (or flat ATS header)
  children.push(...headerBlock(profile, ats));

  // Summary
  children.push(sectionHeading("Summary"));
  children.push(body(profile.summary));

  // Key Achievements
  if (profile.keyAchievements && profile.keyAchievements.length > 0) {
    children.push(sectionHeading("Key Achievements"));
    for (const a of profile.keyAchievements) {
      children.push(body(a.title, { bold: true }));
      children.push(body(a.description));
    }
  }

  // AI Integration Highlights
  if (
    profile.aiIntegrationHighlights &&
    profile.aiIntegrationHighlights.length > 0
  ) {
    children.push(sectionHeading("AI Integration Highlights"));
    children.push(body("Independent / Personal Projects", { bold: true }));
    for (const h of profile.aiIntegrationHighlights) {
      children.push(bullet(h));
    }
  }

  // Experience
  children.push(sectionHeading("Experience"));
  for (const exp of profile.experience) {
    const titleSuffix =
      exp.employmentType && exp.employmentType !== "full-time"
        ? `  (${exp.employmentType})`
        : "";
    children.push(body(exp.title + titleSuffix, { bold: true }));
    children.push(
      body(`${exp.company} · ${exp.period} · ${exp.location}`, {
        italic: true,
        color: TEXT_MUTED,
      })
    );
    if (exp.description) children.push(body(exp.description));
    for (const h of exp.highlights) {
      children.push(bullet(h));
    }
  }

  // Skills
  children.push(sectionHeading("Skills"));
  for (const group of profile.skills) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: `${group.category}: `,
            bold: true,
            size: 19,
            color: TEXT_DARK,
          }),
          new TextRun({
            text: group.items.join(" · "),
            size: 19,
            color: TEXT_DARK,
          }),
        ],
      })
    );
  }

  // Open Source & Creator
  if (profile.openSource.length > 0) {
    children.push(sectionHeading("Open Source & Creator"));
    for (const os of profile.openSource) {
      children.push(body(os.name, { bold: true }));
      if (os.url) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: os.url,
                size: 17,
                color: HEADER_BLUE,
                underline: { color: HEADER_BLUE },
              }),
            ],
          })
        );
      }
      children.push(body(os.description));
    }
  }

  // Publications
  if (profile.publications.length > 0) {
    children.push(sectionHeading("Publications"));
    for (const pub of profile.publications) {
      const line = [pub.title, pub.platform, pub.date].filter(Boolean).join(" · ");
      children.push(bullet(line));
    }
  }

  // Education
  if (profile.education.length > 0) {
    children.push(sectionHeading("Education"));
    for (const edu of profile.education) {
      children.push(body(edu.degree, { bold: true }));
      children.push(
        body(`${edu.institution} · ${edu.period}`, { color: TEXT_MUTED })
      );
    }
  }

  const doc = new Document({
    creator: profile.name,
    title: `${profile.name} — CV`,
    description: profile.role,
    styles: {
      default: {
        document: {
          run: { font: "Helvetica", size: 19 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 900, right: 900 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
