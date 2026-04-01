import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECTS_DIR = process.env.PROJECTS_DIR ?? path.join(process.cwd(), "projects");

function safePath(project: string, file: string) {
  const base = path.join(PROJECTS_DIR, project);
  const full = path.resolve(base, file);
  if (!full.startsWith(base)) throw new Error("Path traversal detected");
  return full;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const file = searchParams.get("file");
  if (!project) return NextResponse.json({ error: "project required" }, { status: 400 });

  if (!file) {
    // List files in project
    const dir = path.join(PROJECTS_DIR, project);
    if (!fs.existsSync(dir)) return NextResponse.json({ error: "not found" }, { status: 404 });
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".tex") || f.endsWith(".bib") || f.endsWith(".sty"));
    return NextResponse.json({ files });
  }

  const filePath = safePath(project, file);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const content = fs.readFileSync(filePath, "utf-8");
  return NextResponse.json({ content });
}

export async function PUT(req: NextRequest) {
  const { project, file, content } = await req.json();
  if (!project || !file) return NextResponse.json({ error: "project and file required" }, { status: 400 });
  const filePath = safePath(project, file);
  fs.writeFileSync(filePath, content, "utf-8");
  return NextResponse.json({ ok: true });
}
