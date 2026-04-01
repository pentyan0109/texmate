import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECTS_DIR = path.join(process.cwd(), "projects");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  const file = searchParams.get("file");

  if (!project || !file) {
    return NextResponse.json({ error: "project and file required" }, { status: 400 });
  }

  const pdfPath = path.resolve(PROJECTS_DIR, project, file);
  const base = path.join(PROJECTS_DIR, project);
  if (!pdfPath.startsWith(base) || !pdfPath.endsWith(".pdf")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }

  const download = searchParams.get("download");
  const downloadName = searchParams.get("name") ?? file;
  const disposition = download
    ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    : `inline; filename="${file}"`;

  const data = fs.readFileSync(pdfPath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
    },
  });
}
