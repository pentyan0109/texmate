import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECTS_DIR = process.env.PROJECTS_DIR ?? path.join(process.cwd(), "projects");
const MAX_SNAPSHOTS = 50;

function historyDir(project: string) {
  return path.join(PROJECTS_DIR, project, ".history");
}

function safeBase(project: string) {
  return path.join(PROJECTS_DIR, project);
}

// GET: list snapshots for a file
// GET /api/history?project=X&file=main.tex
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const file = searchParams.get("file");
  if (!project || !file) return NextResponse.json({ error: "project and file required" }, { status: 400 });

  const dir = historyDir(project);
  if (!fs.existsSync(dir)) return NextResponse.json({ snapshots: [] });

  const base = path.basename(file, ".tex");
  const ext = path.extname(file);
  const prefix = `${base}.`;

  const snapshots = fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext) && f !== file)
    .sort()
    .reverse()
    .slice(0, MAX_SNAPSHOTS)
    .map((f) => {
      const tsStr = f.slice(prefix.length, f.length - ext.length);
      const full = path.join(dir, f);
      const content = fs.readFileSync(full, "utf-8");
      return { snapshot: f, timestamp: tsStr, content };
    });

  return NextResponse.json({ snapshots });
}

// POST: save a snapshot
// Body: { project, file, content }
export async function POST(req: NextRequest) {
  const { project, file, content } = await req.json() as { project: string; file: string; content: string };
  if (!project || !file) return NextResponse.json({ error: "project and file required" }, { status: 400 });

  const base = safeBase(project);
  const dir = historyDir(project);
  if (!fs.existsSync(base)) return NextResponse.json({ error: "project not found" }, { status: 404 });
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const fileBase = path.basename(file, path.extname(file));
  const ext = path.extname(file);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const snapshotName = `${fileBase}.${ts}${ext}`;
  fs.writeFileSync(path.join(dir, snapshotName), content, "utf-8");

  // Prune old snapshots
  const prefix = `${fileBase}.`;
  const all = fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .sort();
  if (all.length > MAX_SNAPSHOTS) {
    all.slice(0, all.length - MAX_SNAPSHOTS).forEach((f) => {
      fs.unlinkSync(path.join(dir, f));
    });
  }

  return NextResponse.json({ ok: true, snapshot: snapshotName });
}

// DELETE: remove all history for a file
export async function DELETE(req: NextRequest) {
  const { project, file } = await req.json() as { project: string; file: string };
  const dir = historyDir(project);
  if (!fs.existsSync(dir)) return NextResponse.json({ ok: true });

  const fileBase = path.basename(file, path.extname(file));
  const ext = path.extname(file);
  const prefix = `${fileBase}.`;

  fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .forEach((f) => fs.unlinkSync(path.join(dir, f)));

  return NextResponse.json({ ok: true });
}
