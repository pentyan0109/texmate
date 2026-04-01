import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECTS_DIR = process.env.PROJECTS_DIR ?? path.join(process.cwd(), "projects");
const ALLOWED_EXTS = [".png", ".jpg", ".jpeg", ".pdf", ".eps"];

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const project = formData.get("project") as string;
  const file = formData.get("file") as File;

  if (!project || !file) {
    return NextResponse.json({ error: "project と file が必要です" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return NextResponse.json({ error: `対応形式: ${ALLOWED_EXTS.join(", ")}` }, { status: 400 });
  }

  const projectDir = path.join(PROJECTS_DIR, project);
  if (!fs.existsSync(projectDir)) {
    return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
  }

  const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9_\-\.ぁ-んァ-ヶ\u4E00-\u9FFF]/g, "_");
  const destPath = path.join(projectDir, safeName);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  return NextResponse.json({ filename: safeName });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) return NextResponse.json({ error: "project required" }, { status: 400 });

  const projectDir = path.join(PROJECTS_DIR, project);
  if (!fs.existsSync(projectDir)) return NextResponse.json({ images: [] });

  const images = fs.readdirSync(projectDir).filter((f) =>
    ALLOWED_EXTS.includes(path.extname(f).toLowerCase())
  );
  return NextResponse.json({ images });
}
