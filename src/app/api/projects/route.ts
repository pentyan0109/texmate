import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECTS_DIR = path.join(process.cwd(), "projects");

function ensureProjectsDir() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
}

export async function GET() {
  ensureProjectsDir();
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  const projects = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const stat = fs.statSync(path.join(PROJECTS_DIR, e.name));
      return { name: e.name, updatedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  ensureProjectsDir();
  const { name, template } = await req.json();
  // Block only characters dangerous for file paths
  if (!name || name.trim() === "" || /[/\\:*?"<>|]|^\.|\.\./.test(name)) {
    return NextResponse.json({ error: "無効なプロジェクト名（/ \\ : * ? \" < > | は使用不可）" }, { status: 400 });
  }
  const projectDir = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(projectDir)) {
    return NextResponse.json({ error: "同名のプロジェクトが存在します" }, { status: 409 });
  }
  fs.mkdirSync(projectDir, { recursive: true });

  const content = getTemplate(template || "basic", name);
  fs.writeFileSync(path.join(projectDir, "main.tex"), content, "utf-8");

  return NextResponse.json({ name, mainFile: "main.tex" });
}

export async function DELETE(req: NextRequest) {
  const { name } = await req.json();
  const projectDir = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectDir)) {
    return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
  }
  fs.rmSync(projectDir, { recursive: true, force: true });
  return NextResponse.json({ ok: true });
}

function getTemplate(template: string, title: string): string {
  if (template === "article") {
    return `\\documentclass[a4paper,12pt]{ltjsarticle}
\\usepackage{luatexja}
\\usepackage{luatexja-fontspec}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{${title}}
\\author{著者名}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{はじめに}
ここに本文を書きます。日本語が使えます。

\\section{数式の例}
インライン数式: $E = mc^2$

ディスプレイ数式:
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
\\end{equation}

\\section{まとめ}
まとめを書きます。

\\end{document}
`;
  }
  if (template === "report") {
    return `\\documentclass[a4paper,12pt]{ltjsreport}
\\usepackage{luatexja}
\\usepackage{luatexja-fontspec}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{${title}}
\\author{著者名}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{序論}
ここにレポートの序論を書きます。

\\chapter{本論}
\\section{第一節}
本論の内容を書きます。

\\chapter{結論}
結論を書きます。

\\end{document}
`;
  }
  if (template === "beamer") {
    return `\\documentclass{beamer}
\\usepackage{luatexja}
\\usepackage{luatexja-fontspec}
\\usetheme{Madrid}

\\title{${title}}
\\author{発表者名}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{目次}
\\tableofcontents
\\end{frame}

\\section{はじめに}
\\begin{frame}{はじめに}
  \\begin{itemize}
    \\item 研究背景
    \\item 研究目的
    \\item 本発表の構成
  \\end{itemize}
\\end{frame}

\\section{手法}
\\begin{frame}{提案手法}
  提案手法の説明をここに書きます。
\\end{frame}

\\section{まとめ}
\\begin{frame}{まとめ}
  \\begin{block}{結論}
    研究のまとめを書きます。
  \\end{block}
\\end{frame}

\\end{document}
`;
  }
  // basic / default
  return `\\documentclass[a4paper,12pt]{ltjsarticle}
\\usepackage{luatexja}
\\usepackage{luatexja-fontspec}

\\title{${title}}
\\author{著者名}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{はじめに}
日本語のLaTeX文書です。

\\end{document}
`;
}
