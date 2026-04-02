import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { Readable } from "stream";

const PROJECTS_DIR = process.env.PROJECTS_DIR ?? path.join(process.cwd(), "projects");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");
  if (!project) return NextResponse.json({ error: "project required" }, { status: 400 });

  const projectDir = path.join(PROJECTS_DIR, project);
  if (!fs.existsSync(projectDir)) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Build ZIP in memory stream
  const archive = archiver("zip", { zlib: { level: 6 } });

  // Collect all non-hidden files recursively
  function addDir(dir: string, baseInZip: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // skip .history etc
      const full = path.join(dir, entry.name);
      const zipPath = path.join(baseInZip, entry.name);
      if (entry.isDirectory()) {
        addDir(full, zipPath);
      } else {
        archive.file(full, { name: zipPath });
      }
    }
  }
  addDir(projectDir, project);

  archive.finalize();

  // Convert Node stream to Web ReadableStream
  const webStream = new ReadableStream({
    start(controller) {
      archive.on("data", (chunk) => controller.enqueue(chunk));
      archive.on("end", () => controller.close());
      archive.on("error", (err) => controller.error(err));
    },
  });

  const filename = encodeURIComponent(`${project}.zip`);
  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
