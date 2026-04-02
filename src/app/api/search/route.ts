import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECTS_DIR = process.env.PROJECTS_DIR ?? path.join(process.cwd(), "projects");

const TEXT_EXTS = new Set([".tex", ".bib", ".sty", ".cls"]);

interface Match {
  file: string;
  line: number;
  text: string;
  column: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const query = searchParams.get("q");
  const caseSensitive = searchParams.get("cs") === "1";

  if (!project || !query) {
    return NextResponse.json({ error: "project and q required" }, { status: 400 });
  }

  const projectDir = path.join(PROJECTS_DIR, project);
  if (!fs.existsSync(projectDir)) return NextResponse.json({ matches: [] });

  const matches: Match[] = [];
  const flags = caseSensitive ? "g" : "gi";
  let regex: RegExp;
  try {
    regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  } catch {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }

  function searchFile(filePath: string, relPath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    lines.forEach((lineText, i) => {
      let m: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((m = regex.exec(lineText)) !== null) {
        matches.push({ file: relPath, line: i + 1, text: lineText.trim(), column: m.index });
        if (!regex.global) break;
      }
    });
  }

  function scanDir(dir: string, relBase: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      const rel = path.join(relBase, entry.name);
      if (entry.isDirectory()) {
        scanDir(full, rel);
      } else if (TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
        searchFile(full, entry.name); // relative to project root
      }
    }
  }

  scanDir(projectDir, "");
  return NextResponse.json({ matches: matches.slice(0, 200) }); // cap at 200
}
