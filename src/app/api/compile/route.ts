import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const PROJECTS_DIR = process.env.PROJECTS_DIR ?? path.join(process.cwd(), "projects");
// Windows: MiKTeX path, Linux: TeX Live (e.g. /usr/bin)
const MIKTEX_BIN = process.env.LATEX_BIN_DIR ?? "C:\\Users\\penty\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64";

function bin(name: string) {
  const isWindows = process.platform === "win32";
  return path.join(MIKTEX_BIN, isWindows ? `${name}.exe` : name);
}

export async function POST(req: NextRequest) {
  const { project, file, engine, lineNumbers, bibtex: useBibtex } = await req.json() as {
    project: string;
    file?: string;
    engine?: string;
    lineNumbers?: boolean;
    bibtex?: boolean;
  };

  const projectDir = path.join(PROJECTS_DIR, project);
  const texFile = path.join(projectDir, file || "main.tex");

  if (!fs.existsSync(texFile)) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }

  const selectedEngine = engine || "lualatex";
  const enginePath = bin(selectedEngine);

  if (!fs.existsSync(enginePath)) {
    return NextResponse.json({ error: `エンジン ${selectedEngine} が見つかりません` }, { status: 500 });
  }

  // If line numbers requested, inject lineno package into a temp file
  let compileTarget = texFile;
  const baseName = path.basename(file || "main.tex", ".tex");
  const tmpTexFile = path.join(projectDir, `${baseName}._lineno_.tex`);

  if (lineNumbers) {
    const original = fs.readFileSync(texFile, "utf-8");
    const injected = original.replace(
      /\\begin\{document\}/,
      "\\usepackage{lineno}\n\\linenumbers\n\\begin{document}"
    );
    fs.writeFileSync(tmpTexFile, injected, "utf-8");
    compileTarget = tmpTexFile;
  }

  const needsDvipdfmx = selectedEngine === "uplatex" || selectedEngine === "platex";
  const compiledBaseName = lineNumbers ? `${baseName}._lineno_` : baseName;

  // Determine if biber (biblatex) or bibtex is needed
  const sourceContent = fs.readFileSync(texFile, "utf-8");
  const usesBiblatex = /\\usepackage(\[.*?\])?\{biblatex\}/.test(sourceContent);
  const hasBibliography = /\\bibliography\{|\\addbibresource\{/.test(sourceContent);
  const runBibStep = useBibtex && hasBibliography;

  const args = [
    "--interaction=nonstopmode",
    "--synctex=1",
    `--output-directory=${projectDir}`,
    compileTarget,
  ];

  const envPath = process.platform === "win32"
    ? `${MIKTEX_BIN};${process.env.PATH}`
    : `${MIKTEX_BIN}:${process.env.PATH}`;

  const env = { ...process.env, PATH: envPath };

  let log = "";

  // Pass 1
  try {
    const r1 = await execFileAsync(enginePath, args, {
      cwd: projectDir, timeout: 120000, maxBuffer: 10 * 1024 * 1024, env,
    });
    log = r1.stdout + r1.stderr;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    log = (e.stdout || "") + (e.stderr || "") + "\n" + (e.message || "");
  }

  // BibTeX / Biber step
  if (runBibStep) {
    if (usesBiblatex) {
      const biberPath = bin("biber");
      if (fs.existsSync(biberPath)) {
        try {
          const r = await execFileAsync(biberPath, [compiledBaseName], {
            cwd: projectDir, timeout: 60000, env,
          });
          log += "\n[biber]\n" + r.stdout + r.stderr;
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string; message?: string };
          log += "\n[biber error]\n" + (e.stdout || "") + (e.stderr || "");
        }
      } else {
        log += "\n[biber not found — skipped]";
      }
    } else {
      const bibtexPath = bin("bibtex");
      const auxFile = path.join(projectDir, `${compiledBaseName}.aux`);
      if (fs.existsSync(bibtexPath) && fs.existsSync(auxFile)) {
        try {
          const r = await execFileAsync(bibtexPath, [auxFile], {
            cwd: projectDir, timeout: 60000, env,
          });
          log += "\n[bibtex]\n" + r.stdout + r.stderr;
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string; message?: string };
          log += "\n[bibtex error]\n" + (e.stdout || "") + (e.stderr || "");
        }
      }
    }
  }

  // Pass 2 (and pass 3 if bib was run, to resolve refs)
  const extraPasses = runBibStep ? [2, 3] : [2];
  for (const pass of extraPasses) {
    try {
      const r = await execFileAsync(enginePath, args, {
        cwd: projectDir, timeout: 120000, maxBuffer: 10 * 1024 * 1024, env,
      });
      if (pass === extraPasses[extraPasses.length - 1]) log = r.stdout + r.stderr;
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      log = (e.stdout || "") + (e.stderr || "") + "\n" + (e.message || "");
      break;
    }
  }

  // DVI → PDF for uplatex/platex
  const pdfName = baseName + ".pdf";
  const pdfPath = path.join(projectDir, pdfName);
  const compiledPdfPath = path.join(projectDir, compiledBaseName + ".pdf");

  if (needsDvipdfmx) {
    const dviPath = path.join(projectDir, compiledBaseName + ".dvi");
    if (fs.existsSync(dviPath)) {
      const dvipdfmx = bin("dvipdfmx");
      try {
        const r = await execFileAsync(dvipdfmx, ["-o", compiledPdfPath, dviPath], {
          cwd: projectDir, timeout: 60000, env,
        });
        log += "\n[dvipdfmx]\n" + r.stdout + r.stderr;
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        log += "\n[dvipdfmx error]\n" + (e.stdout || "") + (e.stderr || "");
      }
    }
  }

  // Move compiled PDF to final name
  if (lineNumbers && fs.existsSync(compiledPdfPath)) {
    fs.copyFileSync(compiledPdfPath, pdfPath);
    for (const ext of [".tex", ".pdf", ".log", ".aux", ".dvi", ".synctex.gz"]) {
      const tmp = path.join(projectDir, `${baseName}._lineno_${ext}`);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }

  const pdfExists = fs.existsSync(pdfPath);
  return NextResponse.json({ success: pdfExists, log, pdfFile: pdfExists ? pdfName : null });
}
