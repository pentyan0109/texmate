import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const PROJECTS_DIR = path.join(process.cwd(), "projects");
// Windows: MiKTeX path, Linux: TeX Live (e.g. /usr/bin)
const MIKTEX_BIN = process.env.LATEX_BIN_DIR ?? "C:\\Users\\penty\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64";

export async function POST(req: NextRequest) {
  const { project, file, engine, lineNumbers } = await req.json();
  const projectDir = path.join(PROJECTS_DIR, project);
  const texFile = path.join(projectDir, file || "main.tex");

  if (!fs.existsSync(texFile)) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }

  const selectedEngine = engine || "lualatex";
  const isWindows = process.platform === "win32";
  const enginePath = path.join(MIKTEX_BIN, isWindows ? `${selectedEngine}.exe` : selectedEngine);

  if (!fs.existsSync(enginePath)) {
    return NextResponse.json({ error: `エンジン ${selectedEngine} が見つかりません` }, { status: 500 });
  }

  // If line numbers requested, inject lineno package into a temp file
  let compileTarget = texFile;
  const baseName = path.basename(file || "main.tex", ".tex");
  const tmpTexFile = path.join(projectDir, `${baseName}._lineno_.tex`);

  if (lineNumbers) {
    const original = fs.readFileSync(texFile, "utf-8");
    // Inject lineno just before \begin{document} so it loads after luatexja
    const injected = original.replace(
      /\\begin\{document\}/,
      "\\usepackage{lineno}\n\\linenumbers\n\\begin{document}"
    );
    fs.writeFileSync(tmpTexFile, injected, "utf-8");
    compileTarget = tmpTexFile;
  }

  // uplatex/platex needs dvipdfmx as a second step
  const needsDvipdfmx = selectedEngine === "uplatex" || selectedEngine === "platex";

  const args = [
    "--interaction=nonstopmode",
    `--output-directory=${projectDir}`,
    compileTarget,
  ];

  let log = "";

  // Run twice for cross-references
  for (let pass = 1; pass <= 2; pass++) {
    try {
      const result = await execFileAsync(enginePath, args, {
        cwd: projectDir,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `${MIKTEX_BIN};${process.env.PATH}`,
        },
      });
      if (pass === 2) log = result.stdout + result.stderr;
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      log = (error.stdout || "") + (error.stderr || "") + "\n" + (error.message || "");
      break;
    }
  }

  // Rename output PDF from temp name to original name if needed
  const compiledBaseName = lineNumbers
    ? `${baseName}._lineno_`
    : baseName;
  const pdfName = baseName + ".pdf";
  const pdfPath = path.join(projectDir, pdfName);
  const compiledPdfPath = path.join(projectDir, compiledBaseName + ".pdf");

  // For uplatex/platex: convert DVI to PDF
  if (needsDvipdfmx) {
    const dviPath = path.join(projectDir, compiledBaseName + ".dvi");
    if (fs.existsSync(dviPath)) {
      const dvipdfmx = path.join(MIKTEX_BIN, isWindows ? "dvipdfmx.exe" : "dvipdfmx");
      try {
        const r = await execFileAsync(dvipdfmx, ["-o", compiledPdfPath, dviPath], {
          cwd: projectDir,
          timeout: 60000,
          env: { ...process.env, PATH: `${MIKTEX_BIN};${process.env.PATH}` },
        });
        log += "\n[dvipdfmx]\n" + r.stdout + r.stderr;
      } catch (err: unknown) {
        const error = err as { stdout?: string; stderr?: string; message?: string };
        log += "\n[dvipdfmx error]\n" + (error.stdout || "") + (error.stderr || "");
      }
    }
  }

  // Move compiled PDF to final name (overwrites previous)
  if (lineNumbers && fs.existsSync(compiledPdfPath)) {
    fs.copyFileSync(compiledPdfPath, pdfPath);
    // Clean up temp files
    for (const ext of [".tex", ".pdf", ".log", ".aux", ".dvi"]) {
      const tmp = path.join(projectDir, `${baseName}._lineno_${ext}`);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }

  const pdfExists = fs.existsSync(pdfPath);
  const success = pdfExists;

  return NextResponse.json({ success, log, pdfFile: pdfExists ? pdfName : null });
}
