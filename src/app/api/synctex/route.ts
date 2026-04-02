import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);
const PROJECTS_DIR = process.env.PROJECTS_DIR ?? path.join(process.cwd(), "projects");

interface SyncTeXRecord {
  page: number;
  x: number;
  y: number;
  line: number;
  col: number;
  file: string;
}

async function parseSyncTeX(project: string, baseName: string): Promise<SyncTeXRecord[]> {
  const synctexPath = path.join(PROJECTS_DIR, project, `${baseName}.synctex.gz`);
  if (!fs.existsSync(synctexPath)) return [];

  const compressed = fs.readFileSync(synctexPath);
  let content: string;
  try {
    const buf = await gunzip(compressed);
    content = buf.toString("utf-8");
  } catch {
    return [];
  }

  const records: SyncTeXRecord[] = [];
  const fileMap: Record<number, string> = {};
  let currentPage = 0;

  const lines = content.split("\n");
  let inContent = false;

  for (const line of lines) {
    if (line.startsWith("Content:")) { inContent = true; continue; }
    if (!inContent) {
      // Parse Input: entries  — "Input:N:path"
      const inputMatch = line.match(/^Input:(\d+):(.+)$/);
      if (inputMatch) {
        fileMap[parseInt(inputMatch[1])] = path.basename(inputMatch[2]);
      }
      continue;
    }

    if (line.startsWith("{")) {
      // Page start: {N
      currentPage = parseInt(line.slice(1)) || currentPage;
      continue;
    }
    if (line.startsWith("}")) continue; // page end

    // Node record: type:tag:line:col:h:v:w:d (simplified)
    // Vertical box: [, hbox: (, kern: k, glue: g, math: $, etc.
    // Only TeX box/character records carry position
    const m = line.match(/^[x([\]]:(\d+),(\d+):(-?\d+),(-?\d+):/);
    if (m) {
      const fileId = parseInt(m[1]);
      const srcLine = parseInt(m[2]);
      const hPos = parseInt(m[3]);
      const vPos = parseInt(m[4]);
      if (fileMap[fileId]) {
        records.push({
          page: currentPage,
          x: hPos,
          y: vPos,
          line: srcLine,
          col: 0,
          file: fileMap[fileId],
        });
      }
    }
  }

  return records;
}

// GET ?project=X&file=main&action=pdf2src&page=1&x=N&y=N
// → nearest source line for a PDF click
// GET ?project=X&file=main&action=src2pdf&line=N
// → page and approximate position for a source line
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const file = searchParams.get("file") ?? "main";
  const action = searchParams.get("action") ?? "pdf2src";

  if (!project) return NextResponse.json({ error: "project required" }, { status: 400 });

  const baseName = path.basename(file, ".tex");
  const records = await parseSyncTeX(project, baseName);

  if (records.length === 0) {
    return NextResponse.json({ error: "synctex not found — compile first with SyncTeX enabled" }, { status: 404 });
  }

  if (action === "pdf2src") {
    const page = parseInt(searchParams.get("page") ?? "1");
    const x = parseInt(searchParams.get("x") ?? "0");
    const y = parseInt(searchParams.get("y") ?? "0");

    const pageRecords = records.filter((r) => r.page === page);
    if (pageRecords.length === 0) return NextResponse.json({ line: 1, file: "main.tex" });

    // Find nearest record by Euclidean distance in synctex coordinates
    let best = pageRecords[0];
    let bestDist = Infinity;
    for (const r of pageRecords) {
      const dx = r.x - x;
      const dy = r.y - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; best = r; }
    }
    return NextResponse.json({ line: best.line, file: best.file });
  }

  if (action === "src2pdf") {
    const srcLine = parseInt(searchParams.get("line") ?? "1");
    const srcFile = searchParams.get("srcfile") ?? "";

    // Find best matching record for this source line
    const candidates = records.filter((r) => {
      if (srcFile && r.file !== path.basename(srcFile)) return false;
      return Math.abs(r.line - srcLine) <= 3;
    });
    if (candidates.length === 0) return NextResponse.json({ page: 1, x: 0, y: 0 });
    candidates.sort((a, b) => Math.abs(a.line - srcLine) - Math.abs(b.line - srcLine));
    const best = candidates[0];
    return NextResponse.json({ page: best.page, x: best.x, y: best.y });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
